import { act, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { createBranding } from '../branding/branding';
import { createWorkflowCatalog } from '../content/workflows/catalog';
import { SubmissionContext } from '../context/SubmissionContext';
import type { ISubmissionContextValue } from '../context/SubmissionContext';
import type { ISubmissionResult } from '../services/types';
import { visibleSteps } from '../workflows/formEngine';
import type { IAnswers, IWorkflowDefinition } from '../workflows/types';
import { ResultPanel } from './ResultPanel';
import { ReviewAnswers } from './ReviewAnswers';

const helpTraining: IWorkflowDefinition = createWorkflowCatalog(createBranding('Overture')).helpTraining;

function renderResultPanel(lastResult: ISubmissionResult | undefined, overrides: Partial<React.ComponentProps<typeof ResultPanel>> = {}): {
  onStartOver: jest.Mock;
  onDone: jest.Mock;
} {
  const onStartOver: jest.Mock = jest.fn();
  const onDone: jest.Mock = jest.fn();
  const value: ISubmissionContextValue = { lastResult, submit: jest.fn() };
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
});
