import * as React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { renderWithFrontDoor, TEST_SITE_URL, TEST_USER } from '../../../../testing/renderWithFrontDoor';
import { InMemoryDraftStore } from '../../../../testing/fakeServices';
import { AppMarketing } from './AppMarketing';
import { INITIAL_JOURNEYS } from '../../content/marketing/demoJourney';
import type { IMarketingServices } from '../../services/marketing/marketingServices';
import type { IRoleResolution } from '../../services/roleResolver';
import { MANUAL_SERVER_FIELDS, manualRequestErrors } from '../../content/marketing/manualDraft';
import { createBusinessMarketingServices } from '../../services/marketing/businessServices';
import { payloadHash } from '../../content/actionEnvelope';

const participant: IRoleResolution = { roles: ['employee', 'marketingParticipant'], resolution: 'resolved' };
const reviewer: IRoleResolution = { roles: ['employee', 'marketingReviewer'], resolution: 'resolved' };
const workId = 'CW-BUSINESS_42';
const source = { id: 'MEETING-042', location: 'https://contoso.sharepoint.com/notes/42', versionOrETag: 'v7', owner: 'Business owner', asOf: '2026-09-23', classification: 'Internal', audience: 'Marketing', mayNotProve: 'Availability' };
function bundle() {
  const failure = { kind: 'failed', failure: 'providerUnavailable', reasons: ['Provider offline'] };
  return {
    mode: 'live', label: 'Business server records', liveReasons: [],
    listWork: jest.fn().mockResolvedValue([workId, 'CW-BUSINESS_43']),
    recoverPending: jest.fn().mockResolvedValue({ kind: 'none', message: 'No pending intent' }),
    saveManualDraft: jest.fn().mockResolvedValue(failure),
    registry: { mode: 'business', readRegister: jest.fn().mockResolvedValue({ available: true, readback: { register: { registerId: 'APPROVED-REGISTRY', version: '7', approval: 'approved', asOf: '2026-09-23', entries: [source] }, revoked: [], snapshotRef: 'server:register-7' } }) },
    draft: { draftCampaignBrief: jest.fn().mockResolvedValue(failure), draftContentPlan: jest.fn().mockResolvedValue(failure), draftMeetingFollowThrough: jest.fn().mockResolvedValue(failure) },
    review: { listArtifacts: jest.fn().mockResolvedValue([]), authorities: jest.fn().mockResolvedValue([]), decisionsFor: jest.fn().mockResolvedValue([]), requestsFor: jest.fn().mockResolvedValue([]), requestReview: jest.fn().mockResolvedValue(failure), recordReviewDecision: jest.fn().mockResolvedValue(failure), assumeSyntheticReviewer: jest.fn(), reconcileAttempt: jest.fn() }
  };
}
function show(marketing = bundle(), resolution = participant, draftStore = new InMemoryDraftStore()) {
  const view = renderWithFrontDoor(<AppMarketing resolution={resolution} demo={INITIAL_JOURNEYS} onDemoChange={jest.fn()} />, { marketing: marketing as unknown as IMarketingServices, draftStore });
  return { ...view, marketing, draftStore };
}

const briefPayload = { schemaVersion: '1.0', briefId: 'BRIEF-042', workId, registerId: 'APPROVED-REGISTRY', registerVersion: '7', objective: 'Reviewed business objective', audience: ['Team leads'], painPoints: ['Duplicated preparation'], message: [{ text: 'Draft message needing review', sources: [], unknown: 'UNKNOWN' }], channelPlan: ['Internal review'], contentCalendar: [], evidenceGaps: [], reviewNeeds: ['Strategy review'], createdAt: '2026-09-23T12:00:00Z' };
function record(state = 'accepted') {
  return { state, storeVersion: 'server-etag-42', envelope: { envelopeVersion: '1.0', tenantScope: TEST_SITE_URL, workId, artifactId: 'BRIEF-042', kind: 'campaignBrief', schemaVersion: '1.0', revision: 3, supersedes: null, parents: [], payload: briefPayload, payloadHash: 'a'.repeat(64), registerSnapshot: { registerId: 'APPROVED-REGISTRY', version: '7', snapshotHash: 'b'.repeat(64), snapshotRef: 'server:register-7' }, sourcesUsed: [], workflowVersion: 'v1', policyVersion: 'v1', providerProvenance: { mode: 'qualified', provider: 'Approved provider', model: 'approved-model', requestId: 'REQ-042', responseId: 'RESP-042', qualificationReceiptRef: 'QUAL-042' }, evidenceGaps: [], knowledge: { known: [], assumed: [], unknown: [] }, createdBy: TEST_USER.email, createdAt: '2026-09-23T12:00:00Z', testRecord: false, receiptRefs: [] } };
}
async function choose(view: ReturnType<typeof show>) {
  await waitFor(() => expect(view.getByRole('option', { name: workId })).toBeInTheDocument());
  fireEvent.change(view.getByLabelText('Marketing case'), { target: { value: workId } });
  await waitFor(() => expect(view.marketing.review.listArtifacts).toHaveBeenCalledWith(workId));
  await view.findByText('Current business records read from the server.');
}

it('runs all three drafts with selected business sources and source-only meeting evidence', async () => {
  const marketing = bundle();
  const saved = record();
  marketing.draft.draftCampaignBrief.mockImplementation(async () => { marketing.review.listArtifacts.mockResolvedValue([saved]); return { ...saved, kind: 'saved', copyFindings: [], sourceGaps: [], limitation: 'Human review required' }; });
  const view = show(marketing);
  await choose(view);
  fireEvent.change(await view.findByLabelText('Approved objective'), { target: { value: 'Business objective' } });
  fireEvent.change(view.getByLabelText('Audience context'), { target: { value: 'Real audience' } });
  fireEvent.click(view.getByLabelText(`Use source ${source.id}`));
  fireEvent.click(view.getByRole('button', { name: 'Draft a campaign brief' }));
  await waitFor(() => expect(marketing.draft.draftCampaignBrief).toHaveBeenCalledWith(expect.objectContaining({ actorId: TEST_USER.email }), { workId, objective: 'Business objective', audienceContext: ['Real audience'], sourceIds: [source.id] }));
  await waitFor(() => expect(view.getByRole('button', { name: 'Draft a content plan' })).toBeEnabled());
  fireEvent.click(view.getByRole('button', { name: 'Draft a content plan' }));
  await waitFor(() => expect(marketing.draft.draftContentPlan).toHaveBeenCalledWith(expect.anything(), { workId, briefArtifactId: 'BRIEF-042', sourceIds: [source.id] }));
  fireEvent.change(view.getByLabelText('Registered meeting source'), { target: { value: source.id } });
  await waitFor(() => expect(view.getByRole('button', { name: 'Draft follow-through' })).toBeEnabled());
  fireEvent.click(view.getByRole('button', { name: 'Draft follow-through' }));
  await waitFor(() => expect(marketing.draft.draftMeetingFollowThrough).toHaveBeenCalledWith(expect.anything(), { workId, briefArtifactId: 'BRIEF-042', sourceIds: [source.id], notes: [{ sourceId: source.id, versionOrETag: source.versionOrETag, locator: source.location, text: '' }] }));
  expect(JSON.stringify(marketing.draft.draftCampaignBrief.mock.calls)).not.toMatch(/synthetic|fixture/i);
  expect(view.queryByLabelText(/meeting notes/i)).toBeNull();
});

it.each([{ roles: ['employee'], resolution: 'resolved' }, { roles: ['marketingParticipant'], resolution: 'unresolved' }])('unauthorized users make zero business or working-draft calls: %j', async resolution => {
  const marketing = bundle(); const store = new InMemoryDraftStore();
  const load = jest.spyOn(store, 'load');
  show(marketing, resolution as IRoleResolution, store);
  await act(async () => undefined);
  expect(marketing.listWork).not.toHaveBeenCalled();
  expect(marketing.registry.readRegister).not.toHaveBeenCalled();
  expect(marketing.review.authorities).not.toHaveBeenCalled();
  expect(marketing.recoverPending).not.toHaveBeenCalled();
  expect(load).not.toHaveBeenCalled();
});

it('uses only the current authenticated reviewer and a matching backend authority', async () => {
  const marketing = bundle(); const held = record('reviewRequested'); held.envelope.createdBy = 'author@contoso.com';
  marketing.review.listArtifacts.mockResolvedValue([held]);
  marketing.review.authorities.mockResolvedValue([{ bindingRef: 'AUTH-042', actorId: TEST_USER.email, tenantScope: TEST_SITE_URL, label: 'Current strategy authority', scope: ['strategyVoice'], expiresAt: '2099-01-01T00:00:00Z', synthetic: false }]);
  marketing.review.recordReviewDecision.mockResolvedValue({ kind: 'recorded', state: 'accepted', decision: { reviewId: 'REVIEW-042', outcome: 'accept' }, receipt: { receiptId: 'RECEIPT-042' }, replayed: false });
  const view = show(marketing, reviewer); await choose(view);
  fireEvent.click(view.getByRole('button', { name: /Campaign brief — BRIEF-042/ }));
  fireEvent.change(await view.findByLabelText('Review comment'), { target: { value: 'Reviewed against the approved source' } });
  fireEvent.click(view.getByRole('button', { name: 'Accept' }));
  await waitFor(() => expect(marketing.review.recordReviewDecision).toHaveBeenCalledWith({ actorId: TEST_USER.email, tenantScope: TEST_SITE_URL, resolution: reviewer, synthetic: false, authorityBindingRef: 'AUTH-042' }, expect.objectContaining({ target: { kind: 'campaignBrief', artifactId: 'BRIEF-042', revision: 3, payloadHash: held.envelope.payloadHash }, expectedStoreVersion: 'server-etag-42', outcome: 'accept' })));
  expect(marketing.review.assumeSyntheticReviewer).not.toHaveBeenCalled();
  expect(view.queryByRole('button', { name: 'Draft a campaign brief' })).toBeNull();
});

it('keeps uncertain review requests pending across remount and repairs only on explicit action', async () => {
  const marketing = bundle(); marketing.review.listArtifacts.mockResolvedValue([record('draft')]);
  marketing.review.requestReview.mockImplementation(async () => {
    marketing.recoverPending.mockResolvedValue({ kind: 'pending', message: 'Review request outcome pending', intentKey: 'opaque-042' });
    return { kind: 'failed', failure: 'uncertain', reasons: ['Request unconfirmed'], intentKey: 'opaque-042' };
  });
  let view = show(marketing); await choose(view);
  expect(marketing.recoverPending).toHaveBeenCalledWith(false);
  fireEvent.click(view.getByRole('button', { name: /Campaign brief — BRIEF-042/ }));
  fireEvent.click(await view.findByRole('button', { name: 'Request review' }));
  await waitFor(() => expect(marketing.review.requestReview).toHaveBeenCalledTimes(1));
  await view.findByRole('button', { name: 'Repair pending Marketing operation' });
  view.unmount(); view = show(marketing); await choose(view);
  expect(marketing.recoverPending).not.toHaveBeenCalledWith(true);
  expect(view.getByRole('button', { name: 'Draft a campaign brief' })).toBeDisabled();
  marketing.recoverPending.mockResolvedValue({ kind: 'recovered', message: 'Original review request confirmed' });
  fireEvent.click(view.getByRole('button', { name: 'Repair pending Marketing operation' }));
  await waitFor(() => expect(marketing.recoverPending).toHaveBeenCalledWith(true));
  expect(marketing.review.reconcileAttempt).not.toHaveBeenCalled();
  expect(marketing.review.recordReviewDecision).not.toHaveBeenCalled();
  expect(marketing.review.requestReview).toHaveBeenCalledTimes(1);
});

it('saves and loads unsubmitted objective audience and manual JSON only through the server draft seam', async () => {
  const store = new InMemoryDraftStore(); const save = jest.spyOn(store, 'save'); const load = jest.spyOn(store, 'load');
  const browserWrite = jest.spyOn(Storage.prototype, 'setItem');
  let view = show(bundle(), participant, store); await choose(view);
  fireEvent.change(view.getByLabelText('Approved objective'), { target: { value: 'Unsubmitted private objective' } });
  fireEvent.change(view.getByLabelText('Audience context'), { target: { value: 'Private audience' } });
  fireEvent.change(view.getByLabelText('Manual artifact JSON'), { target: { value: JSON.stringify(briefPayload) } });
  fireEvent.click(view.getByRole('button', { name: 'Save working draft' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.stringMatching(/^marketing-[a-f0-9]+$/), expect.objectContaining({ workId, objective: 'Unsubmitted private objective', audience: 'Private audience', manualJson: JSON.stringify(briefPayload) })));
  expect(save.mock.calls[0][0].length).toBeLessThan(64);
  await view.findByText('Working draft saved and read back from the server.');
  view.unmount(); view = show(bundle(), participant, store); await choose(view);
  expect(view.getByLabelText('Approved objective')).toHaveValue('Unsubmitted private objective');
  expect(view.getByLabelText('Audience context')).toHaveValue('Private audience');
  expect(view.getByLabelText('Manual artifact JSON')).toHaveValue(JSON.stringify(briefPayload));
  expect(load).toHaveBeenCalledWith(save.mock.calls[0][0]);
  expect(JSON.stringify(browserWrite.mock.calls)).not.toMatch(/Unsubmitted private objective|Private audience|Reviewed business objective/);
  browserWrite.mockRestore();
});

it('edits a manual revision with its exact store version and rejects invalid JSON before calling the facade', async () => {
  const marketing = bundle(); marketing.review.listArtifacts.mockResolvedValue([record('changesRequested')]);
  const view = show(marketing); await choose(view);
  fireEvent.click(view.getByRole('button', { name: /Campaign brief — BRIEF-042/ }));
  fireEvent.click(await view.findByRole('button', { name: 'Edit this artifact manually' }));
  fireEvent.click(view.getByLabelText(`Use source ${source.id}`));
  fireEvent.change(view.getByLabelText('Manual artifact JSON'), { target: { value: '{}' } });
  fireEvent.click(view.getByRole('button', { name: 'Save manual artifact' }));
  await view.findByText(/Manual payload invalid/);
  expect(marketing.saveManualDraft).not.toHaveBeenCalled();
  fireEvent.change(view.getByLabelText('Manual artifact JSON'), { target: { value: JSON.stringify({ ...briefPayload, objective: 'Human correction' }) } });
  fireEvent.click(view.getByRole('button', { name: 'Save manual artifact' }));
  const content: { [key: string]: unknown } = { ...briefPayload, objective: 'Human correction' };
  MANUAL_SERVER_FIELDS.forEach(field => { delete content[field]; });
  await waitFor(() => expect(marketing.saveManualDraft).toHaveBeenCalledWith(expect.objectContaining({ actorId: TEST_USER.email }), { workId, kind: 'campaignBrief', payload: content, sourceIds: [source.id], artifactId: 'BRIEF-042', expectedStoreVersion: 'server-etag-42' }));
  expect(marketing.draft.draftCampaignBrief).not.toHaveBeenCalled();
});

it('does not discard unsaved author text through the case or workspace-mode switchers', async () => {
  const view = show(); await choose(view);
  fireEvent.change(view.getByLabelText('Approved objective'), { target: { value: 'Unsaved case-specific objective' } });
  expect(view.getByLabelText('Marketing case')).toBeDisabled();
  expect(view.getByRole('button', { name: 'Labelled demonstration', exact: true })).toBeDisabled();
  fireEvent.change(view.getByLabelText('Marketing case'), { target: { value: 'CW-BUSINESS_43' } });
  expect(view.getByLabelText('Marketing case')).toHaveValue(workId);
  fireEvent.click(view.getByRole('button', { name: 'Save working draft', exact: true }));
  await view.findByText('Working draft saved and read back from the server.');
  expect(view.getByLabelText('Marketing case')).toBeEnabled();
  expect(view.getByRole('button', { name: 'Labelled demonstration', exact: true })).toBeEnabled();
});

it('lets a reviewer explicitly discard an unsent comment without mutating a saved record', async () => {
  const marketing = bundle(); const held = record('reviewRequested'); held.envelope.createdBy = 'author@contoso.com';
  marketing.review.listArtifacts.mockResolvedValue([held]);
  marketing.review.authorities.mockResolvedValue([{ bindingRef: 'AUTH-042', actorId: TEST_USER.email, tenantScope: TEST_SITE_URL, label: 'Current strategy authority', scope: ['strategyVoice'], expiresAt: '2099-01-01T00:00:00Z', synthetic: false }]);
  const view = show(marketing, reviewer); await choose(view);
  fireEvent.click(view.getByRole('button', { name: /Campaign brief — BRIEF-042/ }));
  fireEvent.change(await view.findByLabelText('Review comment'), { target: { value: 'Unsent review text' } });
  expect(view.getByLabelText('Marketing case')).toBeDisabled();
  fireEvent.click(view.getByRole('button', { name: 'Discard unsaved text', exact: true }));
  expect(view.getByLabelText('Review comment')).toHaveValue('');
  expect(view.getByLabelText('Marketing case')).toBeEnabled();
  expect(marketing.review.recordReviewDecision).not.toHaveBeenCalled();
});

it('submits manual UI corrections through the real business facade using the server content-only contract', async () => {
  const marketing = bundle(); marketing.review.listArtifacts.mockResolvedValue([record('changesRequested')]);
  const references = new Map<string, string>();
  const corrected = { ...briefPayload, objective: 'Human correction through the actual facade' };
  const saved = record('draft'); saved.envelope.payload = corrected;
  saved.envelope.payloadHash = (await payloadHash(corrected))!;
  Object.assign(saved.envelope.providerProvenance, { mode: 'manual', provider: 'human', model: 'none', qualificationReceiptRef: null });
  let projection: unknown;
  const posted: { [key: string]: unknown }[] = [];
  const facade = createBusinessMarketingServices({
    binding: { enabled: true, siteUrl: TEST_SITE_URL, requestListId: '11111111-1111-4111-8111-111111111111', resultListId: '22222222-2222-4222-8222-222222222222', qualificationReceiptRef: 'QUAL-SYNTHETIC-UI' },
    session: { actorId: TEST_USER.email, tenantScope: TEST_SITE_URL, resolution: participant },
    references: { getItem: key => references.get(key) ?? null, setItem: (key, value) => { references.set(key, value); }, removeItem: key => { references.delete(key); } },
    newId: () => '33333333-3333-4333-8333-333333333333', pollAttempts: 1,
    http: { request: async (method, _url, body) => {
      if (method === 'POST' && body) {
        const request = JSON.parse(String(body.PayloadJson));
        posted.push(request);
        expect(body.Operation).toBe('SaveManualMarketingDraftV1');
        expect(manualRequestErrors(request)).toEqual([]);
        const value = { ...saved, kind: 'saved', copyFindings: [], sourceGaps: [], limitation: 'Synthetic transport response for a manual record; no model called.' };
        projection = { RequestId: body.Title, ResultJson: JSON.stringify({ protocol: 'marketing.v1', requestId: body.Title, operation: body.Operation, tenantScope: TEST_SITE_URL, actorId: TEST_USER.email, value, valueHash: await payloadHash(value) }) };
        marketing.review.listArtifacts.mockResolvedValue([saved]);
        return { status: 201, body: { Id: 1 } };
      }
      return { status: 200, body: { value: projection ? [projection] : [] } };
    } }
  });
  marketing.saveManualDraft.mockImplementation((session, request) => facade.saveManualDraft!(session, request));
  const view = show(marketing); await choose(view);
  fireEvent.click(view.getByRole('button', { name: /Campaign brief — BRIEF-042/ }));
  fireEvent.click(await view.findByRole('button', { name: 'Edit this artifact manually' }));
  fireEvent.click(view.getByLabelText(`Use source ${source.id}`));
  fireEvent.change(view.getByLabelText('Manual artifact JSON'), { target: { value: JSON.stringify(corrected) } });
  fireEvent.click(view.getByRole('button', { name: 'Save manual artifact' }));
  await view.findByText(/Saved human-authored artifact BRIEF-042/);
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ artifactId: 'BRIEF-042', expectedStoreVersion: 'server-etag-42', workId });
  expect(references.size).toBe(0);
});

it('offers the provider manual fallback as editable JSON without relabelling it AI output', async () => {
  const marketing = bundle(); marketing.draft.draftCampaignBrief.mockResolvedValue({ kind: 'failed', failure: 'providerUnavailable', reasons: ['Provider offline'], manualFallback: briefPayload });
  const view = show(marketing); await choose(view);
  fireEvent.change(view.getByLabelText('Approved objective'), { target: { value: 'Draft objective' } });
  fireEvent.click(view.getByLabelText(`Use source ${source.id}`));
  fireEvent.click(view.getByRole('button', { name: 'Draft a campaign brief' }));
  await waitFor(() => expect(JSON.parse((view.getByLabelText('Manual artifact JSON') as HTMLTextAreaElement).value)).toEqual(briefPayload));
  expect(view.getByText(/Manual artifacts are human-authored/)).toBeInTheDocument();
});

it('blocks overlapping draft clicks and performs no follow-up after unmount', async () => {
  const marketing = bundle(); let finish!: (value: unknown) => void;
  marketing.draft.draftCampaignBrief.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = show(marketing); await choose(view);
  fireEvent.change(view.getByLabelText('Approved objective'), { target: { value: 'One bounded draft' } });
  fireEvent.click(view.getByLabelText(`Use source ${source.id}`));
  const button = view.getByRole('button', { name: 'Draft a campaign brief' });
  act(() => { fireEvent.click(button); fireEvent.click(button); });
  expect(marketing.draft.draftCampaignBrief).toHaveBeenCalledTimes(1);
  expect(view.getByLabelText('Marketing case')).toBeDisabled();
  const reads = marketing.review.listArtifacts.mock.calls.length;
  view.unmount();
  await act(async () => { finish({ ...record(), kind: 'saved', copyFindings: [], sourceGaps: [], limitation: 'Review needed' }); });
  expect(marketing.review.listArtifacts).toHaveBeenCalledTimes(reads);
});

it('fails closed when business work listing is not bound', async () => {
  const marketing = bundle(); delete (marketing as Partial<typeof marketing>).listWork;
  const view = show(marketing);
  await view.findByText(/Business case listing is not bound/);
  expect(marketing.review.listArtifacts).not.toHaveBeenCalled();
  expect(marketing.registry.readRegister).not.toHaveBeenCalled();
});

it.each([
  { synthetic: true }, { actorId: 'other@contoso.com' }, { tenantScope: 'https://another.example' },
  { expiresAt: '2000-01-01T00:00:00Z' }, { revoked: true }, { scope: ['copyChannel'] }
])('does not expose decisions for nonmatching authority %j', async change => {
  const marketing = bundle(); const held = record('reviewRequested'); held.envelope.createdBy = 'author@contoso.com';
  marketing.review.listArtifacts.mockResolvedValue([held]);
  marketing.review.authorities.mockResolvedValue([{ bindingRef: 'AUTH-042', actorId: TEST_USER.email, tenantScope: TEST_SITE_URL, label: 'Authority', scope: ['strategyVoice'], expiresAt: '2099-01-01T00:00:00Z', synthetic: false, ...change }]);
  const view = show(marketing, reviewer); await choose(view);
  fireEvent.click(view.getByRole('button', { name: /Campaign brief — BRIEF-042/ }));
  await act(async () => undefined);
  expect(view.queryByRole('button', { name: 'Accept' })).toBeNull();
  expect(marketing.review.recordReviewDecision).not.toHaveBeenCalled();
});

it('live mode selects only server-authorized Work IDs and never mounts the synthetic workspace', async () => {
  const view = show();
  const select = await view.findByLabelText('Marketing case');
  await waitFor(() => expect(view.marketing.listWork).toHaveBeenCalledTimes(1));
  fireEvent.change(select, { target: { value: workId } });
  await waitFor(() => expect(view.marketing.review.listArtifacts).toHaveBeenCalledWith(workId));
  expect(view.queryByText(/CW-SYNTHETIC_MARKETING_WORKSPACE/)).toBeNull();
  expect(view.queryByLabelText(/fictional reviewer/i)).toBeNull();
  expect(view.marketing.review.assumeSyntheticReviewer).not.toHaveBeenCalled();
  expect(view.getByRole('button', { name: 'Business workspace' })).toBeInTheDocument();
});
