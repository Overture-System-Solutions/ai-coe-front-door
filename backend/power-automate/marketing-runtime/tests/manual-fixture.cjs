'use strict';
// Explicit offline content fixtures only. No model invocation or real approval is represented here.
const { load, assert, ref } = require('./helpers.cjs');
const workId = 'CW-OFFLINE_TEST';
const source = f => ({ sourceId: f.entry.id, versionOrETag: f.entry.versionOrETag });
const claim = f => ({ text: 'Participants agreed to review the draft.', sources: [source(f)] });
const unknown = text => ({ text, sources: [], unknown: 'AWAITING_VALIDATION' });
const requirement = (id, kind, scopes) => ({ requirementId: id, reviewKind: kind, scopeRefs: scopes, requiredRole: 'Review owner', authorityBindingRef: null, blockingReason: 'Human review required.' });
const brief = f => ({ workId, kind: 'campaignBrief', sourceIds: [f.entry.id], payload: { objective: 'Hand-authored offline example', audience: ['Marketing team'], painPoints: ['Unconfirmed ownership'], message: [claim(f)], channelPlan: ['Internal review only'], contentCalendar: [], evidenceGaps: ['Offline invented fixture'], reviewNeeds: ['Strategy and voice review'] } });
const plan = (f, b, acceptanceReceiptId) => ({ workId, kind: 'contentPlan', sourceIds: [f.entry.id], payload: {
  acceptedBrief: { ...ref(b.envelope), acceptanceReceiptId },
  primaryDestination: { destinationId: 'primary', label: 'Undecided destination', href: null, sourceRefs: [], unknown: 'AWAITING_SOURCE' },
  primaryCta: { ctaId: 'primary', label: 'Review the draft', destinationId: 'primary' },
  assetRegister: [{ assetId: 'ASSET-ONE', name: 'Review note', format: 'briefingNote', purpose: 'Internal review', audience: ['Marketing team'], channel: 'Intranet', channelOwnerBindingRef: null, destinationId: 'primary', ctaId: 'primary', sourceRefs: [source(f)], accessibilityRequirements: ['Plain language'], reviewRequirementIds: ['REQ-COPY'] }],
  copyVariants: [{ variantId: 'VARIANT-ONE', assetId: 'ASSET-ONE', channel: 'Intranet', audience: ['Marketing team'], headline: claim(f), body: [claim(f)], ctaId: 'primary', accessibility: { altText: null, linkLabel: 'Read review note', reviewState: 'pending' } }],
  contentCalendar: [], proposedOwners: [], dependencies: [], approvalRequirements: [requirement('REQ-COPY', 'copyChannel', ['ASSET-ONE'])], evidenceGaps: ['Offline fixture; destination not approved'], reviewNeeds: ['Copy and channel review']
} });
const follow = (f, b, p) => ({ workId, kind: 'meetingFollowThrough', sourceIds: [f.entry.id], payload: {
  campaignPacket: { brief: ref(b.envelope), contentPlan: p ? ref(p.envelope) : null },
  meetingSources: [{ source: source(f), locator: f.entry.location }],
  decisions: [], actionProposals: [], briefChanges: [],
  communicationsDrafts: [{ communicationDraftId: 'COMM-ONE', channel: 'emailDraft', proposedAudience: ['Marketing team'], subject: claim(f), body: [claim(f)], proposedCta: unknown('Review the proposal'), proposedDestination: unknown('Not selected'), sourceRefs: [source(f)], requiredSenderApproval: 'Communications owner', reviewRequirementIds: ['REQ-MEETING', 'REQ-SEND'], sent: false }],
  unresolvedQuestions: [], risks: [], nextGate: { description: unknown('Await human review'), requiredReviewIds: ['REQ-MEETING', 'REQ-SEND'] },
  approvalRequirements: [requirement('REQ-MEETING', 'meetingDecisionsActions', ['COMM-ONE']), requirement('REQ-SEND', 'communicationsSend', ['COMM-ONE'])], evidenceGaps: ['Offline fixture'], reviewNeeds: ['Meeting and communication review']
} });
async function accept(f, artifact, kind) {
  const requested = await f.run('RequestReviewV1', { target: ref(artifact.envelope), reviewKind: kind });
  assert.equal(requested.kind, 'recorded', JSON.stringify(requested));
  const current = await f.run('GetArtifactV1', { artifactId: artifact.envelope.artifactId }, 8);
  const r = await f.run('RecordReviewDecisionV1', { target: ref(artifact.envelope), reviewKind: kind, outcome: 'accept', comments: 'Offline test acceptance only', expectedStoreVersion: current.storeVersion, idempotencyKey: require('node:crypto').randomUUID() }, 8);
  assert.equal(r.kind, 'recorded', JSON.stringify(r)); return r;
}
module.exports = { workId, brief, plan, follow, accept };
