import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { createFakePageContentService, createFakeRoleResolver, createFakeUsageService, createPendingPageContentService, InMemoryDraftStore } from '../../../../testing/fakeServices';
import { SAMPLE_PAGE_DOCUMENT } from '../../../../testing/pageDocument';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../testing/renderWithFrontDoor';
import type { FrontDoorRenderResult, ITestFrontDoorOptions } from '../../../../testing/renderWithFrontDoor';
import { parsePageDocument } from '../../content/pageContent';
import type { IPageDocument } from '../../content/pageContent';
import { PageViewShell } from '../PageViewShell';
import { CONTENT_UNAVAILABLE_TEXT, ContentPage, LOADING_PAGE_TEXT, NO_PAGE_KEY_TEXT, pageMissingText, ROLE_NOTE_TEXT } from './ContentPage';

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

/** A one-page document whose page carries whatever the case under test needs (plan step 22). */
function audienceDocument(page: { [key: string]: unknown }): IPageDocument {
  return parsePageDocument(JSON.stringify({ version: 1, pages: { startHere: { title: 'Start here', ...page } } })) as IPageDocument;
}

function documentService(document: IPageDocument): ReturnType<typeof createFakePageContentService> {
  return createFakePageContentService({ connected: true, message: 'ok', document });
}

describe('ContentPage: audience-conditioned blocks', () => {
  const DOCUMENT: IPageDocument = audienceDocument({
    blocks: [
      { type: 'paragraph', text: 'What this site is for.' },
      { type: 'cards', columns: 2, audience: ['leader'], items: [{ title: 'Decisions waiting on you', body: ['Two requests.'], tone: 'teal' }] }
    ]
  });

  it('shows a block to the role it is written for and leaves it out for everyone else', async () => {
    const leader = renderPage('startHere', { pageContent: documentService(DOCUMENT), roles: ['employee', 'leader'] });
    await screen.findByText('What this site is for.');
    expect(blockTypes(leader.container)).toEqual(['paragraph', 'cards']);
    expect(screen.getByRole('heading', { level: 3, name: 'Decisions waiting on you' })).toBeInTheDocument();
    expect(leader.container.querySelector('p.ai-page-role-note')).toBeNull();
    leader.unmount();

    const { container } = renderPage('startHere', { pageContent: documentService(DOCUMENT), roles: ['employee'] });
    await screen.findByText('What this site is for.');
    expect(blockTypes(container)).toEqual(['paragraph']);
    expect(screen.queryByText('Decisions waiting on you')).not.toBeInTheDocument();
    // The membership was read and the role is simply not held: there is nothing to explain.
    expect(container.querySelector('p.ai-page-role-note')).toBeNull();
  });

  it('resolves a route that names roles against the roles the reader holds', async () => {
    const document: IPageDocument = parsePageDocument(
      JSON.stringify({
        version: 1,
        routes: {
          guidedIntake: { label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
          value: { label: 'Enterprise value', href: 'SitePages/Enterprise-value.aspx', state: 'availableNow', roles: ['leader', 'operator'] }
        },
        pages: { startHere: { title: 'Start here', blocks: [{ type: 'tiles', items: [{ title: 'Enterprise value', route: 'value' }] }] } }
      })
    ) as IPageDocument;
    const settings = { view: 'page' as const, layout: 'wide' as const, pages: {}, pageKey: 'startHere' };
    const leader = renderWithFrontDoor(<PageViewShell settings={settings} />, {
      pageContent: documentService(document),
      roleResolver: createFakeRoleResolver({ roles: ['employee', 'leader'], resolution: 'resolved' })
    });
    expect(await leader.findByRole('link', { name: /Enterprise value/ })).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Enterprise-value.aspx`);
    leader.unmount();

    const { container } = renderWithFrontDoor(<PageViewShell settings={settings} />, {
      pageContent: documentService(document),
      roleResolver: createFakeRoleResolver({ roles: ['employee'], resolution: 'resolved' })
    });
    await screen.findByText('Needs access');
    expect(container.querySelector('div.ai-service-card--closed')).not.toBeNull();
    expect(screen.queryByRole('link', { name: /Enterprise-value/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start a guided request/ })).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Explore-an-AI-idea.aspx`);
  });

  it('says why a section is not there when the membership could not be confirmed', async () => {
    const { container } = renderPage('startHere', { pageContent: documentService(DOCUMENT), roles: ['employee'], rolesState: 'unresolved' });
    await screen.findByText('What this site is for.');
    expect(blockTypes(container)).toEqual(['paragraph']);
    expect(container.querySelector('p.ai-page-role-note')?.textContent).toBe(ROLE_NOTE_TEXT);
    expect(ROLE_NOTE_TEXT).toBe('Some sections are not shown because your role could not be confirmed.');
  });

  it('keeps quiet while the roles are still on their way, and on a page that conditions nothing', async () => {
    const pending = renderPage('startHere', { pageContent: documentService(DOCUMENT), rolesState: 'pending' });
    await screen.findByText('What this site is for.');
    expect(blockTypes(pending.container)).toEqual(['paragraph']);
    expect(pending.container.querySelector('p.ai-page-role-note')).toBeNull();
    pending.unmount();

    const plain: IPageDocument = audienceDocument({ blocks: [{ type: 'paragraph', text: 'What this site is for.' }] });
    const { container } = renderPage('startHere', { pageContent: documentService(plain), rolesState: 'unresolved' });
    await screen.findByText('What this site is for.');
    expect(container.querySelector('p.ai-page-role-note')).toBeNull();
  });
});

describe('ContentPage: protected pages', () => {
  const OPERATOR_PAGE: IPageDocument = audienceDocument({
    requiredRole: ['operator'],
    plane: 'operator',
    blocks: [
      { type: 'paragraph', text: 'What the operators watch.' },
      { type: 'piece', piece: 'home' }
    ]
  });

  it('shows the protected text alone to a person without the role, and mounts no piece', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    await draftStore.save('idea', { answers: { workToImprove: 'Reports' }, currentStepId: 'painPoints', phase: 'form' });
    const { container } = renderPage('startHere', { pageContent: documentService(OPERATOR_PAGE), roles: ['employee'], draftStore });
    await screen.findByText('This page is for the AI CoE operator role and is not available to you.');
    expect(container.querySelectorAll('.ai-page-block')).toHaveLength(0);
    expect(screen.queryByText('What the operators watch.')).not.toBeInTheDocument();
    expect(container.querySelector('.ai-home-grid')).toBeNull();
    expect(screen.queryByText('Resume draft')).not.toBeInTheDocument();
    expect(container.querySelector('p.ai-page-role-note')).toBeNull();
  });

  it('opens a page that names two roles to whoever holds either of them', async () => {
    const document: IPageDocument = audienceDocument({ requiredRole: ['leader', 'operator'], blocks: [{ type: 'paragraph', text: 'Enterprise value.' }] });
    const { container } = renderPage('startHere', { pageContent: documentService(document), roles: ['employee', 'operator'] });
    await screen.findByText('Enterprise value.');
    expect(blockTypes(container)).toEqual(['paragraph']);
    expect(screen.queryByText(/is not available to you/)).not.toBeInTheDocument();
  });

  it('keeps a protected page shut while the membership is unread, and takes its wording from the document', async () => {
    const unread = renderPage('startHere', { pageContent: documentService(OPERATOR_PAGE), rolesState: 'unresolved' });
    await screen.findByText('This page is for the AI CoE operator role and is not available to you.');
    unread.unmount();

    const named: IPageDocument = parsePageDocument(
      JSON.stringify({
        version: 1,
        vocabulary: { chrome: { protectedPage: 'Ask the {role} team for this page.' }, roles: { operator: 'Service desk' } },
        pages: { startHere: { title: 'Start here', requiredRole: 'operator', blocks: [{ type: 'paragraph', text: 'What the operators watch.' }] } }
      })
    ) as IPageDocument;
    renderWithFrontDoor(<PageViewShell settings={{ view: 'page', layout: 'wide', pages: {}, pageKey: 'startHere' }} />, { pageContent: documentService(named) });
    await screen.findByText('Ask the Service desk team for this page.');
    expect(screen.queryByText('What the operators watch.')).not.toBeInTheDocument();
  });

  it('shows the code beside the plain words on an operator page, and the plain words alone on a user page', async () => {
    const cases: { plane: string; code: boolean }[] = [
      { plane: 'operator', code: true },
      { plane: 'user', code: false }
    ];
    for (const item of cases) {
      const document: IPageDocument = parsePageDocument(
        JSON.stringify({
          version: 1,
          pages: {
            startHere: {
              title: 'Start here',
              plane: item.plane,
              blocks: [{ type: 'caseCards', items: [{ id: 'EXAMPLE-01', title: 'A worked example', state: 'READY_FOR_TRIAGE', illustrative: true }] }]
            }
          }
        })
      ) as IPageDocument;
      const { container, unmount } = renderWithFrontDoor(<PageViewShell settings={{ view: 'page', layout: 'wide', pages: {}, pageKey: 'startHere' }} />, {
        pageContent: documentService(document)
      });
      await screen.findByRole('heading', { level: 3, name: 'A worked example' });
      expect(container.querySelector('.ai-pill .ai-pill-label')?.textContent).toBe('Received');
      expect(container.querySelector('.ai-pill code.ai-pill-code')?.textContent ?? '').toBe(item.code ? 'READY_FOR_TRIAGE' : '');
      unmount();
    }
  });
});
