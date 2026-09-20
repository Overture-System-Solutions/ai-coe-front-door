/**
 * The preview server must stay a loopback-only, allowlisted static host with a strict CSP.
 */
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as http from 'http';
import * as path from 'path';
import { FRONT_DOOR_VIEWS } from '../webparts/aiCoeFrontDoor/content/pageViews';

jest.setTimeout(30000);

const PAGE_PROPERTY_NAMES: string[] = ['pageIdea', 'pageToolCheck', 'pageTeamUsage', 'pageHelpTraining', 'pageFeedback', 'pageTelemetry', 'pageAdmin'];

interface IResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function get(url: string, headers: http.OutgoingHttpHeaders = {}): Promise<IResponse> {
  return new Promise<IResponse>((resolve: (value: IResponse) => void, reject: (reason: Error) => void): void => {
    http
      .get(url, { headers }, (response: http.IncomingMessage): void => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer): number => chunks.push(chunk));
        response.on('end', (): void => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
      })
      .on('error', reject);
  });
}

describe('offline preview server', () => {
  let child: ChildProcess;
  let base: string;

  beforeAll(async (): Promise<void> => {
    child = spawn(process.execPath, [path.resolve(process.cwd(), 'scripts/preview.mjs'), '--port', '0'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise<string>((resolve: (value: string) => void, reject: (reason: Error) => void): void => {
      const timer: NodeJS.Timeout = setTimeout((): void => reject(new Error('The preview server did not report readiness.')), 15000);
      let stderr: string = '';
      child.stderr?.on('data', (data: Buffer): void => {
        stderr += data.toString('utf8');
      });
      child.stdout?.once('data', (data: Buffer): void => {
        clearTimeout(timer);
        resolve(JSON.parse(data.toString('utf8')).url as string);
      });
      child.once('exit', (code: number | null): void => {
        clearTimeout(timer);
        reject(new Error(`The preview server exited early (${code}): ${stderr}`));
      });
    });
  });

  afterAll((): void => {
    child.kill();
  });

  it('serves the preview page with the offline banner and a strict CSP', async () => {
    const page: IResponse = await get(`${base}/`);
    expect(page.status).toBe(200);
    expect(page.body).toContain('OFFLINE PREVIEW');
    expect(page.body).toContain('id="app"');
    expect(page.body).toContain('id="telemetry-provider"');
    expect(page.body).toContain('option value="both"');
    expect(page.headers['content-security-policy']).toContain("connect-src 'none'");
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    expect(page.headers['cache-control']).toBe('no-store');
  });

  it('offers a chooser for every page view and the layout, with no inline script allowed', async () => {
    const page: IResponse = await get(`${base}/`);
    const viewSelect: RegExpExecArray | null = /<select id="view">([\s\S]*?)<\/select>/.exec(page.body);
    expect(viewSelect).not.toBeNull();
    const options: string = (viewSelect as RegExpExecArray)[1];
    expect((options.match(/<option /g) ?? []).length).toBe(FRONT_DOOR_VIEWS.length);
    for (const view of FRONT_DOOR_VIEWS) {
      expect(options).toContain(`option value="${view}"`);
    }
    expect(page.body).toContain('id="layout"');
    expect(page.body).toContain('option value="narrow"');
    const pageSelect: RegExpExecArray | null = /<select id="page-key">([\s\S]*?)<\/select>/.exec(page.body);
    expect(pageSelect).not.toBeNull();
    for (const key of ['startHere', 'learn', 'useAi', 'requests', 'prompts', 'status', 'operations']) {
      expect((pageSelect as RegExpExecArray)[1]).toContain(`option value="${key}"`);
    }
    const directives: string[] = String(page.headers['content-security-policy'])
      .split(';')
      .map((directive: string): string => directive.trim());
    expect(directives).toContain("script-src 'self'");
  });

  it('builds the page map and return page from view query strings in the mount script', async () => {
    const mount: IResponse = await get(`${base}/mount.js`);
    expect(mount.body).toContain("searchParams.set('view'");
    for (const name of PAGE_PROPERTY_NAMES) {
      expect(mount.body).toContain(name);
    }
    expect(mount.body).toContain('returnUrl');
    expect(mount.body).toContain('maxWidth');
    expect(mount.body).toContain("get('layout')");
    expect(mount.body).toContain("get('page')");
    expect(mount.body).toContain('pageKey');
    expect(mount.body).toContain('contentUrl');
    expect(mount.body).toContain('setPageKey');
  });

  it('offers the 1.0.0.13 simulation switches: a refused intake list and a failed readback', async () => {
    const page: IResponse = await get(`${base}/`);
    const denySelect: RegExpExecArray | null = /<select id="simulate-deny">([\s\S]*?)<\/select>/.exec(page.body);
    expect(denySelect).not.toBeNull();
    expect((denySelect as RegExpExecArray)[1]).toContain('option value="none"');
    expect((denySelect as RegExpExecArray)[1]).toContain('option value="intakes"');
    expect(page.body).toContain('id="simulate-readback"');
    // mount.js reads both switches from the query string and writes them back when the banner changes.
    const mount: IResponse = await get(`${base}/mount.js`);
    expect(mount.body).toContain("get('deny')");
    expect(mount.body).toContain("get('readback')");
    expect(mount.body).toContain('simulate-deny');
    expect(mount.body).toContain('simulate-readback');
    // The host answers the my-work filter and the readback by id, refuses the intake list under ?deny=intakes and
    // fails the GET that follows a POST under ?readback=fail, so the pending receipt can be seen offline.
    const host: IResponse = await get(`${base}/host.js`);
    expect(host.body).toContain('$filter');
    // The compiled host matches the readback URL with a regular expression, so the parenthesis is escaped in the source.
    expect(host.body).toContain('items\\(');
    expect(host.body).toContain('deny=intakes');
    expect(host.body).toContain('readback=fail');
    expect(host.body).toContain('403');
  });

  it('offers the 1.0.0.14 role simulation and says where the role really comes from', async () => {
    const page: IResponse = await get(`${base}/`);
    const roleSelect: RegExpExecArray | null = /<select id="simulate-role">([\s\S]*?)<\/select>/.exec(page.body);
    expect(roleSelect).not.toBeNull();
    for (const role of ['owner', 'employee', 'leader', 'operator', 'designAuthority']) {
      expect((roleSelect as RegExpExecArray)[1]).toContain(`option value="${role}"`);
    }
    expect(page.body).toContain('Preview role simulation; production resolves the role from identity.');
    // mount.js reads the switch from the query string, binds the simulated groups to the roles and reloads on a change.
    const mount: IResponse = await get(`${base}/mount.js`);
    expect(mount.body).toContain("get('role')");
    expect(mount.body).toContain('simulate-role');
    expect(mount.body).toContain('roleGroups');
    expect(mount.body).toContain('Preview Leaders');
    // The host answers the site groups request the resolver makes, and the same switch answers the permission check.
    const host: IResponse = await get(`${base}/host.js`);
    expect(host.body).toContain('currentuser/groups');
    expect(host.body).toContain('role=');
    expect(host.body).toContain('Preview Design Authority');
    expect(host.body).toContain('previewIsAdmin');
  });

  it('serves only the allowlisted assets', async () => {
    for (const route of ['/react.js', '/react-dom.js', '/host.js', '/strings.js', '/bundle.js', '/mount.js']) {
      const asset: IResponse = await get(`${base}${route}`);
      expect(asset.status).toBe(200);
      expect(asset.headers['content-type']).toBe('text/javascript');
      expect(asset.body.length).toBeGreaterThan(0);
    }
    expect((await get(`${base}/package.json`)).status).toBe(404);
    expect((await get(`${base}/../package.json`)).status).toBe(404);
  });

  it('serves the built bundle and the simulated host', async () => {
    const bundle: IResponse = await get(`${base}/bundle.js`);
    expect(bundle.body.indexOf('define("cf2e5904-0703-4fe4-ae5a-ec012d6fa689_1.0.0"')).toBe(0);
    const host: IResponse = await get(`${base}/host.js`);
    expect(host.body).toContain('OFFLINE_SIMULATION');
    expect(host.body).toContain('External network access is blocked');
    expect(host.body).toContain('setTelemetryProvider');
    expect(host.body).toContain('setView');
    expect(host.body).toContain('setLayout');
    expect(host.body).toContain('setPageKey');
    expect(host.body).toContain('GetFileByServerRelativeUrl');
    expect(host.body).toContain('ai-coe-pages.json');
    expect(host.body).toContain('claude-sonnet-5');
    expect(host.body).toContain('Simulated preview data');
    // The simulated document carries the 1.0.0.12 sections (the route table, the work command, notices and the shared
    // support route) and the 1.0.0.13 ones (the status strip, my work and the case card on Status, the telemetry piece
    // under its kicker on the operator-plane Operations page, the feed labels in vocabulary.telemetry).
    for (const key of ['workCommand', 'supportRoute', 'notice', 'routes', 'statusStrip', 'myWork', 'caseCards', 'operations', "plane: 'operator'", 'telemetry: {']) {
      expect(host.body).toContain(key);
    }
    // Opening a new tab is stubbed, never blocked: the work command opens an available route after saving the draft.
    expect(host.body).toContain('window.open = ');
    expect(host.body).not.toContain('window.open = blocked');
    // Browsers cannot resolve bare specifiers such as "tslib"; the host must compile helper-free.
    expect(host.body).not.toMatch(/^import\b/m);
  });

  it('refuses non-loopback host headers', async () => {
    const response: IResponse = await get(`${base}/`, { host: 'example.com' });
    expect(response.status).toBe(403);
  });
});
