import { reduceBaseAction, RESUME_NOTICE, resumeStepId } from './formEngine';
import type { BaseSessionAction, ISessionBase, IStoredDraftBase } from './formEngine';
import type { IAnswers, IWorkflowDefinition } from './types';

export type FeedbackPhase = 'form' | 'review' | 'submitting' | 'result';

export interface IFeedbackSession extends ISessionBase<FeedbackPhase, 'review'> {
  /** Suggested themes; the shipped build never produced any, but drafts and records carry the list. */
  themes: string[];
}

export interface IFeedbackDraft extends IStoredDraftBase {
  themes?: string[];
}

export function createFeedbackSession(definition: IWorkflowDefinition, draft: IFeedbackDraft | undefined): IFeedbackSession {
  const answers: IAnswers = draft?.answers ?? {};
  return {
    answers,
    currentStepId: resumeStepId(definition, answers, draft?.currentStepId),
    phase: draft?.phase === 'review' ? 'review' : 'form',
    editReturnTarget: undefined,
    errors: {},
    notice: draft ? RESUME_NOTICE : undefined,
    themes: draft?.themes ?? []
  };
}

export function toStoredFeedbackDraft(session: IFeedbackSession): IFeedbackDraft {
  return {
    answers: session.answers,
    currentStepId: session.currentStepId,
    phase: session.phase === 'review' ? 'review' : 'form',
    themes: session.themes
  };
}

export type FeedbackSessionAction =
  | BaseSessionAction<FeedbackPhase, 'review'>
  | { type: 'SET_THEMES'; themes: string[] }
  | { type: 'RESET'; session: IFeedbackSession };

export function feedbackReducer(state: IFeedbackSession, action: FeedbackSessionAction): IFeedbackSession {
  switch (action.type) {
    case 'SET_THEMES':
      return { ...state, themes: action.themes, phase: 'review' };
    case 'RESET':
      return action.session;
    default:
      return reduceBaseAction<FeedbackPhase, 'review', IFeedbackSession>(state, action) ?? state;
  }
}
