/**
 * Lifecycle tests run against the bundle the build just produced, through the simulated SPFx host.
 * They prove the packaged artefact, not only the TypeScript sources.
 */
import { act, fireEvent, waitFor, within } from '@testing-library/react';
import * as fs from 'fs';
import { LIST_TITLES, loadWebPartBundle, MANAGE_WEB_PERMISSION, newestDistBundle, newestStringsChunk } from '../../testing/amdHost';
import type { IAmdHostOptions, IHostedInstance, IHostedWebPart, IPropertyPaneConfigurationLike, IWebPartBundle } from '../../testing/amdHost';
import { IDEA_JOURNEY, journeyAnswers, playJourney, TOOL_CHECK_GAP_JOURNEY } from '../../testing/journeys';
import { InMemoryListStore } from '../../testing/listStore';
import type { IRecordedRequest } from '../../testing/listStore';
import { SAMPLE_PAGE_DOCUMENT } from '../../testing/pageDocument';
import { BUNDLE_SCAN, findTenantWords, readTenantWords } from '../../provisioning/tenantWords';
import type { ITenantWords } from '../../provisioning/tenantWords';
import { createBranding } from './branding/branding';
import { CONTENT_UNAVAILABLE_TEXT, NO_PAGE_KEY_TEXT } from './components/pages/ContentPage';
import { ADMIN_ONLY_TEXT } from './components/PageViewShell';
import { DRAFT_KEY_PREFIX, RECEIPT_READBACK_LINE, RECEIPT_SAVED_TITLE } from './content/constants';
import { createWorkflowCatalog } from './content/workflows/catalog';
import { IDEA_SUMMARY_FIELDS } from './summaries/ideaSummary';
import type { IWorkflowCatalog } from './workflows/types';

// Every mount re-evaluates the built bundle, and coverage tracking slows each evaluation; the journeys near the end of
// this file otherwise drift past Jest's five-second default, and a test abandoned mid-act() crashes the worker at teardown.
// A test that mounts three times and plays a whole journey through each needs well past sixty seconds against the
// minified production bundle once Binding A and Marketing are in it, and an abandoned test leaks its act() warnings
// into the next one, so allow two minutes.
jest.setTimeout(120000);

const bundlePath: string = newestDistBundle();
const bundle: IWebPartBundle = loadWebPartBundle(bundlePath, newestStringsChunk());
const instances: IHostedInstance[] = [];
const catalog: IWorkflowCatalog = createWorkflowCatalog(createBranding(''));
const tenantWords: ITenantWords = readTenantWords();
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

/**
 * jsdom cannot leave the page: a same-tab hand-off through `window.location.assign` reports
 * "Not implemented: navigation" on the console, which is the expected outcome here, not a failure.
 * Everything else (an act warning above all) still reaches the console as before.
 */
async function withoutNavigationErrors(run: () => Promise<void>): Promise<void> {
  const forward: typeof console.error = console.error;
  const spy: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]): void => {
    if (String(args[0]).indexOf('Not implemented: navigation') < 0) {
      forward.apply(console, args);
    }
  });
  try {
    await run();
  } finally {
    spy.mockRestore();
  }
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

  it('carries no word of the tenant list but keeps the data contracts', () => {
    // The bundle scan reads the one tenant word list (src/provisioning/tenantWords.json): the phrases the bundle may not
    // carry, tenant host shapes, the reference roster and the shapes a secret takes. It runs against whichever bundle the
    // build wrote last: the dev bundle heft test produces keeps JSDoc on runtime declarations and inlines a source map
    // (a base64 data URL, which is not a secret) under every stylesheet, so those data URLs are cut before the scan.
    const code: string = fs.readFileSync(bundlePath, 'utf8').replace(/sourceMappingURL=data:[^\s*]*/g, 'sourceMappingURL=<cut>');
    const chunk: string = fs.readFileSync(newestStringsChunk(), 'utf8');
    for (const list of BUNDLE_SCAN) {
      expect({ file: 'bundle', list, found: findTenantWords(code, tenantWords, [list]) }).toEqual({ file: 'bundle', list, found: [] });
      expect({ file: 'strings', list, found: findTenantWords(chunk, tenantWords, [list]) }).toEqual({ file: 'strings', list, found: [] });
    }
    expect(code.indexOf('Overture')).toBe(-1);
    for (const marker of ['OVT-AICOE-', 'overture-ai-coe-front-door:draft:', 'overture-ai-coe-pilot', 'AI CoE Pilot Intakes']) {
      expect(code.indexOf(marker)).toBeGreaterThan(-1);
    }
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
    // The focus ring is a selector list; cssnano keeps only the last selector before the brace.
    expect(injected).toContain('#overture-ai-coe-pilot .ai-view textarea:focus-visible{');
    // The page-view media queries ship as a fifth unhashed stylesheet, minified like the others.
    expect(injected).toMatch(/@media \(max-width:800px\)\{#overture-ai-coe-pilot \.ai-view /);
    expect(injected).toMatch(/@media \(max-width:480px\)\{#overture-ai-coe-pilot \.ai-view /);
    expect(injected).toMatch(/@media \(prefers-reduced-motion:reduce\)\{#overture-ai-coe-pilot \.ai-view /);
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

  it('sets the palette on its own element and declares no token in the stylesheets it injects', async () => {
    // Decision 11: the tenant's colours arrive as custom properties on the web part's element, exactly as the theme
    // colours do; a blank property clears them and the shipped colours stand. A malformed pair is dropped on its own.
    const { webPart } = await mount({ properties: { paletteOverrides: 'accent=#008B83;ink=#102B3D;muted=grey;bogus=#000000' } });
    expect(webPart.domElement.style.getPropertyValue('--fd-accent')).toBe('#008B83');
    expect(webPart.domElement.style.getPropertyValue('--fd-ink')).toBe('#102B3D');
    expect(webPart.domElement.style.getPropertyValue('--fd-muted')).toBe('');
    expect(webPart.domElement.style.getPropertyValue('--fd-bogus')).toBe('');
    setProperty(webPart, 'paletteOverrides', '');
    await act(async (): Promise<void> => {
      webPart.render();
    });
    for (const name of ['--fd-accent', '--fd-ink']) {
      expect({ name, value: webPart.domElement.style.getPropertyValue(name) }).toEqual({ name, value: '' });
    }
    // Nothing the bundle injects declares a token: an own declaration on the section would beat the value above it.
    expect(fs.readFileSync(bundlePath, 'utf8')).not.toMatch(/--fd-[a-z-]*\s*:/);
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
      },
      {
        targetProperty: 'governanceReference',
        properties: {
          label: 'Governance reference',
          description: 'Policy reference quoted on review requests, for example a policy name, version and date. Leave blank for the default wording.',
          placeholder: 'Contoso AI policy, version 2.0, 1 March 2027'
        }
      },
      {
        targetProperty: 'reviewSystemName',
        properties: {
          label: 'Review system name',
          description: 'Name of the performance-review system quoted in tool guidance. Leave blank for the default wording.',
          placeholder: 'Contoso Review Desk'
        }
      },
      // The roles come from site group membership; the site owners the web part already asks about count as operators.
      {
        targetProperty: 'roleGroups',
        properties: {
          label: 'Role groups',
          description:
            'Site groups that map to roles, as role=Group title pairs separated by semicolons: leader=…; operator=…; designAuthority=…; marketingParticipant=…; marketingReviewer=…. Site owners always count as operators; no group grants a Marketing role until it is named here.',
          placeholder: 'leader=AI CoE Leaders;operator=AI CoE Operators'
        }
      },
      // The palette is a tenant's colours, so it is a property the script writes from a parameter, never code (decision 11).
      {
        targetProperty: 'paletteOverrides',
        properties: {
          label: 'Palette overrides',
          description:
            'Colours of this organization as key=#hex pairs separated by semicolons, for example accent=#008B83;ink=#102B3D. Keys: accent, ink, muted, bg, paper, focus, stateGreen, stateBlue, stateAmber, stateRed, line, soft, heroFrom, heroTo, heroGlow, accentDark, accentSoft. Leave blank to keep the shipped colours.',
          placeholder: 'accent=#008B83;ink=#102B3D'
        }
      }
    ]);
    // The drafting flow is named for what it does, never for a provider or a first tenant's flow name.
    expect(configuration.pages[0].groups[1].groupFields).toEqual([
      {
        targetProperty: 'draftServiceUrl',
        properties: {
          label: 'AI draft flow URL',
          description:
            'HTTP trigger URL of the drafting flow. Keep its approved authenticated caller restriction and approve only the required Microsoft Flow Service API permission. Leave blank to keep plain summaries.',
          placeholder: 'https://…/triggers/manual/paths/invoke?api-version=1'
        }
      },
      {
        targetProperty: 'caseAnalysisUrl',
        properties: {
          label: 'Case analysis flow URL',
          description:
            'HTTP trigger URL of the flow that asks Claude to rank the open business cases for leaders, from their structured fields only. It uses the same Microsoft Flow Service permission as the drafting flow; keep its caller restriction to the named leaders. Leave blank to leave the Cases panel unbound.',
          placeholder: 'https://…/triggers/manual/paths/invoke?api-version=1'
        }
      },
      // 1.0.0.18: the concierge the Ask box hands a question to, and the link that adds it in Teams.
      {
        targetProperty: 'conciergeChatUrl',
        properties: {
          label: 'AI CoE Concierge chat link',
          description: 'The AI CoE Concierge agent\'s chat link in Microsoft 365 Copilot (its Share link, https://m365.cloud.microsoft/chat/?titleId=...). The Ask box on the tabbed view copies a question and opens this chat; a saved request offers it as the next step. Only https Microsoft Copilot or Teams addresses are used. Leave blank and the box says the concierge is not set up.',
          placeholder: 'https://m365.cloud.microsoft/chat/?titleId=T_…'
        }
      },
      {
        targetProperty: 'conciergeAddUrl',
        properties: {
          label: 'AI CoE Concierge add link (Teams)',
          description: 'The link that adds the AI CoE Concierge in Teams (https://teams.microsoft.com/l/app/?titleId=...), offered once to people who have not added it yet. Leave blank to offer only the chat.',
          placeholder: 'https://teams.microsoft.com/l/app/?titleId=T_…'
        }
      },
      { targetProperty: 'draftListId', properties: { label: 'Server draft list ID', description: 'Unsubmitted work stays on the server, never in browser storage. Blank disables saved business drafts.' } },
      { targetProperty: 'draftPolicyJson', properties: { label: 'Qualified server draft policy (JSON)', multiline: true, description: 'Supply accepted access/retention references, retention period and qualification expiry. Server policy commissioning is required; this field does not enforce tenant retention.' } },
      { targetProperty: 'coreBindingJson', properties: { label: 'Qualified native CORE binding (JSON)', multiline: true, description: 'Use the exact accepted v0.2.0 binding receipt and separate request/result GUIDs. Never enter secrets. A property cannot grant server permissions.' } },
      { targetProperty: 'marketingBindingJson', properties: { label: 'Qualified business Marketing binding (JSON)', multiline: true, description: 'Requires the approved existing-writer runtime, separate ingress/results and actual qualification. No provider credentials belong in this web part.' } }
    ]);
  });

  it('rebuilds the services once when a branding property the services read changes', async () => {
    // The page content reader is part of the service bundle, so a rebuild shows as one more document read; a render
    // with the same values reads nothing, and the core services (telemetry) are never recreated.
    const instance: IHostedInstance = await mount({
      properties: { view: 'page', pageKey: 'startHere' },
      files: { '/sites/ai/SiteAssets/ai-coe-pages.json': JSON.stringify(SAMPLE_PAGE_DOCUMENT) }
    });
    const root: HTMLElement = instance.webPart.domElement;
    await waitFor((): void => expect(within(root).getByRole('heading', { level: 1, name: 'What do you need done?' })).toBeInTheDocument());
    expect(fileReads(instance)).toHaveLength(1);
    for (const change of [
      { name: 'governanceReference', value: 'Contoso AI policy, version 2.0, 1 March 2027' },
      { name: 'reviewSystemName', value: 'Contoso Review Desk' },
      // The role resolver reads the group bindings, so the property joins the key that rebuilds the bundle.
      { name: 'roleGroups', value: 'leader=AI CoE Leaders;operator=AI CoE Operators' }
    ]) {
      const before: number = fileReads(instance).length;
      setProperty(instance.webPart, change.name, change.value);
      await act(async (): Promise<void> => {
        instance.webPart.render();
        instance.webPart.render();
      });
      await waitFor((): void => expect(within(root).getByRole('heading', { level: 1, name: 'What do you need done?' })).toBeInTheDocument());
      expect(fileReads(instance)).toHaveLength(before + 1);
    }
    await act(async (): Promise<void> => {
      instance.webPart.render();
    });
    expect(fileReads(instance)).toHaveLength(4);
    expect(usageReads(instance)).toHaveLength(0);
  });

  it('resolves the role from identity alone: the bundle reads no role out of the address', () => {
    // The role switch lives in the offline preview host and nowhere else (decision 8): a page that could hand
    // itself a role in a query string would be a role selector, and the permissions would be the only control left.
    const code: string = fs.readFileSync(bundlePath, 'utf8');
    for (const handling of ['role=', 'location.search', 'searchParams', 'URLSearchParams']) {
      expect({ handling, at: code.indexOf(handling) }).toEqual({ handling, at: -1 });
    }
    // The permission behind the operator role is still asked about once, by the web part, as it always was.
    expect(code.indexOf('manageWeb')).toBeGreaterThan(-1);
  });

  it('names the review system from the property: the shipped literal in the legacy view, neutral wording in a page view', async () => {
    // The next step as listed on the result screen (the export text below it repeats the same line inside one block).
    const gapStep = (root: HTMLElement): Promise<HTMLElement> =>
      waitFor((): HTMLElement => {
        const items: HTMLElement[] = Array.prototype.slice.call(root.querySelectorAll('li'));
        const step: HTMLElement | undefined = items.filter((item: HTMLElement): boolean => /^Use .* or contact the AI CoE to confirm/.test(item.textContent ?? ''))[0];
        if (step === undefined) {
          throw new Error('The guidance-gap next step is not listed yet.');
        }
        return step;
      });
    // Legacy view, blank property: byte-identical to the shipped package. (The journey helper reads the step titles
    // from the unbranded catalog, so every mount here is unbranded.)
    const legacy: IHostedInstance = await mount({ properties: { organizationName: '' } });
    fireEvent.click(within(legacy.webPart.domElement).getByText('Check a tool or task').closest('button') as HTMLElement);
    await waitFor((): void => expect(within(legacy.webPart.domElement).getByRole('button', { name: 'Continue' })).toBeInTheDocument());
    playJourney(TOOL_CHECK_GAP_JOURNEY, catalog.toolCheck, legacy.webPart.domElement);
    expect((await gapStep(legacy.webPart.domElement)).textContent).toBe('Use TESS or contact the AI CoE to confirm the current approved-use guidance before proceeding.');
    legacy.dispose();
    instances.pop();

    // Legacy view, filled property: the name replaces the literal.
    const named: IHostedInstance = await mount({ properties: { organizationName: '', reviewSystemName: 'Contoso Review Desk' } });
    fireEvent.click(within(named.webPart.domElement).getByText('Check a tool or task').closest('button') as HTMLElement);
    await waitFor((): void => expect(within(named.webPart.domElement).getByRole('button', { name: 'Continue' })).toBeInTheDocument());
    playJourney(TOOL_CHECK_GAP_JOURNEY, catalog.toolCheck, named.webPart.domElement);
    expect((await gapStep(named.webPart.domElement)).textContent).toBe('Use Contoso Review Desk or contact the AI CoE to confirm the current approved-use guidance before proceeding.');
    named.dispose();
    instances.pop();

    // A page view (a form page) with the property blank: neutral wording, never the first tenant's system.
    const page: IHostedInstance = await mount({ properties: { organizationName: '', view: 'toolCheck' } });
    await waitFor((): void => expect(within(page.webPart.domElement).getByRole('button', { name: 'Continue' })).toBeInTheDocument());
    playJourney(TOOL_CHECK_GAP_JOURNEY, catalog.toolCheck, page.webPart.domElement);
    expect((await gapStep(page.webPart.domElement)).textContent).toBe('Use the review system or contact the AI CoE to confirm the current approved-use guidance before proceeding.');
    expect(page.webPart.domElement.textContent).not.toContain('TESS');
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
            { key: 'app', text: 'Consolidated application with tabs' },
            { key: 'legacy', text: 'Whole front door on one page (default)' },
            { key: 'home', text: 'Home tiles' },
            { key: 'idea', text: 'Explore an AI idea' },
            { key: 'toolCheck', text: 'Check a tool or task' },
            { key: 'teamUsage', text: 'Register team AI use' },
            { key: 'helpTraining', text: 'Get help or training' },
            { key: 'feedback', text: 'Share feedback' },
            { key: 'telemetry', text: 'AI operations snapshot' },
            { key: 'admin', text: 'Administrator dashboard' },
            { key: 'page', text: 'Content page' },
            { key: 'outcome', text: 'Record a task outcome' }
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
    // The outcome record joins the page links on the home view, last, without becoming a tile target (decision 16).
    expect(targets(4)).toEqual(['pageIdea', 'pageToolCheck', 'pageTeamUsage', 'pageHelpTraining', 'pageFeedback', 'pageTelemetry', 'pageAdmin', 'pagePolicy', 'pageOutcome']);
    expect(groups()[4].groupFields[8].properties.label).toBe('Record a task outcome page');
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
    // The sample document carries a route table, the work command and one tile whose route is closed: the tile stays
    // on the page as a labelled non-link and the command's sentence goes to the guided request, the fallback route.
    expect(root.querySelector('form.ai-page-command')).not.toBeNull();
    expect(within(root).getByRole('button', { name: 'Start' })).toBeInTheDocument();
    const closed: HTMLElement = within(root).getByText('Get work done').closest('.ai-service-card') as HTMLElement;
    expect(closed).toHaveClass('ai-service-card--closed');
    expect(closed.tagName).toBe('DIV');
    expect(within(closed).getByText('Needs access')).toBeInTheDocument();
    expect(within(closed).getByRole('link', { name: /Start a guided request/ })).toHaveAttribute('href', 'https://contoso.sharepoint.com/sites/ai/SitePages/Explore-an-AI-idea.aspx');
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

  it.each([
    ['no case service binding', {}],
    ['a binding that cannot be read', { coreBindingJson: '{not json' }]
  ])('leaves the business-case workspace out of Cases on a real site with %s (1.0.0.19)', async (_name: string, binding: { [key: string]: unknown }) => {
    const { webPart } = await mount({ isAdmin: true, properties: { view: 'app', ...binding } });
    const root: HTMLElement = webPart.domElement;
    await waitFor((): void => expect(within(root).getByRole('tab', { name: 'Cases' })).toBeInTheDocument());
    await act(async (): Promise<void> => {
      fireEvent.click(within(root).getByRole('tab', { name: 'Cases' }));
    });
    expect(within(root).getByRole('tab', { name: 'Cases', selected: true })).toBeInTheDocument();
    // 1.0.0.18 showed a notice that cases are saved through the configured service, then seven commissioning reasons.
    expect(root.querySelector('.ai-case-workspace:not(.ai-case-analysis)')).toBeNull();
    expect(root.textContent).not.toContain('Your cases are saved through the configured service');
    expect(root.textContent).not.toContain('integrity helper must be registered');
    fireEvent.click(within(root).getByRole('button', { name: 'What is going on?' }));
    expect(within(root).getByText('What happens to a request', { selector: 'h2, h3, h4' })).toBeInTheDocument();
    expect(within(root).queryByRole('region', { name: 'From a request to a business case' })).not.toBeInTheDocument();
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
      siteUrl: 'http://localhost/simulated-site',
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

  it('stays truthful with every provider unavailable: the command falls back with its draft, the tile reads Needs access, a request saves and reads back', async () => {
    // Every off-site route blank (the sample document's work route has no link), the draft flow answering 503; only the site's lists answer.
    const flowDown = (): { status: number; body: string } => ({ status: 503, body: JSON.stringify({ ok: false, code: 'AI_DRAFT_UNAVAILABLE' }) });
    // Browser-store compatibility is explicitly synthetic; real-site privacy is tested separately.
    const siteUrl: string = 'http://localhost/simulated-site';
    const files: { [path: string]: string } = { '/simulated-site/SiteAssets/ai-coe-pages.json': JSON.stringify(SAMPLE_PAGE_DOCUMENT) };
    const sentence: string = 'Prepare me for the Contoso customer meeting.';
    const guidedIntake: string = `${siteUrl}/SitePages/Explore-an-AI-idea.aspx`;
    const draftKey: string = `${DRAFT_KEY_PREFIX}idea`;

    // Start here renders; the tile on the closed route is a labelled non-link that points at the guided request.
    const first: IHostedInstance = await mount({ siteUrl, properties: { organizationName: '', view: 'page', pageKey: 'startHere', draftServiceUrl: FLOW_URL }, files, draftFlow: flowDown });
    const root: HTMLElement = first.webPart.domElement;
    await waitFor((): void => expect(within(root).getByRole('heading', { level: 1, name: 'What do you need done?' })).toBeInTheDocument());
    const closed: HTMLElement = within(root).getByText('Get work done').closest('.ai-service-card') as HTMLElement;
    expect(closed.tagName).toBe('DIV');
    expect(within(closed).getByText('Needs access')).toBeInTheDocument();
    expect(within(closed).getByRole('link', { name: /Start a guided request/ })).toHaveAttribute('href', guidedIntake);

    // The command keeps the sentence as the idea draft and leaves for the guided request in the same tab: nothing opens elsewhere, the sentence enters no URL.
    const opened: jest.SpyInstance = jest.spyOn(window, 'open').mockImplementation((): null => null);
    fireEvent.change(within(root).getByLabelText('Say what you need done at Contoso'), { target: { value: sentence } });
    await withoutNavigationErrors(async (): Promise<void> => {
      fireEvent.click(within(root).getByRole('button', { name: 'Start' }));
      await waitFor((): void => expect(window.localStorage.getItem(draftKey)).not.toBeNull());
    });
    const draft: { answers: { [step: string]: string }; currentStepId: string; phase: string } = JSON.parse(window.localStorage.getItem(draftKey) as string);
    expect(draft).toMatchObject({ answers: { workToImprove: sentence }, currentStepId: 'workToImprove', phase: 'form' });
    expect(opened).not.toHaveBeenCalled();
    opened.mockRestore();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(first.flowRequests).toEqual([]);
    first.dispose();
    instances.pop();

    // The guided request page resumes the sentence; the flow is down, so the plain summary stands in; the record is written and read back.
    const idea: IHostedInstance = await mount({ siteUrl, properties: { organizationName: '', view: 'idea', contentUrl: 'SiteAssets/ai-coe-pages.json', draftServiceUrl: FLOW_URL }, files, draftFlow: flowDown });
    const page: HTMLElement = idea.webPart.domElement;
    await waitFor((): void => expect(within(page).getByRole('button', { name: 'Continue' })).toBeInTheDocument());
    expect(page.querySelector('#workToImprove')).toHaveValue(sentence);
    playJourney(IDEA_JOURNEY, catalog.idea, page);
    await waitFor((): void => expect(within(page).getByRole('button', { name: 'Continue without AI help' })).toBeInTheDocument());
    expect(idea.flowRequests).toHaveLength(1);
    fireEvent.click(within(page).getByRole('button', { name: 'Continue without AI help' }));
    expect(within(page).getByRole('heading', { name: 'Here is a draft summary' })).toBeInTheDocument();
    fireEvent.click(within(page).getByRole('button', { name: 'Confirm this reflects my idea' }));
    await waitFor((): void => expect(within(page).getByText(RECEIPT_SAVED_TITLE)).toBeInTheDocument());
    const rows: { Id: number; IntakeId?: unknown }[] = idea.store.items('AI CoE Pilot Intakes');
    expect(rows).toHaveLength(1);
    expect(String(rows[0].IntakeId)).toMatch(/^OVT-AICOE-\d{8}-[A-Z0-9]{8}$/);
    expect(page.querySelector('.ai-receipt-reference')?.textContent).toContain(String(rows[0].IntakeId));
    expect(within(page).getByText(RECEIPT_READBACK_LINE)).toBeInTheDocument();
    const readback: IRecordedRequest[] = idea.store.requests.filter(
      (request: IRecordedRequest): boolean => request.method === 'GET' && request.list === 'AI CoE Pilot Intakes' && request.url.indexOf(`items(${rows[0].Id})`) >= 0
    );
    expect(readback).toHaveLength(1);
    // Saved and confirmed: the draft is cleared; the sentence was never part of a URL or of the flow's traffic.
    expect(window.localStorage.getItem(draftKey)).toBeNull();
    expect(idea.flowRequests[0].url).toBe(FLOW_URL);
    for (const request of idea.store.requests) {
      expect(request.url).not.toContain('customer meeting');
    }
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
