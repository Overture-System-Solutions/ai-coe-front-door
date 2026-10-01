/**
 * The demonstration journey: draft, review, save and view, all inside this browser and all invented.
 *
 * Nothing here calls a service, a provider or a tenant. Every artifact is assembled from the sample data in
 * `demoData.ts` and every reviewer is fictional. That is the whole point: the three Marketing workflows can be
 * walked end to end, and the safeguards around them can be seen working, long before a real source register, a
 * named approver or a tenant binding exists.
 *
 * The sequencing is the playbook's own and is enforced rather than suggested: a content plan cannot begin until a
 * campaign brief has been accepted, because the playbook makes the accepted brief its input. The plan then records
 * which brief version it elaborated, so a later change to the brief is visible instead of silently overwriting it.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */

/** The three workflows, in the order the playbook numbers them. */
export type MarketingWorkflowId = 'campaignBrief' | 'contentPlan' | 'meetingFollowThrough';

export const MARKETING_WORKFLOW_IDS: readonly MarketingWorkflowId[] = ['campaignBrief', 'contentPlan', 'meetingFollowThrough'];

/**
 * Where one workflow stands. `drafting` is the only transient one; the rest are places a person can leave the
 * screen and come back to.
 */
export type DemoStage = 'start' | 'drafting' | 'draft' | 'review' | 'changesRequested' | 'saved';

export interface IDemoState {
  stage: DemoStage;
  /** How many times this artifact has been drafted; a revision after requested changes reads as version 2. */
  version: number;
  /** The fictional reviewer's note, when changes were asked for. */
  reviewNote?: string;
  /** Set once saved, so the status view has a reference to show. */
  reference?: string;
  /** Which brief version a content plan elaborated, recorded when the plan is saved. */
  elaboratedBriefVersion?: number;
}

export const START: IDemoState = { stage: 'start', version: 0 };

export type DemoEvent =
  | { type: 'draft' }
  | { type: 'draftReady' }
  | { type: 'submitForReview' }
  | { type: 'accept'; reference: string; briefVersion?: number }
  | { type: 'requestChanges'; note: string }
  | { type: 'reset' };

/**
 * The transitions. Anything not named here leaves the state as it was, so an event arriving twice - a second click
 * on a button, a late timer after the person moved on - cannot advance the journey past where it should be.
 */
export function reduce(state: IDemoState, event: DemoEvent): IDemoState {
  switch (event.type) {
    case 'draft':
      return state.stage === 'start' || state.stage === 'changesRequested'
        ? { ...state, stage: 'drafting', version: state.version + 1, reviewNote: undefined }
        : state;
    case 'draftReady':
      return state.stage === 'drafting' ? { ...state, stage: 'draft' } : state;
    case 'submitForReview':
      return state.stage === 'draft' ? { ...state, stage: 'review' } : state;
    case 'accept':
      return state.stage === 'review'
        ? { ...state, stage: 'saved', reference: event.reference, elaboratedBriefVersion: event.briefVersion }
        : state;
    case 'requestChanges':
      return state.stage === 'review' ? { ...state, stage: 'changesRequested', reviewNote: event.note } : state;
    case 'reset':
      return START;
    default:
      return state;
  }
}

/** Every workflow's state, keyed by id. */
export type DemoJourneys = { [id in MarketingWorkflowId]: IDemoState };

export const INITIAL_JOURNEYS: DemoJourneys = {
  campaignBrief: START,
  contentPlan: START,
  meetingFollowThrough: START
};

/**
 * Whether a workflow may be started at all. The content plan waits for an accepted brief, which is the playbook's
 * sequencing dependency; the other two stand alone. A locked workflow is shown with the reason rather than being
 * left out, so the dependency is something a person can see.
 */
export function lockReason(id: MarketingWorkflowId, journeys: DemoJourneys): string | undefined {
  if (id === 'contentPlan' && journeys.campaignBrief.stage !== 'saved') {
    return 'A content plan starts from an accepted campaign brief. Finish the campaign brief first.';
  }
  return undefined;
}

/** The plain wording for each stage, in the person's language rather than the machine's. */
export const STAGE_LABEL: { [stage in DemoStage]: string } = {
  start: 'Not started',
  drafting: 'Drafting',
  draft: 'Draft ready',
  review: 'Waiting for review',
  changesRequested: 'Changes requested',
  saved: 'Saved'
};

/** Which truth-state pill tone each stage carries, reusing the shipped five rather than inventing colours. */
export const STAGE_STATE: { [stage in DemoStage]: string } = {
  start: 'notSupported',
  drafting: 'needsApproval',
  draft: 'draftOnly',
  review: 'needsApproval',
  changesRequested: 'needsAccess',
  saved: 'availableNow'
};

/** A demonstration reference. Shaped like the real record key so the screen looks right, and marked as invented. */
export function demoReference(id: MarketingWorkflowId, version: number): string {
  const part: string = id === 'campaignBrief' ? 'BRIEF' : id === 'contentPlan' ? 'PLAN' : 'FOLLOWUP';
  return `DEMO-${part}-${String(version).padStart(3, '0')}`;
}
