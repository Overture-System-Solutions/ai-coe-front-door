/**
 * The write allow-list (plan step 13): what the front door may write to SharePoint and what may
 * reach the person. Every journey is played through its page view against the real governance
 * service over the in-memory list store, three times: the lists answer, the readback fails after an
 * accepted POST (pending), and the write is refused with a body that must never surface (failed).
 *
 * - every POST targets `AI CoE Pilot Intakes` or `AI CoE Use Cases`, through the items endpoint of
 *   the site, and every written `Status` is `Submitted - Pilot` (Intakes) or `Submitted` (Use Cases);
 * - no `userMessage` carries a response body, and the page-view DOM after a saved or a pending
 *   submission carries none either. The legacy result panel still renders the shipped `message`
 *   after a failed write (its pins are deliberately unchanged, step 12); the page-view failure
 *   notice that renders `userMessage` instead lands in step 14 and is asserted there.
 */
import { fireEvent, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { createFakeGovernanceService } from '../testing/fakeServices';
import type { IFakeGovernanceService } from '../testing/fakeServices';
import { FEEDBACK_JOURNEY, HELP_TRAINING_JOURNEY, IDEA_JOURNEY, playJourney, TEAM_USAGE_JOURNEY, TOOL_CHECK_GAP_JOURNEY, TOOL_CHECK_JOURNEY } from '../testing/journeys';
import type { IJourney } from '../testing/journeys';
import { createFakeListClient, InMemoryListStore } from '../testing/listStore';
import type { IRecordedRequest } from '../testing/listStore';
import { renderWithFrontDoor, TEST_SITE_URL, TEST_USER } from '../testing/renderWithFrontDoor';
import type { FrontDoorRenderResult } from '../testing/renderWithFrontDoor';
import { firstStepOf } from '../testing/workflowHarness';
import { createBranding } from '../webparts/aiCoeFrontDoor/branding/branding';
import { PageViewShell } from '../webparts/aiCoeFrontDoor/components/PageViewShell';
import { createWorkflowCatalog } from '../webparts/aiCoeFrontDoor/content/workflows/catalog';
import { GovernanceService, INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE } from '../webparts/aiCoeFrontDoor/services/GovernanceService';
import type { ISubmissionResult, ISubmitOptions } from '../webparts/aiCoeFrontDoor/services/types';
import type { IWorkflowCatalog, SubmissionWorkflowType } from '../webparts/aiCoeFrontDoor/workflows/types';

jest.setTimeout(60000);

const catalog: IWorkflowCatalog = createWorkflowCatalog(createBranding('Overture'));
const ITEMS_ENDPOINT: RegExp = /^https:\/\/contoso\.sharepoint\.com\/sites\/ai\/_api\/web\/lists\/getbytitle\('([^']+)'\)\/items$/;
const ALLOWED_LISTS: readonly string[] = [INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE];
const ALLOWED_STATUS: { [list: string]: string } = { [INTAKES_LIST_TITLE]: 'Submitted - Pilot', [USE_CASES_LIST_TITLE]: 'Submitted' };
const CANARY: string = 'canary-body-7f3a9';
const CANARY_BODY: string = `{"error":{"message":"${CANARY} token=eyJabc.def"}}`;
const LOADING_TEXT: RegExp = /Setting things up…|Looking at your answers…|Creating your summary…|Looking at your feedback…|Putting your (summary|review request|feedback) together…|Connecting…/;

interface IScript {
  journey: IJourney;
  label: string;
  /** Drives the page after the last question until the submission is on its way. */
  confirm: (root: HTMLElement) => Promise<void>;
}

function clicks(name: string): (root: HTMLElement) => Promise<void> {
  return async (root: HTMLElement): Promise<void> => {
    fireEvent.click(await within(root).findByRole('button', { name }));
  };
}

function reviewRequest(callToAction: string): (root: HTMLElement) => Promise<void> {
  return async (root: HTMLElement): Promise<void> => {
    fireEvent.click(await within(root).findByRole('button', { name: callToAction }));
    fireEvent.change(within(root).getByPlaceholderText('Your name'), { target: { value: 'Pat Example' } });
    fireEvent.change(within(root).getByPlaceholderText('Your team or department'), { target: { value: 'Finance' } });
    fireEvent.change(within(root).getByPlaceholderText('name@example.com'), { target: { value: 'pat@contoso.com' } });
    fireEvent.click(within(root).getByRole('button', { name: 'Create review request' }));
  };
}

const SCRIPTS: readonly IScript[] = [
  { journey: IDEA_JOURNEY, label: 'idea', confirm: clicks('Confirm this reflects my idea') },
  { journey: TOOL_CHECK_JOURNEY, label: 'toolCheck', confirm: reviewRequest('Want a second opinion? Create a CoE review request') },
  { journey: TOOL_CHECK_GAP_JOURNEY, label: 'toolCheck (guidance gap)', confirm: reviewRequest('Create a CoE review request') },
  { journey: TEAM_USAGE_JOURNEY, label: 'teamUsage', confirm: clicks("Confirm this reflects what's happening") },
  { journey: HELP_TRAINING_JOURNEY, label: 'helpTraining', confirm: clicks('Confirm') },
  { journey: FEEDBACK_JOURNEY, label: 'feedback', confirm: clicks('Confirm my feedback') }
];

interface IRun {
  store: InMemoryListStore;
  results: ISubmissionResult[];
  root: HTMLElement;
}

/** Plays the journey in its page view; the governance service is the real one over the store. */
async function play(script: IScript, configure: (store: InMemoryListStore) => void): Promise<IRun> {
  const store: InMemoryListStore = new InMemoryListStore([INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE, 'AI CoE Decisions']);
  configure(store);
  const real: GovernanceService = new GovernanceService({ siteUrl: TEST_SITE_URL, user: TEST_USER, client: createFakeListClient(store), configuration: 'v1' });
  const results: ISubmissionResult[] = [];
  const governance: IFakeGovernanceService = createFakeGovernanceService();
  governance.submitWorkflow = async (workflowType: SubmissionWorkflowType, payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> => {
    const result: ISubmissionResult = await real.submitWorkflow(workflowType, payload, options);
    results.push(result);
    return result;
  };
  const harness: FrontDoorRenderResult = renderWithFrontDoor(
    React.createElement(PageViewShell, { settings: { view: script.journey.workflowId, layout: 'wide', pages: {} } }),
    { governance }
  );
  const root: HTMLElement = harness.container;
  await firstStepOf(catalog[script.journey.workflowId]);
  playJourney(script.journey, catalog[script.journey.workflowId], root);
  await script.confirm(root);
  await waitFor((): void => expect(results.length).toBeGreaterThan(0));
  await waitFor((): void => expect(root.textContent).not.toMatch(LOADING_TEXT));
  return { store, results, root };
}

function posts(store: InMemoryListStore): IRecordedRequest[] {
  return store.requests.filter((request: IRecordedRequest): boolean => request.method === 'POST');
}

/** Every POST of the run goes to an allowed list through the site's items endpoint, with the allowed status. */
function expectAllowedWrites(store: InMemoryListStore): void {
  const written: IRecordedRequest[] = posts(store);
  expect(written.length).toBeGreaterThan(0);
  for (const request of written) {
    const match: RegExpExecArray | null = ITEMS_ENDPOINT.exec(request.url);
    expect(match).not.toBeNull();
    expect(ALLOWED_LISTS).toContain(request.list);
    expect((request.body as { Status?: unknown }).Status).toBe(ALLOWED_STATUS[request.list as string]);
  }
}

async function silenced<T>(run: () => Promise<T>): Promise<T> {
  const errorSpy: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
  try {
    return await run();
  } finally {
    errorSpy.mockRestore();
  }
}

describe('Write allow-list: what every journey writes', () => {
  for (const script of SCRIPTS) {
    it(`${script.label}: writes only to the intake lists with the submitted status, and reads the row back`, async () => {
      const { store, results, root } = await play(script, (): void => undefined);
      expectAllowedWrites(store);
      const governance: boolean = script.journey.workflowId !== 'helpTraining' && script.journey.workflowId !== 'feedback';
      expect(posts(store).map((request: IRecordedRequest): string | undefined => request.list)).toEqual(
        governance ? [INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE] : [INTAKES_LIST_TITLE]
      );
      expect(results).toHaveLength(1);
      expect(results[0].state).toBe('saved');
      expect(results[0].userMessage).toBeUndefined();
      expect(store.items(INTAKES_LIST_TITLE)).toHaveLength(1);
      expect(root.textContent).toContain(`Submission received: ${results[0].intakeId}`);
      expect(root.textContent).not.toContain(CANARY);
    });
  }
});

describe('Write allow-list: a readback that fails after an accepted write', () => {
  for (const script of SCRIPTS) {
    it(`${script.label}: reports pending, writes once, and neither the message nor the page carries the body`, async () => {
      const { store, results, root } = await silenced(
        (): Promise<IRun> =>
          play(script, (candidate: InMemoryListStore): void => {
            candidate.afterPost(INTAKES_LIST_TITLE, (): void => candidate.fail(INTAKES_LIST_TITLE, 500, CANARY_BODY));
          })
      );
      expectAllowedWrites(store);
      expect(results).toHaveLength(1);
      expect(results[0].state).toBe('pending');
      expect(results[0].failureClass).toBe('INCONCLUSIVE');
      expect(results[0].userMessage).toBe('Saved, not yet confirmed.');
      expect(results[0].userMessage).not.toContain(CANARY);
      expect(results[0].message).not.toContain(CANARY);
      expect(store.items(INTAKES_LIST_TITLE)).toHaveLength(1);
      expect(root.textContent).not.toContain(CANARY);
      expect(root.textContent).not.toContain('eyJabc');
    });
  }
});

describe('Write allow-list: a refused write', () => {
  for (const script of SCRIPTS) {
    it(`${script.label}: reports failed with the class, and the user message carries no body`, async () => {
      const { store, results } = await silenced(
        (): Promise<IRun> =>
          play(script, (candidate: InMemoryListStore): void => {
            candidate.fail(INTAKES_LIST_TITLE, 403, CANARY_BODY);
          })
      );
      expectAllowedWrites(store);
      expect(results).toHaveLength(1);
      expect(results[0].state).toBe('failed');
      expect(results[0].failureClass).toBe('PERMISSION');
      expect(results[0].userMessage).toBe('Needs access.');
      expect(results[0].userMessage).not.toContain(CANARY);
      expect(store.items(INTAKES_LIST_TITLE)).toHaveLength(0);
      expect(store.items(USE_CASES_LIST_TITLE)).toHaveLength(0);
    });
  }
});

describe('Write allow-list: the fakes', () => {
  it('the fake governance service records the retry identifier and its results carry no response body', async () => {
    const governance: IFakeGovernanceService = createFakeGovernanceService();
    await governance.submitWorkflow('feedback', { a: 1 });
    await governance.submitWorkflow('feedback', { a: 1 }, { intakeId: 'OVT-AICOE-20260911-TESTTEST' });
    expect(governance.submissions.map((submission): string | undefined => submission.intakeId)).toEqual([undefined, 'OVT-AICOE-20260911-TESTTEST']);
    expect(governance.result.userMessage).toBeUndefined();
    expect(governance.result.message).not.toMatch(/returned \d{3}/);
    expect(governance.dashboard.userMessage).toBeUndefined();
  });
});
