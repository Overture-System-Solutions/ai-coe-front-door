import * as React from 'react';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { useSubmission } from '../../context/SubmissionContext';
import { LoadingState } from '../../controls/LoadingState';
import { ProgressBar } from '../../controls/ProgressBar';
import { ResultPanel } from '../../controls/ResultPanel';
import { StepNav } from '../../controls/StepNav';
import { StepRenderer } from '../../controls/StepRenderer';
import { WorkflowHeader } from '../../controls/WorkflowHeader';
import { buildReviewRequestExportText } from '../../services/toolPolicyEvaluator';
import type { IPolicyEvaluation, IReviewContact } from '../../services/toolPolicyEvaluator';
import type { ISubmissionResult } from '../../services/types';
import { validateStep } from '../../workflows/formEngine';
import { buildReviewRequestPayload, CONTACT_REQUIRED_MESSAGE, createToolCheckSession, toolCheckReducer, toStoredToolCheckDraft } from '../../workflows/toolCheckSession';
import type { IToolCheckDraft, IToolCheckSession, ToolCheckSessionAction } from '../../workflows/toolCheckSession';
import type { IAnswers, IWorkflowDefinition } from '../../workflows/types';
import { GuidanceResult } from './GuidanceResult';
import { ReviewRequestContactForm } from './ReviewRequestContactForm';
import { IntroParagraph, SETTING_UP_TEXT, settleDraft, StartOverDialog, stepPosition, useClearDraft, useDraftBoot, useSaveDraft, WorkflowCard } from './shared';
import type { IStepPosition, IWorkflowProps } from './shared';

const WORKFLOW_ID: 'toolCheck' = 'toolCheck';

/** Tool or task check: questions, the local routing "guidance prototype", and an optional CoE review request. */
export function ToolCheckWorkflow({ resumeDraft, onExit, onDraftsChanged }: IWorkflowProps): React.ReactElement {
  const { branding, catalog, services, pageView } = useFrontDoor();
  const { submit, retryLast } = useSubmission();
  const definition: IWorkflowDefinition = catalog.toolCheck;
  const [session, dispatch] = React.useReducer(
    toolCheckReducer,
    definition,
    (initial: IWorkflowDefinition): IToolCheckSession => createToolCheckSession(initial, undefined)
  );
  const [confirmingRestart, setConfirmingRestart] = React.useState<boolean>(false);
  const saveDraft: (draft: unknown) => Promise<string> = useSaveDraft(WORKFLOW_ID, onDraftsChanged);
  const clearDraft: () => Promise<void> = useClearDraft(WORKFLOW_ID, onDraftsChanged);
  const loading: boolean = useDraftBoot<IToolCheckDraft>(WORKFLOW_ID, resumeDraft, (draft: IToolCheckDraft | undefined): void => {
    dispatch({ type: 'RESET', session: createToolCheckSession(definition, draft) });
  });

  const position: IStepPosition = React.useMemo((): IStepPosition => stepPosition(definition, session), [definition, session]);
  // The register's view of a picked tool (tabbed view, 1.0.0.18); the full form derives nothing.
  const derived = (answers: IAnswers): IAnswers => (definition.deriveAnswers === undefined ? answers : definition.deriveAnswers(answers));
  const { steps, index, step } = position;

  if (loading) {
    return (
      <div>
        <WorkflowHeader workflow={definition} onExit={onExit} />
        <LoadingState text={SETTING_UP_TEXT} />
      </div>
    );
  }

  const goTo = (action: Omit<Extract<ToolCheckSessionAction, { type: 'GOTO' }>, 'type'>): void => dispatch({ type: 'GOTO', ...action });

  const evaluate = (): void => {
    dispatch({ type: 'SET_PHASE', phase: 'evaluating' });
    services.toolPolicyEvaluator.evaluate(derived(session.answers)).then(
      (decision: IPolicyEvaluation): void => dispatch({ type: 'SET_DECISION', decision }),
      (error: unknown): void => {
        console.error('AI CoE guidance evaluation failed', error);
        dispatch({ type: 'SET_PHASE', phase: 'form' });
      }
    );
  };

  const back = (): void => {
    if (session.editReturnTarget === 'result') {
      goTo({ stepId: session.currentStepId, phase: 'result' });
    } else if (index <= 0) {
      onExit();
    } else {
      goTo({ stepId: steps[index - 1].id, phase: 'form' });
    }
  };

  const next = (): void => {
    const message: string | undefined = validateStep(step, session.answers);
    if (step !== undefined && message !== undefined) {
      dispatch({ type: 'SET_ERROR', stepId: step.id, message });
    } else if (session.editReturnTarget === 'result' || index >= steps.length - 1) {
      evaluate();
    } else {
      goTo({ stepId: steps[index + 1].id, phase: 'form' });
    }
  };

  const save = (): void => {
    saveDraft(toStoredToolCheckDraft(session)).then(
      (text: string): void => dispatch({ type: 'SET_NOTICE', text }),
      (): void => dispatch({ type: 'SET_NOTICE', text: undefined })
    );
  };

  /** After an outcome: the legacy shell clears the draft; a page view keeps the guidance as a draft unless the request is saved. */
  const settle = (result: ISubmissionResult): Promise<void> =>
    settleDraft(result, pageView, (): Promise<string> => saveDraft({ ...toStoredToolCheckDraft(session), phase: 'result' }), clearDraft);

  const submitReviewRequest = async (decision: IPolicyEvaluation): Promise<void> => {
    dispatch({ type: 'SET_PHASE', phase: 'reviewSubmitting' });
    const result: ISubmissionResult = await submit('toolCheck-review-request', buildReviewRequestPayload(definition, derived(session.answers), decision, session.contact));
    await settle(result);
    dispatch({ type: 'SET_PHASE', phase: 'reviewResult' });
  };

  /** Sends the last attempt again under its reference (page views: a pending or failed request completes, nothing duplicates). */
  const confirmAgain = async (): Promise<void> => {
    dispatch({ type: 'SET_PHASE', phase: 'reviewSubmitting' });
    const result: ISubmissionResult | undefined = await retryLast();
    if (result !== undefined) {
      await settle(result);
    }
    dispatch({ type: 'SET_PHASE', phase: 'reviewResult' });
  };

  const retry = (): void => {
    confirmAgain().catch((error: unknown): void => {
      console.error('AI CoE submission failed', error);
      dispatch({ type: 'SET_PHASE', phase: 'reviewResult' });
    });
  };

  const requestReview = (): void => {
    if (!session.contact.name.trim() || !session.contact.team.trim()) {
      dispatch({ type: 'SET_CONTACT_ERROR', message: CONTACT_REQUIRED_MESSAGE });
      return;
    }
    if (session.decision === undefined) {
      return;
    }
    // The governance service reports failures as results; a rejection here is a programming error.
    submitReviewRequest(session.decision).catch((error: unknown): void => {
      console.error('AI CoE submission failed', error);
      dispatch({ type: 'SET_PHASE', phase: 'reviewContact' });
    });
  };

  const restart = (): void => {
    setConfirmingRestart(false);
    clearDraft().then(
      (): void => dispatch({ type: 'RESET', session: createToolCheckSession(definition, undefined) }),
      (): void => undefined
    );
  };

  const inForm: boolean = session.phase === 'form';
  const continueLabel: string = session.editReturnTarget === 'result' ? 'Save & review result' : index >= steps.length - 1 ? 'See guidance' : 'Continue';
  const contact: IReviewContact = session.contact;

  return (
    <div>
      <WorkflowHeader workflow={definition} onExit={onExit} />
      {definition.approvedToolList !== true && (
        <div className="mb-5">
          <span className="overture-badge inline-block rounded-full px-3 py-1 text-xs font-medium">Guidance prototype — routing only, not a policy decision</span>
        </div>
      )}
      {inForm && <ProgressBar current={index} total={steps.length} phase="form" />}
      <WorkflowCard>
        {index === 0 && inForm && session.editReturnTarget === undefined && <IntroParagraph />}
        {inForm && (
          <StepRenderer
            step={step}
            value={step === undefined ? undefined : session.answers[step.id]}
            error={step === undefined ? undefined : session.errors[step.id]}
            onAnswer={(value: string | string[]): void => {
              if (step !== undefined) {
                dispatch({ type: 'ANSWER', stepId: step.id, value });
              }
            }}
            answers={session.answers}
            onAnswerField={(fieldId: string, fieldValue: string | string[]): void => dispatch({ type: 'ANSWER', stepId: fieldId, value: fieldValue })}
          />
        )}
        {session.phase === 'evaluating' && <LoadingState text="Looking at your answers…" />}
        {session.phase === 'result' && session.decision !== undefined && (
          <GuidanceResult
            workflow={definition}
            answers={session.answers}
            decision={session.decision}
            onEditAnswer={(stepId: string): void => goTo({ stepId, phase: 'form', editReturnTarget: 'result' })}
            onStartOver={(): void => setConfirmingRestart(true)}
            onDone={onExit}
            onRequestReview={(): void => dispatch({ type: 'SET_PHASE', phase: 'reviewContact' })}
          />
        )}
        {session.phase === 'reviewContact' && (
          <ReviewRequestContactForm
            contact={contact}
            onChange={(key: keyof IReviewContact, value: string): void => dispatch({ type: 'SET_CONTACT_FIELD', key, value })}
            onCancel={(): void => dispatch({ type: 'SET_PHASE', phase: 'result' })}
            onSubmit={requestReview}
            error={session.contactError}
          />
        )}
        {session.phase === 'reviewSubmitting' && <LoadingState text="Putting your review request together…" />}
        {session.phase === 'reviewResult' && session.decision !== undefined && (
          <ResultPanel
            headerIntro="Your review request is ready"
            headerSubtext="This review request has entered the AI CoE intake and triage process."
            summaryText={buildReviewRequestExportText(definition, session.answers, session.decision, contact, branding)}
            downloadFilename="overture-ai-coe-review-request.txt"
            onStartOver={(): void => setConfirmingRestart(true)}
            onDone={onExit}
            onRetry={retry}
            onSendAnswers={requestReview}
          />
        )}
        {inForm && (
          <StepNav
            onBack={back}
            onContinue={next}
            continueLabel={continueLabel}
            onSaveDraft={save}
            onStartOver={(): void => setConfirmingRestart(true)}
            notice={session.notice}
          />
        )}
      </WorkflowCard>
      <StartOverDialog open={confirmingRestart} onConfirm={restart} onCancel={(): void => setConfirmingRestart(false)} />
    </div>
  );
}
