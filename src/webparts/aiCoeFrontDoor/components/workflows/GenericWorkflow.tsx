import * as React from 'react';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { useSubmission } from '../../context/SubmissionContext';
import { LoadingState } from '../../controls/LoadingState';
import { ProgressBar } from '../../controls/ProgressBar';
import { ResultPanel } from '../../controls/ResultPanel';
import { ReviewAnswers } from '../../controls/ReviewAnswers';
import { StepNav } from '../../controls/StepNav';
import { StepRenderer } from '../../controls/StepRenderer';
import { WorkflowHeader } from '../../controls/WorkflowHeader';
import type { ISubmissionResult } from '../../services/types';
import { buildGenericExportText, createGenericSession, genericReducer, validateStep, whatHappensNextText } from '../../workflows/formEngine';
import type { GenericSessionAction, IGenericDraft, IGenericSession } from '../../workflows/formEngine';
import type { IWorkflowDefinition, WorkflowId } from '../../workflows/types';
import { IntroParagraph, SETTING_UP_TEXT, settleDraft, StartOverDialog, stepPosition, SUBMITTING_TEXT, useClearDraft, useDraftBoot, useSaveDraft, WorkflowCard } from './shared';
import type { IStepPosition, IWorkflowProps } from './shared';

export interface IGenericWorkflowProps extends IWorkflowProps {
  workflowId: WorkflowId;
}

function continueLabel(session: IGenericSession, position: IStepPosition): string {
  if (session.phase === 'review') {
    return 'Confirm';
  }
  if (session.editReturnTarget === 'review') {
    return 'Save & return to review';
  }
  return position.index >= position.steps.length - 1 ? 'Review my answers' : 'Continue';
}

/** Question-by-question form, review page and submission for the workflows without a bespoke summary. */
export function GenericWorkflow({ workflowId, resumeDraft, onExit, onDraftsChanged }: IGenericWorkflowProps): React.ReactElement {
  const { branding, catalog, pageView } = useFrontDoor();
  const { submit, retryLast } = useSubmission();
  const definition: IWorkflowDefinition = catalog[workflowId];
  const [session, dispatch] = React.useReducer(
    genericReducer,
    definition,
    (initial: IWorkflowDefinition): IGenericSession => createGenericSession(initial, undefined)
  );
  const [confirmingRestart, setConfirmingRestart] = React.useState<boolean>(false);
  const saveDraft: (draft: unknown) => Promise<string> = useSaveDraft(workflowId, onDraftsChanged);
  const clearDraft: () => Promise<void> = useClearDraft(workflowId, onDraftsChanged);
  const loading: boolean = useDraftBoot<IGenericDraft>(workflowId, resumeDraft, (draft: IGenericDraft | undefined): void => {
    dispatch({ type: 'RESET', session: createGenericSession(definition, draft) });
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

  const goTo = (action: Omit<Extract<GenericSessionAction, { type: 'GOTO' }>, 'type'>): void => dispatch({ type: 'GOTO', ...action });

  const back = (): void => {
    if (session.phase === 'review') {
      goTo({ stepId: steps[steps.length - 1].id, phase: 'form' });
    } else if (session.editReturnTarget === 'review') {
      goTo({ stepId: session.currentStepId, phase: 'review' });
    } else if (index <= 0) {
      onExit();
    } else {
      goTo({ stepId: steps[index - 1].id, phase: 'form' });
    }
  };

  /** After an outcome: the legacy shell clears the draft; a page view keeps the answers as a review-stage draft unless the record is saved. */
  const settle = (result: ISubmissionResult): Promise<void> =>
    settleDraft(result, pageView, (): Promise<string> => saveDraft({ answers: session.answers, currentStepId: session.currentStepId, phase: 'review' }), clearDraft);

  const submitAnswers = async (): Promise<void> => {
    dispatch({ type: 'SET_PHASE', phase: 'submitting' });
    const result: ISubmissionResult = await submit(workflowId, session.answers);
    await settle(result);
    dispatch({ type: 'SET_RESULT', result });
  };

  /** Sends the last attempt again under its reference (page views: a pending or failed record completes, nothing duplicates). */
  const confirmAgain = async (): Promise<void> => {
    dispatch({ type: 'SET_PHASE', phase: 'submitting' });
    const result: ISubmissionResult | undefined = await retryLast();
    if (result === undefined) {
      dispatch({ type: 'SET_PHASE', phase: 'result' });
      return;
    }
    await settle(result);
    dispatch({ type: 'SET_RESULT', result });
  };

  const retry = (): void => {
    confirmAgain().catch((error: unknown): void => {
      console.error('AI CoE submission failed', error);
      dispatch({ type: 'SET_PHASE', phase: 'result' });
    });
  };

  const next = (): void => {
    if (session.phase === 'review') {
      // The governance service reports failures as results; a rejection here is a programming error.
      submitAnswers().catch((error: unknown): void => {
        console.error('AI CoE submission failed', error);
        dispatch({ type: 'SET_PHASE', phase: 'review' });
      });
      return;
    }
    const message: string | undefined = validateStep(step, session.answers);
    if (step !== undefined && message !== undefined) {
      dispatch({ type: 'SET_ERROR', stepId: step.id, message });
    } else if (session.editReturnTarget === 'review' || index >= steps.length - 1) {
      goTo({ stepId: session.currentStepId, phase: 'review' });
    } else {
      goTo({ stepId: steps[index + 1].id, phase: 'form' });
    }
  };

  const save = (): void => {
    saveDraft({ answers: session.answers, currentStepId: session.currentStepId, phase: session.phase === 'review' ? 'review' : 'form' }).then(
      (text: string): void => dispatch({ type: 'SET_NOTICE', text }),
      (): void => dispatch({ type: 'SET_NOTICE', text: undefined })
    );
  };

  const restart = (): void => {
    setConfirmingRestart(false);
    clearDraft().then(
      (): void => dispatch({ type: 'RESET', session: createGenericSession(definition, undefined) }),
      (): void => undefined
    );
  };

  const inForm: boolean = session.phase === 'form';
  const inReview: boolean = session.phase === 'review';

  return (
    <div>
      <WorkflowHeader workflow={definition} onExit={onExit} />
      {(inForm || inReview) && <ProgressBar current={index} total={steps.length} phase={session.phase} />}
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
          />
        )}
        {inReview && (
          <ReviewAnswers
            workflow={definition}
            steps={steps}
            answers={session.answers}
            onEdit={(stepId: string): void => goTo({ stepId, phase: 'form', editReturnTarget: 'review' })}
          />
        )}
        {session.phase === 'submitting' && <LoadingState text={SUBMITTING_TEXT} />}
        {session.phase === 'result' && (
          <ResultPanel
            headerIntro={definition.resultIntro ?? ''}
            headerSubtext={whatHappensNextText(definition, session.answers) ?? ''}
            summaryText={buildGenericExportText(definition, session.answers, steps, branding)}
            downloadFilename={`overture-ai-coe-${definition.id}-summary.txt`}
            onStartOver={(): void => setConfirmingRestart(true)}
            onDone={onExit}
            onRetry={retry}
          />
        )}
        {(inForm || inReview) && (
          <StepNav
            onBack={back}
            onContinue={next}
            continueLabel={continueLabel(session, position)}
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
