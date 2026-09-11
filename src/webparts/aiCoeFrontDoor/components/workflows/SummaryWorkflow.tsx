import * as React from 'react';
import type { IBranding } from '../../branding/branding';
import { useFrontDoor } from '../../context/FrontDoorContext';
import { useSubmission } from '../../context/SubmissionContext';
import { LoadingState } from '../../controls/LoadingState';
import { ProgressBar } from '../../controls/ProgressBar';
import { ResultPanel } from '../../controls/ResultPanel';
import { SecondaryActions } from '../../controls/SecondaryActions';
import { StepNav } from '../../controls/StepNav';
import { StepRenderer } from '../../controls/StepRenderer';
import { SummaryReview } from '../../controls/SummaryReview';
import type { ISummaryReviewCopy } from '../../controls/SummaryReview';
import { WorkflowHeader } from '../../controls/WorkflowHeader';
import type { ISummaryField } from '../../summaries/types';
import { validateStep } from '../../workflows/formEngine';
import { createSummarySession, summaryReducer, toStoredSummaryDraft } from '../../workflows/summarySession';
import type { ISummarySession, ISummaryWorkflowDraft, SummarySessionAction } from '../../workflows/summarySession';
import type { IAnswers, IWorkflowDefinition, WorkflowId } from '../../workflows/types';
import { SETTING_UP_TEXT, StartOverDialog, stepPosition, SUBMITTING_TEXT, SummaryFooter, useClearDraft, useDraftBoot, useSaveDraft, WorkflowCard } from './shared';
import type { IStepPosition, IWorkflowProps } from './shared';

/** Everything that distinguishes the idea workflow from the team-usage one. */
export interface ISummaryWorkflowConfig<TKey extends string> {
  workflowId: WorkflowId;
  fields: readonly ISummaryField<TKey>[];
  copy: ISummaryReviewCopy;
  /** Continue label on the last question. */
  lastStepLabel: string;
  /** Progress label while the summary is shown. */
  completeLabel: string;
  downloadFilename: string;
  intro: (branding: IBranding) => React.ReactElement;
  buildDraft: (definition: IWorkflowDefinition, answers: IAnswers) => { [key in TKey]: string };
  indicators: (answers: IAnswers) => string[];
  whatHappensNext: (definition: IWorkflowDefinition, answers: IAnswers, branding: IBranding) => string;
  exportText: (definition: IWorkflowDefinition, session: ISummarySession<{ [key in TKey]: string }>, branding: IBranding) => string;
  buildPayload: (definition: IWorkflowDefinition, session: ISummarySession<{ [key in TKey]: string }>, indicators: string[]) => unknown;
  resultIntro: (definition: IWorkflowDefinition, branding: IBranding) => string;
}

export interface ISummaryWorkflowProps<TKey extends string> extends IWorkflowProps {
  config: ISummaryWorkflowConfig<TKey>;
}

/** Question-by-question form followed by an editable summary, shared by the idea and team-usage workflows. */
export function SummaryWorkflow<TKey extends string>({ config, resumeDraft, onExit, onDraftsChanged }: ISummaryWorkflowProps<TKey>): React.ReactElement {
  type TDraft = { [key in TKey]: string };
  const { branding, catalog } = useFrontDoor();
  const { submit } = useSubmission();
  const definition: IWorkflowDefinition = catalog[config.workflowId];
  const reducer: React.Reducer<ISummarySession<TDraft>, SummarySessionAction<TDraft>> = summaryReducer;
  const [session, dispatch] = React.useReducer(
    reducer,
    definition,
    (initial: IWorkflowDefinition): ISummarySession<TDraft> => createSummarySession<TDraft>(initial, undefined)
  );
  const [confirmingRestart, setConfirmingRestart] = React.useState<boolean>(false);
  const saveDraft: (draft: unknown) => Promise<string> = useSaveDraft(config.workflowId, onDraftsChanged);
  const clearDraft: () => Promise<void> = useClearDraft(config.workflowId, onDraftsChanged);
  const loading: boolean = useDraftBoot<ISummaryWorkflowDraft<TDraft>>(config.workflowId, resumeDraft, (draft: ISummaryWorkflowDraft<TDraft> | undefined): void => {
    dispatch({ type: 'RESET', session: createSummarySession<TDraft>(definition, draft) });
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

  const goTo = (action: Omit<Extract<SummarySessionAction<TDraft>, { type: 'GOTO' }>, 'type'>): void => dispatch({ type: 'GOTO', ...action });
  const rebuildDraft = (): void => dispatch({ type: 'SET_SUMMARY_DRAFT', draft: config.buildDraft(definition, session.answers) });

  const back = (): void => {
    if (session.editReturnTarget === 'summary') {
      goTo({ stepId: session.currentStepId, phase: 'summary' });
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
    } else if (session.editReturnTarget === 'summary') {
      goTo({ stepId: session.currentStepId, phase: 'summary' });
    } else if (index >= steps.length - 1) {
      rebuildDraft();
    } else {
      goTo({ stepId: steps[index + 1].id, phase: 'form' });
    }
  };

  const save = (): void => {
    saveDraft(toStoredSummaryDraft(session)).then(
      (text: string): void => dispatch({ type: 'SET_NOTICE', text }),
      (): void => dispatch({ type: 'SET_NOTICE', text: undefined })
    );
  };

  const confirmSummary = async (): Promise<void> => {
    dispatch({ type: 'SET_PHASE', phase: 'submitting' });
    await submit(config.workflowId, config.buildPayload(definition, session, config.indicators(session.answers)));
    await clearDraft();
    dispatch({ type: 'SET_PHASE', phase: 'result' });
  };

  const confirm = (): void => {
    // The governance service reports failures as results; a rejection here is a programming error.
    confirmSummary().catch((error: unknown): void => {
      console.error('AI CoE submission failed', error);
      dispatch({ type: 'SET_PHASE', phase: 'summary' });
    });
  };

  const restart = (): void => {
    setConfirmingRestart(false);
    clearDraft().then(
      (): void => dispatch({ type: 'RESET', session: createSummarySession<TDraft>(definition, undefined) }),
      (): void => undefined
    );
  };

  const inForm: boolean = session.phase === 'form';
  const inSummary: boolean = session.phase === 'summary';
  const continueLabel: string =
    session.editReturnTarget === 'summary' ? 'Save & return to summary' : index >= steps.length - 1 ? config.lastStepLabel : 'Continue';

  return (
    <div>
      <WorkflowHeader workflow={definition} onExit={onExit} />
      {(inForm || inSummary) && (
        <ProgressBar current={inSummary ? steps.length - 1 : index} total={steps.length} phase={inSummary ? 'review' : 'form'} completeLabel={config.completeLabel} />
      )}
      <WorkflowCard>
        {index === 0 && inForm && session.editReturnTarget === undefined && config.intro(branding)}
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
        {inSummary && (
          <SummaryReview<TKey>
            workflow={definition}
            copy={config.copy}
            fields={config.fields}
            session={session}
            indicators={config.indicators(session.answers)}
            whatHappensNext={config.whatHappensNext(definition, session.answers, branding)}
            onUpdateField={(key: TKey, value: string): void => dispatch({ type: 'UPDATE_SUMMARY_FIELD', key, value })}
            onRebuild={rebuildDraft}
            onEditAnswer={(stepId: string): void => goTo({ stepId, phase: 'form', editReturnTarget: 'summary' })}
            onConfirm={confirm}
          />
        )}
        {session.phase === 'submitting' && <LoadingState text={SUBMITTING_TEXT} />}
        {session.phase === 'result' && (
          <ResultPanel
            headerIntro={config.resultIntro(definition, branding)}
            headerSubtext={config.whatHappensNext(definition, session.answers, branding)}
            summaryText={config.exportText(definition, session, branding)}
            downloadFilename={config.downloadFilename}
            onStartOver={(): void => setConfirmingRestart(true)}
            onDone={onExit}
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
        {inSummary && (
          <SummaryFooter>
            <SecondaryActions onSaveDraft={save} onStartOver={(): void => setConfirmingRestart(true)} notice={session.notice} />
          </SummaryFooter>
        )}
      </WorkflowCard>
      <StartOverDialog open={confirmingRestart} onConfirm={restart} onCancel={(): void => setConfirmingRestart(false)} />
    </div>
  );
}
