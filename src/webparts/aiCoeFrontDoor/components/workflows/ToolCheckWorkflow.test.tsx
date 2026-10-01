import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { spyOnDownloads } from '../../../../testing/dom';
import type { IDownloadSpy } from '../../../../testing/dom';
import { createFakeGovernanceService, EARLIER_ATTEMPT, EARLIER_ATTEMPT_SAVED, holdEarlierAttempt, InMemoryDraftStore } from '../../../../testing/fakeServices';
import type { IFakeGovernanceService } from '../../../../testing/fakeServices';
import { enterAnswer, journeyAnswers, playJourney, TOOL_CHECK_GAP_JOURNEY, TOOL_CHECK_JOURNEY } from '../../../../testing/journeys';
import type { IJourney } from '../../../../testing/journeys';
import { firstStepOf, ISO_TIMESTAMP, renderWorkflowPage } from '../../../../testing/workflowHarness';
import type { IWorkflowHarness, IWorkflowPageOptions } from '../../../../testing/workflowHarness';
import { createBranding } from '../../branding/branding';
import type { IBranding } from '../../branding/branding';
import { createWorkflowCatalog } from '../../content/workflows/catalog';
import { evaluateToolPolicy } from '../../services/toolPolicyEvaluator';
import type { IPolicyDecision } from '../../services/toolPolicyEvaluator';
import type { ISubmissionResult } from '../../services/types';
import type { IAnswers, IWorkflowDefinition } from '../../workflows/types';
import type { IWorkflowProps } from './shared';
import { ToolCheckWorkflow } from './ToolCheckWorkflow';

const branding: IBranding = createBranding('Overture');
const toolCheck: IWorkflowDefinition = createWorkflowCatalog(branding).toolCheck;
const fitsAnswers: IAnswers = journeyAnswers(TOOL_CHECK_JOURNEY);
const fits: IPolicyDecision = evaluateToolPolicy(fitsAnswers, branding);
const gapAnswers: IAnswers = journeyAnswers(TOOL_CHECK_GAP_JOURNEY);
const gap: IPolicyDecision = evaluateToolPolicy(gapAnswers, branding);

const RETRY_ID: string = 'OVT-AICOE-20260929-RETRYME4';
const OUTAGE: ISubmissionResult = {
  connected: false,
  state: 'failed',
  intakeId: RETRY_ID,
  message: 'SharePoint could not create the AI CoE record. AI CoE Pilot Intakes returned 503: boom',
  failureClass: 'TRANSIENT',
  userMessage: 'Not available right now; try again.'
};
const PENDING: ISubmissionResult = {
  connected: false,
  state: 'pending',
  intakeId: RETRY_ID,
  message: `SharePoint accepted the AI CoE record ${RETRY_ID} but did not confirm it back.`,
  failureClass: 'INCONCLUSIVE',
  userMessage: 'Saved, not yet confirmed.'
};
/** The guidance a kept draft resumes onto: the answers and the routing result, before any review request. */
const GUIDANCE_DRAFT: object = { answers: fitsAnswers, currentStepId: 'usagePattern', phase: 'result', decision: fits };

function renderToolCheck(options: IWorkflowPageOptions = {}): IWorkflowHarness {
  return renderWorkflowPage((props: IWorkflowProps): React.ReactElement => <ToolCheckWorkflow {...props} />, options);
}

async function reachResult(journey: IJourney, decision: IPolicyDecision, options: IWorkflowPageOptions = {}): Promise<IWorkflowHarness> {
  const harness: IWorkflowHarness = renderToolCheck(options);
  await firstStepOf(toolCheck);
  playJourney(journey, toolCheck);
  expect(screen.getByRole('status')).toHaveTextContent('Looking at your answers…');
  await screen.findByRole('heading', { level: 2, name: decision.label });
  return harness;
}

function fillContact(name: string, team: string, email: string): void {
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Your team'), { target: { value: team } });
  fireEvent.change(screen.getByLabelText('Work email'), { target: { value: email } });
}

/** From the guidance result: opens the contact form, fills it in and files the review request. */
function requestReview(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Want a second opinion? Create a CoE review request' }));
  fillContact('Pat Example', 'Finance', 'pat@contoso.com');
  fireEvent.click(screen.getByRole('button', { name: 'Create review request' }));
}

describe('ToolCheckWorkflow', () => {
  it('routes the answers to a guidance result that can be copied and downloaded', async () => {
    expect(fits.outcomeKey).toBe('fits');
    const downloads: IDownloadSpy = spyOnDownloads();
    const writeText: jest.Mock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      await reachResult(TOOL_CHECK_JOURNEY, fits);
      expect(screen.getByText('Guidance prototype — routing only, not a policy decision')).toHaveClass('overture-badge');
      expect(screen.getByText('Guidance prototype')).toHaveClass('overture-badge');
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByText("This is routing guidance, not an approval decision. A person can still confirm anything you see here — that's what a CoE review request is for.")).toBeInTheDocument();
      const reasons: HTMLElement = screen.getByRole('heading', { name: "Why you're seeing this" }).nextElementSibling as HTMLElement;
      expect(within(reasons).getAllByRole('listitem').map((item: HTMLElement): string | null => item.textContent)).toEqual(fits.reasons);
      const nextSteps: HTMLElement = screen.getByRole('heading', { name: 'Next steps' }).nextElementSibling as HTMLElement;
      expect(within(nextSteps).getAllByRole('listitem').map((item: HTMLElement): string | null => item.textContent)).toEqual(fits.nextSteps);
      const contributing: HTMLElement = screen.getByRole('heading', { name: 'Answers that shaped this result' }).nextElementSibling as HTMLElement;
      expect(contributing.children).toHaveLength(0);
      expect(screen.getByText('The guidance record could not be created. Copy or download this guidance and report the issue to the AI CoE administrator.')).toBeInTheDocument();
      const summary: HTMLElement = screen.getByText(/^Overture AI CoE — /);
      expect(summary.tagName).toBe('PRE');
      expect(summary.textContent).toContain(`Result: ${fits.label}`);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }));
      });
      expect(writeText).toHaveBeenCalledWith(summary.textContent);
      expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Download summary' }));
      expect(downloads.names).toEqual(['overture-ai-coe-guidance-summary.txt']);
      expect(screen.getByRole('button', { name: 'Want a second opinion? Create a CoE review request' })).toHaveClass('overture-btn-secondary');
    } finally {
      downloads.restore();
    }
  });

  it('collects contact details and submits a review request', async () => {
    const downloads: IDownloadSpy = spyOnDownloads();
    try {
      const { governance, draftStore, onDraftsChanged } = await reachResult(TOOL_CHECK_JOURNEY, fits);
      fireEvent.click(screen.getByRole('button', { name: 'Want a second opinion? Create a CoE review request' }));
      expect(screen.getByRole('heading', { name: 'Create a CoE review request' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Create review request' }));
      expect(screen.getByText('Please add your name and team so the AI CoE team knows who to follow up with.')).toBeInTheDocument();
      expect(governance.submissions).toHaveLength(0);

      fillContact('Pat Example', 'Finance', 'pat@contoso.com');
      expect(screen.queryByText(/Please add your name and team/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Back to result' }));
      expect(screen.getByRole('heading', { level: 2, name: fits.label })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Want a second opinion? Create a CoE review request' }));
      expect(screen.getByLabelText('Your name')).toHaveValue('Pat Example');
      fireEvent.click(screen.getByRole('button', { name: 'Create review request' }));
      expect(screen.getByRole('status')).toHaveTextContent('Putting your review request together…');
      await screen.findByRole('heading', { name: 'Your review request is ready' });
      expect(screen.getByText('This review request has entered the AI CoE intake and triage process.')).toBeInTheDocument();
      expect(screen.getByText('Submission received: OVT-AICOE-20260911-TESTTEST')).toBeInTheDocument();
      expect(governance.submissions).toHaveLength(1);
      expect(governance.submissions[0].workflowType).toBe('toolCheck-review-request');
      expect(governance.submissions[0].payload).toEqual({
        requestId: expect.stringMatching(/^review-request-/),
        createdAt: expect.stringMatching(ISO_TIMESTAMP),
        workflowId: 'toolCheck',
        workflowVersion: toolCheck.workflowVersion,
        originalAnswers: fitsAnswers,
        outcome: fits.label,
        reasons: fits.reasons,
        contributingAnswers: [],
        policyGapRecord: null,
        requestedBy: { name: 'Pat Example', team: 'Finance', email: 'pat@contoso.com' },
        status: 'confirmed'
      });
      expect(draftStore.keys()).toEqual([]);
      expect(onDraftsChanged).toHaveBeenCalledWith('toolCheck', false);
      expect(screen.getByText(/^Overture AI CoE — CoE review request/).textContent).toContain('Requested by: Pat Example (Finance)');
      fireEvent.click(screen.getByRole('button', { name: 'Download summary' }));
      expect(downloads.names).toEqual(['overture-ai-coe-review-request.txt']);

      fireEvent.click(screen.getByRole('button', { name: 'Start a new one' }));
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Start over' }));
      await firstStepOf(toolCheck);
      playJourney(TOOL_CHECK_JOURNEY, toolCheck);
      await screen.findByRole('heading', { level: 2, name: fits.label });
      expect(screen.getByText('Guidance record created: OVT-AICOE-20260911-TESTTEST')).toBeInTheDocument();
      expect(screen.getByText('This routing result was recorded for audit. Use the buttons below to copy or download it, or create a governed CoE review request.')).toBeInTheDocument();
    } finally {
      downloads.restore();
    }
  });

  it('attaches a policy-gap record when guidance does not cover the case', async () => {
    expect(gap.outcomeKey).toBe('gap');
    const { governance } = await reachResult(TOOL_CHECK_GAP_JOURNEY, gap);
    const request: HTMLElement = screen.getByRole('button', { name: 'Create a CoE review request' });
    expect(request).toHaveClass('overture-btn-primary');
    fireEvent.click(request);
    fillContact('Pat Example', 'Finance', '');
    fireEvent.click(screen.getByRole('button', { name: 'Create review request' }));
    await screen.findByRole('heading', { name: 'Your review request is ready' });
    const payload: { policyGapRecord: unknown; requestedBy: unknown } = governance.submissions[0].payload as { policyGapRecord: unknown; requestedBy: unknown };
    expect(payload.requestedBy).toEqual({ name: 'Pat Example', team: 'Finance', email: '' });
    expect(payload.policyGapRecord).toEqual({
      recordId: expect.stringMatching(/^policy-gap-/),
      createdAt: expect.stringMatching(ISO_TIMESTAMP),
      workflowId: 'toolCheck',
      type: 'policy-gap',
      originalAnswers: gapAnswers,
      outcome: gap.label,
      reasons: gap.reasons,
      contributingAnswers: [],
      status: 'open'
    });
  });

  it('still clears the draft after a failed review request in the legacy view', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    await draftStore.save('toolCheck', { answers: {} });
    const { governance, onDraftsChanged } = await reachResult(TOOL_CHECK_JOURNEY, fits, { draftStore });
    governance.result = OUTAGE;
    requestReview();
    await screen.findByText('The AI CoE record was not created.');
    expect(draftStore.keys()).toEqual([]);
    expect(onDraftsChanged).toHaveBeenCalledWith('toolCheck', false);
  });

  describe('in a page view', () => {
    it.each([
      ['failed', OUTAGE, 'Try again'],
      ['pending', PENDING, 'Confirm again']
    ])('keeps the guidance as a draft after a %s review request and clears it once a retry under the same reference is saved', async (_state: string, outcome: ISubmissionResult, retryLabel: string) => {
      const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
      const { governance, onDraftsChanged } = await reachResult(TOOL_CHECK_JOURNEY, fits, { draftStore, pageView: true });
      const saved: ISubmissionResult = governance.result;
      governance.result = outcome;
      requestReview();
      await screen.findByRole('heading', { name: 'Your review request is ready' });
      await waitFor((): void => expect(draftStore.keys()).toEqual(['toolCheck']));
      expect(JSON.parse(draftStore.drafts.toolCheck)).toMatchObject(GUIDANCE_DRAFT);
      expect(onDraftsChanged).not.toHaveBeenCalledWith('toolCheck', false);

      governance.result = saved;
      fireEvent.click(screen.getByRole('button', { name: retryLabel }));
      await screen.findByText('Saved and confirmed');
      expect(governance.submissions).toHaveLength(2);
      expect(governance.submissions[1].workflowType).toBe('toolCheck-review-request');
      expect(governance.submissions[1].intakeId).toBe(RETRY_ID);
      expect(governance.submissions[1].payload).toEqual(governance.submissions[0].payload);
      expect(draftStore.keys()).toEqual([]);
      expect(onDraftsChanged).toHaveBeenCalledWith('toolCheck', false);
    });

    it('confirms an earlier attempt that held the review request back without clearing the guidance, then sends it on request', async () => {
      const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
      const governance: IFakeGovernanceService = createFakeGovernanceService();
      const saved: ISubmissionResult = governance.result;
      holdEarlierAttempt(governance);
      const { onDraftsChanged } = await reachResult(TOOL_CHECK_JOURNEY, fits, { draftStore, governance, pageView: true });
      requestReview();
      await screen.findByText('Saved, not yet confirmed');
      await waitFor((): void => expect(draftStore.keys()).toEqual(['toolCheck']));

      governance.result = EARLIER_ATTEMPT_SAVED;
      fireEvent.click(screen.getByRole('button', { name: 'Confirm again' }));
      await screen.findByText('Earlier request confirmed');
      expect(governance.submissions[1]).toEqual({ workflowType: EARLIER_ATTEMPT.workflowType, payload: EARLIER_ATTEMPT.payload, intakeId: EARLIER_ATTEMPT.intakeId });
      expect(JSON.parse(draftStore.drafts.toolCheck)).toMatchObject(GUIDANCE_DRAFT);
      expect(onDraftsChanged).not.toHaveBeenCalledWith('toolCheck', false);

      governance.result = saved;
      fireEvent.click(screen.getByRole('button', { name: 'Send these answers' }));
      await screen.findByText('Saved and confirmed');
      expect(governance.submissions).toHaveLength(3);
      expect(governance.submissions[2].workflowType).toBe('toolCheck-review-request');
      expect(governance.submissions[2].intakeId).toBeUndefined();
      expect(draftStore.keys()).toEqual([]);
      expect(onDraftsChanged).toHaveBeenCalledWith('toolCheck', false);
    });
  });

  it('saves form drafts and resumes onto a saved result', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    const first: IWorkflowHarness = renderToolCheck({ draftStore });
    await firstStepOf(toolCheck);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Progress: Just getting started');
    enterAnswer(toolCheck.steps[0], 'Drafting notes.');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved.');
    expect(JSON.parse(draftStore.drafts.toolCheck)).toEqual({ answers: { helpWith: 'Drafting notes.' }, currentStepId: 'helpWith', phase: 'form', decision: null });
    first.unmount();

    await draftStore.save('toolCheck', { answers: fitsAnswers, currentStepId: 'usagePattern', phase: 'result', decision: fits });
    renderToolCheck({ draftStore, resumeDraft: true });
    await screen.findByRole('heading', { level: 2, name: fits.label });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
