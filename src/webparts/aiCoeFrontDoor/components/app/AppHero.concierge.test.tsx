/**
 * The "Ask the AI CoE" box (1.0.0.18): it copies the question and opens the AI CoE Concierge in Microsoft 365
 * Copilot, where the person pastes it. The first time in a browser it first offers to add the concierge in Teams. It
 * saves no draft and sends nothing itself; without a concierge set up it says so and opens nothing.
 */
import * as React from 'react';
import { act, fireEvent } from '@testing-library/react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import { AppShell } from './AppShell';
import { CONCIERGE_INTRODUCED_KEY } from '../../services/concierge';
import type { IConcierge } from '../../services/concierge';

const CHAT: string = 'https://m365.cloud.microsoft/chat/?titleId=T_90a94581-0aa2-7ff7-625d-5fe358e84502&source=agentCenterDialog';
const ADD: string = 'https://teams.microsoft.com/l/app/?titleId=T_90a94581-0aa2-7ff7-625d-5fe358e84502';

let writeText: jest.Mock;
let open: jest.SpyInstance;

beforeEach(() => {
  window.localStorage.clear();
  writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  open = jest.spyOn(window, 'open').mockImplementation((): Window | null => null);
});

afterEach(() => {
  open.mockRestore();
});

async function ask(concierge: IConcierge | undefined, sentence: string = 'Summarise last week\'s customer calls'): Promise<ReturnType<typeof renderWithFrontDoor>> {
  const view = renderWithFrontDoor(<AppShell settings={{ view: 'app', layout: 'wide', pages: {} }} />, { concierge });
  await act(async (): Promise<void> => undefined);
  fireEvent.change(view.getByLabelText('What are you trying to get done?'), { target: { value: sentence } });
  await act(async (): Promise<void> => {
    fireEvent.click(view.getByRole('button', { name: /^Ask the / }));
  });
  return view;
}

describe('Ask the AI CoE: the concierge hand-off', () => {
  it('says the concierge is not set up, and opens, copies and saves nothing, when the site has none', async () => {
    const view = await ask(undefined);
    expect(view.getByRole('alert').textContent).toBe("The AI CoE Concierge isn't set up on this site yet.");
    expect(open).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(await view.draftStore.load('idea')).toBeUndefined();
    // The tab stays Home: no request opens from the box any more.
    expect(view.getByRole('tab', { name: 'Home', selected: true })).toBeInTheDocument();
  });

  it('the first time, copies the question and offers to add the concierge before opening it', async () => {
    const view = await ask({ chatUrl: CHAT, addUrl: ADD });
    expect(writeText).toHaveBeenCalledWith("Summarise last week's customer calls");
    expect(open).not.toHaveBeenCalled();
    const dialog: HTMLElement = view.getByRole('dialog', { name: 'Open the AI CoE Concierge' });
    expect(dialog.textContent).toContain('Your question is copied');
    expect(dialog.textContent).toContain("Haven't added it yet?");
    fireEvent.click(view.getByRole('button', { name: 'Add it first' }));
    expect(open).toHaveBeenLastCalledWith(ADD, '_blank', 'noopener');
    // Adding does not close the message: the person still has to open the chat.
    expect(view.getByRole('dialog', { name: 'Open the AI CoE Concierge' })).toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Open the AI CoE Concierge' }));
    expect(open).toHaveBeenLastCalledWith(CHAT, '_blank', 'noopener');
    expect(view.queryByRole('dialog')).toBeNull();
    expect(window.localStorage.getItem(CONCIERGE_INTRODUCED_KEY)).toBe('yes');
    expect(view.container.querySelector('.ai-app-hero-micro')?.textContent).toBe('Copied. Paste it into the AI CoE Concierge chat (Ctrl+V).');
    expect(await view.draftStore.load('idea')).toBeUndefined();
  });

  it('offers only the chat when no add link is set', async () => {
    const view = await ask({ chatUrl: CHAT });
    expect(view.queryByRole('button', { name: 'Add it first' })).toBeNull();
    expect(view.getByRole('button', { name: 'Open the AI CoE Concierge' })).toBeInTheDocument();
  });

  it('after the first time, copies and opens the concierge straight away', async () => {
    window.localStorage.setItem(CONCIERGE_INTRODUCED_KEY, 'yes');
    const view = await ask({ chatUrl: CHAT, addUrl: ADD });
    expect(view.queryByRole('dialog')).toBeNull();
    expect(open).toHaveBeenCalledWith(CHAT, '_blank', 'noopener');
    expect(writeText).toHaveBeenCalledWith("Summarise last week's customer calls");
    expect(view.container.querySelector('.ai-app-hero-micro')?.textContent).toBe('Copied. Paste it into the AI CoE Concierge chat (Ctrl+V).');
  });

  it('still opens the chat, and says to paste it by hand, when the browser refuses to copy', async () => {
    window.localStorage.setItem(CONCIERGE_INTRODUCED_KEY, 'yes');
    writeText.mockRejectedValue(new Error('denied'));
    const execCommand: jest.Mock = jest.fn().mockReturnValue(false);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    const view = await ask({ chatUrl: CHAT });
    expect(open).toHaveBeenCalledWith(CHAT, '_blank', 'noopener');
    expect(view.container.querySelector('.ai-app-hero-micro')?.textContent).toBe('Copy your question from the box, then paste it into the AI CoE Concierge chat.');
    // The question stays in the box to copy by hand.
    expect(view.getByLabelText('What are you trying to get done?')).toHaveValue("Summarise last week's customer calls");
  });

  it('asks for a question first when the box is empty', async () => {
    const view = await ask({ chatUrl: CHAT }, '   ');
    expect(view.getByRole('alert').textContent).toBe('Say what you need done first.');
    expect(open).not.toHaveBeenCalled();
  });
});
