/**
 * The negative-access suite (plan step 19, decision 6): what the person's own requests show when the
 * intake list refuses the read, when item-level security trims the rows, and when a response carries
 * something that must never surface. The Status page (the `myWork` piece) and the first screen (the
 * `statusStrip` request count) are rendered as page views over the real my-work service and the
 * in-memory list store, whose `deny` and `trimTo` seams stand in for the list's permissions.
 *
 * The rule under test: the service asks for one person's rows, the server decides what comes back,
 * and the page shows exactly that. It never widens a read, never shows a number the list did not
 * give, and never renders a response body.
 */
import { waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { readTenantWords, findTenantWords } from '../provisioning/tenantWords';
import type { ITenantWords } from '../provisioning/tenantWords';
import { createFakePageContentService } from '../testing/fakeServices';
import { createFakeListClient, InMemoryListStore } from '../testing/listStore';
import type { IRecordedRequest } from '../testing/listStore';
import { renderWithFrontDoor, TEST_SITE_URL, TEST_USER } from '../testing/renderWithFrontDoor';
import type { FrontDoorRenderResult } from '../testing/renderWithFrontDoor';
import { MY_WORK_DENIED_TEXT, MY_WORK_HEADING } from '../webparts/aiCoeFrontDoor/components/pages/MyWork';
import { PageViewShell } from '../webparts/aiCoeFrontDoor/components/PageViewShell';
import { parsePageDocument } from '../webparts/aiCoeFrontDoor/content/pageContent';
import type { IPageDocument } from '../webparts/aiCoeFrontDoor/content/pageContent';
import type { IFrontDoorUser } from '../webparts/aiCoeFrontDoor/context/FrontDoorContext';
import { DECISIONS_LIST_TITLE, INTAKES_LIST_TITLE, OWN_ITEMS_LISTS, OWN_ITEMS_SECURITY, USE_CASES_LIST_TITLE } from '../webparts/aiCoeFrontDoor/services/lists';
import { MyWorkService } from '../webparts/aiCoeFrontDoor/services/myWorkService';

const ADA: IFrontDoorUser = { displayName: 'Ada Example', email: 'ada@contoso.com' };
const PAT_REFERENCE: string = 'OVT-AICOE-20260901-PATPAT01';
const ADA_REFERENCE: string = 'OVT-AICOE-20260902-ADAADA01';
/** A bearer-token shape from the tenant word list's secret patterns: `eyJ` followed by twenty or more token characters. */
const SECRET_TOKEN: string = 'eyJ' + 'a'.repeat(24);
const CANARY: string = 'canary-body-19f3';
const CANARY_BODY: string = `{"error":{"message":"${CANARY} sig=abc123 ${SECRET_TOKEN}"}}`;
const EMPTY_TEXT: string = 'Nothing from you yet.';
const UNAVAILABLE_TEXT: string = 'The request list is not available.';
const tenantWords: ITenantWords = readTenantWords();

/** Status with the my-work piece; Start here with the strip's request count, as the shipped pages carry them. */
const DOCUMENT: IPageDocument = parsePageDocument(
  JSON.stringify({
    version: 1,
    pages: {
      startHere: {
        title: 'Start here',
        blocks: [
          {
            type: 'statusStrip',
            items: [
              { kind: 'myRequests', label: 'My requests', href: 'SitePages/Status.aspx' },
              { kind: 'text', label: 'Requests', text: 'Ideas, tools, training, feedback.' }
            ],
            emptyText: EMPTY_TEXT,
            unavailableText: UNAVAILABLE_TEXT
          }
        ]
      },
      status: {
        title: 'Status',
        blocks: [
          { type: 'paragraph', text: 'What is true today.' },
          { type: 'piece', piece: 'myWork' }
        ]
      }
    }
  })
) as IPageDocument;

function row(reference: string, email: string, extra: { [field: string]: unknown } = {}): { [field: string]: unknown } {
  return {
    Title: `AI idea — ${reference}`,
    IntakeId: reference,
    WorkflowType: 'idea',
    Status: 'Submitted - Pilot',
    RequestorEmail: email,
    SubmittedAt: '2026-09-01T10:00:00Z',
    Modified: '2026-09-01T10:00:00Z',
    ...extra
  };
}

function seedBoth(store: InMemoryListStore): void {
  store.seed(INTAKES_LIST_TITLE, [
    // Pat's row carries a payload with a secret shape and a title with another: neither column is ever asked for or shown.
    row(PAT_REFERENCE, TEST_USER.email, { PayloadJson: `{"token":"${SECRET_TOKEN}"}`, Title: `AI idea — ${PAT_REFERENCE} sig=leak` }),
    row(ADA_REFERENCE, ADA.email)
  ]);
}

interface IRun extends FrontDoorRenderResult {
  store: InMemoryListStore;
}

/** Renders one page of the document as the given person, over the real my-work service and the store. */
function renderPage(pageKey: 'startHere' | 'status', store: InMemoryListStore, user: IFrontDoorUser): IRun {
  const myWork: MyWorkService = new MyWorkService({ siteUrl: TEST_SITE_URL, user, client: createFakeListClient(store), configuration: 'v1' });
  const result: FrontDoorRenderResult = renderWithFrontDoor(React.createElement(PageViewShell, { settings: { view: 'page', layout: 'wide', pages: {}, pageKey } }), {
    pageContent: createFakePageContentService({ connected: true, message: 'ok', document: DOCUMENT }),
    myWork,
    user,
    pageView: true
  });
  return { ...result, store };
}

function newStore(): InMemoryListStore {
  return new InMemoryListStore([INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE, DECISIONS_LIST_TITLE]);
}

function pieceOf(root: HTMLElement): HTMLElement {
  return within(root).getByRole('region', { name: MY_WORK_HEADING });
}

function stripItemOf(root: HTMLElement): HTMLElement {
  return within(root).getByText('My requests').closest('.ai-page-strip-item') as HTMLElement;
}

function intakeReads(store: InMemoryListStore): IRecordedRequest[] {
  return store.requests.filter((request: IRecordedRequest): boolean => request.method === 'GET' && request.list === INTAKES_LIST_TITLE);
}

/** Nothing of a response body, and no secret shape, anywhere in the rendered page. */
function expectCleanDom(root: HTMLElement): void {
  expect(root.textContent).not.toContain(CANARY);
  expect(root.textContent).not.toContain('sig=');
  expect(root.innerHTML).not.toContain(SECRET_TOKEN);
  expect(findTenantWords(root.innerHTML, tenantWords, ['secretPatterns'])).toEqual([]);
}

async function silenced<T>(run: () => Promise<T>): Promise<T> {
  const errorSpy: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
  try {
    return await run();
  } finally {
    errorSpy.mockRestore();
  }
}

describe('Negative access: the lists under item-level security', () => {
  it('are the two intake lists the front door writes to, and pages.json names them by the same constants', () => {
    expect(OWN_ITEMS_LISTS).toEqual([INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE]);
    expect(OWN_ITEMS_LISTS).toEqual(['AI CoE Pilot Intakes', 'AI CoE Use Cases']);
    expect(OWN_ITEMS_SECURITY).toBe('ownItems');
  });
});

describe('Negative access: a refused read', () => {
  it('shows Needs access and zero rows on Status, and nothing of the refusal body', async () => {
    const store: InMemoryListStore = newStore();
    seedBoth(store);
    store.deny(INTAKES_LIST_TITLE, 403);
    const { container } = await silenced(async (): Promise<IRun> => {
      const run: IRun = renderPage('status', store, TEST_USER);
      await within(run.container).findByText(MY_WORK_DENIED_TEXT, { exact: false });
      return run;
    });
    const piece: HTMLElement = pieceOf(container);
    expect(within(piece).queryAllByRole('article')).toHaveLength(0);
    expect(piece.querySelector('.ai-pill')?.textContent).toBe('Needs access');
    expect(piece.textContent).not.toContain(PAT_REFERENCE);
    expect(piece.textContent).not.toContain(ADA_REFERENCE);
    expect(piece.textContent).not.toMatch(/\d+ (received|in review)/);
    expect(container.textContent).not.toContain('Access denied');
    expect(intakeReads(store)).toHaveLength(1);
    // The rows are still on the server: the page shows what the reader may see, not what the list holds.
    expect(store.items(INTAKES_LIST_TITLE)).toHaveLength(2);
  });

  it('shows Needs access and the unavailable text on the first screen, never a count', async () => {
    const store: InMemoryListStore = newStore();
    seedBoth(store);
    store.deny(INTAKES_LIST_TITLE, 403);
    const { container } = await silenced(async (): Promise<IRun> => {
      const run: IRun = renderPage('startHere', store, TEST_USER);
      await within(run.container).findByText(UNAVAILABLE_TEXT);
      return run;
    });
    const item: HTMLElement = stripItemOf(container);
    expect(item.querySelector('.ai-pill')?.textContent).toBe('Needs access');
    expect(item.textContent).toBe(`My requests — Needs access ${UNAVAILABLE_TEXT}`);
    expect(item.querySelector('a')).toBeNull();
  });

  it('never lets a refusal body with a secret shape reach the DOM, on either page', async () => {
    for (const pageKey of ['status', 'startHere'] as ('status' | 'startHere')[]) {
      const store: InMemoryListStore = newStore();
      seedBoth(store);
      store.fail(INTAKES_LIST_TITLE, 403, CANARY_BODY);
      const { container, unmount } = await silenced(async (): Promise<IRun> => {
        const run: IRun = renderPage(pageKey, store, TEST_USER);
        await waitFor((): void => expect(run.container.querySelector('.ai-pill')?.textContent).toBe('Needs access'));
        return run;
      });
      expectCleanDom(container);
      unmount();
    }
  });
});

describe('Negative access: item-level security trims the rows', () => {
  it('shows a person their own row and never a second person’s, on Status and on the first screen', async () => {
    const store: InMemoryListStore = newStore();
    seedBoth(store);
    store.trimTo(ADA.email);
    const status: IRun = renderPage('status', store, ADA);
    const rows: HTMLElement[] = await within(status.container).findAllByRole('article');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText(ADA_REFERENCE)).toBeInTheDocument();
    expect(status.container.textContent).not.toContain(PAT_REFERENCE);
    expect(rows[0].querySelector('.ai-pill')?.textContent).toBe('Received');
    // The service asked for Ada's rows and nothing wider: one filtered GET, the payload column never selected.
    const reads: IRecordedRequest[] = intakeReads(store);
    expect(reads).toHaveLength(1);
    expect(reads[0].query.$filter).toBe(`RequestorEmail eq '${ADA.email}'`);
    expect(reads[0].query.$select).not.toContain('PayloadJson');
    expectCleanDom(status.container);
    status.unmount();

    const first: IRun = renderPage('startHere', store, ADA);
    const link: HTMLElement = await within(first.container).findByRole('link', { name: '1 received' });
    expect(link).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Status.aspx`);
    expect(first.container.textContent).not.toContain('2 received');
    expect(first.container.textContent).not.toContain(PAT_REFERENCE);
    expectCleanDom(first.container);
  });

  it('shows what the server returns, not what was asked for: a read trimmed to another person yields no rows and no number', async () => {
    // Pat asks for Pat's rows; the server, trimming to Ada, returns none. The page says "nothing from you yet", never a count it did not get.
    const store: InMemoryListStore = newStore();
    seedBoth(store);
    store.trimTo(ADA.email);
    const status: IRun = renderPage('status', store, TEST_USER);
    await within(status.container).findByText('No requests from you yet.');
    expect(within(pieceOf(status.container)).queryAllByRole('article')).toHaveLength(0);
    expect(status.container.textContent).not.toContain(PAT_REFERENCE);
    expect(status.container.textContent).not.toContain(ADA_REFERENCE);
    status.unmount();

    const first: IRun = renderPage('startHere', store, TEST_USER);
    expect(await within(first.container).findByRole('link', { name: EMPTY_TEXT })).toBeInTheDocument();
    expect(first.container.textContent).not.toMatch(/\d+ received/);
    expect(store.items(INTAKES_LIST_TITLE)).toHaveLength(2);
  });

  it('keeps a stored secret shape out of the DOM when the read succeeds', async () => {
    const store: InMemoryListStore = newStore();
    seedBoth(store);
    store.trimTo(TEST_USER.email);
    const status: IRun = renderPage('status', store, TEST_USER);
    const rows: HTMLElement[] = await within(status.container).findAllByRole('article');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText(PAT_REFERENCE)).toBeInTheDocument();
    // The title (which carries "sig=") and the payload (which carries the token) are neither selected nor rendered.
    expectCleanDom(status.container);
    expect(status.container.textContent).not.toContain('AI idea — ');
  });
});
