import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { createFakePageContentService, createFakeUsageService, createPendingPageContentService, InMemoryDraftStore } from '../../../../testing/fakeServices';
import { SAMPLE_PAGE_DOCUMENT } from '../../../../testing/pageDocument';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../testing/renderWithFrontDoor';
import type { FrontDoorRenderResult, ITestFrontDoorOptions } from '../../../../testing/renderWithFrontDoor';
import type { IPageDocument } from '../../content/pageContent';
import { PageViewShell } from '../PageViewShell';
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
    // The page view shell provides the document's route list to the blocks; on its own the page reads the host's.
    const { container } = renderPage('startHere', { routes: SAMPLE_PAGE_DOCUMENT.routes });
    await screen.findByRole('heading', { level: 1, name: 'What do you need done?' });
    expect(blockTypes(container)).toEqual(['hero', 'workCommand', 'heading', 'tiles', 'cards', 'statusRow']);
    expect(screen.getByRole('heading', { level: 2, name: 'What do you want to do?' })).toBeInTheDocument();
    expect(container.querySelectorAll('.ai-page-tiles > a.ai-service-card')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /Use AI for my work/ })).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Use-AI.aspx`);
    // The sample document's route table closes the work route, so its tile is a labelled non-link with the guided request as fallback.
    expect(container.querySelectorAll('.ai-page-tiles > div.ai-service-card--closed')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Start a guided request/ })).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Explore-an-AI-idea.aspx`);
    expect(container.querySelector('form.ai-page-command')).not.toBeNull();
    expect(container.querySelectorAll('.ai-page-cards--3 > .ai-page-card')).toHaveLength(3);
    expect(container.querySelectorAll('.ai-page-status-item')).toHaveLength(2);
    expect(screen.queryByText('AI CoE Lab')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('dates the facts on the page against the clock of the page document context', async () => {
    const document: IPageDocument = {
      version: 1,
      pages: {
        status: {
          title: 'Status',
          blocks: [
            {
              type: 'cards',
              columns: 2,
              items: [
                { title: 'What is running', body: ['x'], tone: 'teal', asOf: '2026-09-01', source: 'AI CoE check' },
                { title: 'What is not running', body: ['y'], tone: 'gold', source: 'AI CoE check' }
              ]
            },
            { type: 'statusRow', items: [{ label: 'Assistant', text: 'Read back.', asOf: '2026-07-01', source: 'AI CoE check' }] }
          ]
        }
      }
    };
    const service = createFakePageContentService({ connected: true, message: 'ok', document });
    const { container } = renderPage('status', { pageContent: service, now: new Date('2026-09-19T12:00:00Z') });
    await screen.findByRole('heading', { level: 3, name: 'What is running' });
    const lines: NodeListOf<HTMLElement> = container.querySelectorAll('p.ai-page-freshness');
    expect(lines).toHaveLength(3);
    expect(lines[0].textContent).toBe('As of 1 Sep 2026 · AI CoE check');
    expect(lines[1].textContent).toBe('Awaiting source Do not infer progress.');
    expect(lines[2].textContent).toBe('As of 1 Jul 2026 · AI CoE check Needs refresh');
  });

  it('honours the freshness threshold of the document settings', async () => {
    const document: IPageDocument = {
      version: 1,
      settings: { freshnessDays: 7, minimumCohort: 5 },
      pages: {
        status: {
          title: 'Status',
          blocks: [{ type: 'cards', columns: 2, items: [{ title: 'Dated', body: ['x'], tone: 'teal', asOf: '2026-09-01', source: 'AI CoE check' }] }]
        }
      }
    };
    const service = createFakePageContentService({ connected: true, message: 'ok', document });
    // On its own the page reads the host's settings (the defaults: current); through the shell the document's threshold applies (stale).
    const alone = renderPage('status', { pageContent: service, now: new Date('2026-09-19T12:00:00Z') });
    await alone.findByRole('heading', { level: 3, name: 'Dated' });
    expect(alone.container.querySelector('p.ai-page-freshness')?.textContent).toBe('As of 1 Sep 2026 · AI CoE check');
    alone.unmount();
    const { container } = renderWithFrontDoor(<PageViewShell settings={{ view: 'page', layout: 'wide', pages: {}, pageKey: 'status' }} />, {
      pageContent: service,
      now: new Date('2026-09-19T12:00:00Z')
    });
    await screen.findByRole('heading', { level: 3, name: 'Dated' });
    expect(container.querySelector('p.ai-page-freshness')?.textContent).toBe('As of 1 Sep 2026 · AI CoE check Needs refresh');
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

  it('renders the work command against the route list and hands the sentence to the guided intake', async () => {
    const document: IPageDocument = {
      version: 1,
      routes: {
        guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
        work: { key: 'work', label: 'Get work done', state: 'availableNow' }
      },
      pages: {
        startHere: {
          title: 'Start here',
          blocks: [
            { type: 'hero', title: 'What do you need done?' },
            { type: 'workCommand', prompt: 'Say what you need done', submitLabel: 'Start', route: 'work', emptyText: 'Say what you need done first.' },
            { type: 'paragraph', text: 'One sentence is enough.' }
          ]
        }
      }
    };
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    // The page view shell provides the document's route list to the blocks; on its own the page reads the host's.
    const { container, navigate } = renderPage('startHere', { pageContent: createFakePageContentService({ connected: true, document, message: 'ok' }), draftStore, routes: document.routes });
    await screen.findByRole('heading', { level: 1, name: 'What do you need done?' });
    expect(blockTypes(container)).toEqual(['hero', 'workCommand', 'paragraph']);
    expect(container.querySelector('.ai-page-block--workCommand > form.ai-page-command')).not.toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Say what you need done' }), { target: { value: 'prepare me for a customer meeting' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor((): void => expect(navigate).toHaveBeenCalledWith(`${TEST_SITE_URL}/SitePages/Explore-an-AI-idea.aspx`));
    expect(await draftStore.load('idea')).toEqual({
      answers: { workToImprove: 'prepare me for a customer meeting' },
      currentStepId: 'workToImprove',
      phase: 'form',
      summaryDraft: null,
      summarySourceSnapshot: null
    });
  });

  it('renders notices and rules in their block wrappers', async () => {
    const document: IPageDocument = {
      version: 1,
      pages: {
        startHere: {
          title: 'Start here',
          blocks: [
            { type: 'heading', level: 2, text: 'Three rules' },
            { type: 'rules', ordered: true, items: [{ title: 'You decide', text: 'The tool suggests.' }, { title: 'Check every number' }, { title: 'Say when you used it' }] },
            { type: 'notice', tone: 'caution', title: 'Data boundary', text: 'Keep **personal data** out of every prompt.' },
            { type: 'notice', tone: 'info', text: 'Nothing here is graded.' }
          ]
        }
      }
    };
    const { container } = renderPage('startHere', { pageContent: createFakePageContentService({ connected: true, document, message: 'ok' }) });
    await screen.findByRole('heading', { level: 2, name: 'Three rules' });
    expect(blockTypes(container)).toEqual(['heading', 'rules', 'notice', 'notice']);
    expect(container.querySelectorAll('.ai-page-block--rules > ol.ai-page-rules > li.ai-page-rule')).toHaveLength(3);
    const notes: HTMLElement[] = screen.getAllByRole('note');
    expect(notes).toHaveLength(2);
    expect(notes[0]).toHaveClass('ai-page-notice--caution');
    expect(notes[0].querySelector('strong.ai-page-notice-title')?.textContent).toBe('Data boundary');
    expect(notes[1]).toHaveClass('ai-page-notice--info');
    expect(container.querySelectorAll('.ai-page-block--notice > aside.ai-page-notice')).toHaveLength(2);
  });

  it('renders no shared footer itself: the page view shell places it below every view', async () => {
    const document: IPageDocument = {
      version: 1,
      shared: { footer: [{ type: 'supportRoute', label: 'Ask in the pilot channel', stopWhen: [], reportFields: [], routes: [] }] },
      pages: { startHere: { title: 'Start here', blocks: [{ type: 'paragraph', text: 'One sentence is enough.' }] } }
    };
    const { container } = renderPage('startHere', { pageContent: createFakePageContentService({ connected: true, document, message: 'ok' }) });
    await screen.findByText('One sentence is enough.');
    expect(blockTypes(container)).toEqual(['paragraph']);
    expect(container.querySelector('.ai-page-block--shared')).toBeNull();
    expect(container.querySelector('section.ai-page-support')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Support' })).not.toBeInTheDocument();
  });

  it('embeds the telemetry strip between the cards on the status page', async () => {
    const { container } = renderPage('status', { usage: createFakeUsageService() });
    await screen.findByText('SharePoint connected');
    expect(blockTypes(container)).toEqual(['paragraph', 'cards', 'piece', 'cards']);
    expect(container.querySelector('.ai-page-block--piece > .ai-usage-section')).not.toBeNull();
    expect(container.querySelector('.ai-home-grid')).toBeNull();
  });
});
