/**
 * The leaders' case analysis panel. What matters: only a role holding the capability sees it, only the question is
 * sent, the answer is drawn with its provenance and caveat, and a failure reads as plain words with nothing drawn.
 */
import * as React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import type { RoleId } from '../../content/roles';
import { CaseAnalysisError, DEFAULT_CASE_ANALYSIS_QUESTION } from '../../services/caseAnalysisService';
import type { ICaseAnalysisResult, ICaseAnalysisService } from '../../services/caseAnalysisService';
import type { IRoleResolution, IRoleResolver } from '../../services/roleResolver';
import { AppShell } from './AppShell';
import { CASE_ANALYSIS_UNBOUND_TEXT } from './AppCaseAnalysis';

const RESULT: ICaseAnalysisResult = {
  analysis: {
    summary: 'Two cases need a decision this week.',
    priorities: [
      { coeId: 'OVT-AICOE-20260920-AAAA1111', title: 'Ticket replies', whyItMatters: 'High risk, restricted data, waiting 12 days.', suggestedNextStep: 'Schedule the review.' },
      { coeId: 'OVT-AICOE-20260915-BBBB2222', title: 'Change notes', whyItMatters: 'Needs information for 20 days.', suggestedNextStep: 'Chase the submitter.' }
    ],
    patterns: ['Most open cases wait on information.'],
    gaps: ['One case has no risk tier.']
  },
  caseCount: 7,
  truncated: true,
  asOf: '2026-09-25T14:00:00Z',
  provenance: { provider: 'anthropic', model: 'claude-opus-5', responseId: 'msg_01', requestId: 'analysis-1', draftOnly: true, humanReviewRequired: true }
};

function resolver(roles: RoleId[]): IRoleResolver {
  return { resolve: async (): Promise<IRoleResolution> => ({ roles, resolution: 'resolved' }) };
}

async function openCases(roles: RoleId[], caseAnalysis?: ICaseAnalysisService): Promise<ReturnType<typeof renderWithFrontDoor>> {
  const view: ReturnType<typeof renderWithFrontDoor> = renderWithFrontDoor(<AppShell settings={{ view: 'app', layout: 'wide', pages: {} }} />, {
    roleResolver: resolver(roles),
    caseAnalysis
  });
  await act(async (): Promise<void> => undefined);
  fireEvent.click(view.getByRole('tab', { name: 'Cases', exact: true }));
  return view;
}

describe('AppCaseAnalysis', () => {
  it('is not drawn for an employee, and no request is made', async () => {
    const analyze: jest.Mock = jest.fn();
    await openCases(['employee'], { analyze });
    expect(screen.queryByRole('heading', { name: 'Analyze the most important cases' })).toBeNull();
    expect(analyze).not.toHaveBeenCalled();
  });

  it('says plainly when the site has no analysis flow bound', async () => {
    await openCases(['employee', 'leader']);
    expect(screen.getByRole('heading', { name: 'Analyze the most important cases' })).toBeInTheDocument();
    expect(screen.getByText(CASE_ANALYSIS_UNBOUND_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask Claude' })).toBeNull();
  });

  it('sends the leader\'s question and draws the ranked answer with its provenance', async () => {
    let finish: (result: ICaseAnalysisResult) => void = (): void => undefined;
    const analyze: jest.Mock = jest.fn((): Promise<ICaseAnalysisResult> => new Promise((resolve): void => { finish = resolve; }));
    await openCases(['employee', 'leader'], { analyze });

    const question: HTMLElement = screen.getByLabelText('Your question to Claude');
    expect(question).toHaveValue(DEFAULT_CASE_ANALYSIS_QUESTION);
    fireEvent.change(question, { target: { value: 'Which cases are blocked?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask Claude' }));
    expect(analyze).toHaveBeenCalledWith('Which cases are blocked?');
    expect(screen.getByRole('button', { name: 'Asking Claude…' })).toBeDisabled();
    expect(screen.getByLabelText('Your question to Claude')).toBeDisabled();

    await act(async (): Promise<void> => {
      finish(RESULT);
    });
    expect(screen.getByText('Two cases need a decision this week.')).toBeInTheDocument();
    const ranked: HTMLElement = screen.getByRole('list', { name: 'Cases to look at first' });
    expect(within(ranked).getAllByRole('listitem')).toHaveLength(2);
    expect(within(ranked).getByText('OVT-AICOE-20260920-AAAA1111')).toBeInTheDocument();
    expect(within(ranked).getByText('Rank 1')).toBeInTheDocument();
    expect(within(ranked).getByText('Next: Schedule the review.')).toBeInTheDocument();
    expect(screen.getByText('Most open cases wait on information.')).toBeInTheDocument();
    expect(screen.getByText('One case has no risk tier.')).toBeInTheDocument();
    const note: HTMLElement = screen.getByText(/^Drafted by Claude \(claude-opus-5\) from 7 open business cases/);
    expect(note).toHaveTextContent('never request text');
    expect(note).toHaveTextContent('Only the 200 most recently updated open cases were read.');
    expect(note).toHaveTextContent('check the records before acting on it');
  });

  it('shows plain words when the analysis fails, and draws nothing', async () => {
    const analyze: jest.Mock = jest.fn(async (): Promise<ICaseAnalysisResult> => {
      throw new CaseAnalysisError('cases-unavailable', 'x', 503, 'CASES_UNAVAILABLE');
    });
    await openCases(['employee', 'operator'], { analyze });
    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByRole('button', { name: 'Ask Claude' }));
    });
    expect(screen.getByText(/^The open business cases could not be read, so nothing was sent to Claude\./)).toHaveClass('ai-app-aside');
    expect(screen.queryByRole('list', { name: 'Cases to look at first' })).toBeNull();
  });

  it('says so when there are no open cases', async () => {
    const analyze: jest.Mock = jest.fn(async (): Promise<ICaseAnalysisResult> => ({ ...RESULT, analysis: undefined, caseCount: 0, truncated: false }));
    await openCases(['employee', 'leader'], { analyze });
    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByRole('button', { name: 'Ask Claude' }));
    });
    expect(screen.getByText('There are no open business cases to analyze right now.')).toBeInTheDocument();
  });

  it('will not send a blank question and restores the suggested one', async () => {
    const analyze: jest.Mock = jest.fn();
    await openCases(['employee', 'leader'], { analyze });
    fireEvent.change(screen.getByLabelText('Your question to Claude'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Ask Claude' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use the suggested question' }));
    expect(screen.getByLabelText('Your question to Claude')).toHaveValue(DEFAULT_CASE_ANALYSIS_QUESTION);
    expect(analyze).not.toHaveBeenCalled();
  });
});
