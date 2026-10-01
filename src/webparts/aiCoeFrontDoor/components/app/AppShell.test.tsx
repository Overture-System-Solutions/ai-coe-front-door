/**
 * The consolidated shell. The cases that matter are the ones a rebuild could quietly break: the gate must keep a
 * section out of the tab list AND out of the tree, the keyboard must be able to move along the tabs, and a section
 * change must land somewhere a screen reader announces.
 */
import * as React from 'react';
import { IDEA_JOURNEY, playJourney } from '../../../../testing/journeys';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import { createTabbedCatalog } from '../../content/workflows/tabbedForms';
import { AppShell } from './AppShell';
import type { IPageViewSettings } from '../../content/pageViews';
import type { RoleId } from '../../content/roles';
import type { IRoleResolution, IRoleResolver } from '../../services/roleResolver';
import { createFakeGovernanceService, createFakePageContentService, createFakeProgramMeasuresService, createFakeUsageService } from '../../../../testing/fakeServices';
import { createSyntheticMarketingServices } from '../../services/marketing/marketingServices';
import { MemoryStorageBackend } from '../../services/marketing/artifactStore';

const SETTINGS: IPageViewSettings = { view: 'app', layout: 'wide', pages: {} };

/**
 * The shell reads roles from the resolver service, not from the page-document context, so a test that wants a role
 * has to supply one. This answers at once with exactly what it is given, which is what lets the gate be exercised.
 */
function resolver(roles: RoleId[], resolution: IRoleResolution['resolution']): IRoleResolver {
  return {
    resolve: async (): Promise<IRoleResolution> => ({ roles, resolution })
  };
}

/**
 * Renders and lets the resolver's answer land. The resolver replies on a microtask, so without this the gate is
 * asserted against the membership it had before the answer arrived, and React reports the update as unwrapped.
 */
async function renderShell(options?: Parameters<typeof renderWithFrontDoor>[1]): Promise<ReturnType<typeof renderWithFrontDoor>> {
  const result: ReturnType<typeof renderWithFrontDoor> = renderWithFrontDoor(<AppShell settings={SETTINGS} />, options);
  await act(async (): Promise<void> => undefined);
  return result;
}

function tabNames(container: HTMLElement): string[] {
  const names: string[] = [];
  container.querySelectorAll('[role="tab"]').forEach((tab: Element): void => {
    names.push((tab.textContent ?? '').trim());
  });
  return names;
}

function selected(container: HTMLElement): string {
  const tab: Element | null = container.querySelector('[role="tab"][aria-selected="true"]');
  return (tab?.textContent ?? '').trim();
}

describe('AppShell', () => {
  it('preserves transient synthetic objective and notes across section changes without a browser-text write', async () => {
    const browser = jest.spyOn(Storage.prototype, 'setItem');
    const view = await renderShell({ roleResolver: resolver(['employee', 'marketingParticipant'], 'resolved'), marketing: createSyntheticMarketingServices(new MemoryStorageBackend()) });
    fireEvent.click(view.getByRole('tab', { name: 'Marketing', exact: true }));
    fireEvent.change(await view.findByLabelText('Approved objective (synthetic)'), { target: { value: 'Transient invented objective' } });
    fireEvent.change(view.getByLabelText('Permitted meeting notes (fixture source FIXTURE-MEETING-004)'), { target: { value: 'Transient invented notes' } });
    fireEvent.click(view.getByRole('tab', { name: 'Home', exact: true }));
    fireEvent.click(view.getByRole('tab', { name: 'Marketing', exact: true }));
    expect(await view.findByLabelText('Approved objective (synthetic)')).toHaveValue('Transient invented objective');
    expect(view.getByLabelText('Permitted meeting notes (fixture source FIXTURE-MEETING-004)')).toHaveValue('Transient invented notes');
    expect(JSON.stringify(browser.mock.calls)).not.toMatch(/Transient invented/);
    browser.mockRestore();
  });

  it('blocks leaving unsaved business Marketing input until the server draft seam confirms it', async () => {
    const marketing = { ...createSyntheticMarketingServices(new MemoryStorageBackend()), mode: 'live' as const, listWork: async () => ['CW-DRAFT_GUARD'], recoverPending: async () => ({ kind: 'none' as const, message: 'No pending intent' }) };
    const view = await renderShell({ roleResolver: resolver(['employee', 'marketingParticipant'], 'resolved'), marketing });
    fireEvent.click(view.getByRole('tab', { name: 'Marketing', exact: true }));
    await view.findByRole('option', { name: 'CW-DRAFT_GUARD' });
    fireEvent.change(view.getByLabelText('Marketing case'), { target: { value: 'CW-DRAFT_GUARD' } });
    await waitFor(() => expect(view.getByLabelText('Approved objective')).toBeEnabled());
    fireEvent.change(view.getByLabelText('Approved objective'), { target: { value: 'Unsubmitted working objective' } });
    fireEvent.click(view.getByRole('tab', { name: 'Home', exact: true }));
    await view.findByText(/Unsaved changes/);
    expect(selected(view.container)).toBe('Marketing');
    fireEvent.click(view.getByRole('button', { name: 'Save working draft', exact: true }));
    await view.findByText('Working draft saved and read back from the server.');
    fireEvent.click(view.getByRole('tab', { name: 'Home', exact: true }));
    expect(selected(view.container)).toBe('Home');
  });

  it('opens on the first screen with the entry panel and only the available ways in', async () => {
    const { container } = await renderShell();
    expect(container.querySelector('.ai-app-hero-title')?.textContent).toBe('Make the next move.');
    const choices: number = container.querySelectorAll('.ai-app-choice-button').length;
    expect(choices).toBe(2);
    expect(selected(container)).toBe('Home');
  });

  it('keeps a section a person may not use out of the tab list entirely', async () => {
    // An employee holds none of the narrowed capabilities, so the three gated sections are absent - not disabled,
    // not styled differently, absent. Their services are therefore never constructed.
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const names: string[] = tabNames(container);
    expect(names).toEqual(['Home', 'Requests', 'Improvement', 'Cases']);
    expect(names.indexOf('Marketing')).toBe(-1);
    expect(names.indexOf('Metrics')).toBe(-1);
    expect(names.indexOf('System map')).toBe(-1);
    expect(names.indexOf('Admin')).toBe(-1);
  });

  it('opens the measured view to a leader but still not the operator surface', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee', 'leader'], 'resolved') });
    const names: string[] = tabNames(container);
    expect(names.indexOf('Metrics')).toBeGreaterThan(-1);
    expect(names.indexOf('System map')).toBe(-1);
    expect(names.indexOf('Marketing')).toBe(-1);
    expect(names.indexOf('Admin')).toBe(-1);
  });

  it('shows nothing narrowed while the membership is unresolved, rather than guessing', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee', 'operator'], 'unresolved') });
    const names: string[] = tabNames(container);
    expect(names).toEqual(['Home', 'Requests', 'Improvement', 'Cases']);
  });

  it('moves along the tabs with the arrow keys, and wraps at both ends', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const list: Element = container.querySelector('[role="tablist"]') as Element;
    expect(selected(container)).toBe('Home');
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'ArrowRight' }); });
    expect(selected(container)).toBe('Requests');
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'ArrowLeft' }); });
    expect(selected(container)).toBe('Home');
    // Left from the first wraps to the last, which is what a tab list promises.
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'ArrowLeft' }); });
    expect(selected(container)).toBe('Cases');
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'Home' }); });
    expect(selected(container)).toBe('Home');
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'End' }); });
    expect(selected(container)).toBe('Cases');
  });

  it('keeps sequential keyboard navigation on the actual focused tab, but pointer entry focuses the heading', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    (container.querySelector('#ai-app-tab-home') as HTMLElement).focus();
    for (const [key, id] of [['ArrowRight', 'engineering'], ['ArrowRight', 'improvement'], ['End', 'cases'], ['ArrowRight', 'home'], ['ArrowLeft', 'cases'], ['Home', 'home']]) {
      await act(async (): Promise<void> => { fireEvent.keyDown(document.activeElement as Element, { key }); });
      expect(document.activeElement).toBe(container.querySelector(`#ai-app-tab-${id}`));
    }
    await act(async (): Promise<void> => { fireEvent.click(container.querySelector('#ai-app-tab-cases') as Element); });
    expect(document.activeElement).toBe(container.querySelector('.ai-app-heading'));
  });

  it('ignores a key the tab list does not own, so typing is not swallowed', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const list: Element = container.querySelector('[role="tablist"]') as Element;
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'a' }); });
    expect(selected(container)).toBe('Home');
  });

  it('keeps one tab in the tab order and points each panel at its tab', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const reachable: Element[] = [];
    container.querySelectorAll('[role="tab"]').forEach((tab: Element): void => {
      if (tab.getAttribute('tabindex') === '0') {
        reachable.push(tab);
      }
    });
    expect(reachable.length).toBe(1);
    const panel: Element | null = container.querySelector('[role="tabpanel"]');
    const labelledBy: string = panel?.getAttribute('aria-labelledby') ?? '';
    expect(container.querySelector(`#${labelledBy}`)?.getAttribute('aria-selected')).toBe('true');
  });

  it('gives the section a heading that can take focus, so a change is announced', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const heading: Element | null = container.querySelector('.ai-app-heading');
    expect(heading?.tagName).toBe('H2');
    expect(heading?.getAttribute('tabindex')).toBe('-1');
    // On the first screen the entry panel already names the view, so the heading is there for readers only.
    expect(heading?.className).toContain('ai-app-heading--quiet');
  });

  it('names the person and what the view can say about their access', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const chips: string[] = [];
    container.querySelectorAll('.ai-app-chip-line').forEach((chip: Element): void => {
      chips.push((chip.textContent ?? '').trim());
    });
    expect(chips.filter((chip: string): boolean => chip.indexOf('Access confirmed') >= 0).length).toBe(1);
    expect(chips.filter((chip: string): boolean => chip.indexOf('Signed in as') >= 0).length).toBe(1);
  });

  it('says so when the membership could not be confirmed, rather than staying quiet about it', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'unresolved') });
    expect(container.textContent).toContain('Access not confirmed');
  });

  it.each([true, false])('hands a saved request on to the AI CoE Concierge only when one is set up (concierge set: %s), never to a document route', async (set: boolean) => {
    // 1.0.0.18 (decision 2a): the tabbed view's next step is the concierge, or nothing; a document route is not used here.
    const pageContent = createFakePageContentService({ connected: true, message: 'loaded', document: {
      version: 1, pages: {}, routes: { assistant: { key: 'assistant', label: 'Approved assistant', href: 'SitePages/Assistant.aspx', state: 'availableNow' } }
    } });
    const concierge = set ? { chatUrl: 'https://m365.cloud.microsoft/chat/?titleId=T_1' } : undefined;
    const view = await renderShell({ pageView: true, pageContent, concierge });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('tab', { name: 'Requests' })); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: /Explore an AI idea/ })); });
    await waitFor((): void => { expect(view.container.querySelector('#workToImprove')).not.toBeNull(); });
    playJourney(IDEA_JOURNEY, createTabbedCatalog(view.value.catalog, []).idea);
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Confirm this reflects my idea' })); });
    await waitFor((): void => { expect(view.governance.submissions).toHaveLength(1); });
    await waitFor((): void => { expect(view.container.textContent).toContain('Saved and confirmed'); });
    expect(view.queryByRole('link', { name: 'Approved assistant' })).toBeNull();
    expect(view.queryByRole('region', { name: 'Continue in the AI CoE Concierge' }) !== null).toBe(set);
  });

  it('carries the footer promise on every section', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    expect(container.querySelector('.ai-app-foot')?.textContent).toContain('without a person deciding it');
  });

  it('hides the Metrics Home card for an employee without mounting or fetching it', async () => {
    const measures = createFakeProgramMeasuresService();
    const usage = createFakeUsageService();
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved'), programMeasures: measures, usage });
    const cards: NodeListOf<HTMLButtonElement> = container.querySelectorAll('.ai-app-choice-button');
    const value: HTMLButtonElement | undefined = Array.from(cards).filter((button: HTMLButtonElement): boolean => (button.textContent ?? '').indexOf('Review AI metrics') >= 0)[0];
    expect(value).toBeUndefined();
    expect(measures.calls).toBe(0);
    expect(usage.calls).toBe(0);
    expect(selected(container)).toBe('Home');
    expect(container.textContent).not.toContain('Review AI metrics');
    expect(container.querySelector('.ai-app-measures')).toBeNull();
    expect(container.querySelector('.ai-usage-section')).toBeNull();
  });

  it('hides the Metrics Home card and fetches nothing while membership is unresolved', async () => {
    const measures = createFakeProgramMeasuresService();
    const usage = createFakeUsageService();
    const { container } = await renderShell({
      roleResolver: resolver(['employee', 'operator'], 'unresolved'),
      programMeasures: measures,
      usage
    });
    expect(tabNames(container).indexOf('Metrics')).toBe(-1);
    expect(container.querySelector('.ai-usage-section')).toBeNull();
    expect(measures.calls).toBe(0);
    expect(usage.calls).toBe(0);
    const cards: NodeListOf<HTMLButtonElement> = container.querySelectorAll('.ai-app-choice-button');
    const value: HTMLButtonElement | undefined = Array.from(cards).filter((button: HTMLButtonElement): boolean => (button.textContent ?? '').indexOf('Review AI metrics') >= 0)[0];
    expect(value).toBeUndefined();
    expect(selected(container)).toBe('Home');
    expect(measures.calls).toBe(0);
    expect(usage.calls).toBe(0);
    expect(container.querySelector('.ai-usage-section')).toBeNull();
  });

  it('shows Usage on Metrics for an operator without a System map route', async () => {
    const measures = createFakeProgramMeasuresService();
    const usage = createFakeUsageService();
    const { container } = await renderShell({
      isAdmin: true,
      roleResolver: resolver(['employee', 'operator'], 'resolved'),
      programMeasures: measures,
      usage
    });
    const valueTab: HTMLElement = Array.from(container.querySelectorAll('[role="tab"]')).filter((tab: Element): boolean => (tab.textContent ?? '').trim() === 'Metrics')[0] as HTMLElement;
    await act(async (): Promise<void> => {
      fireEvent.click(valueTab);
    });
    expect(selected(container)).toBe('Metrics');
    await waitFor((): void => {
      expect(container.textContent).toContain('Usage');
    });
    expect(container.querySelector('.ai-usage-section')).not.toBeNull();
    expect(container.textContent).toContain('Read from the usage lists');
    expect(usage.calls).toBeGreaterThan(0);
    expect(measures.calls).toBeGreaterThan(0);
    expect(tabNames(container)).not.toContain('System map');
    await act(async (): Promise<void> => {
      fireEvent.click(container.querySelector('#ai-app-tab-home') as Element);
    });
    expect(selected(container)).toBe('Home');
    expect(container.querySelector('.ai-usage-section')).toBeNull();
    expect(container.textContent).not.toContain('AI operations snapshot');
  });

  it('lets a leader open Metrics without mounting usage or calling getMetrics', async () => {
    const measures = createFakeProgramMeasuresService();
    const usage = createFakeUsageService();
    const { container } = await renderShell({
      roleResolver: resolver(['employee', 'leader'], 'resolved'),
      programMeasures: measures,
      usage
    });
    const valueTab: HTMLElement = Array.from(container.querySelectorAll('[role="tab"]')).filter((tab: Element): boolean => (tab.textContent ?? '').trim() === 'Metrics')[0] as HTMLElement;
    await act(async (): Promise<void> => {
      fireEvent.click(valueTab);
    });
    expect(selected(container)).toBe('Metrics');
    await waitFor((): void => {
      expect(measures.calls).toBeGreaterThan(0);
    });
    expect(container.querySelector('.ai-usage-section')).toBeNull();
    expect(container.textContent).not.toContain('AI operations snapshot');
    expect(usage.calls).toBe(0);
  });

  // 1.0.0.18: the Home box hands its sentence to the AI CoE Concierge and keeps no idea draft; its cases are in
  // AppHero.concierge.test.tsx. The two cases that pinned the old draft-and-open behaviour were retired with it.

  it.each(['refused', 'rejected'])('keeps guided edits mounted when navigation needs an unsaved draft and saving is %s', async (failure: string) => {
    const view = await renderShell();
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('tab', { name: 'Requests' })); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: /Explore an AI idea/ })); });
    await waitFor((): void => { expect(view.container.querySelector('#workToImprove')).not.toBeNull(); });
    fireEvent.change(view.container.querySelector('#workToImprove') as Element, { target: { value: 'Edited sentence that must survive' } });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('tab', { name: 'Home' })); });
    expect(selected(view.container)).toBe('Requests');
    expect(view.getByRole('alert')).toHaveTextContent('Unsaved changes');
    const save = view.draftStore.save.bind(view.draftStore);
    view.draftStore.save = async (): Promise<{ ok: boolean }> => {
      if (failure === 'rejected') { throw new Error('Store unavailable'); }
      return { ok: false };
    };
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Save draft' })); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('tab', { name: 'Home' })); });
    expect(selected(view.container)).toBe('Requests');
    expect(view.container.querySelector('#workToImprove')).toHaveValue('Edited sentence that must survive');
    view.draftStore.save = save;
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Save draft' })); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('tab', { name: 'Home' })); });
    expect(selected(view.container)).toBe('Home');
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('tab', { name: 'Requests' })); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: /Explore an AI idea/ })); });
    await waitFor((): void => { expect(view.container.querySelector('#workToImprove')).toHaveValue('Edited sentence that must survive'); });
    expect(Object.keys(window.localStorage)).toEqual([]);
  });

  it('opens Marketing for a reviewer without granting drafting controls', async () => {
    const marketing = createSyntheticMarketingServices(new MemoryStorageBackend());
    const view = await renderShell({ roleResolver: resolver(['employee', 'marketingReviewer'], 'resolved'), marketing });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('tab', { name: 'Marketing' })); });
    expect(view.getByRole('heading', { name: 'Review queue' })).toBeInTheDocument();
    expect(view.queryByRole('button', { name: 'Draft a campaign brief' })).toBeNull();
    expect(view.queryByLabelText('Approved objective (synthetic)')).toBeNull();
  });

  it('shows Marketing to a bounded participant and keeps the synthetic workspace across a Home round-trip', async () => {
    const marketing = createSyntheticMarketingServices(new MemoryStorageBackend());
    const { container } = await renderShell({
      roleResolver: resolver(['employee', 'marketingParticipant'], 'resolved'),
      marketing
    });
    expect(tabNames(container).indexOf('Marketing')).toBeGreaterThan(-1);
    const marketingTab: HTMLElement = Array.from(container.querySelectorAll('[role="tab"]')).filter((tab: Element): boolean => (tab.textContent ?? '').trim() === 'Marketing')[0] as HTMLElement;
    await act(async (): Promise<void> => {
      fireEvent.click(marketingTab);
    });
    expect(container.textContent).toContain('Synthetic workspace');
    const homeTab: HTMLElement = Array.from(container.querySelectorAll('[role="tab"]')).filter((tab: Element): boolean => (tab.textContent ?? '').trim() === 'Home')[0] as HTMLElement;
    await act(async (): Promise<void> => {
      fireEvent.click(homeTab);
    });
    await act(async (): Promise<void> => {
      fireEvent.click(marketingTab);
    });
    expect(container.textContent).toContain('Synthetic workspace');
  });

  it('keeps the administrator queue unread for an operator without site-owner permission and no System map route', async () => {
    const governance = createFakeGovernanceService();
    const { container } = await renderShell({
      isAdmin: false,
      roleResolver: resolver(['employee', 'operator'], 'resolved'),
      governance
    });
    expect(tabNames(container)).not.toContain('System map');
    expect(tabNames(container)).toContain('Metrics');
    await act(async (): Promise<void> => {
      fireEvent.keyDown(container.querySelector('[role="tablist"]') as Element, { key: 'End' });
    });
    expect(selected(container)).toBe('Metrics');
    expect(governance.dashboardCalls).toBe(0);
    expect(tabNames(container).indexOf('Admin')).toBe(-1);
  });

  it('says the support route is unbound when the content document does not name one', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    expect(container.textContent).toContain('Support route: not bound on this site yet.');
  });

  it.each(['javascript:void(0)', 'data:text/html,unsafe', '//untrusted.invalid/path'])('does not expose an unsafe support link: %s', async (href: string) => {
    const pageContent = createFakePageContentService({ connected: true, document: { version: 1, pages: {}, shared: { footer: [{ type: 'supportRoute', label: 'Support', href, stopWhen: [], reportFields: [], routes: [] }] } }, message: 'loaded' });
    const { container } = await renderShell({ pageContent });
    expect(container.querySelector('.ai-app-foot-support a')).toBeNull();
    expect(container.querySelector('.ai-app-foot-support')?.textContent).toContain('no link bound');
  });

  it('resolves site-relative support links against the site rather than the hosting page', async () => {
    const pageContent = createFakePageContentService({ connected: true, document: { version: 1, pages: {}, shared: { footer: [{ type: 'supportRoute', label: 'Support', href: 'SitePages/Support.aspx', stopWhen: [], reportFields: [], routes: [] }] } }, message: 'loaded' });
    const { container } = await renderShell({ pageContent });
    expect(container.querySelector('.ai-app-foot-support a')?.getAttribute('href')).toBe('https://contoso.sharepoint.com/sites/ai/SitePages/Support.aspx');
  });

  it('renders a configured support route from the page content document', async () => {
    const pageContent = createFakePageContentService({
      connected: true,
      document: {
        version: 1,
        pages: {},
        shared: {
          footer: [
            { type: 'supportRoute', label: 'Ask the AI CoE for help', href: 'https://example.invalid/support', stopWhen: [], reportFields: [], routes: [] }
          ]
        }
      },
      message: 'loaded'
    });
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved'), pageContent });
    await act(async (): Promise<void> => undefined);
    const link: HTMLAnchorElement | null = container.querySelector('.ai-app-foot-support a');
    expect(link?.getAttribute('href')).toBe('https://example.invalid/support');
    expect(link?.textContent).toBe('Ask the AI CoE for help');
  });

  it('orders the tabs of an operator: Requests, Improvement, Marketing, then Cases, Metrics and Admin together at the far end (1.0.0.18)', async () => {
    const { container } = await renderShell({ isAdmin: true, roleResolver: resolver(['employee', 'operator'], 'resolved') });
    expect(tabNames(container)).toEqual(['Home', 'Requests', 'Improvement', 'Marketing', 'Cases', 'Metrics', 'Admin']);
    const end: string[] = Array.from(container.querySelectorAll('.ai-app-tab--end')).map((tab: Element): string => (tab.textContent ?? '').trim());
    expect(end).toEqual(['Cases', 'Metrics', 'Admin']);
    // Only the first of the end group is pushed to the far side; the other two follow it.
    const first: Element[] = Array.from(container.querySelectorAll('.ai-app-tab--end-first'));
    expect(first.map((tab: Element): string => (tab.textContent ?? '').trim())).toEqual(['Cases']);
  });

  it('places the administrator control last, apart from the section tabs, for a site owner', async () => {
    const { container } = await renderShell({
      isAdmin: true,
      roleResolver: resolver(['employee', 'operator'], 'resolved')
    });
    const names: string[] = tabNames(container);
    expect(names.indexOf('Admin')).toBe(names.length - 1);
    expect(names.indexOf('Home')).toBe(0);
    const admin: Element | null = container.querySelector('#ai-app-tab-admin');
    expect(admin?.className).toContain('ai-app-tab--admin');
    container.querySelectorAll('[role="tab"]').forEach((tab: Element): void => {
      if ((tab.textContent ?? '').trim() !== 'Admin') {
        expect(tab.className).not.toContain('ai-app-tab--admin');
      }
    });
  });

  it('opens the administrator queue from that control and still opens a section tab', async () => {
    const governance = createFakeGovernanceService();
    const { container } = await renderShell({
      isAdmin: true,
      roleResolver: resolver(['employee', 'operator'], 'resolved'),
      governance
    });
    const adminTab: HTMLElement = container.querySelector('#ai-app-tab-admin') as HTMLElement;
    await act(async (): Promise<void> => {
      fireEvent.click(adminTab);
    });
    await waitFor((): void => {
      expect(container.textContent).toContain('AI CoE Admin Dashboard');
    });
    expect(governance.dashboardCalls).toBeGreaterThan(0);
    const casesTab: HTMLElement = Array.from(container.querySelectorAll('[role="tab"]')).filter((tab: Element): boolean => (tab.textContent ?? '').trim() === 'Cases')[0] as HTMLElement;
    await act(async (): Promise<void> => {
      fireEvent.click(casesTab);
    });
    expect(selected(container)).toBe('Cases');
    expect(container.querySelector('.ai-admin-dashboard')).toBeNull();
  });

  it('keeps System map absent and administrator reads lazy even for a site owner', async () => {
    const governance = createFakeGovernanceService();
    const { container } = await renderShell({
      isAdmin: true,
      roleResolver: resolver(['employee', 'operator'], 'resolved'),
      governance
    });
    expect(tabNames(container)).not.toContain('System map');
    expect(tabNames(container)).toContain('Admin');
    expect(selected(container)).toBe('Home');
    expect(container.querySelector('.ai-admin-dashboard')).toBeNull();
    expect(container.querySelector('.ai-usage-section')).toBeNull();
    expect(governance.dashboardCalls).toBe(0);
  });

  it('moves to the administrator control with End when the person may open it', async () => {
    const { container } = await renderShell({
      isAdmin: true,
      roleResolver: resolver(['employee', 'operator'], 'resolved')
    });
    const list: Element = container.querySelector('[role="tablist"]') as Element;
    await act(async (): Promise<void> => {
      fireEvent.keyDown(list, { key: 'End' });
    });
    expect(selected(container)).toBe('Admin');
  });

  it('keeps the outcome and feedback cards on Improvement and the larger panels below, under What is going on?', async () => {
    const { container } = await renderShell();
    const improvementTab: HTMLElement = Array.from(container.querySelectorAll('[role="tab"]')).filter((tab: Element): boolean => (tab.textContent ?? '').trim() === 'Improvement')[0] as HTMLElement;
    await act(async (): Promise<void> => {
      fireEvent.click(improvementTab);
    });
    const list: Element | null = container.querySelector('.ai-app-starters--spaced');
    expect(list).not.toBeNull();
    const titles: string[] = Array.from((list as Element).querySelectorAll('.ai-app-starter-title')).map((node: Element): string => (node.textContent ?? '').trim());
    // Register team AI use moved to Requests (1.0.0.18); the explanation sits under "What is going on?", closed.
    expect(titles).toEqual(['Record a task outcome', 'Share feedback']);
    expect(container.textContent).not.toContain('What happens to what you record');
    const disclosure: HTMLElement = Array.from(container.querySelectorAll('button')).filter((button: Element): boolean => (button.textContent ?? '').trim() === 'What is going on?')[0] as HTMLElement;
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    await act(async (): Promise<void> => { fireEvent.click(disclosure); });
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.ai-app-split')).not.toBeNull();
    expect(container.textContent).toContain('What happens to what you record');
    expect(container.textContent).toContain('What an outcome keeps');
  });

  it('does not mount the administrator queue or read it for an employee', async () => {
    const governance = createFakeGovernanceService();
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved'), governance });
    expect(container.querySelector('#ai-app-tab-admin')).toBeNull();
    expect(container.querySelector('.ai-app-tab--admin')).toBeNull();
    expect(container.querySelector('.ai-admin-dashboard')).toBeNull();
    expect(governance.dashboardCalls).toBe(0);
  });
});
