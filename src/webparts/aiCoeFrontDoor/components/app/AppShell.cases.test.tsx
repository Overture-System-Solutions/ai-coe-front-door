import * as React from 'react';
import { act, fireEvent } from '@testing-library/react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import type { ICoreWorkService } from '../../services/core/coreWorkService';
import * as coreWorkspace from './AppCoreWorkspace';
import { AppShell } from './AppShell';

// Exercise the real AppShell -> AppCases boundary independently of the parallel Cases redesign.
// The workspace seam reports dirty/save state; no business service is invoked by this stand-in.
beforeEach(() => {
  jest.spyOn(coreWorkspace, 'AppCoreWorkspace').mockImplementation((props: { onDirtyChange?: (dirty: boolean) => void }) => (
    <div>
      <button type="button" onClick={() => props.onDirtyChange?.(true)}>Edit case fixture</button>
      <button type="button" onClick={() => props.onDirtyChange?.(false)}>Confirm case save fixture</button>
    </div>
  ));
});
afterEach(() => jest.restoreAllMocks());

async function cases(): Promise<ReturnType<typeof renderWithFrontDoor>> {
  const view = renderWithFrontDoor(<AppShell settings={{ view: 'app', layout: 'wide', pages: {} }} />, {
    coreWork: { mode: 'synthetic' } as ICoreWorkService
  });
  await act(async () => undefined);
  fireEvent.click(view.getByRole('tab', { name: 'Cases', exact: true }));
  fireEvent.click(view.getByRole('button', { name: 'Edit case fixture' }));
  return view;
}

describe('Cases unsaved navigation wiring', () => {
  it('blocks pointer navigation, gives case-specific instructions and stays mounted until a confirmed save', async () => {
    const view = await cases();
    fireEvent.click(view.getByRole('tab', { name: 'Home' }));
    expect(view.getByRole('tab', { name: 'Cases', selected: true })).toBeInTheDocument();
    expect(view.getByRole('alert')).toHaveTextContent('Save case changes');
    expect(view.getByRole('alert')).toHaveTextContent('response');
    expect(view.getByRole('alert')).not.toHaveTextContent('Save draft');
    fireEvent.click(view.getByRole('button', { name: 'Keep editing' }));
    expect(view.queryByRole('alert')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Confirm case save fixture' }));
    fireEvent.click(view.getByRole('tab', { name: 'Home' }));
    expect(view.getByRole('tab', { name: 'Home', selected: true })).toBeInTheDocument();
  });

  it('guards keyboard and unload until explicit discard, without deleting a saved draft', async () => {
    const view = await cases();
    const clear = jest.spyOn(view.draftStore, 'clear');
    const caseTab = view.getByRole('tab', { name: 'Cases' });
    caseTab.focus();
    fireEvent.keyDown(caseTab, { key: 'ArrowRight' });
    expect(caseTab).toHaveFocus();
    expect(caseTab).toHaveAttribute('aria-selected', 'true');
    const before = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Discard unsaved changes and leave' }));
    expect(view.getByRole('tab', { name: 'Engineering', selected: true })).toBeInTheDocument();
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    expect(clear).not.toHaveBeenCalled();
  });
});
