import * as React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import { createFakeProgramMeasuresService, createFakeUsageService } from '../../../../testing/fakeServices';
import type { RoleId } from '../../content/roles';
import type { IRoleResolution } from '../../services/roleResolver';
import { AppShell } from './AppShell';

const settings = { view: 'app' as const, layout: 'wide' as const, pages: {} };

it.each([
  ['employee', false], ['leader', true], ['operator', true], ['designAuthority', false],
  ['marketingParticipant', false], ['marketingReviewer', false]
] as [RoleId, boolean][])('matches the enterprise Home entry to the existing %s capability', async (role, allowed) => {
  const measures = createFakeProgramMeasuresService();
  const usage = createFakeUsageService();
  const view = renderWithFrontDoor(<AppShell settings={settings} />, {
    roleResolver: { resolve: async () => ({ roles: ['employee', role], resolution: 'resolved' }) },
    programMeasures: measures, usage
  });
  await act(async (): Promise<void> => undefined);
  const entry = view.queryByRole('button', { name: /Review AI metrics/ });
  expect(entry !== null).toBe(allowed);
  expect(view.queryByRole('tab', { name: 'Metrics' }) !== null).toBe(allowed);
  expect(measures.calls).toBe(0);
  expect(usage.calls).toBe(0);
  if (entry !== null) {
    fireEvent.click(entry);
    await waitFor(() => expect(view.getByRole('tab', { name: 'Metrics' })).toHaveAttribute('aria-selected', 'true'));
    await act(async (): Promise<void> => undefined);
    expect(measures.calls).toBeGreaterThan(0);
    if (role === 'leader') { expect(usage.calls).toBe(0); }
  }
});

it('keeps the enterprise Home entry absent until its membership has actually resolved', async () => {
  let finish!: (value: IRoleResolution) => void;
  const pending = new Promise<IRoleResolution>(resolve => { finish = resolve; });
  const view = renderWithFrontDoor(<AppShell settings={settings} />, { roleResolver: { resolve: () => pending } });
  expect(view.queryByRole('button', { name: /Review AI metrics/ })).toBeNull();
  expect(view.queryByRole('tab', { name: 'Metrics' })).toBeNull();
  await act(async (): Promise<void> => { finish({ roles: ['employee', 'leader'], resolution: 'resolved' }); });
  expect(view.getByRole('button', { name: /Review AI metrics/ })).toBeInTheDocument();
});
