import { fireEvent, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { InMemoryDraftStore } from '../../../../../testing/fakeServices';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../../testing/renderWithFrontDoor';
import type { FrontDoorRenderResult } from '../../../../../testing/renderWithFrontDoor';
import type { IWorkCommandBlock } from '../../../content/pageContent';
import { NO_FALLBACK_LABEL } from '../../../content/routes';
import type { RouteTable } from '../../../content/routes';
import { WorkCommandBlock } from './WorkCommandBlock';

const SENTENCE: string = 'prepare me for a customer meeting';
const GUIDED_INTAKE_HREF: string = `${TEST_SITE_URL}/SitePages/Explore-an-AI-idea.aspx`;
const WORK_HREF: string = 'https://work.example/start';

const BLOCK: IWorkCommandBlock = {
  type: 'workCommand',
  prompt: 'What do you need done?',
  placeholder: 'Say it in one sentence.',
  submitLabel: 'Start',
  route: 'work',
  note: 'Your sentence is saved as a **draft request** and never sent anywhere else.',
  emptyText: 'Say what you need done first.'
};

/** The idea draft the command saves: the stored shape of the summary workflows with the sentence as the first answer. */
const EXPECTED_DRAFT: unknown = {
  answers: { workToImprove: SENTENCE },
  currentStepId: 'workToImprove',
  phase: 'form',
  summaryDraft: null,
  summarySourceSnapshot: null
};

const GUIDED_INTAKE_ROW: RouteTable = {
  guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' }
};

/** The work route with no link yet: closed, so the command falls back to the guided intake. */
const CLOSED_ROUTES: RouteTable = {
  ...GUIDED_INTAKE_ROW,
  work: { key: 'work', label: 'Get work done', state: 'availableNow', note: 'Not yet proved here.' }
};

/** The work route proved off-site: opens in a new tab. */
const OPEN_ROUTES: RouteTable = {
  ...GUIDED_INTAKE_ROW,
  work: { key: 'work', label: 'Get work done', href: WORK_HREF, state: 'availableNow', verifiedOn: '2026-09-01', receiptRef: 'TQ-0007', note: 'Opens in a new tab.' }
};

const NOW: Date = new Date('2026-09-20T12:00:00Z');

let openSpy: jest.SpyInstance;

beforeEach((): void => {
  openSpy = jest.spyOn(window, 'open').mockImplementation((): null => null);
});

afterEach((): void => {
  openSpy.mockRestore();
});

function renderCommand(routes: RouteTable, block: IWorkCommandBlock = BLOCK): FrontDoorRenderResult {
  return renderWithFrontDoor(<WorkCommandBlock block={block} />, { routes, now: NOW, draftStore: new InMemoryDraftStore() });
}

function submitSentence(text: string): HTMLInputElement {
  const input: HTMLInputElement = screen.getByRole('textbox', { name: 'What do you need done?' }) as HTMLInputElement;
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  return input;
}

describe('WorkCommandBlock', () => {
  it('renders a labelled form with one text input, a submit button and the note', () => {
    const { container } = renderCommand(CLOSED_ROUTES);
    const form: HTMLFormElement = container.querySelector('form.ai-page-command') as HTMLFormElement;
    expect(form).not.toBeNull();
    const label: HTMLLabelElement = form.querySelector('label') as HTMLLabelElement;
    const input: HTMLInputElement = form.querySelector('input[type=text]') as HTMLInputElement;
    expect(label.textContent).toBe('What do you need done?');
    expect(label.getAttribute('for')).toBe(input.id);
    expect(input).toHaveAttribute('placeholder', 'Say it in one sentence.');
    expect(input).toHaveClass('ai-page-command-input');
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
    const button: HTMLButtonElement = form.querySelector('button[type=submit]') as HTMLButtonElement;
    expect(button.textContent).toBe('Start');
    expect(button).toHaveClass('ai-page-command-submit');
    const note: HTMLElement = form.querySelector('.ai-page-command-note') as HTMLElement;
    expect(note.textContent).toBe('Your sentence is saved as a draft request and never sent anywhere else.');
    expect(note.querySelector('strong')?.textContent).toBe('draft request');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('takes its ids from a counter, never from a literal', () => {
    const { container } = renderWithFrontDoor(
      <>
        <WorkCommandBlock block={BLOCK} />
        <WorkCommandBlock block={{ ...BLOCK, prompt: 'Second' }} />
      </>,
      { routes: CLOSED_ROUTES, now: NOW }
    );
    const inputs: HTMLInputElement[] = Array.prototype.slice.call(container.querySelectorAll('input[type=text]'));
    const labels: HTMLLabelElement[] = Array.prototype.slice.call(container.querySelectorAll('label'));
    expect(inputs).toHaveLength(2);
    expect(inputs[0].id).toMatch(/^ai-page-command-\d+-input$/);
    expect(inputs[1].id).toMatch(/^ai-page-command-\d+-input$/);
    expect(inputs[0].id).not.toBe(inputs[1].id);
    expect(labels[0].getAttribute('for')).toBe(inputs[0].id);
    expect(labels[1].getAttribute('for')).toBe(inputs[1].id);
  });

  it('refuses an empty sentence with an alert, saves nothing and goes nowhere', async () => {
    const { navigate, draftStore } = renderCommand(CLOSED_ROUTES);
    const input: HTMLInputElement = submitSentence('   ');
    const alert: HTMLElement = screen.getByRole('alert');
    expect(alert.tagName).toBe('P');
    expect(alert).toHaveClass('ai-page-command-alert');
    expect(alert.textContent).toBe('Say what you need done first.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
    expect(input).toHaveFocus();
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(draftStore.keys()).toEqual([]);
  });

  it('saves the sentence as the first idea answer and opens the guided intake when the route is closed', async () => {
    const { navigate, draftStore } = renderCommand(CLOSED_ROUTES);
    submitSentence(SENTENCE);
    await waitFor((): void => expect(navigate).toHaveBeenCalledWith(GUIDED_INTAKE_HREF));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(await draftStore.load('idea')).toEqual(EXPECTED_DRAFT);
    expect(openSpy).not.toHaveBeenCalled();
    expect(String(navigate.mock.calls[0][0])).not.toContain('customer');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('treats an unknown route key as the guided intake and opens it in the same tab', async () => {
    const { navigate, draftStore } = renderCommand(GUIDED_INTAKE_ROW);
    submitSentence(SENTENCE);
    await waitFor((): void => expect(navigate).toHaveBeenCalledWith(GUIDED_INTAKE_HREF));
    expect(await draftStore.load('idea')).toEqual(EXPECTED_DRAFT);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('saves the draft and opens an available route in a new tab, with the status line from its note', async () => {
    const { navigate, draftStore } = renderCommand(OPEN_ROUTES);
    submitSentence(SENTENCE);
    const status: HTMLElement = await screen.findByRole('status');
    expect(status.tagName).toBe('P');
    expect(status).toHaveClass('ai-page-command-status');
    expect(status.textContent).toBe('Opens in a new tab.');
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(WORK_HREF, '_blank', 'noopener');
    expect(String(openSpy.mock.calls[0][0])).not.toContain('customer');
    expect(navigate).not.toHaveBeenCalled();
    expect(await draftStore.load('idea')).toEqual(EXPECTED_DRAFT);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says where an available route without a note opened', async () => {
    const routes: RouteTable = { ...OPEN_ROUTES, work: { ...OPEN_ROUTES.work, note: undefined } };
    renderCommand(routes);
    submitSentence(SENTENCE);
    const status: HTMLElement = await screen.findByRole('status');
    expect(status.textContent).toBe('Get work done opened in a new tab; your sentence is saved as a draft request.');
  });

  it('alerts when no fallback is configured and saves nothing', async () => {
    const { navigate, draftStore } = renderCommand({});
    submitSentence(SENTENCE);
    expect(screen.getByRole('alert').textContent).toBe(NO_FALLBACK_LABEL);
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(draftStore.keys()).toEqual([]);
  });

  it('alerts when the closed route has no fallback link either', async () => {
    const routes: RouteTable = {
      guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', state: 'availableNow' },
      work: { key: 'work', label: 'Get work done', state: 'availableNow' }
    };
    const { navigate, draftStore } = renderCommand(routes);
    submitSentence(SENTENCE);
    expect(screen.getByRole('alert').textContent).toBe(NO_FALLBACK_LABEL);
    await Promise.resolve();
    expect(navigate).not.toHaveBeenCalled();
    expect(draftStore.keys()).toEqual([]);
  });

  it('clears the alert once a sentence is submitted', async () => {
    const { navigate } = renderCommand(CLOSED_ROUTES);
    submitSentence('');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    submitSentence(SENTENCE);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor((): void => expect(navigate).toHaveBeenCalledWith(GUIDED_INTAKE_HREF));
  });
});
