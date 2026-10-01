/**
 * The next step after a saved submission (1.0.0.18). In the tabbed view it is the AI CoE Concierge when the site set
 * one up - "Continue in the AI CoE Concierge", which copies the reference and opens the chat - and nothing at all when
 * it did not. Page views, which provide no hand-off, keep their route card.
 */
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FrontDoorProvider } from '../context/FrontDoorContext';
import { HandOffProvider } from '../context/HandOffContext';
import { SubmissionContext } from '../context/SubmissionContext';
import type { ISubmissionContextValue } from '../context/SubmissionContext';
import { createTestFrontDoor } from '../../../testing/renderWithFrontDoor';
import type { IConcierge } from '../services/concierge';
import type { ISubmissionResult } from '../services/types';
import { ResultPanel } from './ResultPanel';

const CHAT: string = 'https://m365.cloud.microsoft/chat/?titleId=T_90a94581-0aa2-7ff7-625d-5fe358e84502&source=agentCenterDialog';
const SAVED: ISubmissionResult = {
  connected: true,
  intakeId: 'OVT-AICOE-20260930-ABCDEFGH',
  message: 'Saved.',
  savedAt: '2026-09-30T12:00:00Z'
} as ISubmissionResult;

let open: jest.SpyInstance;
let writeText: jest.Mock;

beforeEach(() => {
  open = jest.spyOn(window, 'open').mockImplementation((): Window | null => null);
  writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => open.mockRestore());

function renderSaved(handOff: { concierge?: IConcierge } | undefined): void {
  const frontDoor = createTestFrontDoor({ pageView: true });
  const submission: ISubmissionContextValue = { lastResult: SAVED, lastAttempt: undefined, submit: jest.fn(), retryLast: jest.fn() };
  const panel: React.ReactElement = (
    <ResultPanel headerIntro="Thanks." headerSubtext="Recorded." summaryText="Summary" downloadFilename="s.txt" onStartOver={jest.fn()} onDone={jest.fn()} />
  );
  render(
    <FrontDoorProvider value={frontDoor.value}>
      <SubmissionContext.Provider value={submission}>
        {handOff === undefined ? panel : <HandOffProvider value={handOff}>{panel}</HandOffProvider>}
      </SubmissionContext.Provider>
    </FrontDoorProvider>
  );
}

describe('the next step after a saved submission', () => {
  it('is the AI CoE Concierge in the tabbed view when the site set one up', async () => {
    renderSaved({ concierge: { chatUrl: CHAT } });
    const card: HTMLElement = screen.getByRole('region', { name: 'Continue in the AI CoE Concierge' });
    expect(card.textContent).toContain('OVT-AICOE-20260930-ABCDEFGH');
    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByRole('button', { name: 'Open the AI CoE Concierge' }));
    });
    expect(open).toHaveBeenCalledWith(CHAT, '_blank', 'noopener');
    expect(writeText).toHaveBeenCalledWith('My AI CoE request OVT-AICOE-20260930-ABCDEFGH: ');
    expect(card.textContent).toContain('The reference is copied. Paste it into the chat (Ctrl+V) and ask your question.');
    expect(screen.queryByRole('region', { name: /^Continue with/ })).toBeNull();
  });

  it('is left out entirely in the tabbed view when no concierge is set up', () => {
    renderSaved({});
    expect(screen.queryByRole('region', { name: /^Continue (in|with)/ })).toBeNull();
    expect(document.querySelector('.ai-route-card')).toBeNull();
    // The receipt itself is unchanged.
    expect(screen.getByText('OVT-AICOE-20260930-ABCDEFGH')).toBeInTheDocument();
  });

  it('stays the route card in page views, which provide no hand-off', () => {
    renderSaved(undefined);
    expect(document.querySelector('.ai-route-card')).not.toBeNull();
  });
});
