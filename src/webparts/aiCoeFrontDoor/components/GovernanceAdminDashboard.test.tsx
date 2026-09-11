import { act, fireEvent, screen, within } from '@testing-library/react';
import * as React from 'react';
import { createDeferred, createFakeGovernanceService } from '../../../testing/fakeServices';
import type { IDeferred, IFakeGovernanceService } from '../../../testing/fakeServices';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../testing/renderWithFrontDoor';
import type { IAdminDashboardData, IListItem } from '../services/types';
import { buildRecords, formatAnswerValue, formatDateTime, GovernanceAdminDashboard, humanizeKey } from './GovernanceAdminDashboard';
import type { IDashboardRecord } from './GovernanceAdminDashboard';

const intakes: IListItem[] = [
  {
    Id: 11,
    Title: 'Explore an AI idea — OVT-AICOE-20260901-AAAAAAAA',
    IntakeId: 'OVT-AICOE-20260901-AAAAAAAA',
    WorkflowType: 'idea',
    RequestorName: 'Pat Example',
    RequestorEmail: 'pat@contoso.com',
    SubmittedAt: '2026-09-01T10:00:00Z',
    Status: 'Submitted',
    Priority: 'Normal',
    PilotOnly: false,
    PayloadJson: JSON.stringify({
      confirmedSummary: { title: 'Summarise reports', problemToSolve: 'Slow' },
      originalAnswers: { workToImprove: 'Reports', informationCategories: ['internal', 'public'], flag: true, nothing: null, empty: '', nested: { a: 1 } }
    })
  },
  {
    Id: 12,
    Title: 'Help or training — OVT-AICOE-20260902-BBBBBBBB',
    IntakeId: 'OVT-AICOE-20260902-BBBBBBBB',
    WorkflowType: 'helpTraining',
    RequestorName: 'Sam Example',
    RequestorEmail: 'sam@contoso.com',
    SubmittedAt: '2026-09-02T10:00:00Z',
    Status: 'Needs information',
    Priority: 'High',
    PilotOnly: true,
    PayloadJson: 'not json'
  },
  {
    Id: 13,
    Title: 'Tool or task review — OVT-AICOE-20260903-CCCCCCCC',
    IntakeId: 'OVT-AICOE-20260903-CCCCCCCC',
    WorkflowType: 'toolCheck-review-request',
    RequestorEmail: 'kim@contoso.com',
    Created: '2026-09-03T10:00:00Z',
    PilotOnly: true
  }
];

const useCases: IListItem[] = [
  {
    Id: 21,
    Title: 'Summarise reports',
    CoEID: 'OVT-AICOE-20260901-AAAAAAAA',
    Status: 'In review',
    RiskTier: 'Medium',
    SubmitterEmail: 'pat@contoso.com',
    BusinessProblem: 'Reports take too long.',
    Created: '2026-09-01T11:00:00Z'
  },
  { Id: 22, Title: 'Standalone use case', Status: 'Approved', RiskTier: 'High', SubmitterEmail: 'lee@contoso.com', Created: '2026-08-30T10:00:00Z' },
  { Id: 23, Title: 'Closed one', Status: 'Closed', RiskTier: 'Low', BusinessOwnerEmail: 'owner@contoso.com', Created: '2026-08-01T10:00:00Z' }
];

const decisions: IListItem[] = [1, 2, 3, 4, 5, 6].map(
  (n: number): IListItem => ({
    Id: 30 + n,
    Title: `Decision title ${n}`,
    Decision: n === 6 ? undefined : `Decision ${n}`,
    UseCaseID: n === 2 ? undefined : `UC-${n}`,
    DecisionDate: n === 3 ? undefined : `2026-08-${10 + n}T09:00:00Z`,
    Created: '2026-08-01T09:00:00Z'
  })
);

const dashboard: IAdminDashboardData = { connected: true, intakes, useCases, decisions, message: 'SharePoint governance data refreshed.' };

function dateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

async function renderDashboard(data: IAdminDashboardData = dashboard): Promise<{ governance: IFakeGovernanceService; onExit: jest.Mock }> {
  const governance: IFakeGovernanceService = createFakeGovernanceService();
  governance.dashboard = data;
  const onExit: jest.Mock = jest.fn();
  renderWithFrontDoor(<GovernanceAdminDashboard onExit={onExit} />, { governance, isAdmin: true });
  await screen.findByText('5 of 5 records shown');
  return { governance, onExit };
}

function recordRows(): HTMLElement[] {
  return Array.prototype.slice.call(document.querySelectorAll('.ai-admin-record'));
}

describe('GovernanceAdminDashboard helpers', () => {
  it('formats dates, answer values and keys as shipped', () => {
    expect(formatDateTime(undefined)).toBe('Not available');
    expect(formatDateTime('whenever')).toBe('whenever');
    expect(formatDateTime('2026-09-01T10:00:00Z')).toBe(dateTime('2026-09-01T10:00:00Z'));
    expect(formatAnswerValue(['a', '', 'b'])).toBe('a, Not provided, b');
    expect(formatAnswerValue({ a: 1 })).toBe('{"a":1}');
    expect(formatAnswerValue(true)).toBe('Yes');
    expect(formatAnswerValue(false)).toBe('No');
    expect(formatAnswerValue(undefined)).toBe('Not provided');
    expect(formatAnswerValue(null)).toBe('Not provided');
    expect(formatAnswerValue('')).toBe('Not provided');
    expect(formatAnswerValue(42)).toBe('42');
    expect(humanizeKey('workToImprove')).toBe('Work To Improve');
    expect(humanizeKey('data_sensitivity-level2')).toBe('Data sensitivity level2');
  });

  it('merges intakes with their use cases and sorts newest first', () => {
    const records: IDashboardRecord[] = buildRecords(intakes, useCases);
    expect(records.map((record: IDashboardRecord): string => record.key)).toEqual(['intake-13', 'intake-12', 'intake-11', 'usecase-22', 'usecase-23']);
    expect(records[2]).toMatchObject({ title: intakes[0].Title, status: 'In review', risk: 'Medium', governance: true, requestor: 'Pat Example', requestorEmail: 'pat@contoso.com' });
    expect(records[0]).toMatchObject({ status: 'Submitted', risk: 'Unrated', governance: false, requestor: 'kim@contoso.com', submittedAt: '2026-09-03T10:00:00Z' });
    expect(records[3]).toMatchObject({ workflow: '', governance: true, requestor: 'lee@contoso.com', risk: 'High' });
    expect(records[4]).toMatchObject({ requestor: 'owner@contoso.com', requestorEmail: 'owner@contoso.com', status: 'Closed' });
  });
});

describe('GovernanceAdminDashboard', () => {
  it('loads the queue, metrics and decisions', async () => {
    const deferred: IDeferred<IAdminDashboardData> = createDeferred<IAdminDashboardData>();
    const governance: IFakeGovernanceService = createFakeGovernanceService();
    governance.getAdminDashboardData = (): Promise<IAdminDashboardData> => deferred.promise;
    renderWithFrontDoor(<GovernanceAdminDashboard onExit={jest.fn()} />, { governance });
    expect(screen.getByText('ADMINISTRATOR VIEW')).toHaveClass('ai-usage-kicker');
    expect(screen.getByRole('heading', { level: 1, name: 'AI CoE Admin Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Loading live SharePoint records…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refreshing' })).toBeDisabled();
    expect(screen.getByText('Connection issue')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => {
      deferred.resolve(dashboard);
      await deferred.promise;
    });

    expect(screen.getByText('SharePoint connected')).toHaveClass('is-connected');
    const metrics: HTMLElement = screen.getByRole('region', { name: 'AI CoE administration summary' });
    const cards: HTMLElement[] = within(metrics).getAllByRole('article');
    expect(cards.map((card: HTMLElement): string | null => card.textContent)).toEqual([
      '3Front Door submissions',
      '1Open governance items',
      '2High-priority items',
      '6Recorded decisions'
    ]);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();

    const rows: HTMLElement[] = recordRows();
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByText('Tool or task review · kim@contoso.com')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Unrated')).toHaveClass('is-unrated');
    expect(within(rows[0]).getByText(dateTime('2026-09-03T10:00:00Z'))).toHaveClass('ai-admin-record-date');
    expect(within(rows[1]).getByText('Help or training · Sam Example')).toBeInTheDocument();
    expect(within(rows[1]).getByText('High')).toHaveClass('is-high');
    expect(within(rows[1]).getByText('Needs information')).toHaveClass('ai-admin-status');
    expect(within(rows[2]).getByText('Explore an AI idea · Pat Example')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Medium')).toHaveClass('is-medium');
    expect(within(rows[3]).getByText('Governance use case · lee@contoso.com')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Recent decisions' })).toBeInTheDocument();
    expect(screen.getByText('Latest entries from AI CoE Decisions')).toBeInTheDocument();
    const decisionItems: HTMLElement[] = within(screen.getByRole('heading', { name: 'Recent decisions' }).closest('section') as HTMLElement).getAllByRole('listitem');
    expect(decisionItems).toHaveLength(5);
    expect(decisionItems[0].textContent).toBe(`Decision 1UC-1${dateTime('2026-08-11T09:00:00Z')}`);
    expect(decisionItems[1].textContent).toBe(`Decision 2Use case not specified${dateTime('2026-08-12T09:00:00Z')}`);
    expect(decisionItems[2].textContent).toBe(`Decision 3UC-3${dateTime('2026-08-01T09:00:00Z')}`);
    expect(screen.queryByText('Decision title 6')).not.toBeInTheDocument();
  });

  it('filters and searches the queue', async () => {
    await renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'Governance' }));
    expect(screen.getByRole('button', { name: 'Governance' })).toHaveClass('is-active');
    expect(screen.getByText('3 of 5 records shown')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Service requests' }));
    expect(screen.getByText('2 of 5 records shown')).toBeInTheDocument();
    expect(recordRows().map((row: HTMLElement): string | null => row.querySelector('strong')?.textContent ?? null)).toEqual([intakes[2].Title, intakes[1].Title]);
    fireEvent.click(screen.getByRole('button', { name: 'Needs attention' }));
    expect(screen.getByText('2 of 5 records shown')).toBeInTheDocument();
    expect(recordRows().map((row: HTMLElement): string | null => row.querySelector('strong')?.textContent ?? null)).toEqual([intakes[1].Title, 'Standalone use case']);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByPlaceholderText('Search records'), { target: { value: '  KIM ' } });
    expect(screen.getByText('1 of 5 records shown')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search records'), { target: { value: 'reports take' } });
    expect(recordRows().map((row: HTMLElement): string | null => row.querySelector('strong')?.textContent ?? null)).toEqual([intakes[0].Title]);
    fireEvent.change(screen.getByPlaceholderText('Search records'), { target: { value: 'zzz' } });
    expect(screen.getByText('No records match this view.')).toBeInTheDocument();
    expect(screen.getByText('0 of 5 records shown')).toBeInTheDocument();
  });

  it('shows record details with parsed answers and deep links', async () => {
    await renderDashboard();
    expect(screen.getByRole('heading', { name: 'Select a record' })).toBeInTheDocument();
    expect(screen.getByText('Choose a submission to see its answers, governance state, and SharePoint records.')).toBeInTheDocument();

    fireEvent.click(recordRows()[2]);
    expect(recordRows()[2]).toHaveClass('is-selected');
    const detail: HTMLElement = screen.getByRole('complementary');
    expect(within(detail).getByText('RECORD DETAIL')).toBeInTheDocument();
    expect(within(detail).getByRole('heading', { level: 2, name: intakes[0].Title as string })).toBeInTheDocument();
    const summary: HTMLElement = within(detail).getAllByRole('definition')[0].closest('dl') as HTMLElement;
    expect(summary.textContent).toBe(`StatusIn reviewRisk / priorityMediumRequestorPat ExampleSubmitted${dateTime('2026-09-01T10:00:00Z')}`);
    expect(within(detail).getByRole('heading', { name: 'Business problem' }).nextElementSibling).toHaveTextContent('Reports take too long.');
    const confirmed: HTMLElement = within(detail).getByRole('heading', { name: 'Confirmed summary' }).nextElementSibling as HTMLElement;
    expect(confirmed.textContent).toBe('TitleSummarise reportsProblem To SolveSlow');
    const submitted: HTMLElement = within(detail).getByRole('heading', { name: 'Submitted answers' }).nextElementSibling as HTMLElement;
    expect(submitted.textContent).toBe('Work To ImproveReportsInformation Categoriesinternal, publicFlagYesNothingNot providedEmptyNot providedNested{"a":1}');
    expect(within(detail).getByRole('link', { name: 'Open intake record' })).toHaveAttribute('href', `${TEST_SITE_URL}/Lists/AICoEPilotIntakes/DispForm.aspx?ID=11`);
    expect(within(detail).getByRole('link', { name: 'Open governance record' })).toHaveAttribute('href', `${TEST_SITE_URL}/Lists/AI%20CoE%20Use%20Cases/DispForm.aspx?ID=21`);
    expect(within(detail).getByRole('link', { name: 'Open intake record' })).toHaveAttribute('target', '_blank');
    expect(within(detail).getByRole('link', { name: 'Open intake record' })).toHaveAttribute('rel', 'noreferrer');

    fireEvent.click(recordRows()[1]);
    expect(within(detail).queryByRole('heading', { name: 'Confirmed summary' })).not.toBeInTheDocument();
    expect(within(detail).queryByRole('heading', { name: 'Submitted answers' })).not.toBeInTheDocument();
    expect(within(detail).queryByRole('link', { name: 'Open governance record' })).not.toBeInTheDocument();

    fireEvent.click(recordRows()[3]);
    expect(within(detail).queryByRole('link', { name: 'Open intake record' })).not.toBeInTheDocument();
    expect(within(detail).getByRole('link', { name: 'Open governance record' })).toHaveAttribute('href', `${TEST_SITE_URL}/Lists/AI%20CoE%20Use%20Cases/DispForm.aspx?ID=22`);

    fireEvent.click(within(detail).getByRole('button', { name: 'Close record details' }));
    expect(screen.getByRole('heading', { name: 'Select a record' })).toBeInTheDocument();
  });

  it('refreshes on demand and reports connection problems', async () => {
    const { governance, onExit } = await renderDashboard();
    governance.dashboard = { connected: false, intakes: [], useCases: [], decisions: [], message: 'The dashboard could not load SharePoint data. boom' };
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.getByRole('button', { name: 'Refreshing' })).toBeDisabled();
    expect(screen.getByText('Loading live SharePoint records…')).toBeInTheDocument();
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('The dashboard could not load SharePoint data. boom');
    expect(screen.getByText('Connection issue')).not.toHaveClass('is-connected');
    expect(screen.getByText('0 of 0 records shown')).toBeInTheDocument();
    expect(screen.getByText('No decisions recorded yet.')).toBeInTheDocument();
    expect(governance.dashboardCalls).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Front Door' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
