import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { createFakePageContentService, createFakeUsageService, createPendingPageContentService, InMemoryDraftStore } from '../../../../testing/fakeServices';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../testing/renderWithFrontDoor';
import type { FrontDoorRenderResult, ITestFrontDoorOptions } from '../../../../testing/renderWithFrontDoor';
import { CONTENT_UNAVAILABLE_TEXT, ContentPage, LOADING_PAGE_TEXT, NO_PAGE_KEY_TEXT, pageMissingText } from './ContentPage';

function renderPage(pageKey: string | undefined, options: ITestFrontDoorOptions = {}): FrontDoorRenderResult {
  return renderWithFrontDoor(<ContentPage pageKey={pageKey} />, { pageContent: createFakePageContentService(), ...options });
}

function blockTypes(container: HTMLElement): string[] {
  const blocks: HTMLElement[] = Array.prototype.slice.call(container.querySelectorAll('.ai-home.ai-page > .ai-page-block'));
  return blocks.map((block: HTMLElement): string => block.className.replace('ai-page-block ai-page-block--', ''));
}

describe('ContentPage', () => {
  it('shows a loading state until the document arrives', () => {
    renderPage('startHere', { pageContent: createPendingPageContentService() });
    expect(screen.getByRole('status')).toHaveTextContent(LOADING_PAGE_TEXT);
  });

  it('renders the blocks of the requested page in order', async () => {
    const { container } = renderPage('startHere');
    await screen.findByRole('heading', { level: 1, name: 'What do you need done?' });
    expect(blockTypes(container)).toEqual(['hero', 'heading', 'tiles', 'cards', 'statusRow']);
    expect(screen.getByRole('heading', { level: 2, name: 'What do you want to do?' })).toBeInTheDocument();
    expect(container.querySelectorAll('.ai-page-tiles > a.ai-service-card')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /Use AI for my work/ })).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Use-AI.aspx`);
    expect(container.querySelectorAll('.ai-page-cards--3 > .ai-page-card')).toHaveLength(3);
    expect(container.querySelectorAll('.ai-page-status-item')).toHaveLength(2);
    expect(screen.queryByText('AI CoE Lab')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('asks for a page key when none is configured', () => {
    renderPage(undefined);
    expect(screen.getByText(NO_PAGE_KEY_TEXT).closest('.overture-notice')).not.toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('names a page the document does not have', async () => {
    renderPage('nope');
    await screen.findByText(pageMissingText('nope'));
    expect(pageMissingText('nope')).toContain('"nope"');
  });

  it('explains when the document is unavailable, with the service message', async () => {
    renderPage('startHere', { pageContent: createFakePageContentService({ connected: false, message: 'SiteAssets/ai-coe-pages.json answered 404.' }) });
    const notice: HTMLElement = (await screen.findByText(CONTENT_UNAVAILABLE_TEXT, { exact: false })).closest('.overture-notice') as HTMLElement;
    expect(notice.textContent).toContain('SiteAssets/ai-coe-pages.json answered 404.');
  });

  it('is unavailable without a content service', () => {
    renderWithFrontDoor(<ContentPage pageKey="startHere" />);
    expect(screen.getByText(CONTENT_UNAVAILABLE_TEXT, { exact: false })).toBeInTheDocument();
  });

  it('embeds the home tiles with draft badges and the lanes on the requests page', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    await draftStore.save('idea', { answers: { workToImprove: 'Reports' }, currentStepId: 'painPoints', phase: 'form' });
    const { container } = renderPage('requests', { draftStore });
    await screen.findByText('Resume draft');
    expect(screen.getAllByText('Resume draft')).toHaveLength(1);
    const idea: HTMLElement = screen.getByText('Explore an AI idea').closest('a') as HTMLElement;
    expect(idea).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Explore-an-AI-idea.aspx`);
    expect(within(idea).getByText('Resume draft')).toBeInTheDocument();
    expect(blockTypes(container)).toEqual(['heading', 'lanes', 'paragraph', 'piece']);
    expect(container.querySelector('.ai-page-lane--green')).not.toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('embeds the telemetry strip between the cards on the status page', async () => {
    const { container } = renderPage('status', { usage: createFakeUsageService() });
    await screen.findByText('SharePoint connected');
    expect(blockTypes(container)).toEqual(['paragraph', 'cards', 'piece', 'cards']);
    expect(container.querySelector('.ai-page-block--piece > .ai-usage-section')).not.toBeNull();
    expect(container.querySelector('.ai-home-grid')).toBeNull();
  });
});
