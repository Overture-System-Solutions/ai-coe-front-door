import * as React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { renderWithFrontDoor, TEST_SITE_URL, TEST_USER } from '../../../../testing/renderWithFrontDoor';
import { createSyntheticCoreWorkService } from '../../services/core/coreWorkService';
import { MemoryStorageBackend } from '../../services/marketing/artifactStore';
import { AppCoreWorkspace } from './AppCoreWorkspace';

const session = { actorId: TEST_USER.email, tenantScope: TEST_SITE_URL };
const details = { Title: 'Weekly reporting', SourceChannel: 'FRONT_DOOR', Requester: TEST_USER.email, ProblemStatement: 'Too much copying', DesiredOutcome: 'A checked weekly report', Sponsor: 'Operations lead' };
const service = (): ReturnType<typeof createSyntheticCoreWorkService> => createSyntheticCoreWorkService(TEST_USER.email, { backend: new MemoryStorageBackend() });
beforeEach(() => { window.localStorage.clear(); });

describe('Cases UAT clarity', () => {
  it.each([false, true])('toggles the saved-case list without losing unsaved answers (empty: %s)', async empty => {
    const core = service();
    if (!empty) { await core.createOrResume(session, { s1: details }); }
    const list = jest.spyOn(core, 'listMine');
    const create = jest.spyOn(core, 'createOrResume');
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={core} />);
    await act(async (): Promise<void> => undefined);
    fireEvent.change(view.getByLabelText('Case title'), { target: { value: 'Keep my unfinished case' } });
    fireEvent.change(view.getByLabelText('Problem statement'), { target: { value: 'Keep my unfinished answer' } });
    const show = view.getByRole('button', { name: 'Show saved cases' });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    await act(async (): Promise<void> => { fireEvent.click(show); });
    const hide = await view.findByRole('button', { name: 'Hide saved cases' });
    await waitFor(() => expect(hide).toBeEnabled());
    const region = view.getByRole('region', { name: 'My saved cases' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    expect(hide).toHaveAttribute('aria-controls', region.id);
    expect(region).toHaveTextContent(empty ? 'No saved cases yet' : details.Title);
    fireEvent.click(hide);
    expect(view.queryByRole('region', { name: 'My saved cases' })).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Show saved cases' })); });
    await waitFor(() => expect(view.getByRole('button', { name: 'Hide saved cases' })).toBeEnabled());
    expect(view.getByRole('region', { name: 'My saved cases' })).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
    expect(create).not.toHaveBeenCalled();
    expect(view.getByLabelText('Case title')).toHaveValue('Keep my unfinished case');
    expect(view.getByLabelText('Problem statement')).toHaveValue('Keep my unfinished answer');
    expect(view.getByRole('button', { name: 'New case' })).toBeDisabled();
  });

  it('starts with an empty, labelled case form rather than pre-entered fictional business text', async () => {
    const core = service();
    const create = jest.spyOn(core, 'createOrResume');
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={core} />);
    expect(view.getByRole('heading', { name: 'Start a new case' })).toBeInTheDocument();
    expect(view.getByLabelText('Case title')).toHaveValue('');
    expect(view.getByLabelText('Problem statement').tagName).toBe('TEXTAREA');
    expect(view.getByLabelText('Desired outcome').tagName).toBe('TEXTAREA');
    expect(view.getByLabelText('Business sponsor')).toHaveValue('');
    expect(view.getByRole('button', { name: 'Create case' })).toBeDisabled();
    expect(view.queryByText(/real command keys, validators and polling/)).toBeNull();
    expect(view.getByText(/Practice mode/)).toBeInTheDocument();
    await act(async (): Promise<void> => { await Promise.resolve(); });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates only the entered case and reports readable confirmed feedback', async () => {
    const core = service(); const create = jest.spyOn(core, 'createOrResume');
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={core} />);
    fireEvent.change(view.getByLabelText('Case title'), { target: { value: details.Title } });
    fireEvent.change(view.getByLabelText('Problem statement'), { target: { value: details.ProblemStatement } });
    fireEvent.change(view.getByLabelText('Desired outcome'), { target: { value: details.DesiredOutcome } });
    fireEvent.change(view.getByLabelText('Business sponsor'), { target: { value: details.Sponsor } });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Create case' })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: 'Save case changes' })).not.toBeDisabled(); });
    expect(create).toHaveBeenCalledWith(session, expect.objectContaining({ s1: expect.objectContaining(details) }));
    expect(view.getByRole('status')).toHaveTextContent('Case saved');
    expect(view.getByRole('status')).not.toHaveTextContent('Command: completed');
    expect(view.getByRole('heading', { name: 'Requested information' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: 'Check required information' })).toBeInTheDocument();
  });

  it('can start a separate blank case without changing an existing one', async () => {
    const core = service(); const saved = await core.createOrResume(session, { s1: details });
    if (saved.kind !== 'ok' || saved.work === undefined) { throw new Error('Fixture failed'); }
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={core} />);
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Show saved cases' })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: (name: string): boolean => name.includes(saved.work!.workId) })).not.toBeDisabled(); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: (name: string): boolean => name.includes(saved.work!.workId) })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: 'New case' })).not.toBeDisabled(); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'New case' })); });
    expect(view.getByLabelText('Case title')).toHaveValue('');
    expect(view.getByLabelText('Business sponsor')).toHaveValue('');
    expect(view.getByRole('heading', { name: 'Start a new case' })).toBeInTheDocument();
    expect((await core.listMine(session)).kind).toBe('ok');
  });

  it('reports unsaved case edits to the shell and protects them from a fresh selection', async () => {
    const core = service(); const dirty = jest.fn();
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={core} onDirtyChange={dirty} />);
    fireEvent.change(view.getByLabelText('Case title'), { target: { value: 'My unsaved case' } });
    await waitFor((): void => { expect(dirty).toHaveBeenLastCalledWith(true); });
    expect(view.getByRole('button', { name: 'New case' })).toBeDisabled();
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Discard changes' })); });
    expect(dirty).toHaveBeenLastCalledWith(false);
    expect(view.getByLabelText('Case title')).toHaveValue('');
  });

  it('names information requests plainly and keeps certainty choices explained', async () => {
    const core = service(); const saved = await core.createOrResume(session, { s1: details });
    if (saved.kind !== 'ok' || saved.work === undefined) { throw new Error('Fixture failed'); }
    const packets = await core.listPackets(session, saved.work.workId);
    const target = packets.packets.filter(packet => packet.packetType === 'S4_TECHNICAL')[0];
    const view = renderWithFrontDoor(<AppCoreWorkspace coreWork={core} />);
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: 'Show saved cases' })); });
    await waitFor((): void => { expect(view.getByRole('button', { name: (name: string): boolean => name.includes(saved.work!.workId) })).not.toBeDisabled(); });
    await act(async (): Promise<void> => { fireEvent.click(view.getByRole('button', { name: (name: string): boolean => name.includes(saved.work!.workId) })); });
    await waitFor((): void => { expect(view.getByLabelText('Information to provide')).toBeInTheDocument(); });
    expect(view.getByRole('option', { name: /Technical details/ })).not.toHaveTextContent('EVP-');
    fireEvent.change(view.getByLabelText('Information to provide'), { target: { value: target.packetId } });
    expect(view.getByLabelText('Your response')).toHaveAttribute('rows', '6');
    expect(view.getByRole('option', { name: /Assumption/ })).toHaveValue('ASSUMED');
    expect(view.getByText(/Saving your response is not approval/)).toBeInTheDocument();
  });
});
