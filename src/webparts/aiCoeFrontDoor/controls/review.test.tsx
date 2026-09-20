import { act, fireEvent, render, screen, within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../testing/renderWithFrontDoor';
import type { ITestFrontDoorOptions } from '../../../testing/renderWithFrontDoor';
import { createBranding } from '../branding/branding';
import type { ISharedSections } from '../content/pageContent';
import type { RouteTable } from '../content/routes';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import { SubmissionContext } from '../context/SubmissionContext';
import type { ISubmissionContextValue } from '../context/SubmissionContext';
import type { ISubmissionResult } from '../services/types';
import { buildIdeaSummaryDraft, IDEA_SUMMARY_FIELDS } from '../summaries/ideaSummary';
import type { IdeaSummaryKey } from '../summaries/ideaSummary';
import { visibleSteps } from '../workflows/formEngine';
import { createSummarySession } from '../workflows/summarySession';
import type { ISummarySession } from '../workflows/summarySession';
import type { IAnswers, IWorkflowDefinition } from '../workflows/types';
import { ResultPanel } from './ResultPanel';
import { ReviewAnswers } from './ReviewAnswers';
import { SummaryReview } from './SummaryReview';
import type { ISummaryReviewCopy } from './SummaryReview';

const helpTraining: IWorkflowDefinition = createWorkflowCatalog(createBranding('Overture')).helpTraining;
const idea: IWorkflowDefinition = createWorkflowCatalog(createBranding('Overture')).idea;

const REFERENCE: string = 'OVT-AICOE-20260911-ABCDEFGH';
const RECORD_URL: string = 'https://contoso.sharepoint.com/sites/ai/Lists/AICoEPilotIntakes/DispForm.aspx?ID=7';
const NOW: Date = new Date('2026-09-20T12:00:00Z');

const SAVED: ISubmissionResult = {
  connected: true,
  state: 'saved',
  intakeId: REFERENCE,
  itemId: 7,
  itemUrl: RECORD_URL,
  savedAt: '2026-09-11T10:15:00Z',
  version: '2.1',
  message: 'Submission received and added to the AI CoE service queue.'
};
const PENDING: ISubmissionResult = {
  connected: false,
  state: 'pending',
  intakeId: REFERENCE,
  itemId: 7,
  itemUrl: RECORD_URL,
  version: '2.1',
  message: `SharePoint accepted the AI CoE record ${REFERENCE} but did not confirm it back.`,
  failureClass: 'INCONCLUSIVE',
  userMessage: 'Saved, not yet confirmed.'
};
const DENIED: ISubmissionResult = {
  connected: false,
  state: 'failed',
  intakeId: REFERENCE,
  message: 'SharePoint could not create the AI CoE record. AI CoE Pilot Intakes returned 403: Access denied <secret body>',
  failureClass: 'PERMISSION',
  userMessage: 'Needs access.'
};
const OUTAGE: ISubmissionResult = {
  connected: false,
  state: 'failed',
  intakeId: REFERENCE,
  message: 'SharePoint could not create the AI CoE record. AI CoE Pilot Intakes returned 503: <secret body>',
  failureClass: 'TRANSIENT',
  userMessage: 'Not available right now; try again.'
};

/** An open assistant route (off-site, proved, carrying the reference) and the guided intake it falls back to. */
const OPEN_ROUTES: RouteTable = {
  guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
  assistant: { key: 'assistant', label: 'the assistant', href: 'https://assistant.example/chat', state: 'availableNow', verifiedOn: '2026-09-01', receiptRef: 'TQ-0007', carriesReference: true }
};
/** The same assistant route before its tenant receipt is recorded: closed, awaiting its source. */
const CLOSED_ROUTES: RouteTable = {
  guidedIntake: OPEN_ROUTES.guidedIntake,
  assistant: { key: 'assistant', label: 'the assistant', href: 'https://assistant.example/chat', state: 'availableNow', carriesReference: true }
};
const SUPPORT: ISharedSections = {
  footer: [
    {
      type: 'supportRoute',
      label: 'Ask the AI CoE for help',
      stopWhen: [],
      reportFields: [],
      routes: [
        { issue: 'Access or sign-in', owner: 'Identity owner', kind: 'identity' },
        { issue: 'Anything else', owner: 'Support desk', kind: 'support' }
      ]
    }
  ]
};

interface IPageViewResult {
  container: HTMLElement;
  retryLast: jest.Mock;
  onRetry: jest.Mock;
}

function renderPageViewResult(lastResult: ISubmissionResult | undefined, options: ITestFrontDoorOptions = {}, withOnRetry: boolean = false): IPageViewResult {
  const retryLast: jest.Mock = jest.fn().mockResolvedValue(undefined);
  const onRetry: jest.Mock = jest.fn();
  const value: ISubmissionContextValue = { lastResult, lastAttempt: undefined, submit: jest.fn(), retryLast };
  const { container } = renderWithFrontDoor(
    <SubmissionContext.Provider value={value}>
      <ResultPanel
        headerIntro="Thanks for reaching out."
        headerSubtext="Your request will be recorded."
        summaryText="Summary text"
        downloadFilename="overture-ai-coe-helpTraining-summary.txt"
        onStartOver={jest.fn()}
        onDone={jest.fn()}
        onRetry={withOnRetry ? onRetry : undefined}
      />
    </SubmissionContext.Provider>,
    { pageView: true, now: NOW, routes: OPEN_ROUTES, shared: SUPPORT, ...options }
  );
  return { container, retryLast, onRetry };
}

function receiptOf(container: HTMLElement): HTMLElement {
  const receipt: HTMLElement | null = container.querySelector('.ai-receipt');
  expect(receipt).not.toBeNull();
  return receipt as HTMLElement;
}

function routeCardOf(container: HTMLElement): HTMLElement {
  const card: HTMLElement | null = container.querySelector('.ai-route-card');
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

function renderResultPanel(lastResult: ISubmissionResult | undefined, overrides: Partial<React.ComponentProps<typeof ResultPanel>> = {}): {
  onStartOver: jest.Mock;
  onDone: jest.Mock;
} {
  const onStartOver: jest.Mock = jest.fn();
  const onDone: jest.Mock = jest.fn();
  const value: ISubmissionContextValue = { lastResult, lastAttempt: undefined, submit: jest.fn(), retryLast: jest.fn() };
  render(
    <SubmissionContext.Provider value={value}>
      <ResultPanel
        headerIntro="Thanks for reaching out."
        headerSubtext="Your request will be recorded."
        summaryText="Summary text"
        downloadFilename="overture-ai-coe-helpTraining-summary.txt"
        onStartOver={onStartOver}
        onDone={onDone}
        {...overrides}
      />
    </SubmissionContext.Provider>
  );
  return { onStartOver, onDone };
}

describe('ReviewAnswers', () => {
  it('lists answered and unanswered visible steps with edit buttons', () => {
    const answers: IAnswers = { helpCategory: 'new', name: 'Pat', team: '' };
    const onEdit: jest.Mock = jest.fn();
    render(<ReviewAnswers workflow={helpTraining} steps={visibleSteps(helpTraining, answers)} answers={answers} onEdit={onEdit} />);
    expect(screen.getByRole('heading', { name: 'Check your answers' })).toBeInTheDocument();
    expect(screen.getByText('Take a look below. You can change anything before you confirm.')).toBeInTheDocument();
    expect(screen.getByText('I am new to AI')).toBeInTheDocument();
    expect(screen.getByText('Pat')).toBeInTheDocument();
    expect(screen.getAllByText('Not answered')).toHaveLength(3);
    const editButtons: HTMLElement[] = screen.getAllByRole('button', { name: 'Edit' });
    expect(editButtons).toHaveLength(5);
    fireEvent.click(editButtons[1]);
    expect(onEdit).toHaveBeenCalledWith('newToAiFocus');
    expect(screen.getByText('What happens after you confirm')).toBeInTheDocument();
    expect(screen.getByText(helpTraining.whatHappensNext as string)).toBeInTheDocument();
  });
});

describe('ResultPanel', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the submission acknowledgement when the record was created', () => {
    renderResultPanel({ connected: true, intakeId: 'OVT-AICOE-20260911-ABCDEFGH', message: 'Submission received and added to the AI CoE service queue.' });
    expect(screen.getByRole('heading', { name: 'Thanks for reaching out.' })).toBeInTheDocument();
    expect(screen.getByText('Your request will be recorded.')).toBeInTheDocument();
    expect(screen.getByText('Submission received: OVT-AICOE-20260911-ABCDEFGH')).toBeInTheDocument();
    expect(screen.getByText('Submission received and added to the AI CoE service queue. This acknowledgement is not an approval decision.')).toBeInTheDocument();
    expect(screen.getByText('Summary text')).toBeInTheDocument();
  });

  it('explains a failed or missing record', () => {
    renderResultPanel({ connected: false, message: 'SharePoint could not create the AI CoE record. boom' });
    expect(screen.getByText('The AI CoE record was not created.')).toBeInTheDocument();
    expect(screen.getByText('SharePoint could not create the AI CoE record. boom')).toBeInTheDocument();
  });

  it('falls back to a generic message without any result', () => {
    renderResultPanel(undefined);
    expect(screen.getByText('Copy or download the summary and report the issue to the AI CoE administrator.')).toBeInTheDocument();
  });

  it('copies the summary and resets the label after 2.5 seconds', async () => {
    const writeText: jest.Mock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderResultPanel(undefined);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }));
    });
    expect(writeText).toHaveBeenCalledWith('Summary text');
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Summary copied to clipboard.');
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.getByRole('button', { name: 'Copy summary' })).toBeInTheDocument();
  });

  it('reports a copy failure', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    renderResultPanel(undefined);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }));
    });
    expect(screen.getByText('We could not copy automatically. You can select the text above and copy it yourself.')).toBeInTheDocument();
  });

  it('downloads the summary under the given file name', () => {
    const createObjectURL: jest.Mock = jest.fn((): string => 'blob:summary');
    const revokeObjectURL: jest.Mock = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true, writable: true });
    let clicked: HTMLAnchorElement | undefined;
    const click: jest.SpyInstance = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement): void {
      clicked = this;
    });
    try {
      renderResultPanel(undefined);
      fireEvent.click(screen.getByRole('button', { name: 'Download summary' }));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe('text/plain');
      expect(clicked?.download).toBe('overture-ai-coe-helpTraining-summary.txt');
      expect(clicked?.href).toBe('blob:summary');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:summary');
    } finally {
      click.mockRestore();
    }
  });

  it('offers to start over or go back to all topics', () => {
    const { onStartOver, onDone } = renderResultPanel(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Start a new one' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to all topics' }));
    expect(onStartOver).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('says a pending record is saved but not yet confirmed, never that it was not created (legacy third branch)', () => {
    renderResultPanel(PENDING);
    const title: HTMLElement = screen.getByText('Saved but not yet confirmed.');
    expect(title.tagName).toBe('STRONG');
    expect(screen.getByText(`${PENDING.message} Open the form again and confirm with the same reference; nothing is duplicated.`)).toBeInTheDocument();
    expect(screen.queryByText('The AI CoE record was not created.')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Submission received:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm again' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Summary text')).toBeInTheDocument();
  });

  it('keeps the shipped legacy wording for a failed result that carries a failure class', () => {
    renderResultPanel(DENIED);
    expect(screen.getByText('The AI CoE record was not created.')).toBeInTheDocument();
    expect(screen.getByText(DENIED.message)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ResultPanel in a page view', () => {
  it('renders the receipt of a saved record: operation, source, reference, readback, the record link, the draft state and the hand-off card', () => {
    const { container } = renderPageViewResult(SAVED);
    expect(screen.getByRole('heading', { name: 'Thanks for reaching out.' })).toBeInTheDocument();
    const receipt: HTMLElement = receiptOf(container);
    const title: HTMLElement = within(receipt).getByText('Saved and confirmed');
    expect(title.tagName).toBe('STRONG');
    expect(within(receipt).getByText('Saved to the AI CoE request list on this site')).toBeInTheDocument();
    const reference: HTMLElement = receipt.querySelector('.ai-receipt-reference') as HTMLElement;
    expect(reference).not.toBeNull();
    expect(reference).toHaveTextContent(`Reference ${REFERENCE} · saved ${new Date(SAVED.savedAt as string).toLocaleString()}`);
    expect(within(receipt).getByText('Read back from the list')).toBeInTheDocument();
    expect(within(receipt).getByRole('link', { name: 'Open the record' })).toHaveAttribute('href', RECORD_URL);
    expect(within(receipt).getByText('This acknowledgement is not an approval decision.')).toBeInTheDocument();
    const pill: HTMLElement = receipt.querySelector('.ai-pill') as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill).toHaveTextContent('Draft only');
    // The legacy notice is replaced, not doubled.
    expect(screen.queryByText(`Submission received: ${REFERENCE}`)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm again' })).not.toBeInTheDocument();
    // The hand-off card resolves the assistant route: open, so its own link carries the reference (the row says so) and opens in a new tab.
    const card: HTMLElement = routeCardOf(container);
    expect(within(card).getByRole('heading', { level: 3, name: 'Continue with the assistant' })).toBeInTheDocument();
    const code: HTMLElement = card.querySelector('code') as HTMLElement;
    expect(code).not.toBeNull();
    expect(code.textContent).toBe(REFERENCE);
    expect(within(card).getByText('Available now')).toBeInTheDocument();
    const link: HTMLElement = within(card).getByRole('link', { name: 'the assistant' });
    expect(link).toHaveAttribute('href', `https://assistant.example/chat?ref=${REFERENCE}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(card).queryByRole('link', { name: 'Start a guided request' })).not.toBeInTheDocument();
    // The summary and its actions stay below the receipt.
    expect(screen.getByText('Summary text')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy summary' })).toBeInTheDocument();
  });

  it('never appends the reference unless the route row says so, and never appends user text', () => {
    const routes: RouteTable = { ...OPEN_ROUTES, assistant: { ...OPEN_ROUTES.assistant, carriesReference: undefined } };
    const { container } = renderPageViewResult(SAVED, { routes });
    const card: HTMLElement = routeCardOf(container);
    expect(within(card).getByRole('link', { name: 'the assistant' })).toHaveAttribute('href', 'https://assistant.example/chat');
    expect(card.querySelector('code')?.textContent).toBe(REFERENCE);
  });

  it('falls back to the guided intake on the hand-off card while the assistant route is closed', () => {
    const { container } = renderPageViewResult(SAVED, { routes: CLOSED_ROUTES });
    const card: HTMLElement = routeCardOf(container);
    expect(within(card).getByRole('heading', { level: 3, name: 'Continue with the assistant' })).toBeInTheDocument();
    expect(within(card).getByText('Awaiting source')).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'the assistant' })).not.toBeInTheDocument();
    const fallback: HTMLElement = within(card).getByRole('link', { name: 'Start a guided request' });
    expect(fallback).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Explore-an-AI-idea.aspx`);
    expect(fallback).not.toHaveAttribute('target');
    expect(card.querySelector('code')?.textContent).toBe(REFERENCE);
  });

  it('omits the record link when the service has no item URL', () => {
    const { container } = renderPageViewResult({ ...SAVED, itemUrl: undefined });
    expect(within(receiptOf(container)).queryByRole('link', { name: 'Open the record' })).not.toBeInTheDocument();
    expect(within(receiptOf(container)).getByText('Read back from the list')).toBeInTheDocument();
  });

  it('renders a pending record as saved but not confirmed, with one button that confirms again under the same reference', async () => {
    const { container, retryLast } = renderPageViewResult(PENDING);
    const receipt: HTMLElement = receiptOf(container);
    const title: HTMLElement = within(receipt).getByText('Saved, not yet confirmed');
    expect(title.tagName).toBe('STRONG');
    expect(receipt).toHaveTextContent(
      `SharePoint accepted your request under reference ${REFERENCE} but did not confirm it back. Confirm again with the same reference; nothing is duplicated.`
    );
    expect(receipt.querySelector('code')?.textContent).toBe(REFERENCE);
    expect(within(receipt).queryByText('INCONCLUSIVE')).not.toBeInTheDocument();
    expect(within(receipt).queryByText('Saved and confirmed')).not.toBeInTheDocument();
    expect(within(receipt).queryByRole('link', { name: 'Open the record' })).not.toBeInTheDocument();
    expect(screen.queryByText('The AI CoE record was not created.')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelector('.ai-route-card')).toBeNull();
    await act(async () => {
      fireEvent.click(within(receipt).getByRole('button', { name: 'Confirm again' }));
    });
    expect(retryLast).toHaveBeenCalledTimes(1);
  });

  it('hands the confirm-again click to the workflow when it owns the retry, and shows the class code on the operator plane', () => {
    const { container, retryLast, onRetry } = renderPageViewResult(PENDING, { plane: 'operator' }, true);
    const receipt: HTMLElement = receiptOf(container);
    expect(within(receipt).getByText('INCONCLUSIVE').tagName).toBe('CODE');
    fireEvent.click(within(receipt).getByRole('button', { name: 'Confirm again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(retryLast).not.toHaveBeenCalled();
  });

  it('renders a failed record as a failure notice with the class, the owner, the rerun condition and the kept draft, never the response body', () => {
    const { container } = renderPageViewResult(DENIED);
    expect(container.querySelector('.ai-receipt')).toBeNull();
    expect(container.querySelector('.ai-route-card')).toBeNull();
    const notice: HTMLElement = screen.getByRole('alert');
    expect(within(notice).getByText('Needs access').tagName).toBe('STRONG');
    expect(within(notice).getByText('Needs access.')).toBeInTheDocument();
    expect(notice).toHaveTextContent('Identity owner');
    expect(notice).toHaveTextContent('after access is granted');
    expect(notice).toHaveTextContent('Your answers are kept as a draft on this device.');
    expect(notice.textContent).not.toContain('secret body');
    expect(notice.textContent).not.toContain('403');
    expect(screen.queryByText(DENIED.message)).not.toBeInTheDocument();
    expect(screen.queryByText('The AI CoE record was not created.')).not.toBeInTheDocument();
    expect(within(notice).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(within(notice).queryByText('PERMISSION')).not.toBeInTheDocument();
    expect(screen.getByText('Summary text')).toBeInTheDocument();
  });

  it('offers to try a transient failure again through the workflow and routes it to the support owner', () => {
    const { onRetry } = renderPageViewResult(OUTAGE, {}, true);
    const notice: HTMLElement = screen.getByRole('alert');
    expect(within(notice).getByText('Not available right now; try again').tagName).toBe('STRONG');
    expect(notice).toHaveTextContent('Support desk');
    fireEvent.click(within(notice).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('says the owner is not yet named when the support route names none', () => {
    renderPageViewResult(DENIED, { shared: { footer: [] } });
    expect(screen.getByRole('alert')).toHaveTextContent('not yet named');
  });

  it('keeps the generic legacy fallback when there is no result at all', () => {
    renderPageViewResult(undefined);
    expect(screen.getByText('Copy or download the summary and report the issue to the AI CoE administrator.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SummaryReview', () => {
  const answers: IAnswers = { workToImprove: 'Reports', painPoints: 'Slow', name: 'Pat', email: 'pat@contoso.com' };
  const copy: ISummaryReviewCopy = {
    heading: 'Here is a draft summary',
    intro: 'Check it before you confirm.',
    rebuildLabel: 'Reset summary to my answers',
    changedHint: 'Your answers have changed.',
    confirmLabel: 'Confirm this reflects my idea',
    fieldIdPrefix: 'idea'
  };

  function renderReview(pageView: boolean): void {
    const session: ISummarySession<{ [key in IdeaSummaryKey]: string }> = createSummarySession(idea, {
      answers,
      currentStepId: 'email',
      phase: 'summary',
      summaryDraft: buildIdeaSummaryDraft(idea, answers),
      summarySourceSnapshot: JSON.stringify(answers)
    });
    renderWithFrontDoor(
      <SummaryReview<IdeaSummaryKey>
        workflow={idea}
        copy={copy}
        fields={IDEA_SUMMARY_FIELDS}
        session={session}
        indicators={[]}
        whatHappensNext="A person reads it."
        onUpdateField={jest.fn()}
        onRebuild={jest.fn()}
        onEditAnswer={jest.fn()}
        onConfirm={jest.fn()}
      />,
      { pageView }
    );
  }

  it('shows the draft-only state beside the heading in a page view', () => {
    renderReview(true);
    expect(screen.getByRole('heading', { name: 'Here is a draft summary' })).toBeInTheDocument();
    const pill: HTMLElement = screen.getByText('Draft only');
    expect(pill.closest('.ai-pill')).not.toBeNull();
  });

  it('shows no state pill in the legacy view (the shipped summary screen is unchanged)', () => {
    renderReview(false);
    expect(screen.getByRole('heading', { name: 'Here is a draft summary' })).toBeInTheDocument();
    expect(screen.queryByText('Draft only')).not.toBeInTheDocument();
    expect(document.querySelector('.ai-pill')).toBeNull();
  });
});
