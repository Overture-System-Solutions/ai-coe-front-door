import { screen } from '@testing-library/react';
import * as React from 'react';
import { InMemoryDraftStore } from '../../../testing/fakeServices';
import { renderWithFrontDoor } from '../../../testing/renderWithFrontDoor';
import { useFrontDoor } from '../context/FrontDoorContext';
import type { DraftFlags } from './LandingPage';
import { useDraftFlags } from './useDraftFlags';

function Probe({ enabled }: { enabled: boolean }): React.ReactElement {
  const { services } = useFrontDoor();
  const drafts: DraftFlags = useDraftFlags(services.draftStore, enabled);
  return <p data-testid="drafts">{Object.keys(drafts).sort().join(',')}</p>;
}

describe('useDraftFlags', () => {
  it('discovers the workflows with a saved draft when enabled', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    await draftStore.save('idea', { answers: {}, phase: 'form' });
    await draftStore.save('feedback', { answers: {}, phase: 'form' });
    renderWithFrontDoor(<Probe enabled={true} />, { draftStore });
    await screen.findByText('feedback,idea');
  });

  it('stays empty when disabled', async () => {
    const draftStore: InMemoryDraftStore = new InMemoryDraftStore();
    await draftStore.save('idea', { answers: {}, phase: 'form' });
    renderWithFrontDoor(<Probe enabled={false} />, { draftStore });
    await new Promise<void>((resolve: () => void): void => {
      setTimeout(resolve, 20);
    });
    expect(screen.getByTestId('drafts').textContent).toBe('');
  });
});
