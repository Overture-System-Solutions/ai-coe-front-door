import * as React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { renderWithFrontDoor, TEST_SITE_URL, TEST_USER } from '../../../../testing/renderWithFrontDoor';
import { createSyntheticCoreWorkService } from '../../services/core/coreWorkService';
import type { CoreCallResult, ICoreWorkService } from '../../services/core/coreWorkService';
import { MemoryStorageBackend } from '../../services/marketing/artifactStore';
import { AppCoreWorkspace } from './AppCoreWorkspace';

const session = { actorId: TEST_USER.email, tenantScope: TEST_SITE_URL };
const s1 = { Title: 'A saved case', SourceChannel: 'FRONT_DOOR', Requester: TEST_USER.email, ProblemStatement: null, DesiredOutcome: null, Sponsor: null };
async function seeded(): Promise<{ service: ICoreWorkService; workId: string }> {
  const service = createSyntheticCoreWorkService(TEST_USER.email, { backend: new MemoryStorageBackend() });
  const result = await service.createOrResume(session, { s1 });
  if (result.kind !== 'ok' || result.work === undefined) { throw new Error('Fixture create failed'); }
  return { service, workId: result.work.workId };
}

beforeEach(() => { window.localStorage.clear(); });

describe('AppCoreWorkspace case journey', () => {
  it('saves only edited clarification fields instead of clearing unseen S1 values', async () => {
    const { service, workId } = await seeded();
    await service.createOrResume(session, { workId, s1: { ...s1, ProblemStatement: 'Preserve the confirmed problem', DesiredOutcome: 'Preserve the confirmed outcome', Sponsor: 'Original sponsor', DataClassification: 'CONFIDENTIAL' } });
    Object.defineProperty(service, 'mode', { value: 'live' });
    const save = jest.spyOn(service, 'createOrResume');
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />);
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Show saved cases' })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: new RegExp(workId) })).not.toBeDisabled(); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: new RegExp(workId) })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: 'Save case changes' })).not.toBeDisabled(); });
    fireEvent.change(view.getByLabelText('Business sponsor'), { target: { value: 'Updated sponsor' } });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Save case changes' })); });
    const input = save.mock.calls[0][1];
    expect(input.s1).not.toHaveProperty('ProblemStatement');
    expect(input.s1).not.toHaveProperty('DesiredOutcome');
    expect(input.s1).not.toHaveProperty('Requester');
    expect(input.s1).not.toHaveProperty('DataClassification');
    expect(input).toHaveProperty('changedFields', ['Sponsor']);
  });
  it('renders unvalidated native work without a fabricated date or synthetic write notice', async () => {
    const { service, workId } = await seeded();
    const listed = await service.listMine(session);
    if (listed.kind !== 'ok' || !listed.observation.response || !('Items' in listed.observation.response)) { throw new Error('Fixture list failed'); }
    Object.defineProperty(service, 'mode', { value: 'live' });
    Object.defineProperty(service, 'label', { value: 'Native CORE fixture transport (no network)' });
    jest.spyOn(service, 'listMine').mockResolvedValue({ ...listed, observation: { ...listed.observation, response: { ...listed.observation.response, Items: listed.observation.response.Items.map(item => ({ ...item, LastValidatedAt: null })) } } });
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />);
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Show saved cases' })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: new RegExp(workId) })).not.toBeDisabled(); });
    expect(view.queryByText(/Synthetic Binding A workspace/)).toBeNull();
    expect(view.getByLabelText('Business sponsor')).toHaveValue('');
  });

  it.each([
    { roles: ['employee'], rolesState: 'resolved' as const },
    { roles: ['operator'], rolesState: 'resolved' as const, isAdmin: true },
    { roles: ['marketingReviewer'], rolesState: 'resolved' as const },
    { roles: ['designAuthority'], rolesState: 'pending' as const },
    { roles: ['designAuthority'], rolesState: 'unresolved' as const }
  ])('does not call human validation for an unauthorized or unresolved reviewer context %j', async (context) => {
    const { service, workId } = await seeded();
    await service.createOrResume(session, { workId, s1: { ...s1, ProblemStatement: 'Confirmed problem', DesiredOutcome: 'Confirmed outcome', Sponsor: 'Sponsor role' } });
    const target = (await service.listPackets(session, workId)).packets[0];
    service.validateEvidence = jest.fn();
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />, context);
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Show saved cases' })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: new RegExp(workId) })).not.toBeDisabled(); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: new RegExp(workId) })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: 'Save case changes' })).not.toBeDisabled(); });
    fireEvent.change(view.getByLabelText('Information to provide'), { target: { value: target.packetId } });
    expect(view.queryByRole('button', { name: 'Record human validation' })).toBeNull();
    expect(view.queryByLabelText('Human validation assertion')).toBeNull();
    expect(view.getByText(/Saving your response is not approval/)).toBeInTheDocument();
    expect(service.validateEvidence).not.toHaveBeenCalled();
  });

  it('explains unavailable synthetic human validation instead of inventing authority', async () => {
    const { service, workId } = await seeded();
    await service.createOrResume(session, { workId, s1: { ...s1, ProblemStatement: 'Confirmed problem', DesiredOutcome: 'Confirmed outcome', Sponsor: 'Sponsor role' } });
    const target = (await service.listPackets(session, workId)).packets[0];
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />, { roles: ['designAuthority'] });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Show saved cases' })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: new RegExp(workId) })).not.toBeDisabled(); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: new RegExp(workId) })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: 'Save case changes' })).not.toBeDisabled(); });
    fireEvent.change(view.getByLabelText('Information to provide'), { target: { value: target.packetId } });
    expect(view.queryByRole('button', { name: 'Record human validation' })).toBeNull();
    expect(view.getByText(/Human validation is unavailable in this service/)).toBeInTheDocument();
  });

  it('keeps recovery failure fail-closed and makes no follow-up call after unmount', async () => {
    const { service } = await seeded();
    let finish!: (result: CoreCallResult | undefined) => void;
    service.recoverPending = jest.fn().mockResolvedValueOnce({ kind: 'disabled', reasons: ['Result cannot be confirmed.'] }).mockImplementationOnce(() => new Promise<CoreCallResult | undefined>(resolve => { finish = resolve; }));
    const list = jest.spyOn(service, 'listMine');
    const create = jest.spyOn(service, 'createOrResume');
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />);
    await waitFor((): void => { expect(view.getByRole('button', { name: 'Recover pending result' })).not.toBeDisabled(); });
    expect(view.getByRole('button', { name: 'Create case' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Show saved cases' })).toBeDisabled();
    fireEvent.click(view.getByRole('button', { name: 'Create case' }));
    fireEvent.click(view.getByRole('button', { name: 'Recover pending result' }));
    view.unmount();
    await act(async (): Promise<void> => { finish(undefined); });
    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('offers explicit human validation only to resolved design authority and refreshes the original packet after saving', async () => {
    const { service, workId } = await seeded();
    await service.createOrResume(session, { workId, s1: { ...s1, ProblemStatement: 'Confirmed problem', DesiredOutcome: 'Confirmed outcome', Sponsor: 'Sponsor role' } });
    const target = (await service.listPackets(session, workId)).packets[0];
    const saved = await service.getStatus(session, workId);
    service.validateEvidence = jest.fn().mockResolvedValue(saved);
    const packetReads = jest.spyOn(service, 'listPackets');
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />, { roles: ['employee', 'designAuthority'] });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Show saved cases' })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: new RegExp(workId) })).not.toBeDisabled(); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: new RegExp(workId) })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: 'Save case changes' })).not.toBeDisabled(); });
    fireEvent.change(view.getByLabelText('Information to provide'), { target: { value: target.packetId } });
    const save = view.getByRole('button', { name: 'Record human validation' });
    expect(save).toBeDisabled();
    fireEvent.change(view.getByLabelText('Validation disposition'), { target: { value: 'VALIDATED' } });
    fireEvent.change(view.getByLabelText('Human validation assertion'), { target: { value: 'I checked the supporting receipt and confirmed this response.' } });
    expect(save).toBeDisabled();
    fireEvent.change(view.getByLabelText('Supporting source references (one per line)'), { target: { value: ' SRC-ORIGINAL-001\nSRC-ORIGINAL-002 ' } });
    packetReads.mockClear();
    await act(async (): Promise<void> => { fireEvent.click(save); });
    await waitFor((): void => { expect(view.getByRole('status')).toHaveTextContent('Human review saved'); });
    expect(save).toBeDisabled();
    expect(service.validateEvidence).toHaveBeenCalledWith(session, { workId, evidencePacketId: target.packetId, disposition: 'VALIDATED', assertion: 'I checked the supporting receipt and confirmed this response.', sourceRefs: ['SRC-ORIGINAL-001', 'SRC-ORIGINAL-002'] });
    expect(packetReads).toHaveBeenCalledWith(session, workId);
    expect(view.getByText(/server authorizes each validation/i)).toBeInTheDocument();
    expect(view.getByLabelText('Human validation assertion')).toHaveValue('');
    expect(view.getByLabelText('Supporting source references (one per line)')).toHaveValue('');
  });

  it('recovers the original pending command before fresh reads and never resubmits an unknown mutation', async () => {
    const { service, workId } = await seeded();
    const saved = await service.getStatus(session, workId);
    if (saved.kind !== 'ok') { throw new Error('Fixture status failed'); }
    const pending: CoreCallResult = { kind: 'failed', observation: { ...saved.observation, phase: 'queued', observation: 'queued', response: undefined, reason: 'Original command is pending.' } };
    let finish!: (result: CoreCallResult | undefined) => void;
    // eslint-disable-next-line require-atomic-updates -- isolated fixture, seeded before any UI operation is started
    service.recoverPending = jest.fn().mockImplementationOnce(() => new Promise<CoreCallResult | undefined>(resolve => { finish = resolve; })).mockResolvedValue(saved);
    const list = jest.spyOn(service, 'listMine');
    const create = jest.spyOn(service, 'createOrResume');
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />);
    await waitFor((): void => { expect(service.recoverPending).toHaveBeenCalledWith(session); });
    expect(list).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Create case' })).toBeDisabled();
    await act(async (): Promise<void> => { finish(pending); });
    expect(view.getByRole('button', { name: 'Show saved cases' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Create case' })).toBeDisabled();
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Recover pending result' })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: 'Save case changes' })).not.toBeDisabled(); });
    expect(view.getByRole('region', { name: 'Selected case status' })).toHaveTextContent(workId);
    expect(create).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledTimes(1);
    expect(service.recoverPending).toHaveBeenCalledTimes(2);
  });

  it('lets the person select a packet, read its questions and submit their own classified answer', async () => {
    const { service, workId } = await seeded();
    await service.createOrResume(session, { workId, s1: { ...s1, ProblemStatement: 'A complete problem', DesiredOutcome: 'A measured outcome', Sponsor: 'Operations sponsor' } });
    const packets = (await service.listPackets(session, workId)).packets;
    expect(packets.length).toBeGreaterThan(1);
    const target = packets[packets.length - 1];
    const submit = jest.spyOn(service, 'submitEvidence');
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />);
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Show saved cases' })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: new RegExp(workId) })).not.toBeDisabled(); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: new RegExp(workId) })); });
    await waitFor((): void => { expect(view.getByLabelText('Information to provide')).toBeInTheDocument(); });
    expect(view.getByRole('button', { name: 'Save response' })).toBeDisabled();
    fireEvent.change(view.getByLabelText('Information to provide'), { target: { value: target.packetId } });
    for (const question of target.questions) { expect(view.getByText(question)).toBeInTheDocument(); }
    fireEvent.change(view.getByLabelText('Your response'), { target: { value: 'Reviewed answer for this selected packet' } });
    fireEvent.change(view.getByLabelText('Certainty'), { target: { value: 'ASSUMED' } });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Save response' })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: 'Refresh status' })).not.toBeDisabled(); });
    expect(submit).toHaveBeenCalledWith(session, { workId, evidencePacketId: target.packetId, response: 'Reviewed answer for this selected packet', knownAssumedUnknown: 'ASSUMED' });
    expect((await service.listPackets(session, workId)).packets.filter(packet => packet.packetId === target.packetId)[0].response).toBe('Reviewed answer for this selected packet');
  });

  it('restores only a scoped opaque selection by reading the service after remount', async () => {
    const { service, workId } = await seeded();
    const first = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />);
    await act(async (): Promise<void> => { fireEvent.click(first.getByRole('button', { name: 'Show saved cases' })); });
    await waitFor((): void => { expect(first.getByRole('button', { name: new RegExp(workId) })).not.toBeDisabled(); });
    await act(async (): Promise<void> => { fireEvent.click(first.getByRole('button', { name: new RegExp(workId) })); });
    await waitFor((): void => { expect(first.getByRole('button', { name: 'Save case changes' })).not.toBeDisabled(); });
    const storage = Object.keys(window.localStorage).map(key => [key, window.localStorage.getItem(key)]);
    expect(storage).toHaveLength(1);
    expect(storage[0][1]).toBe(workId);
    expect(JSON.stringify(storage)).not.toMatch(/A saved case|pat@contoso|sharepoint/);
    first.unmount();
    const read = jest.spyOn(service, 'getStatus');
    const next = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />);
    await waitFor((): void => { expect(next.getByRole('button', { name: 'Save case changes' })).not.toBeDisabled(); });
    expect(read).toHaveBeenCalledWith(session, workId);
    next.unmount();
    read.mockClear();
    const other = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />, { user: { email: 'other@contoso.com', displayName: 'Other' } });
    await act(async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 15)); });
    expect(read).not.toHaveBeenCalled();
    expect(other.queryByText(workId)).toBeNull();
  });

  it('saves entered clarification against the selected WorkID rather than creating a second case', async () => {
    const { service, workId } = await seeded();
    const resume = jest.spyOn(service, 'createOrResume');
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />);
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Show saved cases' })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: new RegExp(workId) })).not.toBeDisabled(); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: new RegExp(workId) })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: 'Save case changes' })).not.toBeDisabled(); });
    fireEvent.change(view.getByLabelText('Problem statement'), { target: { value: 'Confirmed problem' } });
    fireEvent.change(view.getByLabelText('Desired outcome'), { target: { value: 'Confirmed outcome' } });
    fireEvent.change(view.getByLabelText('Business sponsor'), { target: { value: 'Operations sponsor' } });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Save case changes' })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: 'Save case changes' })).not.toBeDisabled(); });
    expect(resume).toHaveBeenLastCalledWith(session, { workId, changedFields: ['ProblemStatement', 'DesiredOutcome', 'Sponsor'], s1: expect.objectContaining({ Title: 'A saved case', ProblemStatement: 'Confirmed problem', DesiredOutcome: 'Confirmed outcome', Sponsor: 'Operations sponsor' }) });
    const listed = await service.listMine(session);
    if (listed.kind !== 'ok' || listed.observation.response === undefined || !('Items' in listed.observation.response)) { throw new Error('Fixture list failed'); }
    expect(listed.observation.response.Items.map(item => item.WorkID)).toEqual([workId]);
  });

  it('renders public ListMyWork Items as selectable cases and reads status on selection', async () => {
    const { service, workId } = await seeded();
    const getStatus = jest.spyOn(service, 'getStatus');
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={service} />);
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Show saved cases' })); });
    await waitFor((): void => { expect(view.container.querySelector('[data-core-phase]')).toHaveAttribute('data-core-phase', 'completed'); });
    const item = view.getByRole('button', { name: new RegExp(workId) });
    expect(item).toHaveTextContent('A saved case');
    await act(async (): Promise<void> => { fireEvent.click(item); });
    expect(getStatus).toHaveBeenCalledWith(session, workId);
    await waitFor((): void => { expect(view.getByRole('button', { name: 'Save case changes' })).not.toBeDisabled(); });
  });
});
