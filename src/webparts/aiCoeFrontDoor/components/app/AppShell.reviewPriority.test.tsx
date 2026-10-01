/**
 * The executive review priority, through the consolidated view as a site mounts it. The gated governance facade adds
 * the mark, so what matters is the route a form's submission takes: from the app view it must pass that facade for
 * the membership the view resolved; the facade must keep a real site's recovery record within reach, or Confirm again
 * cannot complete the attempt the record holds; and a retry must send what its first attempt recorded, whatever the
 * membership says by then, or the record refuses it for good.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { createDeferred, createFakeGovernanceService, createFakeRoleResolver, EARLIER_ATTEMPT, EARLIER_ATTEMPT_SAVED, holdEarlierAttempt, InMemoryDraftStore } from '../../../../testing/fakeServices';
import type { IDeferred, IFakeGovernanceService, IRecordedSubmission } from '../../../../testing/fakeServices';
import { FEEDBACK_JOURNEY, IDEA_JOURNEY, playJourney, TEAM_USAGE_JOURNEY } from '../../../../testing/journeys';
import { createTabbedCatalog } from '../../content/workflows/tabbedForms';
import type { IJourney } from '../../../../testing/journeys';
import { createTestFrontDoor } from '../../../../testing/renderWithFrontDoor';
import type { ITestFrontDoor } from '../../../../testing/renderWithFrontDoor';
import { firstStepOf } from '../../../../testing/workflowHarness';
import { payloadHash } from '../../content/actionEnvelope';
import { RECEIPT_CONFIRM_AGAIN, RECEIPT_EARLIER_NOT_SENT, RECEIPT_EARLIER_SAVED_TITLE, RECEIPT_PENDING_TITLE, RECEIPT_SAVED_TITLE } from '../../content/constants';
import type { RoleId } from '../../content/roles';
import { DurableSubmissionService } from '../../services/durableSubmissionService';
import { EXECUTIVE_REVIEW_PRIORITY, readReviewPriority } from '../../services/executivePriority';
import type { IRoleResolution } from '../../services/roleResolver';
import type { IAdminDashboardData, IGovernanceService, ISubmissionResult, ISubmitOptions } from '../../services/types';
import type { SubmissionWorkflowType } from '../../workflows/types';
import { AiCoeFrontDoor } from '../AiCoeFrontDoor';

function resolved(...roles: RoleId[]): IRoleResolution {
  return { roles: ['employee', ...roles], resolution: 'resolved' };
}

/** The list behind a real site's recovery record: it keeps the reference it is given and confirms only when told to. */
class ReviewList implements IGovernanceService {
  public readonly calls: IRecordedSubmission[] = [];
  public confirms: boolean = false;

  public async submitWorkflow(workflowType: SubmissionWorkflowType, payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult> {
    this.calls.push({ workflowType, payload, intakeId: options?.intakeId });
    return this.confirms
      ? { connected: true, state: 'saved', intakeId: options?.intakeId, message: 'Saved.' }
      : { connected: false, state: 'pending', intakeId: options?.intakeId, message: 'Accepted, not read back.' };
  }

  public submitOutcome(): Promise<ISubmissionResult> {
    return Promise.reject(new Error('Not used by these tests.'));
  }

  public getAdminDashboardData(): Promise<IAdminDashboardData> {
    return Promise.reject(new Error('Not used by these tests.'));
  }
}

/** Mounts the web part's own root in the consolidated view, as a site does, and lets the membership answer. */
async function renderApp(membership: IRoleResolution | Promise<IRoleResolution>, governance: IGovernanceService): Promise<ITestFrontDoor> {
  const front: ITestFrontDoor = createTestFrontDoor({ roleResolver: createFakeRoleResolver(membership) });
  render(
    <AiCoeFrontDoor
      isDarkTheme={false}
      branding={front.value.branding}
      siteUrl={front.value.siteUrl}
      user={front.value.user}
      isAdmin={false}
      telemetryProvider={front.value.telemetryProvider}
      services={{ ...front.value.services, governance }}
      pageView={{ view: 'app', layout: 'wide', pages: {} }}
    />
  );
  await act(async (): Promise<void> => undefined);
  return front;
}

type FormId = 'idea' | 'teamUsage' | 'feedback';

interface IForm {
  tab: string;
  starter: RegExp;
  journey: IJourney;
  confirm: string;
}

/** Where each form starts in the consolidated view, and the button that sends it. */
const FORMS: { [id in FormId]: IForm } = {
  idea: { tab: 'Requests', starter: /Explore an AI idea/, journey: IDEA_JOURNEY, confirm: 'Confirm this reflects my idea' },
  teamUsage: { tab: 'Requests', starter: /Register team AI use/, journey: TEAM_USAGE_JOURNEY, confirm: "Confirm this reflects what's happening" },
  feedback: { tab: 'Improvement', starter: /Share feedback/, journey: FEEDBACK_JOURNEY, confirm: 'Confirm my feedback' }
};

/** Opens the form from its section, answers it as a visitor would and sends it. */
async function send(front: ITestFrontDoor, id: FormId): Promise<void> {
  const form: IForm = FORMS[id];
  await act(async (): Promise<void> => {
    fireEvent.click(screen.getByRole('tab', { name: form.tab }));
  });
  await act(async (): Promise<void> => {
    fireEvent.click(screen.getByRole('button', { name: form.starter }));
  });
  // The tabbed view asks its shorter forms (1.0.0.18); the journey's answers are the same keys.
  const definition = createTabbedCatalog(front.value.catalog, [])[id];
  await firstStepOf(definition);
  playJourney(form.journey, definition);
  await act(async (): Promise<void> => {
    fireEvent.click(screen.getByRole('button', { name: form.confirm }));
  });
}

async function confirmAgain(): Promise<void> {
  await act(async (): Promise<void> => {
    fireEvent.click(screen.getByRole('button', { name: RECEIPT_CONFIRM_AGAIN }));
  });
}

describe('the review priority of a business case sent from the consolidated view', () => {
  it.each(['idea', 'teamUsage'] as FormId[])('marks the %s of a confirmed leader to be reviewed sooner', async (id: FormId) => {
    const governance: IFakeGovernanceService = createFakeGovernanceService();
    const front: ITestFrontDoor = await renderApp(resolved('leader'), governance);
    await send(front, id);
    await waitFor((): void => expect(governance.submissions).toHaveLength(1));
    expect(governance.submissions[0].workflowType).toBe(id);
    expect(readReviewPriority(governance.submissions[0].payload)).toEqual(EXECUTIVE_REVIEW_PRIORITY);
  });

  it.each([
    ['an employee', resolved()],
    ['an operator', resolved('operator')],
    ['a leader whose membership was not confirmed', { roles: ['employee', 'leader'], resolution: 'unresolved' }]
  ] as [string, IRoleResolution][])('never marks the business case of %s', async (_who: string, membership: IRoleResolution) => {
    const governance: IFakeGovernanceService = createFakeGovernanceService();
    const front: ITestFrontDoor = await renderApp(membership, governance);
    await send(front, 'idea');
    await waitFor((): void => expect(governance.submissions).toHaveLength(1));
    expect(readReviewPriority(governance.submissions[0].payload)).toBeUndefined();
  });

  it('keeps Confirm again able to complete the earlier attempt a real site\'s recovery record holds', async () => {
    const governance: IFakeGovernanceService = createFakeGovernanceService();
    holdEarlierAttempt(governance);
    const front: ITestFrontDoor = await renderApp(resolved('leader'), governance);
    await send(front, 'feedback');
    await screen.findByText(RECEIPT_EARLIER_NOT_SENT);

    governance.result = EARLIER_ATTEMPT_SAVED;
    await confirmAgain();
    await screen.findByText(RECEIPT_EARLIER_SAVED_TITLE);
    expect(governance.submissions[1]).toEqual({ workflowType: 'feedback', payload: EARLIER_ATTEMPT.payload, intakeId: EARLIER_ATTEMPT.intakeId });
  });

  it('completes a leader\'s business case recorded without the mark, instead of refusing it for good', async () => {
    const list: ReviewList = new ReviewList();
    const store: InMemoryDraftStore = new InMemoryDraftStore();
    // What a build that never marked leaves for a leader: the business case sent without the mark, not yet read back.
    const payload: { [key: string]: unknown } = { originalAnswers: { workToImprove: 'An earlier business case' } };
    const intakeId: string = 'OVT-AICOE-20260925-UNMARKED';
    const digest: string | undefined = await payloadHash({ workflowType: 'idea', payload });
    await store.save('submission_last', { version: 1, phase: 'pending', digest, attempt: { workflowType: 'idea', payload, intakeId } });
    const front: ITestFrontDoor = await renderApp(resolved('leader'), new DurableSubmissionService(list, store));

    // A different form is refused while the record holds the business case; Confirm again completes the record's own.
    await send(front, 'feedback');
    await screen.findByText(RECEIPT_EARLIER_NOT_SENT);
    expect(list.calls).toEqual([]);

    list.confirms = true;
    await confirmAgain();
    await screen.findByText(RECEIPT_EARLIER_SAVED_TITLE);
    expect(list.calls).toEqual([{ workflowType: 'idea', payload, intakeId }]);
  });

  it('confirms a business case sent before the membership answered again as it was sent', async () => {
    const membership: IDeferred<IRoleResolution> = createDeferred<IRoleResolution>();
    const list: ReviewList = new ReviewList();
    const front: ITestFrontDoor = await renderApp(membership.promise, new DurableSubmissionService(list, new InMemoryDraftStore()));
    await send(front, 'idea');
    await screen.findByText(RECEIPT_PENDING_TITLE);
    await act(async (): Promise<void> => {
      membership.resolve(resolved('leader'));
    });

    list.confirms = true;
    await confirmAgain();
    await screen.findByText(RECEIPT_SAVED_TITLE);
    expect(list.calls).toHaveLength(2);
    expect(list.calls[1].intakeId).toBe(list.calls[0].intakeId);
    // The mark is decided once, when the form is sent; a retry completes the rows that attempt wrote.
    expect(readReviewPriority(list.calls[1].payload)).toBeUndefined();
  });
});
