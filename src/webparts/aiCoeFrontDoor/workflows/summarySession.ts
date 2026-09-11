/**
 * Session state of the two workflows that end in an editable summary (idea and team usage).
 * `TDraft` is the summary draft shape: one string per summary field.
 */
import { reduceBaseAction, RESUME_NOTICE, resumeStepId } from './formEngine';
import type { BaseSessionAction, ISessionBase, IStoredDraftBase } from './formEngine';
import type { IAnswers, IWorkflowDefinition } from './types';

export type SummaryPhase = 'form' | 'summary' | 'submitting' | 'result';

export interface ISummarySession<TDraft> extends ISessionBase<SummaryPhase, 'summary'> {
  summaryDraft: TDraft | undefined;
  /** JSON of the answers the draft was built from; a mismatch shows the "answers changed" hint. */
  summarySourceSnapshot: string | undefined;
}

/** Shape persisted to localStorage; the nulls are part of the stored contract of package 1.0.0.7. */
export interface ISummaryWorkflowDraft<TDraft> extends IStoredDraftBase {
  // eslint-disable-next-line @rushstack/no-new-null
  summaryDraft?: TDraft | null;
  // eslint-disable-next-line @rushstack/no-new-null
  summarySourceSnapshot?: string | null;
}

export function createSummarySession<TDraft>(definition: IWorkflowDefinition, draft: ISummaryWorkflowDraft<TDraft> | undefined): ISummarySession<TDraft> {
  const answers: IAnswers = draft?.answers ?? {};
  const summaryDraft: TDraft | undefined = draft?.summaryDraft ?? undefined;
  return {
    answers,
    currentStepId: resumeStepId(definition, answers, draft?.currentStepId),
    phase: draft?.phase === 'summary' && summaryDraft !== undefined ? 'summary' : 'form',
    editReturnTarget: undefined,
    errors: {},
    notice: draft ? RESUME_NOTICE : undefined,
    summaryDraft,
    summarySourceSnapshot: draft?.summarySourceSnapshot ?? undefined
  };
}

export function toStoredSummaryDraft<TDraft>(session: ISummarySession<TDraft>): ISummaryWorkflowDraft<TDraft> {
  return {
    answers: session.answers,
    currentStepId: session.currentStepId,
    phase: session.phase === 'summary' ? 'summary' : 'form',
    summaryDraft: session.summaryDraft ?? null,
    summarySourceSnapshot: session.summarySourceSnapshot ?? null
  };
}

export type SummarySessionAction<TDraft> =
  | BaseSessionAction<SummaryPhase, 'summary'>
  | { type: 'SET_SUMMARY_DRAFT'; draft: TDraft }
  | { type: 'UPDATE_SUMMARY_FIELD'; key: keyof TDraft & string; value: string }
  | { type: 'RESET'; session: ISummarySession<TDraft> };

export function summaryReducer<TDraft extends { [key: string]: string }>(
  state: ISummarySession<TDraft>,
  action: SummarySessionAction<TDraft>
): ISummarySession<TDraft> {
  switch (action.type) {
    case 'SET_SUMMARY_DRAFT':
      return { ...state, summaryDraft: action.draft, summarySourceSnapshot: JSON.stringify(state.answers), phase: 'summary' };
    case 'UPDATE_SUMMARY_FIELD':
      if (state.summaryDraft === undefined) {
        return state;
      }
      return { ...state, summaryDraft: { ...state.summaryDraft, [action.key]: action.value } };
    case 'RESET':
      return action.session;
    default:
      return reduceBaseAction<SummaryPhase, 'summary', ISummarySession<TDraft>>(state, action) ?? state;
  }
}
