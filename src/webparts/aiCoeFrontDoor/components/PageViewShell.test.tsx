import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { createFakePageContentService, createFakeUsageService, InMemoryDraftStore } from '../../../testing/fakeServices';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../testing/renderWithFrontDoor';
import type { FrontDoorRenderResult, ITestFrontDoorOptions } from '../../../testing/renderWithFrontDoor';
import { firstStepOf } from '../../../testing/workflowHarness';
import { createBranding } from '../branding/branding';
import type { FrontDoorView, IPageViewSettings } from '../content/pageViews';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import type { IWorkflowCatalog } from '../workflows/types';
import { NO_PAGE_KEY_TEXT } from './pages/ContentPage';
import { ADMIN_ONLY_TEXT, PageViewShell, UNCONFIGURED_VIEW_TEXT } from './PageViewShell';

const catalog: IWorkflowCatalog = createWorkflowCatalog(createBranding('Overture'));
const RETURN_URL: string = 'https://contoso.sharepoint.com/sites/ai/SitePages/Requests.aspx';

function settingsFor(view: FrontDoorView, overrides: Partial<IPageViewSettings> = {}): IPageViewSettings {
  return { view, layout: 'wide', pages: {}, ...overrides };
}

function renderView(settings: IPageViewSettings, options: ITestFrontDoorOptions = {}): FrontDoorRenderResult {
  return renderWithFrontDoor(<PageViewShell settings={settings} />, options);
}

describe('PageViewShell', () => {
  it('renders a workflow view inside the workflow shell with the header chrome and no hero', async () => {
    const { container } = renderView(settingsFor('idea'));
    expect(container.firstChild).toHaveClass('overture-app', 'ai-view', 'ai-view--idea');
    expect(container.firstChild).not.toHaveClass('min-h-screen');
    expect(container.firstChild).not.toHaveClass('ai-view--narrow');
    expect(container.querySelector('.ai-workflow-shell')).not.toBeNull();
    expect(container.querySelector('.ai-home-shell')).toBeNull();
    expect((screen.getByText('AI CoE Lab').closest('p') as HTMLElement).textContent).toBe('Overture AI CoE Lab');
    expect(screen.getByText('Governed intake · SharePoint connected')).toHaveClass('overture-badge');
    expect(screen.getByRole('heading', { level: 1, name: catalog.idea.title })).toBeInTheDocument();
    await firstStepOf(catalog.idea);
    expect(screen.queryByText('AI, safely put to work.')).not.toBeInTheDocument();
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

  it('shows a configuration notice for the legacy view instead of the landing page', () => {
    renderView(settingsFor('legacy'));
    expect(screen.getByText(UNCONFIGURED_VIEW_TEXT).closest('.overture-notice')).not.toBeNull();
    expect(screen.queryByText('AI, safely put to work.')).not.toBeInTheDocument();
  });

  it('renders a content page inside the home shell', async () => {
    const { container } = renderView(settingsFor('page', { pageKey: 'startHere' }), { pageContent: createFakePageContentService() });
    expect(container.firstChild).toHaveClass('overture-app', 'ai-view', 'ai-view--page');
    await screen.findByRole('heading', { level: 1, name: 'What do you need done?' });
    expect(container.querySelector('.ai-home-shell > main > .ai-home.ai-page > .ai-page-block--hero')).not.toBeNull();
    expect(container.querySelector('.ai-workflow-shell')).toBeNull();
    expect(screen.queryByText('AI CoE Lab')).not.toBeInTheDocument();
    expect(screen.queryByText('AI, safely put to work.')).not.toBeInTheDocument();
  });

  it('asks for a page key on a content page without one', () => {
    renderView(settingsFor('page'), { pageContent: createFakePageContentService() });
    expect(screen.getByText(NO_PAGE_KEY_TEXT).closest('.overture-notice')).not.toBeNull();
  });
});
