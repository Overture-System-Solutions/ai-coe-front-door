/**
 * Lifecycle tests run against the bundle the build just produced, through the simulated SPFx host.
 * They prove the packaged artefact, not only the TypeScript sources.
 */
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import * as fs from 'fs';
import { LIST_TITLES, loadWebPartBundle, MANAGE_WEB_PERMISSION, newestDistBundle, newestStringsChunk } from '../../testing/amdHost';
import type { IAmdHostOptions, IHostedInstance, IHostedWebPart, IPropertyPaneConfigurationLike, IWebPartBundle } from '../../testing/amdHost';
import { IDEA_JOURNEY, journeyAnswers, playJourney } from '../../testing/journeys';
import { InMemoryListStore } from '../../testing/listStore';
import type { IRecordedRequest } from '../../testing/listStore';
import { SAMPLE_PAGE_DOCUMENT } from '../../testing/pageDocument';
import { createBranding } from './branding/branding';
import { CONTENT_UNAVAILABLE_TEXT, NO_PAGE_KEY_TEXT } from './components/pages/ContentPage';
import { ADMIN_ONLY_TEXT } from './components/PageViewShell';
import { createWorkflowCatalog } from './content/workflows/catalog';
import { IDEA_SUMMARY_FIELDS } from './summaries/ideaSummary';
import type { IWorkflowCatalog } from './workflows/types';

// Every mount re-evaluates the built bundle, and coverage tracking slows each evaluation; the journeys near the end of
// this file otherwise drift past Jest's five-second default, and a test abandoned mid-act() crashes the worker at teardown.
jest.setTimeout(30000);

const bundlePath: string = newestDistBundle();
const bundle: IWebPartBundle = loadWebPartBundle(bundlePath, newestStringsChunk());
const instances: IHostedInstance[] = [];
const catalog: IWorkflowCatalog = createWorkflowCatalog(createBranding(''));
const FLOW_URL: string = 'https://default0000.01.environment.api.powerplatform.com/powerautomate/automations/direct/cu/25/workflows/abc/triggers/manual/paths/invoke?api-version=1';

function flowSuccess(): { [key: string]: unknown } {
  const draft: { [key: string]: string } = {};
  for (const field of IDEA_SUMMARY_FIELDS) {
    draft[field.key] = `AI ${field.key}`;
  }
  return { ok: true, schemaVersion: '1.0', requestId: 'draft-unknown', draftOnly: true, humanReviewRequired: true, provider: 'anthropic', model: 'claude-sonnet-5', responseId: 'msg_01ABC', draft };
}

async function mount(options: IAmdHostOptions = {}): Promise<IHostedInstance> {
  const instance: IHostedInstance = bundle.create(options);
  instances.push(instance);
  await act(async (): Promise<void> => {
    await instance.webPart.onInit();
    instance.webPart.render();
  });
  return instance;
}

/** What the property pane does when an author changes a value: a synchronous write to the property bag. */
function setProperty(webPart: IHostedWebPart, name: string, value: unknown): void {
  webPart.properties[name] = value;
}

function usageReads(instance: IHostedInstance): IRecordedRequest[] {
  return instance.store.requests.filter((request: IRecordedRequest): boolean => request.method === 'GET' && request.list === 'AI Usage Daily');
}

function fileReads(instance: IHostedInstance): IRecordedRequest[] {
  return instance.store.requests.filter((request: IRecordedRequest): boolean => request.file !== undefined);
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
    // The page view modifiers ship as a fourth unhashed stylesheet.
    expect(injected).toContain('#overture-ai-coe-pilot .ai-view--narrow .ai-home-grid .ai-service-card{');
    expect(injected).toContain('#overture-ai-coe-pilot .ai-view--page .ai-page-tiles{');
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

  it('shows the Claude tiles by default and switches feeds from the property bag without refetching', async () => {
    const store: InMemoryListStore = new InMemoryListStore(LIST_TITLES.slice());
    const today: string = new Date().toISOString();
    store.seed('AI Usage Daily', [
      { Provider: 'anthropic', MetricType: 'cost', BucketStart: today, Amount: 42.5, Currency: 'USD' },
      { Provider: 'openai', MetricType: 'cost', BucketStart: today, Amount: 3, Currency: 'USD' }
    ]);
    const instance: IHostedInstance = await mount({ store });
    const root: HTMLElement = instance.webPart.domElement;
    await waitFor((): void => expect(within(root).getByText('SharePoint connected')).toBeInTheDocument());
    expect(within(root).getByText('Claude API spend this month')).toBeInTheDocument();
    expect(within(root).getByText('AI CoE alerts and usage overages')).toBeInTheDocument();
    expect(within(root).queryByText('OpenAI API spend this month')).not.toBeInTheDocument();
    expect(root.querySelectorAll('.ai-metric-card')).toHaveLength(4);
    expect(usageReads(instance)).toHaveLength(1);

    setProperty(instance.webPart, 'telemetryProvider', 'both');
    await act(async (): Promise<void> => {
      instance.webPart.render();
    });
    expect(within(root).getByText('Claude API spend this month')).toBeInTheDocument();
    expect(within(root).getByText('OpenAI API spend this month')).toBeInTheDocument();
    expect(root.querySelectorAll('.ai-metric-card')).toHaveLength(7);

    setProperty(instance.webPart, 'telemetryProvider', 'openai');
    await act(async (): Promise<void> => {
      instance.webPart.render();
    });
    expect(within(root).queryByText('Claude API spend this month')).not.toBeInTheDocument();
    expect(within(root).getByText('AI CoE alerts and ChatGPT / Work overages')).toBeInTheDocument();
    expect(root.querySelectorAll('.ai-metric-card')).toHaveLength(4);
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

  it('offers the branding, draft-flow, telemetry and page layout groups in the property pane', async () => {
    const { webPart } = await mount({ properties: { telemetryProvider: 'both' } });
    const configuration = webPart.getPropertyPaneConfiguration();
    expect(configuration.pages).toHaveLength(1);
    expect(configuration.pages[0].header.description).toBe('Configure how the AI CoE Front Door presents your organization.');
    expect(configuration.pages[0].groups.map((group): string => group.groupName)).toEqual(['Branding', 'AI drafting', 'Telemetry', 'Page layout']);
    expect(configuration.pages[0].groups[2].groupFields).toEqual([
      {
        targetProperty: 'telemetryProvider',
        properties: {
          label: 'Usage metrics provider',
          options: [
            { key: 'claude', text: 'Claude (Anthropic API)' },
            { key: 'openai', text: 'OpenAI (as shipped in 1.0.0.7)' },
            { key: 'both', text: 'Claude and OpenAI' }
          ],
          selectedKey: 'both'
        }
      }
    ]);
    setProperty(webPart, 'telemetryProvider', 'not a mode');
    expect(webPart.getPropertyPaneConfiguration().pages[0].groups[2].groupFields[0].properties.selectedKey).toBe('claude');
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
    expect(configuration.pages[0].groups[1].groupFields).toEqual([
      {
        targetProperty: 'draftServiceUrl',
        properties: {
          label: 'Claude draft flow URL',
          description:
            'HTTP trigger URL of the "OSS Demo - Claude Intake Draft" flow. The flow must allow any user in the tenant, and the Microsoft Flow Service API permission must be approved. Leave blank to keep plain summaries.',
          placeholder: 'https://…/triggers/manual/paths/invoke?api-version=1'
        }
      }
    ]);
  });

  it('offers the view dropdown and reveals layout, return page and page links as the view changes', async () => {
    const { webPart } = await mount();
    const groups = (): IPropertyPaneConfigurationLike['pages'][0]['groups'] => webPart.getPropertyPaneConfiguration().pages[0].groups;
    const targets = (index: number): string[] => groups()[index].groupFields.map((field): string => field.targetProperty);
    expect(groups()[3].groupFields).toEqual([
      {
        targetProperty: 'view',
        properties: {
          label: 'Piece shown on this page',
          options: [
            { key: 'legacy', text: 'Whole front door on one page (default)' },
            { key: 'home', text: 'Home tiles' },
            { key: 'idea', text: 'Explore an AI idea' },
            { key: 'toolCheck', text: 'Check a tool or task' },
            { key: 'teamUsage', text: 'Register team AI use' },
            { key: 'helpTraining', text: 'Get help or training' },
            { key: 'feedback', text: 'Share feedback' },
            { key: 'telemetry', text: 'AI operations snapshot' },
            { key: 'admin', text: 'Administrator dashboard' },
            { key: 'page', text: 'Content page' }
          ],
          selectedKey: 'legacy'
        }
      }
    ]);
    setProperty(webPart, 'view', 'idea');
    expect(groups().map((group): string => group.groupName)).toEqual(['Branding', 'AI drafting', 'Telemetry', 'Page layout']);
    expect(targets(3)).toEqual(['view', 'layout', 'returnUrl']);
    setProperty(webPart, 'view', 'telemetry');
    expect(targets(3)).toEqual(['view', 'layout']);
    setProperty(webPart, 'view', 'ADMIN');
    expect(groups()[3].groupFields[0].properties.selectedKey).toBe('admin');
    expect(targets(3)).toEqual(['view', 'layout', 'returnUrl']);
    setProperty(webPart, 'view', 'home');
    expect(groups().map((group): string => group.groupName)).toEqual(['Branding', 'AI drafting', 'Telemetry', 'Page layout', 'Page links']);
    expect(targets(3)).toEqual(['view', 'layout']);
    expect(targets(4)).toEqual(['pageIdea', 'pageToolCheck', 'pageTeamUsage', 'pageHelpTraining', 'pageFeedback', 'pageTelemetry', 'pageAdmin', 'pagePolicy']);
    expect(groups()[3].groupFields[1].properties.options).toEqual([
      { key: 'wide', text: 'Wide (full page width)' },
      { key: 'narrow', text: 'Narrow (one column)' }
    ]);
    expect(groups()[3].groupFields[1].properties.selectedKey).toBe('wide');
    expect(groups()[4].groupFields[0].properties.label).toBe('Explore an AI idea page');
    setProperty(webPart, 'view', 'page');
    expect(groups().map((group): string => group.groupName)).toEqual(['Branding', 'AI drafting', 'Telemetry', 'Page layout', 'Page content']);
    expect(targets(3)).toEqual(['view', 'layout']);
    expect(targets(4)).toEqual(['pageKey', 'contentUrl']);
    expect(groups()[4].groupFields[0].properties.label).toBe('Page key');
    expect(groups()[4].groupFields[0].properties.placeholder).toBe('startHere');
    expect(groups()[4].groupFields[1].properties.label).toBe('Page document');
    expect(groups()[4].groupFields[1].properties.placeholder).toBe('SiteAssets/ai-coe-pages.json');
  });

  it('refreshes the property pane only when the view changes', async () => {
    const refresh: jest.Mock = jest.fn();
    const { webPart } = await mount({ propertyPane: { refresh } });
    webPart.onPropertyPaneFieldChanged('view', 'legacy', 'home');
    expect(refresh).toHaveBeenCalledTimes(1);
    webPart.onPropertyPaneFieldChanged('organizationName', '', 'Contoso');
    expect(refresh).toHaveBeenCalledTimes(1);
    webPart.onPropertyPaneFieldChanged('view', 'home', 'home');
    expect(refresh).toHaveBeenCalledTimes(1);
    const withoutPane: IHostedInstance = await mount();
    expect((): void => withoutPane.webPart.onPropertyPaneFieldChanged('view', 'legacy', 'idea')).not.toThrow();
  });

  it('renders the whole front door for an unconfigured or unknown view', async () => {
    const { webPart } = await mount({ properties: { view: 'not a view' } });
    expect(within(webPart.domElement).getByRole('heading', { level: 1, name: 'AI, safely put to work.' })).toBeInTheDocument();
    expect(webPart.domElement.querySelector('.ai-view')).toBeNull();
  });

  it('renders only the home tiles for the home view, linking the configured pages', async () => {
    const { webPart } = await mount({
      isAdmin: true,
      properties: { view: 'home', pageIdea: 'SitePages/AI-Idea.aspx', pagePolicy: 'https://contoso.sharepoint.com/sites/ai/SitePages/Policy.aspx' }
    });
    const root: HTMLElement = webPart.domElement;
    expect(root.querySelector('.ai-view--home')).not.toBeNull();
    expect(within(root).queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(within(root).getByText('Explore an AI idea').closest('a')).toHaveAttribute('href', 'https://contoso.sharepoint.com/sites/ai/SitePages/AI-Idea.aspx');
    expect(within(root).getByRole('link', { name: 'AI policy' })).toHaveAttribute('href', 'https://contoso.sharepoint.com/sites/ai/SitePages/Policy.aspx');
    expect(within(root).queryByText('Check a tool or task')).not.toBeInTheDocument();
    expect(within(root).queryByText('AI CoE administration')).not.toBeInTheDocument();
    expect(within(root).queryByRole('heading', { name: 'AI operations snapshot' })).not.toBeInTheDocument();
  });

  it('renders one workflow for a workflow view in the narrow layout', async () => {
    const { webPart } = await mount({ properties: { view: 'toolCheck', returnUrl: 'SitePages/AI-CoE.aspx', layout: 'narrow' } });
    const root: HTMLElement = webPart.domElement;
    expect(root.querySelector('.ai-view--toolCheck.ai-view--narrow')).not.toBeNull();
    expect(root.querySelector('.min-h-screen')).toBeNull();
    expect(within(root).getByRole('heading', { level: 1, name: catalog.toolCheck.title })).toBeInTheDocument();
    // The page-view header names the CoE and the badge names the intake; the sr-only span stays with the legacy view.
    expect(root.querySelector('p.ai-page-header')?.textContent).toMatch(/AI CoE$/);
    expect(within(root).queryByText('AI CoE Lab')).not.toBeInTheDocument();
    expect(root.querySelector('.overture-badge')?.textContent).toBe('Governed intake');
    expect(root.querySelector('p.ai-page-identity')?.textContent).toMatch(/^Signed in as /);
    expect(within(root).getAllByText(/^Signed in as /)).toHaveLength(1);
    expect(root.querySelector('div[role="region"]')).toHaveAttribute('aria-label', catalog.toolCheck.title);
    await waitFor((): void => expect(within(root).getByRole('button', { name: 'Continue' })).toBeInTheDocument());
  });

  it('renders the shared footer below a form page that names the content document, and reads nothing without one', async () => {
    const withFooter: { [key: string]: unknown } = {
      ...SAMPLE_PAGE_DOCUMENT,
      shared: {
        footer: [
          {
            type: 'supportRoute',
            label: 'Ask in the pilot channel',
            href: 'https://teams.microsoft.com/l/channel/contoso',
            stopWhen: ['a source is missing'],
            reportFields: ['the task type', 'the time'],
            routes: [{ issue: 'Outcome is uncertain after an action', owner: 'Recovery owner', action: 'Reconcile the native state before retrying' }]
          }
        ]
      }
    };
    const files: { [path: string]: string } = { '/sites/ai/SiteAssets/ai-coe-pages.json': JSON.stringify(withFooter) };
    const named: IHostedInstance = await mount({ properties: { view: 'idea', contentUrl: 'SiteAssets/ai-coe-pages.json' }, files });
    const root: HTMLElement = named.webPart.domElement;
    await waitFor((): void => expect(within(root).getByRole('heading', { level: 2, name: 'Support' })).toBeInTheDocument());
    expect(within(root).getByRole('heading', { level: 1, name: catalog.idea.title })).toBeInTheDocument();
    expect(root.querySelector('.ai-workflow-shell > div[role="region"] + .ai-page-block--shared > .ai-page-block--supportRoute > section.ai-page-support')).not.toBeNull();
    expect(within(root).getByRole('link', { name: 'Ask in the pilot channel' })).toHaveAttribute('href', 'https://teams.microsoft.com/l/channel/contoso');
    await waitFor((): void => expect(within(root).getByRole('button', { name: 'Continue' })).toBeInTheDocument());
    expect(fileReads(named)).toHaveLength(1);
    expect(fileReads(named)[0].file).toBe('/sites/ai/SiteAssets/ai-coe-pages.json');
    named.dispose();
    instances.pop();

    // A form instance whose property bag names no document (every instance built before 1.0.0.12) reads nothing.
    const unnamed: IHostedInstance = await mount({ properties: { view: 'idea' }, files });
    await waitFor((): void => expect(within(unnamed.webPart.domElement).getByRole('button', { name: 'Continue' })).toBeInTheDocument());
    expect(fileReads(unnamed)).toHaveLength(0);
    expect(unnamed.webPart.domElement.querySelector('.ai-page-block--shared')).toBeNull();
    expect(within(unnamed.webPart.domElement).queryByRole('heading', { level: 2, name: 'Support' })).not.toBeInTheDocument();
  });

  it('renders the telemetry snapshot alone', async () => {
    const { webPart } = await mount({ properties: { view: 'telemetry' } });
    const root: HTMLElement = webPart.domElement;
    await waitFor((): void => expect(within(root).getByText('SharePoint connected')).toBeInTheDocument());
    expect(root.querySelectorAll('.ai-metric-card')).toHaveLength(4);
    expect(within(root).queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(root.querySelector('.ai-home-grid')).toBeNull();
  });

  it('renders a content page from the document in Site Assets and reads it once per document path', async () => {
    const instance: IHostedInstance = await mount({
      properties: { view: 'page', pageKey: 'startHere' },
      files: { '/sites/ai/SiteAssets/ai-coe-pages.json': JSON.stringify(SAMPLE_PAGE_DOCUMENT) }
    });
    const root: HTMLElement = instance.webPart.domElement;
    expect(root.querySelector('.ai-view--page')).not.toBeNull();
    await waitFor((): void => expect(within(root).getByRole('heading', { level: 1, name: 'What do you need done?' })).toBeInTheDocument());
    const tile: HTMLElement = within(root).getByText('Use AI for my work').closest('a') as HTMLElement;
    expect(tile).toHaveClass('ai-service-card');
    expect(tile).toHaveAttribute('href', 'https://contoso.sharepoint.com/sites/ai/SitePages/Use-AI.aspx');
    expect(root.querySelectorAll('.ai-page-card')).toHaveLength(3);
    expect(fileReads(instance)).toHaveLength(1);
    expect(fileReads(instance)[0].file).toBe('/sites/ai/SiteAssets/ai-coe-pages.json');
    expect(fileReads(instance)[0].headers).toEqual({ Accept: 'application/json;odata=nometadata', 'odata-version': '' });

    // Another page of the same document: no second read; the status page embeds the telemetry strip.
    setProperty(instance.webPart, 'pageKey', 'status');
    await act(async (): Promise<void> => {
      instance.webPart.render();
    });
    await waitFor((): void => expect(within(root).getByText('SharePoint connected')).toBeInTheDocument());
    expect(root.querySelectorAll('.ai-metric-card')).toHaveLength(4);
    expect(within(root).queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(fileReads(instance)).toHaveLength(1);

    // Another document path is a new read.
    setProperty(instance.webPart, 'contentUrl', 'SiteAssets/other.json');
    await act(async (): Promise<void> => {
      instance.webPart.render();
    });
    await waitFor((): void => expect(within(root).getByText(CONTENT_UNAVAILABLE_TEXT, { exact: false })).toBeInTheDocument());
    expect(fileReads(instance)).toHaveLength(2);
    expect(fileReads(instance)[1].file).toBe('/sites/ai/SiteAssets/other.json');
  });

  it('explains a missing document and asks for a page key without reading anything', async () => {
    const missing: IHostedInstance = await mount({ properties: { view: 'page', pageKey: 'startHere' } });
    await waitFor((): void => expect(within(missing.webPart.domElement).getByText(CONTENT_UNAVAILABLE_TEXT, { exact: false })).toBeInTheDocument());
    expect(within(missing.webPart.domElement).getByText(/answered 404/)).toBeInTheDocument();
    const unkeyed: IHostedInstance = await mount({ properties: { view: 'page' } });
    expect(within(unkeyed.webPart.domElement).getByText(NO_PAGE_KEY_TEXT)).toBeInTheDocument();
    expect(fileReads(unkeyed)).toHaveLength(0);
  });

  it('gates the administrator dashboard by permission for the admin view', async () => {
    const visitor: IHostedInstance = await mount({ properties: { view: 'admin' } });
    expect(within(visitor.webPart.domElement).getByText(ADMIN_ONLY_TEXT)).toBeInTheDocument();
    expect(visitor.permissionChecks).toEqual([MANAGE_WEB_PERMISSION]);
    visitor.dispose();
    instances.pop();
    const { webPart } = await mount({ isAdmin: true, properties: { view: 'admin' } });
    expect(within(webPart.domElement).getByRole('heading', { level: 1, name: 'AI CoE Admin Dashboard' })).toBeInTheDocument();
    await waitFor((): void => expect(within(webPart.domElement).getByText('0 of 0 records shown')).toBeInTheDocument());
  });

  it('does not touch the flow service while no draft flow is configured', async () => {
    const instance: IHostedInstance = await mount({ properties: { organizationName: '' } });
    fireEvent.click(within(instance.webPart.domElement).getByText('Explore an AI idea').closest('button') as HTMLElement);
    await waitFor((): void => expect(within(instance.webPart.domElement).getByRole('button', { name: 'Continue' })).toBeInTheDocument());
    playJourney(IDEA_JOURNEY, catalog.idea, instance.webPart.domElement);
    expect(within(instance.webPart.domElement).getByRole('heading', { name: 'Here is a draft summary' })).toBeInTheDocument();
    expect(instance.flowResources).toEqual([]);
    expect(instance.flowRequests).toEqual([]);
  });

  it('drafts the idea summary through the configured flow with an Entra token client', async () => {
    const instance: IHostedInstance = await mount({
      properties: { organizationName: '', draftServiceUrl: FLOW_URL },
      draftFlow: (request: unknown): { status: number; body: string } => ({
        status: 200,
        body: JSON.stringify({ ...flowSuccess(), requestId: (request as { requestId: string }).requestId })
      })
    });
    fireEvent.click(within(instance.webPart.domElement).getByText('Explore an AI idea').closest('button') as HTMLElement);
    await waitFor((): void => expect(within(instance.webPart.domElement).getByRole('button', { name: 'Continue' })).toBeInTheDocument());
    playJourney(IDEA_JOURNEY, catalog.idea, instance.webPart.domElement);
    await waitFor((): void => expect(within(instance.webPart.domElement).getByRole('heading', { name: 'Here is a draft summary' })).toBeInTheDocument());
    expect(instance.flowResources).toEqual(['https://service.flow.microsoft.com/']);
    expect(instance.flowRequests).toHaveLength(1);
    expect(instance.flowRequests[0].url).toBe(FLOW_URL);
    expect(instance.flowRequests[0].headers['Content-Type']).toBe('application/json');
    expect(instance.flowRequests[0].body).toMatchObject({
      schemaVersion: '1.0',
      workflowId: 'idea',
      demoDataOnly: true,
      answers: { workToImprove: journeyAnswers(IDEA_JOURNEY).workToImprove, informationCategories: ['internal'] }
    });
    expect(within(instance.webPart.domElement).getByLabelText('Suggested use-case title')).toHaveValue('AI title');

    fireEvent.click(within(instance.webPart.domElement).getByRole('button', { name: 'Confirm this reflects my idea' }));
    await waitFor((): void => expect(within(instance.webPart.domElement).getByRole('heading', { name: 'Thanks for sharing your idea.' })).toBeInTheDocument());
    const intake: IRecordedRequest = instance.store.requests.filter((request: IRecordedRequest): boolean => request.method === 'POST' && request.list === 'AI CoE Pilot Intakes')[0];
    const payload: { draftSource?: unknown } = JSON.parse(String((intake.body as { PayloadJson: string }).PayloadJson));
    expect(payload.draftSource).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5', responseId: 'msg_01ABC', requestId: expect.stringMatching(/^draft-/), draftOnly: true, humanReviewRequired: true });
  });

  it('falls back to the plain summary when the flow rejects the request', async () => {
    const instance: IHostedInstance = await mount({
      properties: { organizationName: '', draftServiceUrl: FLOW_URL },
      draftFlow: (): { status: number; body: string } => ({ status: 502, body: JSON.stringify({ ok: false, code: 'AI_DRAFT_UNAVAILABLE' }) })
    });
    fireEvent.click(within(instance.webPart.domElement).getByText('Explore an AI idea').closest('button') as HTMLElement);
    await waitFor((): void => expect(within(instance.webPart.domElement).getByRole('button', { name: 'Continue' })).toBeInTheDocument());
    playJourney(IDEA_JOURNEY, catalog.idea, instance.webPart.domElement);
    await waitFor((): void => expect(within(instance.webPart.domElement).getByRole('button', { name: 'Continue without AI help' })).toBeInTheDocument());
    fireEvent.click(within(instance.webPart.domElement).getByRole('button', { name: 'Continue without AI help' }));
    expect(within(instance.webPart.domElement).getByRole('heading', { name: 'Here is a draft summary' })).toBeInTheDocument();
    expect(instance.flowRequests).toHaveLength(1);
  });
});
