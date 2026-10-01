/**
 * The consolidated shell. The cases that matter are the ones a rebuild could quietly break: the gate must keep a
 * section out of the tab list AND out of the tree, the keyboard must be able to move along the tabs, and a section
 * change must land somewhere a screen reader announces.
 */
import * as React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import { AppShell } from './AppShell';
import type { IPageViewSettings } from '../../content/pageViews';
import type { RoleId } from '../../content/roles';
import type { IRoleResolution, IRoleResolver } from '../../services/roleResolver';
import { createFakeGovernanceService, createFakePageContentService, createFakeProgramMeasuresService, createFakeUsageService, InMemoryDraftStore } from '../../../../testing/fakeServices';
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
  it('opens on the first screen with the entry panel and the three ways in', async () => {
    const { container } = await renderShell();
    expect(container.querySelector('.ai-app-hero-title')?.textContent).toBe('Make the next move.');
    const choices: number = container.querySelectorAll('.ai-app-choice-button').length;
    expect(choices).toBe(3);
    expect(selected(container)).toBe('Home');
  });

  it('keeps a section a person may not use out of the tab list entirely', async () => {
    // An employee holds none of the narrowed capabilities, so the three gated sections are absent - not disabled,
    // not styled differently, absent. Their services are therefore never constructed.
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const names: string[] = tabNames(container);
    expect(names).toEqual(['Home', 'Cases', 'Engineering', 'Improvement']);
    expect(names.indexOf('Marketing')).toBe(-1);
    expect(names.indexOf('Enterprise value')).toBe(-1);
    expect(names.indexOf('System map')).toBe(-1);
    expect(names.indexOf('Admin')).toBe(-1);
  });

  it('opens the measured view to a leader but still not the operator surface', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee', 'leader'], 'resolved') });
    const names: string[] = tabNames(container);
    expect(names.indexOf('Enterprise value')).toBeGreaterThan(-1);
    expect(names.indexOf('System map')).toBe(-1);
    expect(names.indexOf('Marketing')).toBe(-1);
    expect(names.indexOf('Admin')).toBe(-1);
  });

  it('shows nothing narrowed while the membership is unresolved, rather than guessing', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee', 'operator'], 'unresolved') });
    const names: string[] = tabNames(container);
    expect(names).toEqual(['Home', 'Cases', 'Engineering', 'Improvement']);
  });

  it('moves along the tabs with the arrow keys, and wraps at both ends', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const list: Element = container.querySelector('[role="tablist"]') as Element;
    expect(selected(container)).toBe('Home');
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'ArrowRight' }); });
    expect(selected(container)).toBe('Cases');
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'ArrowLeft' }); });
    expect(selected(container)).toBe('Home');
    // Left from the first wraps to the last, which is what a tab list promises.
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'ArrowLeft' }); });
    expect(selected(container)).toBe('Improvement');
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'Home' }); });
    expect(selected(container)).toBe('Home');
    await act(async (): Promise<void> => { fireEvent.keyDown(list, { key: 'End' }); });
    expect(selected(container)).toBe('Improvement');
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

  it('carries the footer promise on every section', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    expect(container.querySelector('.ai-app-foot')?.textContent).toContain('without a person deciding it');
  });

  it('does not mount Enterprise value or call getMeasures when an employee clicks the Home card', async () => {
    const measures = createFakeProgramMeasuresService();
    const usage = createFakeUsageService();
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved'), programMeasures: measures, usage });
    const cards: NodeListOf<HTMLButtonElement> = container.querySelectorAll('.ai-app-choice-button');
    const value: HTMLButtonElement | undefined = Array.from(cards).filter((button: HTMLButtonElement): boolean => (button.textContent ?? '').indexOf('Review enterprise AI value') >= 0)[0];
    expect(value).toBeDefined();
    await act(async (): Promise<void> => {
      fireEvent.click(value as HTMLButtonElement);
    });
    expect(measures.calls).toBe(0);
    expect(usage.calls).toBe(0);
    expect(selected(container)).toBe('Home');
    expect(container.textContent).toContain('This part of the front door is not available to you');
    expect(container.querySelector('.ai-app-measures')).toBeNull();
    expect(container.querySelector('.ai-usage-section')).toBeNull();
  });

  it('does not fetch measures or usage while membership is unresolved, including from the Home card', async () => {
    const measures = createFakeProgramMeasuresService();
    const usage = createFakeUsageService();
    const { container } = await renderShell({
      roleResolver: resolver(['employee', 'operator'], 'unresolved'),
      programMeasures: measures,
      usage
    });
    expect(tabNames(container).indexOf('Enterprise value')).toBe(-1);
    expect(container.querySelector('.ai-usage-section')).toBeNull();
    expect(measures.calls).toBe(0);
    expect(usage.calls).toBe(0);
    const cards: NodeListOf<HTMLButtonElement> = container.querySelectorAll('.ai-app-choice-button');
    const value: HTMLButtonElement | undefined = Array.from(cards).filter((button: HTMLButtonElement): boolean => (button.textContent ?? '').indexOf('Review enterprise AI value') >= 0)[0];
    await act(async (): Promise<void> => {
      fireEvent.click(value as HTMLButtonElement);
    });
    expect(selected(container)).toBe('Home');
    expect(measures.calls).toBe(0);
    expect(usage.calls).toBe(0);
    expect(container.querySelector('.ai-usage-section')).toBeNull();
  });

  it('shows Usage on Enterprise value for an operator and not on System map', async () => {
    const measures = createFakeProgramMeasuresService();
    const usage = createFakeUsageService();
    const { container } = await renderShell({
      isAdmin: true,
      roleResolver: resolver(['employee', 'operator'], 'resolved'),
      programMeasures: measures,
      usage
    });
    const valueTab: HTMLElement = Array.from(container.querySelectorAll('[role="tab"]')).filter((tab: Element): boolean => (tab.textContent ?? '').trim() === 'Enterprise value')[0] as HTMLElement;
    await act(async (): Promise<void> => {
      fireEvent.click(valueTab);
    });
    expect(selected(container)).toBe('Enterprise value');
    await waitFor((): void => {
      expect(container.textContent).toContain('Usage');
    });
    expect(container.querySelector('.ai-usage-section')).not.toBeNull();
    expect(container.textContent).toContain('Read from the usage lists');
    expect(usage.calls).toBeGreaterThan(0);
    expect(measures.calls).toBeGreaterThan(0);
    const mapTab: HTMLElement = Array.from(container.querySelectorAll('[role="tab"]')).filter((tab: Element): boolean => (tab.textContent ?? '').trim() === 'System map')[0] as HTMLElement;
    await act(async (): Promise<void> => {
      fireEvent.click(mapTab);
    });
    expect(selected(container)).toBe('System map');
    expect(container.textContent).toContain('What is connected');
    expect(container.querySelector('.ai-usage-section')).toBeNull();
    expect(container.textContent).not.toContain('AI operations snapshot');
  });

  it('lets a leader open Enterprise value without mounting usage or calling getMetrics', async () => {
    const measures = createFakeProgramMeasuresService();
    const usage = createFakeUsageService();
    const { container } = await renderShell({
      roleResolver: resolver(['employee', 'leader'], 'resolved'),
      programMeasures: measures,
      usage
    });
    const valueTab: HTMLElement = Array.from(container.querySelectorAll('[role="tab"]')).filter((tab: Element): boolean => (tab.textContent ?? '').trim() === 'Enterprise value')[0] as HTMLElement;
    await act(async (): Promise<void> => {
      fireEvent.click(valueTab);
    });
    expect(selected(container)).toBe('Enterprise value');
    await waitFor((): void => {
      expect(measures.calls).toBeGreaterThan(0);
    });
    expect(container.querySelector('.ai-usage-section')).toBeNull();
    expect(container.textContent).not.toContain('AI operations snapshot');
    expect(usage.calls).toBe(0);
  });

  it('keeps the Home sentence as the idea draft and opens the guided request with the same wording', async () => {
    const { container, draftStore } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    const input: HTMLInputElement = container.querySelector('#ai-app-command-input') as HTMLInputElement;
    const form: HTMLFormElement = container.querySelector('.ai-app-command') as HTMLFormElement;
    await act(async (): Promise<void> => {
      fireEvent.change(input, { target: { value: 'Prepare a weekly operations pack' } });
    });
    await act(async (): Promise<void> => {
      fireEvent.submit(form);
    });
    await waitFor((): void => {
      expect(draftStore.drafts.idea).toBeDefined();
    });
    const stored: { answers: { workToImprove: string } } = JSON.parse(draftStore.drafts.idea) as { answers: { workToImprove: string } };
    expect(stored.answers.workToImprove).toBe('Prepare a weekly operations pack');
    const resumed: HTMLInputElement | null = container.querySelector('#workToImprove');
    expect(resumed?.value).toBe('Prepare a weekly operations pack');
  });

  it('keeps the sentence in the box and opens nothing when the draft cannot be saved', async () => {
    const failing = new InMemoryDraftStore();
    failing.save = async (): Promise<{ ok: boolean }> => ({ ok: false });
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved'), draftStore: failing });
    const input: HTMLInputElement = container.querySelector('#ai-app-command-input') as HTMLInputElement;
    const form: HTMLFormElement = container.querySelector('.ai-app-command') as HTMLFormElement;
    await act(async (): Promise<void> => {
      fireEvent.change(input, { target: { value: 'Prepare a weekly operations pack' } });
    });
    await act(async (): Promise<void> => {
      fireEvent.submit(form);
    });
    await waitFor((): void => {
      expect(container.textContent).toContain('could not be kept on this device');
    });
    expect(selected(container)).toBe('Home');
    expect(input.value).toBe('Prepare a weekly operations pack');
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

  it('tells an operator without site-owner permission that the queue was not read', async () => {
    const governance = createFakeGovernanceService();
    const { container } = await renderShell({
      isAdmin: false,
      roleResolver: resolver(['employee', 'operator'], 'resolved'),
      governance
    });
    const mapTab: HTMLElement = Array.from(container.querySelectorAll('[role="tab"]')).filter((tab: Element): boolean => (tab.textContent ?? '').trim() === 'System map')[0] as HTMLElement;
    await act(async (): Promise<void> => {
      fireEvent.click(mapTab);
    });
    expect(container.textContent).toContain('Your operator role is confirmed');
    expect(governance.dashboardCalls).toBe(0);
    expect(tabNames(container).indexOf('Admin')).toBe(-1);
  });

  it('says the support route is unbound when the content document does not name one', async () => {
    const { container } = await renderShell({ roleResolver: resolver(['employee'], 'resolved') });
    expect(container.textContent).toContain('Support route: not bound on this site yet.');
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

  it('does not keep the administrator queue on System map once it has its own control', async () => {
    const governance = createFakeGovernanceService();
    const { container } = await renderShell({
      isAdmin: true,
      roleResolver: resolver(['employee', 'operator'], 'resolved'),
      governance
    });
    const mapTab: HTMLElement = Array.from(container.querySelectorAll('[role="tab"]')).filter((tab: Element): boolean => (tab.textContent ?? '').trim() === 'System map')[0] as HTMLElement;
    await act(async (): Promise<void> => {
      fireEvent.click(mapTab);
    });
    expect(selected(container)).toBe('System map');
    expect(container.textContent).toContain('What is connected');
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

  it('spaces Register team AI use from the other Improvement cards and keeps the larger panels below', async () => {
    const { container } = await renderShell();
    const improvementTab: HTMLElement = Array.from(container.querySelectorAll('[role="tab"]')).filter((tab: Element): boolean => (tab.textContent ?? '').trim() === 'Improvement')[0] as HTMLElement;
    await act(async (): Promise<void> => {
      fireEvent.click(improvementTab);
    });
    const list: Element | null = container.querySelector('.ai-app-starters--spaced');
    expect(list).not.toBeNull();
    const titles: string[] = Array.from((list as Element).querySelectorAll('.ai-app-starter-title')).map((node: Element): string => (node.textContent ?? '').trim());
    expect(titles).toEqual(['Register team AI use', 'Record a task outcome', 'Share feedback']);
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
