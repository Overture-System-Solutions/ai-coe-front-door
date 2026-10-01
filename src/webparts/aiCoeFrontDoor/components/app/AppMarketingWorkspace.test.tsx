import * as React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { renderWithFrontDoor, TEST_SITE_URL, TEST_USER } from '../../../../testing/renderWithFrontDoor';
import { createSyntheticMarketingServices, createDisabledLiveMarketingServices } from '../../services/marketing/marketingServices';
import { MemoryStorageBackend } from '../../services/marketing/artifactStore';
import { FIXTURE_REGISTER } from '../../content/marketing/sourceRegister';
import type { IRoleResolution } from '../../services/roleResolver';
import { AppMarketingWorkspace, SYNTHETIC_WORK_ID } from './AppMarketingWorkspace';

const participant: IRoleResolution = { roles: ['employee', 'marketingParticipant'], resolution: 'resolved' };
const reviewer: IRoleResolution = { roles: ['employee', 'marketingReviewer'], resolution: 'resolved' };
const session = { actorId: TEST_USER.email, tenantScope: TEST_SITE_URL, resolution: participant };

async function fixture() {
  const marketing = createSyntheticMarketingServices(new MemoryStorageBackend());
  const draft = await marketing.draft.draftCampaignBrief(session, { workId: SYNTHETIC_WORK_ID, objective: 'Original objective (synthetic)', audienceContext: ['Fixture audience'], sourceIds: FIXTURE_REGISTER.entries.map(entry => entry.id) });
  if (draft.kind !== 'saved') { throw new Error(draft.reasons.join(' ')); }
  return { marketing, draft };
}

describe('AppMarketingWorkspace review boundaries', () => {
  it('keeps one synthetic warning banner without repeating the service label as plain text', async () => {
    const marketing = createSyntheticMarketingServices(new MemoryStorageBackend());
    const view = renderWithFrontDoor(<AppMarketingWorkspace marketing={marketing} resolution={participant} />);
    await act(async (): Promise<void> => undefined);
    expect(view.queryByText(marketing.label, { exact: true })).toBeNull();
    expect(view.getByRole('note')).toHaveTextContent('Synthetic workspace');
    expect(view.getByRole('note')).toHaveTextContent('Nothing here is business content or a live AI response');
    expect(view.container.querySelectorAll('.ai-app-demo-banner')).toHaveLength(1);
    expect(view.getByLabelText('Approved objective (synthetic)')).toBeInTheDocument();
  });

  it('creates a meaningful objective correction as a new revision after changes are requested', async () => {
    const { marketing, draft } = await fixture();
    const target = { kind: draft.envelope.kind, artifactId: draft.envelope.artifactId, revision: draft.envelope.revision, payloadHash: draft.envelope.payloadHash };
    await marketing.review.requestReview(session, target, 'strategyVoice');
    const authority = await marketing.review.assumeSyntheticReviewer({ ...session, resolution: reviewer }, 'synthetic:marketing-owner');
    if ('kind' in authority) { throw new Error('Fixture authority unavailable'); }
    const changed = await marketing.review.recordReviewDecision(authority, { target, reviewKind: 'strategyVoice', outcome: 'requestChanges', comments: 'Correct the objective', expectedStoreVersion: draft.storeVersion, idempotencyKey: 'fixture-correction' });
    expect(changed.kind).toBe('recorded');
    const view = renderWithFrontDoor(<AppMarketingWorkspace marketing={marketing} resolution={participant} />);
    fireEvent.click(await view.findByRole('button', { name: new RegExp(draft.envelope.artifactId) }));
    await act(async (): Promise<void> => undefined);
    const edit = view.getByLabelText('Corrected objective');
    expect(view.getByRole('button', { name: 'Draft corrected objective as a new revision' })).toBeDisabled();
    fireEvent.change(edit, { target: { value: 'Clarified objective supplied by the author' } });
    fireEvent.click(view.getByRole('button', { name: 'Draft corrected objective as a new revision' }));
    await waitFor((): void => { expect(view.getByRole('status')).toHaveTextContent('Saved revision 2'); });
    const current = await marketing.review.getArtifact(draft.envelope.artifactId);
    expect(current?.envelope.payload).toMatchObject({ objective: 'Clarified objective supplied by the author' });
    expect(current?.state).toBe('draft');
    expect((await marketing.review.getArtifact(draft.envelope.artifactId, 1))?.envelope.payload).toMatchObject({ objective: 'Original objective (synthetic)' });
  });

  it('does not offer participant-to-reviewer switching or a decision without the service capability', async () => {
    const { marketing, draft } = await fixture();
    const view = renderWithFrontDoor(<AppMarketingWorkspace marketing={marketing} resolution={participant} />);
    await act(async (): Promise<void> => undefined);
    fireEvent.click(await view.findByRole('button', { name: new RegExp(draft.envelope.artifactId) }));
    await act(async (): Promise<void> => undefined);
    expect(view.queryByLabelText(/Act as a fictional reviewer/)).toBeNull();
    expect(view.queryByRole('button', { name: 'Accept' })).toBeNull();
  });
});
