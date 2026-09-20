import * as React from 'react';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { useSubmission } from '../../context/SubmissionContext';
import { LoadingState } from '../../controls/LoadingState';
import { NoticeBanner } from '../../controls/NoticeBanner';
import { ProgressBar } from '../../controls/ProgressBar';
import { ResultPanel } from '../../controls/ResultPanel';
import { SecondaryActions } from '../../controls/SecondaryActions';
import { StepNav } from '../../controls/StepNav';
import { StepRenderer } from '../../controls/StepRenderer';
import { WorkflowHeader } from '../../controls/WorkflowHeader';
import { Info } from '../../icons';
import type { ISubmissionResult } from '../../services/types';
import { buildFeedbackExportText, buildFeedbackRecord, feedbackWhatHappensNext } from '../../summaries/feedbackSummary';
import { createFeedbackSession, feedbackReducer, toStoredFeedbackDraft } from '../../workflows/feedbackSession';
import type { FeedbackSessionAction, IFeedbackDraft, IFeedbackSession } from '../../workflows/feedbackSession';
import { validateStep } from '../../workflows/formEngine';
import type { IWorkflowDefinition } from '../../workflows/types';
import { FEEDBACK_NOTICE, FeedbackReview } from './FeedbackReview';
import { SETTING_UP_TEXT, settleDraft, StartOverDialog, stepPosition, SummaryFooter, useClearDraft, useDraftBoot, useSaveDraft, WorkflowCard } from './shared';
import type { IStepPosition, IWorkflowProps } from './shared';

const WORKFLOW_ID: 'feedback' = 'feedback';

/** Feedback about the AI CoE services: questions, a review page and the confirmed record. */
export function FeedbackWorkflow({ resumeDraft, onExit, onDraftsChanged }: IWorkflowProps): React.ReactElement {
  const { branding, catalog, pageView } = useFrontDoor();
  const { submit, retryLast } = useSubmission();
  const definition: IWorkflowDefinition = catalog.feedback;
  const [session, dispatch] = React.useReducer(
    feedbackReducer,
    definition,
    (initial: IWorkflowDefinition): IFeedbackSession => createFeedbackSession(initial, undefined)
  );
  const [confirmingRestart, setConfirmingRestart] = React.useState<boolean>(false);
  const saveDraft: (draft: unknown) => Promise<string> = useSaveDraft(WORKFLOW_ID, onDraftsChanged);
  const clearDraft: () => Promise<void> = useClearDraft(WORKFLOW_ID, onDraftsChanged);
  const loading: boolean = useDraftBoot<IFeedbackDraft>(WORKFLOW_ID, resumeDraft, (draft: IFeedbackDraft | undefined): void => {
    dispatch({ type: 'RESET', session: createFeedbackSession(definition, draft) });
  });

  const position: IStepPosition = React.useMemo((): IStepPosition => stepPosition(definition, session), [definition, session]);
  const { steps, index, step } = position;

  if (loading) {
    return (
      <div>
        <WorkflowHeader workflow={definition} onExit={onExit} />
        <LoadingState text={SETTING_UP_TEXT} />
      </div>
    );
  }

  const goTo = (action: Omit<Extract<FeedbackSessionAction, { type: 'GOTO' }>, 'type'>): void => dispatch({ type: 'GOTO', ...action });

  const back = (): void => {
    if (session.editReturnTarget === 'review') {
      goTo({ stepId: session.currentStepId, phase: 'review' });
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
    } else if (session.editReturnTarget === 'review') {
      goTo({ stepId: session.currentStepId, phase: 'review' });
    } else if (index >= steps.length - 1) {
      // The shipped build asked a model for theme suggestions here and always received none.
      dispatch({ type: 'SET_THEMES', themes: [] });
    } else {
      goTo({ stepId: steps[index + 1].id, phase: 'form' });
    }
  };

  const save = (): void => {
    saveDraft(toStoredFeedbackDraft(session)).then(
      (text: string): void => dispatch({ type: 'SET_NOTICE', text }),
      (): void => dispatch({ type: 'SET_NOTICE', text: undefined })
    );
  };

  /** After an outcome: the legacy shell clears the draft; a page view keeps the feedback as a review-stage draft unless the record is saved. */
  const settle = (result: ISubmissionResult): Promise<void> =>
    settleDraft(result, pageView, (): Promise<string> => saveDraft({ ...toStoredFeedbackDraft(session), phase: 'review' }), clearDraft);

  const submitFeedback = async (): Promise<void> => {
    dispatch({ type: 'SET_PHASE', phase: 'submitting' });
    const result: ISubmissionResult = await submit(WORKFLOW_ID, buildFeedbackRecord(definition, session.answers, session.themes));
    await settle(result);
    dispatch({ type: 'SET_PHASE', phase: 'result' });
  };

  const confirm = (): void => {
    // The governance service reports failures as results; a rejection here is a programming error.
    submitFeedback().catch((error: unknown): void => {
      console.error('AI CoE submission failed', error);
      dispatch({ type: 'SET_PHASE', phase: 'review' });
    });
  };

  /** Sends the last attempt again under its reference (page views: a pending or failed record completes, nothing duplicates). */
  const confirmAgain = async (): Promise<void> => {
    dispatch({ type: 'SET_PHASE', phase: 'submitting' });
    const result: ISubmissionResult | undefined = await retryLast();
    if (result !== undefined) {
      await settle(result);
    }
    dispatch({ type: 'SET_PHASE', phase: 'result' });
  };

  const retry = (): void => {
    confirmAgain().catch((error: unknown): void => {
      console.error('AI CoE submission failed', error);
      dispatch({ type: 'SET_PHASE', phase: 'result' });
    });
  };

  const restart = (): void => {
    setConfirmingRestart(false);
    clearDraft().then(
      (): void => dispatch({ type: 'RESET', session: createFeedbackSession(definition, undefined) }),
      (): void => undefined
    );
  };

  const inForm: boolean = session.phase === 'form';
  const inReview: boolean = session.phase === 'review';
  const continueLabel: string = session.editReturnTarget === 'review' ? 'Save & return to review' : index >= steps.length - 1 ? 'Review my feedback' : 'Continue';

  return (
    <div>
      <WorkflowHeader workflow={definition} onExit={onExit} />
      {(inForm || inReview) && <ProgressBar current={index} total={steps.length} phase={session.phase} />}
      <WorkflowCard>
        {index === 0 && inForm && session.editReturnTarget === undefined && (
          <div className="mb-5">
            <NoticeBanner icon={Info}>{FEEDBACK_NOTICE}</NoticeBanner>
          </div>
        )}
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
          />
        )}
        {inReview && (
          <FeedbackReview
            workflow={definition}
            answers={session.answers}
            onEditAnswer={(stepId: string): void => goTo({ stepId, phase: 'form', editReturnTarget: 'review' })}
            onConfirm={confirm}
          />
        )}
        {session.phase === 'submitting' && <LoadingState text="Putting your feedback together…" />}
        {session.phase === 'result' && (
          <ResultPanel
            headerIntro="Thank you for your feedback."
            headerSubtext={feedbackWhatHappensNext(session.answers)}
            summaryText={buildFeedbackExportText(definition, { answers: session.answers, themes: session.themes }, branding)}
            downloadFilename="overture-ai-coe-feedback.txt"
            onStartOver={(): void => setConfirmingRestart(true)}
            onDone={onExit}
            onRetry={retry}
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
        {inReview && (
          <SummaryFooter>
            <SecondaryActions onSaveDraft={save} onStartOver={(): void => setConfirmingRestart(true)} notice={session.notice} />
          </SummaryFooter>
        )}
      </WorkflowCard>
      <StartOverDialog open={confirmingRestart} onConfirm={restart} onCancel={(): void => setConfirmingRestart(false)} />
    </div>
  );
}
