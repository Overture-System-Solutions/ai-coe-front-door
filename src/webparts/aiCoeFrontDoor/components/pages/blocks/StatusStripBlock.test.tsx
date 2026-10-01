import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { createFakeMyWorkService, createPendingMyWorkService } from '../../../../../testing/fakeServices';
import type { IFakeMyWorkService } from '../../../../../testing/fakeServices';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../../testing/renderWithFrontDoor';
import type { IStatusStripBlock, IVocabulary } from '../../../content/pageContent';
import type { RouteTable } from '../../../content/routes';
import type { IMyWorkItem, IMyWorkResult } from '../../../services/myWorkService';
import { MY_REQUESTS_LOADING_TEXT, StatusStripBlock, summariseRequests } from './StatusStripBlock';

function item(reference: string, status: string): IMyWorkItem {
  return { id: 1, title: reference, reference, workflowType: 'idea', workflowLabel: 'AI idea', status, submittedAt: '2026-09-01T10:00:00Z' };
}

function ok(items: IMyWorkItem[]): IMyWorkResult {
  return { state: 'ok', items, message: 'Read.' };
}

const ROUTES: RouteTable = {
  guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
  assistant: { key: 'assistant', label: 'Ask the assistant', href: 'https://assistant.example/chat', state: 'availableNow' }
};

const BLOCK: IStatusStripBlock = {
  type: 'statusStrip',
  items: [
    { kind: 'myRequests', label: 'My requests', href: 'SitePages/Status.aspx' },
    { kind: 'text', label: 'Assistant', text: 'Answering from approved sources.', route: 'assistant', asOf: '2026-09-01' },
    { kind: 'text', label: 'Prompts', text: 'All [draft](SitePages/Prompts.aspx).', state: 'draftOnly' }
  ],
  emptyText: 'Nothing from you yet.',
  unavailableText: 'The request list is not available.'
};

describe('summariseRequests', () => {
  it('counts the requests by plain status in order of first appearance, lower-cased', () => {
    const items: IMyWorkItem[] = [item('a', 'Submitted - Pilot'), item('b', 'In Review - Pilot'), item('c', 'READY_FOR_TRIAGE'), item('d', 'Test Failed')];
    expect(summariseRequests(items)).toBe('2 received · 1 in review · 1 needs attention');
    expect(summariseRequests([item('a', 'Submitted - Pilot')])).toBe('1 received');
    expect(summariseRequests([])).toBe('');
  });

  it('uses the document wording for a status', () => {
    const vocabulary: IVocabulary = { truthStates: {}, requestStatuses: { 'Submitted - Pilot': 'Logged' }, chrome: {}, roles: {}, telemetry: {} };
    expect(summariseRequests([item('a', 'Submitted - Pilot'), item('b', '')], vocabulary)).toBe('1 logged · 1 status unavailable');
  });
});

describe('StatusStripBlock', () => {
  it('renders the request counts as a link beside the labelled lines with their pills', async () => {
    const service: IFakeMyWorkService = createFakeMyWorkService(ok([item('a', 'Submitted - Pilot'), item('b', 'Submitted - Pilot'), item('c', 'In Review - Pilot')]));
    const { container } = renderWithFrontDoor(<StatusStripBlock block={BLOCK} />, { myWork: service, routes: ROUTES, now: new Date('2026-09-20T12:00:00Z'), pageView: true });
    const items: NodeListOf<HTMLElement> = container.querySelectorAll('.ai-page-strip > div.ai-page-strip-item');
    expect(items).toHaveLength(3);
    expect(items[0].querySelector('strong')?.textContent).toBe('My requests');
    expect(items[0].textContent).toBe(`My requests — ${MY_REQUESTS_LOADING_TEXT}`);
    const link: HTMLElement = await within(items[0]).findByRole('link', { name: '2 received · 1 in review' });
    expect(link).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Status.aspx`);
    expect(link).toHaveClass('ai-page-strip-link');
    expect(items[0].textContent).toBe('My requests — 2 received · 1 in review');
    expect(items[0].querySelector('.ai-page-freshness')).toBeNull();
    // The text items behave as status-row items: the off-site route without its receipt reads "Awaiting source", the state its pill;
    // the dated item ends with its freshness line.
    expect(items[1].textContent).toBe('Assistant — Answering from approved sources. Awaiting sourceAs of 1 Sep 2026');
    expect(items[1].querySelector('.ai-pill--amber')).not.toBeNull();
    expect(items[1].querySelector('p.ai-page-freshness')?.textContent).toBe('As of 1 Sep 2026');
    expect(items[1].lastElementChild).toHaveClass('ai-page-freshness');
    expect(items[2].querySelector('.ai-pill--blue')?.textContent).toBe('Draft only');
    expect(items[2].querySelector('.ai-page-freshness')).toBeNull();
    expect(within(items[2]).getByRole('link', { name: 'draft' })).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Prompts.aspx`);
    expect(service.calls).toBe(1);
  });

  it('shows the empty text, linked to the page, when the person has sent nothing', async () => {
    renderWithFrontDoor(<StatusStripBlock block={BLOCK} />, { myWork: createFakeMyWorkService(ok([])), pageView: true });
    const link: HTMLElement = await screen.findByRole('link', { name: 'Nothing from you yet.' });
    expect(link).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Status.aspx`);
    const line: HTMLElement = link.closest('.ai-page-strip-item') as HTMLElement;
    expect(line.textContent).toBe('My requests — Nothing from you yet.');
    expect(line.querySelector('.ai-pill')).toBeNull();
  });

  it('never shows a number when the list cannot be read, and marks a refused read as needing access', async () => {
    const denied: IFakeMyWorkService = createFakeMyWorkService({ state: 'denied', items: [], message: 'refused', failureClass: 'PERMISSION', userMessage: 'Needs access.' });
    const first = renderWithFrontDoor(<StatusStripBlock block={{ ...BLOCK, items: [BLOCK.items[0]] }} />, { myWork: denied, pageView: true });
    const refused: HTMLElement = (await first.findByText('The request list is not available.', { exact: false })).closest('.ai-page-strip-item') as HTMLElement;
    expect(refused.querySelector('.ai-pill--amber')?.textContent).toBe('Needs access');
    expect(refused.textContent).toBe('My requests — Needs access The request list is not available.');
    expect(within(refused).queryByRole('link')).not.toBeInTheDocument();
    expect(refused.textContent).not.toMatch(/\d/);
    first.unmount();
    const broken: IFakeMyWorkService = createFakeMyWorkService({ state: 'unavailable', items: [item('a', 'Submitted - Pilot')], message: 'AI CoE Pilot Intakes answered 500.', failureClass: 'TRANSIENT', userMessage: 'Not available right now; try again.' });
    const second = renderWithFrontDoor(<StatusStripBlock block={{ ...BLOCK, items: [BLOCK.items[0]] }} />, { myWork: broken, pageView: true });
    const line: HTMLElement = (await second.findByText('The request list is not available.')).closest('.ai-page-strip-item') as HTMLElement;
    expect(line.textContent).toBe('My requests — The request list is not available.');
    expect(line.querySelector('.ai-pill')).toBeNull();
    expect(second.container.textContent).not.toContain('500');
  });

  it('shows the unavailable text without a link when the host has no request service, and asks nothing without a request item', () => {
    const textOnly: IStatusStripBlock = { ...BLOCK, items: [BLOCK.items[2]] };
    const service: IFakeMyWorkService = createFakeMyWorkService(ok([]));
    const { container, unmount } = renderWithFrontDoor(<StatusStripBlock block={textOnly} />, { myWork: service, pageView: true });
    expect(container.querySelectorAll('div.ai-page-strip-item')).toHaveLength(1);
    expect(service.calls).toBe(0);
    unmount();
    const { container: without } = renderWithFrontDoor(<StatusStripBlock block={{ ...BLOCK, items: [BLOCK.items[0]] }} />, { pageView: true });
    expect(within(without).getByText('The request list is not available.')).toBeInTheDocument();
    expect(within(without).queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a request item without a link as plain text and keeps its lead text', async () => {
    const block: IStatusStripBlock = { ...BLOCK, items: [{ kind: 'myRequests', label: 'Requests', text: 'Yours:' }] };
    const { container } = renderWithFrontDoor(<StatusStripBlock block={block} />, { myWork: createFakeMyWorkService(ok([item('a', 'Closed - Pilot')])), pageView: true });
    const line: HTMLElement = (await screen.findByText('1 closed')).closest('.ai-page-strip-item') as HTMLElement;
    expect(line.textContent).toBe('Requests — Yours: 1 closed');
    expect(container.querySelector('a')).toBeNull();
  });

  it('keeps the loading line while the service has not answered', () => {
    const { container } = renderWithFrontDoor(<StatusStripBlock block={{ ...BLOCK, items: [BLOCK.items[0]] }} />, { myWork: createPendingMyWorkService(), pageView: true });
    expect(container.textContent).toBe(`My requests — ${MY_REQUESTS_LOADING_TEXT}`);
  });

  it('draws the freshness line of a dated text item against the document clock and threshold', () => {
    const block: IStatusStripBlock = {
      ...BLOCK,
      items: [
        { kind: 'text', label: 'Current', text: 'Read back.', asOf: '2026-09-01', source: 'AI CoE check' },
        { kind: 'text', label: 'Stale', text: 'Read back a while ago.', asOf: '2026-07-01', source: 'AI CoE check' },
        { kind: 'text', label: 'Undated', text: 'Not yet read back.', source: 'AI CoE check' },
        { kind: 'text', label: 'Example', text: 'Made up.', illustrative: true },
        { kind: 'text', label: 'Recent', text: 'Read back this week.', asOf: '2026-09-15' }
      ]
    };
    const { container } = renderWithFrontDoor(<StatusStripBlock block={block} />, { now: new Date('2026-09-19T12:00:00Z'), settings: { freshnessDays: 7, minimumCohort: 5 }, pageView: true });
    const lines: NodeListOf<HTMLElement> = container.querySelectorAll('div.ai-page-strip-item > p.ai-page-freshness');
    expect(lines).toHaveLength(5);
    expect(lines[0].textContent).toBe('As of 1 Sep 2026 · AI CoE check Needs refresh');
    expect(lines[1].textContent).toBe('As of 1 Jul 2026 · AI CoE check Needs refresh');
    expect(lines[2].textContent).toBe('Awaiting source Do not infer progress.');
    expect(lines[3].textContent).toBe('Example');
    expect(lines[4].textContent).toBe('As of 15 Sep 2026');
    expect(lines[4].querySelector('.ai-pill')).toBeNull();
  });
});
