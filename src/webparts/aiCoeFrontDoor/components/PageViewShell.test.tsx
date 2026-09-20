import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { createFakePageContentService, createFakeRoleResolver, createFakeUsageService, InMemoryDraftStore } from '../../../testing/fakeServices';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../testing/renderWithFrontDoor';
import type { FrontDoorRenderResult, ITestFrontDoorOptions } from '../../../testing/renderWithFrontDoor';
import { firstStepOf } from '../../../testing/workflowHarness';
import { createBranding } from '../branding/branding';
import type { IPageDocument } from '../content/pageContent';
import type { FrontDoorView, IPageViewSettings } from '../content/pageViews';
import { createWorkflowCatalog, WORKFLOW_ORDER } from '../content/workflows/catalog';
import { OUTCOME_WORKFLOW } from '../content/workflows/outcome';
import type { IFrontDoorUser } from '../context/FrontDoorContext';
import type { IRoleResolution } from '../services/roleResolver';
import type { IWorkflowCatalog } from '../workflows/types';
import { NO_PAGE_KEY_TEXT } from './pages/ContentPage';
import { ADMIN_ONLY_TEXT, DEFAULT_CHROME_BADGE, PageViewShell, UNCONFIGURED_VIEW_TEXT } from './PageViewShell';

const catalog: IWorkflowCatalog = createWorkflowCatalog(createBranding('Overture'));
const RETURN_URL: string = 'https://contoso.sharepoint.com/sites/ai/SitePages/Requests.aspx';
const ADA: IFrontDoorUser = { displayName: 'Ada Contoso', email: 'ada@contoso.com' };

/** A document whose shared footer carries the support route and a closing line, and one content page. */
const FOOTER_DOCUMENT: IPageDocument = {
  version: 1,
  shared: {
    footer: [
      {
        type: 'supportRoute',
        label: 'Ask in the pilot channel',
        href: 'https://teams.microsoft.com/l/channel/contoso',
        stopWhen: ['a source is missing'],
        reportFields: ['the task type', 'the time'],
        routes: [{ issue: 'Outcome is uncertain after an action', owner: 'Recovery owner', action: 'Reconcile the native state before retrying' }]
      },
      { type: 'paragraph', text: 'Nothing here is graded.' }
    ]
  },
  pages: {
    startHere: {
      title: 'Start here',
      blocks: [
        { type: 'hero', title: 'What do you need done?' },
        { type: 'paragraph', text: 'One sentence is enough.' }
      ]
    }
  }
};

function footerService(): ReturnType<typeof createFakePageContentService> {
  return createFakePageContentService({ connected: true, message: 'ok', document: FOOTER_DOCUMENT });
}

function settingsFor(view: FrontDoorView, overrides: Partial<IPageViewSettings> = {}): IPageViewSettings {
  return { view, layout: 'wide', pages: {}, ...overrides };
}

function renderView(settings: IPageViewSettings, options: ITestFrontDoorOptions = {}): FrontDoorRenderResult {
  return renderWithFrontDoor(<PageViewShell settings={settings} />, options);
}

describe('PageViewShell', () => {
  it('renders a workflow view inside the workflow shell with the header chrome and no hero', async () => {
    const { container } = renderView(settingsFor('idea'), { user: ADA });
    expect(container.firstChild).toHaveClass('overture-app', 'ai-view', 'ai-view--idea');
    expect(container.firstChild).not.toHaveClass('min-h-screen');
    expect(container.firstChild).not.toHaveClass('ai-view--narrow');
    expect(container.querySelector('.ai-workflow-shell')).not.toBeNull();
    expect(container.querySelector('.ai-home-shell')).toBeNull();
    // The header names the CoE, never a "Lab"; the badge names the intake, never a connection it has not proved.
    expect(container.querySelector('p.ai-page-header')?.textContent).toBe('Overture AI CoE');
    expect(screen.queryByText('AI CoE Lab')).not.toBeInTheDocument();
    const badge: HTMLElement = container.querySelector('.overture-badge') as HTMLElement;
    expect(badge.textContent).toBe(DEFAULT_CHROME_BADGE);
    expect(badge.textContent).toBe('Governed intake');
    expect(screen.queryByText('Governed intake · SharePoint connected')).not.toBeInTheDocument();
    expect(container.querySelector('p.ai-page-identity')?.textContent).toBe('Signed in as Ada Contoso · role not set');
    expect(screen.getByRole('heading', { level: 1, name: catalog.idea.title })).toBeInTheDocument();
    await firstStepOf(catalog.idea);
    expect(screen.queryByText('AI, safely put to work.')).not.toBeInTheDocument();
  });

  it('takes the badge wording from the document vocabulary', async () => {
    const document: IPageDocument = { ...FOOTER_DOCUMENT, vocabulary: { truthStates: {}, requestStatuses: {}, chrome: { badge: 'Pilot intake' }, roles: {}, telemetry: {} } };
    const { container } = renderView(settingsFor('idea'), { pageContent: createFakePageContentService({ connected: true, message: 'ok', document }) });
    await firstStepOf(catalog.idea);
    await waitFor((): void => expect(container.querySelector('.overture-badge')?.textContent).toBe('Pilot intake'));
    expect(screen.queryByText('Governed intake')).not.toBeInTheDocument();
  });

  it('wraps a workflow view in a region named after the workflow, with no main landmark', async () => {
    const { container } = renderView(settingsFor('feedback'));
    await firstStepOf(catalog.feedback);
    const region: HTMLElement = container.querySelector('.ai-workflow-shell > div[role="region"]') as HTMLElement;
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute('aria-label', catalog.feedback.title);
    expect(within(region).getByRole('heading', { level: 1, name: catalog.feedback.title })).toBeInTheDocument();
    expect(container.querySelector('main')).toBeNull();
    expect(screen.getByRole('region', { name: catalog.feedback.title })).toBe(region);
  });

  it('names the region of every other piece and shows the identity line on each', async () => {
    const cases: { settings: IPageViewSettings; label: string; options?: ITestFrontDoorOptions }[] = [
      { settings: settingsFor('home'), label: 'Home tiles' },
      { settings: settingsFor('telemetry'), label: 'AI operations snapshot', options: { usage: createFakeUsageService() } },
      { settings: settingsFor('admin'), label: 'Administrator dashboard' },
      { settings: settingsFor('page'), label: 'Content page', options: { pageContent: createFakePageContentService() } }
    ];
    for (const item of cases) {
      const { container, unmount } = renderView(item.settings, { ...(item.options ?? {}), user: ADA });
      const region: HTMLElement = container.querySelector('.ai-home-shell > div[role="region"]') as HTMLElement;
      expect(region).toHaveAttribute('aria-label', item.label);
      expect(container.querySelector('main')).toBeNull();
      expect(container.querySelector('p.ai-page-identity')?.textContent).toBe('Signed in as Ada Contoso · role not set');
      expect(container.querySelectorAll('.ai-page-identity')).toHaveLength(1);
      expect(container.querySelector('.overture-badge')).toBeNull();
      if (item.settings.view === 'telemetry') {
        await screen.findByText('SharePoint connected');
      }
      // Let the draft discovery of the home piece settle before the tree goes away.
      await act(async (): Promise<void> => undefined);
      unmount();
    }
  });

  it('exits a workflow to the return page', async () => {
    const { navigate } = renderView(settingsFor('toolCheck', { returnUrl: RETURN_URL }));
    await firstStepOf(catalog.toolCheck);
    fireEvent.click(screen.getByRole('button', { name: 'All topics' }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(RETURN_URL);
    expect(screen.queryByText('AI, safely put to work.')).not.toBeInTheDocument();
  });

  it('falls back to the site when no return page is configured', async () => {
    const { navigate } = renderView(settingsFor('feedback'));
    await firstStepOf(catalog.feedback);
    fireEvent.click(screen.getByRole('button', { name: 'All topics' }));
    expect(navigate).toHaveBeenCalledWith(TEST_SITE_URL);
  });

  it('resumes a saved draft automatically', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    await draftStore.save('idea', { answers: { workToImprove: 'Reports' }, currentStepId: 'painPoints', phase: 'form' });
    renderView(settingsFor('idea'), { draftStore });
    await screen.findByText('Picking up where you left off.');
    expect(screen.getByRole('heading', { level: 2, name: catalog.idea.steps[1].title })).toBeInTheDocument();
  });

  it('routes every workflow view to its workflow', async () => {
    for (const workflow of [catalog.teamUsage, catalog.helpTraining, catalog.feedback]) {
      const { unmount } = renderView(settingsFor(workflow.id));
      expect(screen.getByRole('heading', { level: 1, name: workflow.title })).toBeInTheDocument();
      await firstStepOf(workflow);
      unmount();
    }
  });

  it('renders the telemetry strip alone inside the home shell', async () => {
    const { container } = renderView(settingsFor('telemetry'), { usage: createFakeUsageService() });
    expect(container.firstChild).toHaveClass('ai-view--telemetry');
    expect(container.querySelector('.ai-home-shell .ai-home > .ai-usage-section')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'AI operations snapshot' })).toBeInTheDocument();
    await screen.findByText('SharePoint connected');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByText('AI CoE Lab')).not.toBeInTheDocument();
    expect(container.querySelector('.ai-home-grid')).toBeNull();
  });

  it('shows the administrator dashboard to site administrators and exits to the return page', async () => {
    const { navigate } = renderView(settingsFor('admin', { returnUrl: RETURN_URL }), { isAdmin: true });
    expect(screen.getByRole('heading', { level: 1, name: 'AI CoE Admin Dashboard' })).toBeInTheDocument();
    await screen.findByText('0 of 0 records shown');
    fireEvent.click(screen.getByRole('button', { name: 'Front Door' }));
    expect(navigate).toHaveBeenCalledWith(RETURN_URL);
  });

  it('tells everyone else the dashboard is for administrators, without the landing page', () => {
    const { container, governance } = renderView(settingsFor('admin'), { isAdmin: false });
    expect(screen.getByText(ADMIN_ONLY_TEXT).closest('.overture-notice')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'AI CoE Admin Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByText('AI, safely put to work.')).not.toBeInTheDocument();
    expect(container.querySelector('.ai-home-grid')).toBeNull();
    expect(governance.dashboardCalls).toBe(0);
  });

  it('adds the narrow modifier for the narrow layout', () => {
    const { container } = renderView(settingsFor('telemetry', { layout: 'narrow' }));
    expect(container.firstChild).toHaveClass('ai-view--telemetry', 'ai-view--narrow');
  });

  it('renders the home tiles and discovers saved drafts', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    await draftStore.save('idea', { answers: { workToImprove: 'Reports' }, currentStepId: 'painPoints', phase: 'form' });
    await draftStore.save('feedback', { answers: {}, phase: 'form' });
    const pages: IPageViewSettings['pages'] = {
      idea: `${TEST_SITE_URL}/SitePages/Explore-an-AI-idea.aspx`,
      toolCheck: `${TEST_SITE_URL}/SitePages/Check-a-tool-or-task.aspx`,
      feedback: `${TEST_SITE_URL}/SitePages/Share-feedback.aspx`
    };
    const { container } = renderView(settingsFor('home', { pages }), { draftStore });
    await waitFor((): void => expect(screen.getAllByText('Resume draft')).toHaveLength(2));
    expect(within(screen.getByText('Explore an AI idea').closest('a') as HTMLElement).getByText('Resume draft')).toBeInTheDocument();
    expect(within(screen.getByText('Check a tool or task').closest('a') as HTMLElement).queryByText('Resume draft')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveClass('ai-view--home');
    expect(container.querySelector('.ai-home-shell')).not.toBeNull();
    expect(screen.queryByText('AI CoE Lab')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('keeps the outcome view on the wizard path, never the home shell (decision 16)', async () => {
    const { container } = renderView(settingsFor('outcome'), { user: ADA });
    // Since step 29b the view renders the outcome piece, which reads the draft store before its first question.
    await firstStepOf(OUTCOME_WORKFLOW);
    expect(container.firstChild).toHaveClass('overture-app', 'ai-view', 'ai-view--outcome');
    expect(container.querySelector('.ai-workflow-shell')).not.toBeNull();
    expect(container.querySelector('.ai-home-shell')).toBeNull();
    expect(container.querySelector('.ai-home-grid')).toBeNull();
    expect(container.querySelector('.overture-badge')?.textContent).toBe(DEFAULT_CHROME_BADGE);
    expect(container.querySelector('div[role="region"]')).toHaveAttribute('aria-label', 'Record a task outcome');
    expect(screen.queryByText('AI, safely put to work.')).not.toBeInTheDocument();
  });

  it('shows a configuration notice for the legacy view instead of the landing page', () => {
    renderView(settingsFor('legacy'));
    expect(screen.getByText(UNCONFIGURED_VIEW_TEXT).closest('.overture-notice')).not.toBeNull();
    expect(screen.queryByText('AI, safely put to work.')).not.toBeInTheDocument();
  });

  it('renders a content page inside the home shell, in a region named after the page, with the identity line', async () => {
    const { container } = renderView(settingsFor('page', { pageKey: 'startHere' }), { pageContent: createFakePageContentService(), user: ADA });
    expect(container.firstChild).toHaveClass('overture-app', 'ai-view', 'ai-view--page');
    await screen.findByRole('heading', { level: 1, name: 'What do you need done?' });
    expect(container.querySelector('.ai-home-shell > div[role="region"] > .ai-home.ai-page > .ai-page-block--hero')).not.toBeNull();
    expect(container.querySelector('main')).toBeNull();
    expect(screen.getByRole('region', { name: 'Start here' })).toBe(container.querySelector('.ai-home-shell > div[role="region"]'));
    expect(container.querySelector('p.ai-page-identity')?.textContent).toBe('Signed in as Ada Contoso · role not set');
    expect(container.querySelectorAll('.ai-page-identity')).toHaveLength(1);
    expect(container.querySelector('.ai-workflow-shell')).toBeNull();
    expect(container.querySelector('.overture-badge')).toBeNull();
    expect(screen.queryByText('AI CoE Lab')).not.toBeInTheDocument();
    expect(screen.queryByText('AI, safely put to work.')).not.toBeInTheDocument();
  });

  it('names the role of the signed-in person on the identity line, from the site groups alone', async () => {
    const { container } = renderView(settingsFor('page', { pageKey: 'startHere' }), {
      pageContent: createFakePageContentService(),
      user: ADA,
      roleResolver: createFakeRoleResolver({ roles: ['employee', 'leader'], resolution: 'resolved' })
    });
    await screen.findByRole('heading', { level: 1, name: 'What do you need done?' });
    await waitFor((): void => expect(container.querySelector('p.ai-page-identity')?.textContent).toBe('Signed in as Ada Contoso · Leader'));
    expect(container.querySelectorAll('.ai-page-identity')).toHaveLength(1);
  });

  it('says the role is not set when the membership names none and when it could not be read', async () => {
    const cases: IRoleResolution[] = [
      { roles: ['employee'], resolution: 'resolved' },
      { roles: ['employee'], resolution: 'unresolved' }
    ];
    for (const resolution of cases) {
      const { container, unmount } = renderView(settingsFor('page', { pageKey: 'startHere' }), {
        pageContent: createFakePageContentService(),
        user: ADA,
        roleResolver: createFakeRoleResolver(resolution)
      });
      await screen.findByRole('heading', { level: 1, name: 'What do you need done?' });
      await waitFor((): void => expect(container.querySelector('p.ai-page-identity')?.textContent).toBe('Signed in as Ada Contoso · role not set'));
      unmount();
    }
  });

  it('takes the role wording from the document vocabulary', async () => {
    const document: IPageDocument = {
      ...FOOTER_DOCUMENT,
      vocabulary: { truthStates: {}, requestStatuses: {}, chrome: {}, roles: { operator: 'Service desk' }, telemetry: {} }
    };
    const { container } = renderView(settingsFor('page', { pageKey: 'startHere' }), {
      pageContent: createFakePageContentService({ connected: true, message: 'ok', document }),
      user: ADA,
      roleResolver: createFakeRoleResolver({ roles: ['employee', 'operator'], resolution: 'resolved' })
    });
    await screen.findByRole('heading', { level: 1, name: 'What do you need done?' });
    await waitFor((): void => expect(container.querySelector('p.ai-page-identity')?.textContent).toBe('Signed in as Ada Contoso · Service desk'));
  });

  it('asks for a page key on a content page without one', () => {
    renderView(settingsFor('page'), { pageContent: createFakePageContentService() });
    expect(screen.getByText(NO_PAGE_KEY_TEXT).closest('.overture-notice')).not.toBeNull();
  });

  describe('shared footer', () => {
    // The support route is the same help in the same place on every page view (WCAG 2.2 3.2.6, Consistent Help).
    const views: { settings: IPageViewSettings; ready: () => Promise<unknown> }[] = [
      { settings: settingsFor('page', { pageKey: 'startHere' }), ready: (): Promise<unknown> => screen.findByText('One sentence is enough.') }
    ];
    for (const workflowId of WORKFLOW_ORDER) {
      views.push({ settings: settingsFor(workflowId), ready: (): Promise<unknown> => firstStepOf(catalog[workflowId]) });
    }

    it('renders the support route exactly once on the content view and on each of the five wizard views, below the content in the same place', async () => {
      for (const view of views) {
        const { container, unmount } = renderView(view.settings, { pageContent: footerService() });
        await view.ready();
        await screen.findByRole('heading', { level: 2, name: 'Support' });
        const sections: NodeListOf<HTMLElement> = container.querySelectorAll('section.ai-page-support');
        expect(sections).toHaveLength(1);
        const shared: HTMLElement = sections[0].closest('.ai-page-block--shared') as HTMLElement;
        expect(shared).not.toBeNull();
        const shell: HTMLElement = container.querySelector('.ai-home-shell, .ai-workflow-shell') as HTMLElement;
        expect(shared.parentElement).toBe(shell);
        expect(shell.lastElementChild).toBe(shared);
        expect(shared.previousElementSibling).toBe(container.querySelector('div[role="region"]'));
        expect(within(shared).getByRole('link', { name: 'Ask in the pilot channel' })).toHaveAttribute('href', 'https://teams.microsoft.com/l/channel/contoso');
        expect(within(shared).getByText('Nothing here is graded.')).toBeInTheDocument();
        expect(shared.querySelectorAll('.ai-page-block--supportRoute, .ai-page-block--paragraph')).toHaveLength(2);
        unmount();
      }
    });

    it('renders no footer and reads no document on a wizard instance without a content document', async () => {
      const { container } = renderView(settingsFor('idea'));
      await firstStepOf(catalog.idea);
      expect(container.querySelector('.ai-page-block--shared')).toBeNull();
      expect(container.querySelector('section.ai-page-support')).toBeNull();
    });

    it('reads no document on a content view without a page key', () => {
      const pageContent: ReturnType<typeof footerService> = footerService();
      const { container } = renderView(settingsFor('page'), { pageContent });
      expect(screen.getByText(NO_PAGE_KEY_TEXT)).toBeInTheDocument();
      expect(pageContent.calls).toBe(0);
      expect(container.querySelector('.ai-page-block--shared')).toBeNull();
    });

    it('renders no footer when the document has none', async () => {
      const pageContent: ReturnType<typeof createFakePageContentService> = createFakePageContentService();
      const { container } = renderView(settingsFor('toolCheck'), { pageContent });
      await firstStepOf(catalog.toolCheck);
      await waitFor((): void => expect(pageContent.calls).toBe(1));
      // Let the resolved document settle before asserting that nothing was added.
      await act(async (): Promise<void> => undefined);
      expect(container.querySelector('.ai-page-block--shared')).toBeNull();
    });
  });
});
