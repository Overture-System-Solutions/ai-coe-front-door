/**
 * The preview server must stay a loopback-only, allowlisted static host with a strict CSP.
 */
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as http from 'http';
import * as path from 'path';

jest.setTimeout(30000);

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
    expect(page.headers['content-security-policy']).toContain("connect-src 'none'");
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    expect(page.headers['cache-control']).toBe('no-store');
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
    // Browsers cannot resolve bare specifiers such as "tslib"; the host must compile helper-free.
    expect(host.body).not.toMatch(/^import\b/m);
  });

  it('refuses non-loopback host headers', async () => {
    const response: IResponse = await get(`${base}/`, { host: 'example.com' });
    expect(response.status).toBe(403);
  });
});
