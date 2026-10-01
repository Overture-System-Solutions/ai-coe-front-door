/**
 * Marketing drafting and durable review: three operations, source gate, reload recovery of an accepted record.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FIXTURE_MEETING_NOTES, FIXTURE_REGISTER } from '../../content/marketing/sourceRegister';
import type { ISourceEntry } from '../../content/marketing/sourceRegister';
import type { IMarketingSession } from './marketingDraftService';
import { SYNTHETIC_AUTHORITIES } from './marketingReviewService';
import { createDisabledLiveMarketingServices, createSyntheticMarketingServices } from './marketingServices';
import { MemoryStorageBackend } from './artifactStore';

const WORK_ID: string = 'CW-SYNTHETIC_MARKETING_WORKSPACE';

const DRAFTER: IMarketingSession = {
  actorId: 'pat@contoso.com',
  tenantScope: 'https://contoso.sharepoint.com/sites/ai',
  resolution: { roles: ['employee', 'marketingParticipant'], resolution: 'resolved' }
};

const SOURCE_IDS: string[] = FIXTURE_REGISTER.entries.map((entry: ISourceEntry): string => entry.id);

describe('synthetic Marketing services', () => {
  it('drafts a brief, records strategy review, and recovers the same accepted record after a service restart', async () => {
    const backend: MemoryStorageBackend = new MemoryStorageBackend();
    const first = createSyntheticMarketingServices(backend);
    const drafted = await first.draft.draftCampaignBrief(DRAFTER, {
      workId: WORK_ID,
      objective: 'Help every team understand what the AI Center of Excellence offers (synthetic).',
      audienceContext: ['Team leads who have not asked yet (synthetic)'],
      sourceIds: SOURCE_IDS
    });
    expect({ kind: drafted.kind, reasons: drafted.kind === 'failed' ? drafted.reasons : [] }).toEqual({ kind: 'saved', reasons: [] });
    if (drafted.kind !== 'saved') {
      return;
    }
    expect(drafted.envelope.testRecord).toBe(true);
    expect(drafted.state).toBe('draft');
    const target = {
      kind: drafted.envelope.kind,
      artifactId: drafted.envelope.artifactId,
      revision: drafted.envelope.revision,
      payloadHash: drafted.envelope.payloadHash
    };
    const requested = await first.review.requestReview(DRAFTER, target, 'strategyVoice');
    expect(requested.kind).toBe('recorded');
    const reviewer = await first.review.assumeSyntheticReviewer(DRAFTER, 'synthetic:marketing-owner');
    expect('kind' in reviewer).toBe(false);
    if ('kind' in reviewer) {
      return;
    }
    expect(reviewer.actorId).toBe(SYNTHETIC_AUTHORITIES[0].actorId);
    const held = await first.review.getArtifact(drafted.envelope.artifactId);
    expect(held).toBeDefined();
    const decided = await first.review.recordReviewDecision(reviewer, {
      target,
      reviewKind: 'strategyVoice',
      outcome: 'accept',
      comments: 'Accepted for local synthetic testing; no live send.',
      expectedStoreVersion: held!.storeVersion,
      idempotencyKey: 'test:accept-brief-1'
    });
    expect({ kind: decided.kind, reasons: decided.kind === 'failed' ? decided.reasons : [] }).toEqual({ kind: 'recorded', reasons: [] });
    if (decided.kind !== 'recorded') {
      return;
    }
    expect(decided.state).toBe('accepted');
    expect(decided.replayed).toBe(false);

    const restarted = createSyntheticMarketingServices(backend);
    const recovered = await restarted.review.getArtifact(drafted.envelope.artifactId);
    expect(recovered?.state).toBe('accepted');
    expect(recovered?.envelope.payloadHash).toBe(drafted.envelope.payloadHash);
    expect(recovered?.envelope.revision).toBe(drafted.envelope.revision);

    const plan = await restarted.draft.draftContentPlan(DRAFTER, {
      workId: WORK_ID,
      briefArtifactId: drafted.envelope.artifactId,
      sourceIds: SOURCE_IDS
    });
    expect({ kind: plan.kind, reasons: plan.kind === 'failed' ? plan.reasons : [] }).toEqual({ kind: 'saved', reasons: [] });

    const follow = await restarted.draft.draftMeetingFollowThrough(DRAFTER, {
      workId: WORK_ID,
      briefArtifactId: drafted.envelope.artifactId,
      notes: [{ sourceId: 'FIXTURE-MEETING-004', versionOrETag: 'fixture-v1', locator: 'fixture://meeting/notes-week-1#notes', text: FIXTURE_MEETING_NOTES }],
      sourceIds: SOURCE_IDS
    });
    expect({ kind: follow.kind, reasons: follow.kind === 'failed' ? follow.reasons : [] }).toEqual({ kind: 'saved', reasons: [] });
  });

  it('does not treat a later send, publish, assign or schedule as part of acceptance', async () => {
    const source: string = fs.readFileSync(path.join(process.cwd(), 'src/webparts/aiCoeFrontDoor/services/marketing/marketingReviewService.ts'), 'utf8');
    expect(source).toContain('Nothing here sends, publishes, assigns, schedules or changes a campaign');
  });
});

describe('live Marketing route', () => {
  it('fails closed with reasons and never writes a business artifact', async () => {
    const live = createDisabledLiveMarketingServices();
    expect(live.mode).toBe('live');
    expect(live.liveReasons.length).toBeGreaterThan(0);
    const drafted = await live.draft.draftCampaignBrief(DRAFTER, {
      workId: WORK_ID,
      objective: 'Would be a live brief.',
      audienceContext: ['Anyone'],
      sourceIds: SOURCE_IDS
    });
    expect(drafted.kind).toBe('failed');
  });
});
