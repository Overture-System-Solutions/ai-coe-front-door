/**
 * Lifecycle tests run against the bundle the build just produced, through the simulated SPFx host.
 * They prove the packaged artefact, not only the TypeScript sources.
 */
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import * as fs from 'fs';
import { loadWebPartBundle, MANAGE_WEB_PERMISSION, newestDistBundle, newestStringsChunk } from '../../testing/amdHost';
import type { IAmdHostOptions, IHostedInstance, IWebPartBundle } from '../../testing/amdHost';
import type { IRecordedRequest } from '../../testing/listStore';

const bundlePath: string = newestDistBundle();
const bundle: IWebPartBundle = loadWebPartBundle(bundlePath, newestStringsChunk());
const instances: IHostedInstance[] = [];

async function mount(options: IAmdHostOptions = {}): Promise<IHostedInstance> {
  const instance: IHostedInstance = bundle.create(options);
  instances.push(instance);
  await act(async (): Promise<void> => {
    await instance.webPart.onInit();
    instance.webPart.render();
  });
  return instance;
}

function usageReads(instance: IHostedInstance): IRecordedRequest[] {
  return instance.store.requests.filter((request: IRecordedRequest): boolean => request.method === 'GET' && request.list === 'AI Usage Daily');
}

afterEach((): void => {
  while (instances.length > 0) {
    (instances.pop() as IHostedInstance).dispose();
  }
});

describe('AiCoeFrontDoorWebPart bundle', () => {
  it('declares the SharePoint Framework externals and nothing else', () => {
    expect(bundle.id).toBe('cf2e5904-0703-4fe4-ae5a-ec012d6fa689_1.0.0');
    expect(bundle.dependencies.slice().sort()).toEqual([
      '@microsoft/sp-core-library',
      '@microsoft/sp-http',
      '@microsoft/sp-page-context',
      '@microsoft/sp-property-pane',
      '@microsoft/sp-webpart-base',
      'AiCoeFrontDoorWebPartStrings',
      'react',
      'react-dom'
    ]);
  });

  it('carries no organization branding but keeps the data contracts', () => {
    const code: string = fs.readFileSync(bundlePath, 'utf8');
    expect(code.indexOf('Overture')).toBe(-1);
    expect(code.indexOf('OVT-AICOE-')).toBeGreaterThan(-1);
    expect(code.indexOf('overture-ai-coe-front-door:draft:')).toBeGreaterThan(-1);
    expect(code.indexOf('overture-ai-coe-pilot')).toBeGreaterThan(-1);
  });

  it('mounts the front door into its element after onInit', async () => {
    const { webPart, permissionChecks } = await mount({ properties: { organizationName: '' } });
    const section: HTMLElement | null = webPart.domElement.querySelector('section#overture-ai-coe-pilot');
    expect(section).not.toBeNull();
    expect(section).toHaveAttribute('data-theme', 'light');
    expect(within(webPart.domElement).getByText('Signed in as Pat Example')).toBeInTheDocument();
    expect(within(webPart.domElement).getByRole('heading', { level: 1, name: 'AI, safely put to work.' })).toBeInTheDocument();
    expect(within(webPart.domElement).getByText('AI COE')).toHaveClass('ai-hero-badge');
    expect(within(webPart.domElement).queryByText('AI CoE administration')).not.toBeInTheDocument();
    expect(permissionChecks).toEqual([MANAGE_WEB_PERMISSION]);
    await waitFor((): void => expect(within(webPart.domElement).getByText('SharePoint connected')).toBeInTheDocument());
    // The framework's style loader injects the bundled stylesheets asynchronously.
    await waitFor((): void => expect(document.head.querySelectorAll('style').length).toBeGreaterThan(0));
    const injected: string = Array.prototype.map
      .call(document.head.querySelectorAll('style'), (style: HTMLStyleElement): string => style.textContent ?? '')
      .join('\n');
    // Global stylesheets must reach the page with their selectors intact, not rewritten as CSS-module hashes.
    expect(injected).toContain('#overture-ai-coe-pilot .ai-home-shell{');
    expect(injected).toContain('#overture-ai-coe-pilot .sr-only{');
    expect(injected).toContain('.overture-app{');
    expect(injected).not.toMatch(/overture-ai-coe-pilot_[0-9a-f]{8}/);
    expect(injected).toMatch(/\.aiCoeFrontDoor_[0-9a-f]{8}\{/);
  });

  it('creates the services once, so re-rendering does not refetch telemetry', async () => {
    const instance: IHostedInstance = await mount();
    await waitFor((): void => expect(usageReads(instance)).toHaveLength(1));
    await act(async (): Promise<void> => {
      instance.webPart.render();
      instance.webPart.render();
    });
    await waitFor((): void => expect(within(instance.webPart.domElement).getByText('SharePoint connected')).toBeInTheDocument());
    expect(usageReads(instance)).toHaveLength(1);
  });

  it('shows the administration bar to site administrators', async () => {
    const { webPart } = await mount({ isAdmin: true });
    expect(within(webPart.domElement).getByRole('button', { name: 'Open admin dashboard' })).toBeInTheDocument();
  });

  it('applies the organization name from the property bag', async () => {
    const { webPart } = await mount({ properties: { organizationName: 'Contoso' } });
    expect(within(webPart.domElement).getByText('CONTOSO AI COE')).toHaveClass('ai-hero-badge');
    fireEvent.click(within(webPart.domElement).getByText('Share feedback').closest('button') as HTMLElement);
    const header: HTMLElement = within(webPart.domElement).getByText('AI CoE Lab').closest('p') as HTMLElement;
    expect(header.textContent).toBe('Contoso AI CoE Lab');
    await waitFor((): void => expect(within(webPart.domElement).getByRole('button', { name: 'Continue' })).toBeInTheDocument());
  });

  it('reflects theme changes on the next render', async () => {
    const { webPart } = await mount();
    webPart.onThemeChanged({ isInverted: true, semanticColors: { bodyText: '#111111', link: '#222222', linkHovered: '#333333' } });
    await act(async (): Promise<void> => {
      webPart.render();
    });
    expect(webPart.domElement.style.getPropertyValue('--bodyText')).toBe('#111111');
    expect(webPart.domElement.style.getPropertyValue('--link')).toBe('#222222');
    expect(webPart.domElement.style.getPropertyValue('--linkHovered')).toBe('#333333');
    expect(webPart.domElement.querySelector('section#overture-ai-coe-pilot')).toHaveAttribute('data-theme', 'dark');
    webPart.onThemeChanged(undefined);
    expect(webPart.domElement.style.getPropertyValue('--bodyText')).toBe('#111111');
  });

  it('unmounts on dispose and reports data version 1.0', async () => {
    const instance: IHostedInstance = await mount();
    expect(instance.webPart.dataVersion.toString()).toBe('1.0');
    instance.webPart.onDispose();
    expect(instance.webPart.domElement.childElementCount).toBe(0);
  });

  it('offers a single organization-name field in the property pane', async () => {
    const { webPart } = await mount();
    const configuration = webPart.getPropertyPaneConfiguration();
    expect(configuration.pages).toHaveLength(1);
    expect(configuration.pages[0].header.description).toBe('Configure how the AI CoE Front Door presents your organization.');
    expect(configuration.pages[0].groups).toHaveLength(1);
    expect(configuration.pages[0].groups[0].groupName).toBe('Branding');
    expect(configuration.pages[0].groups[0].groupFields).toEqual([
      {
        targetProperty: 'organizationName',
        properties: {
          label: 'Organization name',
          description: 'Shown in the header, the hero badge and the summaries, for example Contoso. Leave blank for neutral wording.',
          placeholder: 'Contoso'
        }
      }
    ]);
  });
});
