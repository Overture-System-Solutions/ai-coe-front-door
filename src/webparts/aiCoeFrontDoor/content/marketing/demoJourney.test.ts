/**
 * The demonstration journey. The rules worth holding are the sequencing dependency, the fact that a repeated event
 * cannot advance the journey twice, and that an accepted brief's version is carried onto the plan that elaborated
 * it rather than overwriting the brief.
 */
import {
  INITIAL_JOURNEYS,
  MARKETING_WORKFLOW_IDS,
  STAGE_LABEL,
  STAGE_STATE,
  START,
  demoReference,
  lockReason,
  reduce
} from './demoJourney';
import type { DemoJourneys, DemoStage, IDemoState, MarketingWorkflowId } from './demoJourney';
import { DEMO_NOTICE, DEMO_SHORT, DEMO_WORKFLOWS } from './demoData';

/** Walks one workflow from the start to saved, as a person clicking through would. */
function walkToSaved(id: MarketingWorkflowId, briefVersion?: number): IDemoState {
  let state: IDemoState = reduce(START, { type: 'draft' });
  state = reduce(state, { type: 'draftReady' });
  state = reduce(state, { type: 'submitForReview' });
  return reduce(state, { type: 'accept', reference: demoReference(id, state.version), briefVersion });
}

describe('demonstration journey', () => {
  it('walks draft, review and save in order', () => {
    const stages: DemoStage[] = [];
    let state: IDemoState = START;
    stages.push(state.stage);
    state = reduce(state, { type: 'draft' });
    stages.push(state.stage);
    state = reduce(state, { type: 'draftReady' });
    stages.push(state.stage);
    state = reduce(state, { type: 'submitForReview' });
    stages.push(state.stage);
    state = reduce(state, { type: 'accept', reference: 'DEMO-BRIEF-001' });
    stages.push(state.stage);
    expect(stages).toEqual(['start', 'drafting', 'draft', 'review', 'saved']);
    expect(state.reference).toBe('DEMO-BRIEF-001');
    expect(state.version).toBe(1);
  });

  it('ignores an event that does not belong to the stage, so a second click cannot skip ahead', () => {
    // Accepting before a review exists, or drafting twice, must leave the journey where it was.
    expect(reduce(START, { type: 'accept', reference: 'X' })).toEqual(START);
    expect(reduce(START, { type: 'submitForReview' })).toEqual(START);
    const drafting: IDemoState = reduce(START, { type: 'draft' });
    expect(reduce(drafting, { type: 'draft' })).toEqual(drafting);
    // A late timer arriving after the person moved on cannot push a reviewed draft back.
    const review: IDemoState = reduce(reduce(drafting, { type: 'draftReady' }), { type: 'submitForReview' });
    expect(reduce(review, { type: 'draftReady' })).toEqual(review);
  });

  it('counts a revision after requested changes as the next version, and clears the note', () => {
    let state: IDemoState = reduce(reduce(reduce(START, { type: 'draft' }), { type: 'draftReady' }), { type: 'submitForReview' });
    state = reduce(state, { type: 'requestChanges', note: 'Hold that claim.' });
    expect({ stage: state.stage, note: state.reviewNote, version: state.version }).toEqual({
      stage: 'changesRequested',
      note: 'Hold that claim.',
      version: 1
    });
    state = reduce(state, { type: 'draft' });
    expect({ stage: state.stage, note: state.reviewNote, version: state.version }).toEqual({
      stage: 'drafting',
      note: undefined,
      version: 2
    });
  });

  it('locks the content plan until a campaign brief is accepted, and says why', () => {
    const fresh: DemoJourneys = INITIAL_JOURNEYS;
    const reason: string | undefined = lockReason('contentPlan', fresh);
    expect(typeof reason).toBe('string');
    expect(reason).toContain('accepted campaign brief');
    // The other two stand alone.
    expect(lockReason('campaignBrief', fresh)).toBeUndefined();
    expect(lockReason('meetingFollowThrough', fresh)).toBeUndefined();
    // Once the brief is saved the plan opens.
    const afterBrief: DemoJourneys = { ...fresh, campaignBrief: walkToSaved('campaignBrief') };
    expect(lockReason('contentPlan', afterBrief)).toBeUndefined();
  });

  it('records which brief version a plan elaborated, rather than changing the brief', () => {
    const brief: IDemoState = walkToSaved('campaignBrief');
    const plan: IDemoState = walkToSaved('contentPlan', brief.version);
    expect(plan.elaboratedBriefVersion).toBe(brief.version);
    // The brief is untouched by the plan: it is still the version it was saved at.
    expect(brief.version).toBe(1);
  });

  it('gives every stage a plain label and a shipped truth state, inventing no new tone', () => {
    const shipped: string[] = ['availableNow', 'draftOnly', 'needsApproval', 'needsAccess', 'notSupported'];
    const stages: DemoStage[] = ['start', 'drafting', 'draft', 'review', 'changesRequested', 'saved'];
    for (const stage of stages) {
      expect({ stage, label: STAGE_LABEL[stage].length > 0 }).toEqual({ stage, label: true });
      expect({ stage, known: shipped.indexOf(STAGE_STATE[stage]) >= 0 }).toEqual({ stage, known: true });
    }
  });

  it('shapes a demonstration reference that cannot be mistaken for a real record key', () => {
    expect(demoReference('campaignBrief', 1)).toBe('DEMO-BRIEF-001');
    expect(demoReference('contentPlan', 2)).toBe('DEMO-PLAN-002');
    expect(demoReference('meetingFollowThrough', 12)).toBe('DEMO-FOLLOWUP-012');
    for (const id of MARKETING_WORKFLOW_IDS) {
      expect(demoReference(id, 1).indexOf('DEMO-')).toBe(0);
    }
  });

  it('says on every screen that nothing live happens', () => {
    expect(DEMO_SHORT.toLowerCase()).toContain('no live actions');
    expect(DEMO_NOTICE.toLowerCase()).toContain('invented');
    expect(DEMO_NOTICE.toLowerCase()).toContain('nothing is sent');
  });

  it('states each workflow contract in the playbook terms, for all three', () => {
    for (const id of MARKETING_WORKFLOW_IDS) {
      const copy = DEMO_WORKFLOWS[id];
      for (const field of [copy.title, copy.summary, copy.input, copy.humanDecision, copy.pass, copy.startLabel]) {
        expect({ id, filled: typeof field === 'string' && field.length > 0 }).toEqual({ id, filled: true });
      }
    }
  });
});
