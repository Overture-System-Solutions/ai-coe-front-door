import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { createFakeMyWorkService, createPendingMyWorkService } from '../../../../testing/fakeServices';
import type { IFakeMyWorkService } from '../../../../testing/fakeServices';
import { createFakeListClient, InMemoryListStore } from '../../../../testing/listStore';
import { renderWithFrontDoor, TEST_SITE_URL, TEST_USER } from '../../../../testing/renderWithFrontDoor';
import type { IVocabulary } from '../../content/pageContent';
import { INTAKES_LIST_TITLE } from '../../services/GovernanceService';
import { MyWorkService } from '../../services/myWorkService';
import type { IMyWorkItem, IMyWorkResult } from '../../services/myWorkService';
import { MY_WORK_DENIED_TEXT, MY_WORK_EMPTY_TEXT, MY_WORK_HEADING, MY_WORK_LOADING_TEXT, MY_WORK_UNAVAILABLE_TEXT, MyWork } from './MyWork';

function item(overrides: Partial<IMyWorkItem>): IMyWorkItem {
  return {
    id: 1,
    title: 'AI idea — OVT-AICOE-20260901-AAAAAAAA',
    reference: 'OVT-AICOE-20260901-AAAAAAAA',
    workflowType: 'idea',
    workflowLabel: 'AI idea',
    status: 'Submitted - Pilot',
    submittedAt: '2026-09-01T10:00:00Z',
    modified: '2026-09-02T08:00:00Z',
    ...overrides
  };
}

function ok(items: IMyWorkItem[]): IMyWorkResult {
  return { state: 'ok', items, message: 'Read.' };
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

describe('MyWork', () => {
  it('lists the requests of the signed-in person as rows with the reference, the workflow, a plain status and the dates', async () => {
    const service: IFakeMyWorkService = createFakeMyWorkService(
      ok([
        item({ id: 2, reference: 'OVT-AICOE-20260905-BBBBBBBB', workflowType: 'helpTraining', workflowLabel: 'Help or training', status: 'In Review - Pilot', submittedAt: '2026-09-05T10:00:00Z', modified: '2026-09-05T10:00:00Z' }),
        item({})
      ])
    );
    const { container } = renderWithFrontDoor(<MyWork />, { myWork: service, pageView: true });
    expect(screen.getByRole('region', { name: MY_WORK_HEADING })).toHaveClass('ai-page-mywork');
    expect(screen.getByRole('heading', { level: 2, name: MY_WORK_HEADING })).toBeInTheDocument();
    expect(screen.getByText(MY_WORK_LOADING_TEXT)).toHaveClass('ai-mywork-note');
    const rows: HTMLElement[] = await screen.findAllByRole('article');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveClass('ai-mywork-row');
    expect(container.querySelectorAll('article.ai-mywork-row')).toHaveLength(2);
    expect(within(rows[0]).getByText('Help or training')).toHaveClass('ai-mywork-label');
    expect(within(rows[0]).getByText('OVT-AICOE-20260905-BBBBBBBB').tagName).toBe('CODE');
    expect(within(rows[0]).getByText('Reference')).toHaveClass('ai-mywork-key');
    // The status is the plain wording, as a pill with an icon shape, never the list code.
    const pill: HTMLElement = rows[0].querySelector('.ai-pill') as HTMLElement;
    expect(pill).toHaveClass('ai-pill--amber');
    expect(pill.textContent).toBe('In review');
    expect(pill.querySelector('svg')).not.toBeNull();
    expect(within(rows[0]).queryByText('In Review - Pilot')).not.toBeInTheDocument();
    expect(within(rows[0]).getByText(`Sent ${shortDate('2026-09-05T10:00:00Z')}`)).toHaveClass('ai-mywork-dates');
    expect(within(rows[1]).getByText('AI idea')).toBeInTheDocument();
    expect(rows[1].querySelector('.ai-pill')?.textContent).toBe('Received');
    expect(rows[1].querySelector('.ai-pill')).toHaveClass('ai-pill--blue');
    expect(within(rows[1]).getByText(`Sent ${shortDate('2026-09-01T10:00:00Z')} · Updated ${shortDate('2026-09-02T08:00:00Z')}`)).toBeInTheDocument();
    expect(screen.queryByText(MY_WORK_LOADING_TEXT)).not.toBeInTheDocument();
    expect(service.calls).toBe(1);
    expect(container.querySelector('[id]')).toBeNull();
  });

  it('says so when there are no requests yet', async () => {
    renderWithFrontDoor(<MyWork />, { myWork: createFakeMyWorkService(ok([])), pageView: true });
    expect(await screen.findByText(MY_WORK_EMPTY_TEXT)).toHaveClass('ai-mywork-note');
    expect(MY_WORK_EMPTY_TEXT).toBe('No requests from you yet.');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('shows the needs-access pill and the denied sentence when the list refuses the read', async () => {
    const service: IFakeMyWorkService = createFakeMyWorkService({ state: 'denied', items: [], message: 'refused', failureClass: 'PERMISSION', userMessage: 'Needs access.' });
    const { container } = renderWithFrontDoor(<MyWork />, { myWork: service, pageView: true });
    const note: HTMLElement = await screen.findByText(MY_WORK_DENIED_TEXT, { exact: false });
    expect(note).toHaveClass('ai-mywork-note');
    expect(MY_WORK_DENIED_TEXT).toBe('You cannot read the request list on this site.');
    expect(container.querySelector('.ai-pill--amber')?.textContent).toBe('Needs access');
    expect(screen.queryByText('refused')).not.toBeInTheDocument();
  });

  it('says the status is unavailable when the list cannot be read, without a pill or a number', async () => {
    const service: IFakeMyWorkService = createFakeMyWorkService({ state: 'unavailable', items: [], message: 'AI CoE Pilot Intakes answered 500.', failureClass: 'TRANSIENT', userMessage: 'Not available right now; try again.' });
    const { container } = renderWithFrontDoor(<MyWork />, { myWork: service, pageView: true });
    expect(await screen.findByText(MY_WORK_UNAVAILABLE_TEXT)).toHaveClass('ai-mywork-note');
    expect(MY_WORK_UNAVAILABLE_TEXT).toBe('Status unavailable: the request list could not be read.');
    expect(container.querySelector('.ai-pill')).toBeNull();
    expect(screen.queryByText(/answered 500/)).not.toBeInTheDocument();
  });

  it('treats a host without the service as unavailable without asking anything', async () => {
    const { container } = renderWithFrontDoor(<MyWork />, { pageView: true });
    expect(await screen.findByText(MY_WORK_UNAVAILABLE_TEXT)).toBeInTheDocument();
    expect(container.querySelector('.ai-pill')).toBeNull();
    expect(screen.queryByText(MY_WORK_LOADING_TEXT)).not.toBeInTheDocument();
  });

  it('keeps the loading line while the service has not answered', () => {
    renderWithFrontDoor(<MyWork />, { myWork: createPendingMyWorkService(), pageView: true });
    expect(screen.getByText(MY_WORK_LOADING_TEXT)).toBeInTheDocument();
  });

  it("renders the document's plain wording for a status and appends the code on the operator plane only", async () => {
    const vocabulary: IVocabulary = { truthStates: {}, requestStatuses: { 'Submitted - Pilot': 'Logged' }, chrome: {}, roles: {}, telemetry: {} };
    const first = renderWithFrontDoor(<MyWork />, { myWork: createFakeMyWorkService(ok([item({})])), pageView: true, vocabulary });
    const user: HTMLElement[] = await screen.findAllByRole('article');
    expect(user[0].querySelector('.ai-pill')?.textContent).toBe('Logged');
    expect(user[0].querySelector('.ai-pill-code')).toBeNull();
    first.unmount();
    renderWithFrontDoor(<MyWork />, { myWork: createFakeMyWorkService(ok([item({ status: 'Test Failed' })])), pageView: true, plane: 'operator' });
    const rows: HTMLElement[] = await screen.findAllByRole('article');
    expect(rows).toHaveLength(1);
    const pill: HTMLElement = rows[0].querySelector('.ai-pill') as HTMLElement;
    expect(pill).toHaveClass('ai-pill--red');
    expect(pill.querySelector('.ai-pill-label')?.textContent).toBe('Needs attention');
    expect(pill.querySelector('code.ai-pill-code')?.textContent).toBe('Test Failed');
  });

  it('shows a row whose dates are missing or unreadable without inventing one', async () => {
    renderWithFrontDoor(<MyWork />, { myWork: createFakeMyWorkService(ok([item({ submittedAt: undefined, modified: 'yesterday' })])), pageView: true });
    const rows: HTMLElement[] = await screen.findAllByRole('article');
    expect(within(rows[0]).getByText('Sent: date unavailable')).toHaveClass('ai-mywork-dates');
  });

  it("shows only the signed-in person's rows when item-level security trims the list", async () => {
    const store: InMemoryListStore = new InMemoryListStore([INTAKES_LIST_TITLE]);
    store.seed(INTAKES_LIST_TITLE, [
      { IntakeId: 'OVT-AICOE-20260901-AAAAAAAA', WorkflowType: 'idea', Status: 'Submitted - Pilot', RequestorEmail: TEST_USER.email, SubmittedAt: '2026-09-01T10:00:00Z' },
      { IntakeId: 'OVT-AICOE-20260903-CCCCCCCC', WorkflowType: 'idea', Status: 'Submitted - Pilot', RequestorEmail: 'grace@contoso.com', SubmittedAt: '2026-09-03T10:00:00Z' }
    ]);
    store.trimTo(TEST_USER.email);
    const service: MyWorkService = new MyWorkService({ siteUrl: TEST_SITE_URL, user: TEST_USER, client: createFakeListClient(store), configuration: 'v1' });
    const { container } = renderWithFrontDoor(<MyWork />, { myWork: service, pageView: true });
    const rows: HTMLElement[] = await screen.findAllByRole('article');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('OVT-AICOE-20260901-AAAAAAAA')).toBeInTheDocument();
    expect(container.textContent).not.toContain('CCCCCCCC');
    // One read of the request list; the link lookups since 1.0.0.18 read the lists themselves, never more rows.
    const itemReads = store.requests.filter((request) => request.url.indexOf('/items') >= 0);
    expect(itemReads).toHaveLength(1);
    expect(itemReads[0].query.$filter).toBe(`RequestorEmail eq '${TEST_USER.email}'`);
  });
});
