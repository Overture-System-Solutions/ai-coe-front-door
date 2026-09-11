import { createRecordId } from '../services/recordId';
import { createPolicyGapRecord } from '../services/toolPolicyEvaluator';
import type { IPolicyEvaluation, IPolicyGapRecord, IReviewContact } from '../services/toolPolicyEvaluator';
import { reduceBaseAction, RESUME_NOTICE, resumeStepId } from './formEngine';
import type { BaseSessionAction, ISessionBase, IStoredDraftBase } from './formEngine';
import type { IAnswers, IWorkflowDefinition } from './types';

export type ToolCheckPhase = 'form' | 'evaluating' | 'result' | 'reviewContact' | 'reviewSubmitting' | 'reviewResult';

export interface IToolCheckSession extends ISessionBase<ToolCheckPhase, 'result'> {
  decision: IPolicyEvaluation | undefined;
  contact: IReviewContact;
  contactError: string | undefined;
}

/** Shape persisted to localStorage; `decision` is null until the answers have been evaluated. */
export interface IToolCheckDraft extends IStoredDraftBase {
  // eslint-disable-next-line @rushstack/no-new-null
  decision?: IPolicyEvaluation | null;
}

export const EMPTY_CONTACT: IReviewContact = { name: '', team: '', email: '' };

export function createToolCheckSession(definition: IWorkflowDefinition, draft: IToolCheckDraft | undefined): IToolCheckSession {
  const answers: IAnswers = draft?.answers ?? {};
  const decision: IPolicyEvaluation | undefined = draft?.decision ?? undefined;
  return {
    answers,
    currentStepId: resumeStepId(definition, answers, draft?.currentStepId),
    phase: draft?.phase === 'result' && decision !== undefined ? 'result' : 'form',
    editReturnTarget: undefined,
    errors: {},
    notice: draft ? RESUME_NOTICE : undefined,
    decision,
    contact: EMPTY_CONTACT,
    contactError: undefined
  };
}

export function toStoredToolCheckDraft(session: IToolCheckSession): IToolCheckDraft {
  return {
    answers: session.answers,
    currentStepId: session.currentStepId,
    phase: session.phase === 'result' ? 'result' : 'form',
    decision: session.decision ?? null
  };
}

export type ToolCheckSessionAction =
  | BaseSessionAction<ToolCheckPhase, 'result'>
  | { type: 'SET_DECISION'; decision: IPolicyEvaluation }
  | { type: 'SET_CONTACT_FIELD'; key: keyof IReviewContact; value: string }
  | { type: 'SET_CONTACT_ERROR'; message: string }
  | { type: 'RESET'; session: IToolCheckSession };

export function toolCheckReducer(state: IToolCheckSession, action: ToolCheckSessionAction): IToolCheckSession {
  switch (action.type) {
    case 'SET_DECISION':
      return { ...state, decision: action.decision, phase: 'result' };
    case 'SET_CONTACT_FIELD':
      return { ...state, contact: { ...state.contact, [action.key]: action.value }, contactError: undefined };
    case 'SET_CONTACT_ERROR':
      return { ...state, contactError: action.message };
    case 'RESET':
      return action.session;
    default:
      return reduceBaseAction<ToolCheckPhase, 'result', IToolCheckSession>(state, action) ?? state;
  }
}

export const CONTACT_REQUIRED_MESSAGE: string = 'Please add your name and team so the AI CoE team knows who to follow up with.';

/** The CoE review request as submitted to SharePoint; `policyGapRecord` is null on the wire unless guidance had a gap. */
export interface IReviewRequestPayload {
  requestId: string;
  createdAt: string;
  workflowId: string;
  workflowVersion: string | undefined;
  originalAnswers: IAnswers;
  outcome: string;
  reasons: string[];
  contributingAnswers: string[];
  // eslint-disable-next-line @rushstack/no-new-null
  policyGapRecord: IPolicyGapRecord | null;
  requestedBy: IReviewContact;
  status: 'confirmed';
}

export function buildReviewRequestPayload(
  definition: IWorkflowDefinition,
  answers: IAnswers,
  decision: IPolicyEvaluation,
  contact: IReviewContact,
  now: Date = new Date()
): IReviewRequestPayload {
  return {
    requestId: createRecordId('review-request'),
    createdAt: now.toISOString(),
    workflowId: definition.id,
    workflowVersion: definition.workflowVersion,
    originalAnswers: answers,
    outcome: decision.label,
    reasons: decision.reasons,
    contributingAnswers: decision.contributingStepIds,
    policyGapRecord: decision.outcomeKey === 'gap' ? createPolicyGapRecord(definition, answers, decision, now) : null,
    requestedBy: contact,
    status: 'confirmed'
  };
}
