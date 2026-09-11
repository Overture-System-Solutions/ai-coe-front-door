import * as React from 'react';
import { useFrontDoor } from '../context/FrontDoorContext';
import { ChevronLeft, ChevronRight, CircleCheck, Clock3, ExternalLink, Inbox, LayoutDashboard, RefreshCw, Search, ShieldAlert, X } from '../icons';
import type { IAdminDashboardData, IListItem } from '../services/types';
import { includes } from '../utils/collections';

export interface IGovernanceAdminDashboardProps {
  onExit: () => void;
}

/** One row of the queue: an intake merged with its governance use case, or a use case on its own. */
export interface IDashboardRecord {
  key: string;
  intake?: IListItem;
  useCase?: IListItem;
  title: string;
  workflow: string;
  requestor: string;
  requestorEmail: string;
  submittedAt: string | undefined;
  status: string;
  risk: string;
  /** True for records that have (or are) a governance use case. */
  governance: boolean;
}

type QueueFilter = 'all' | 'governance' | 'service' | 'attention';

interface IDashboardState {
  loading: boolean;
  data: IAdminDashboardData | undefined;
  message: string;
}

const FILTERS: readonly [QueueFilter, string][] = [
  ['all', 'All'],
  ['governance', 'Governance'],
  ['service', 'Service requests'],
  ['attention', 'Needs attention']
];

const WORKFLOW_LABELS: { [workflow: string]: string } = {
  idea: 'Explore an AI idea',
  toolCheck: 'Tool or task guidance',
  'toolCheck-review-request': 'Tool or task review',
  teamUsage: 'Register team AI use',
  helpTraining: 'Help or training',
  feedback: 'Feedback'
};

const CLOSED_STATUSES: readonly string[] = ['approved', 'declined', 'closed'];
const EMPTY_DATA: IAdminDashboardData = { connected: false, intakes: [], useCases: [], decisions: [], message: '' };
const MAX_DECISIONS: number = 5;

/** "Sep 1, 2026, 10:00 AM" for a parseable timestamp; the raw value when not; "Not available" when empty. */
export function formatDateTime(value: unknown): string {
  if (!value) {
    return 'Not available';
  }
  const date: Date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

/** Display text of a stored answer: joined lists, JSON for objects, Yes/No, "Not provided" for blanks. */
export function formatAnswerValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(formatAnswerValue).join(', ');
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }
  if (value === true) {
    return 'Yes';
  }
  if (value === false) {
    return 'No';
  }
  if (value === undefined || value === null || value === '') {
    return 'Not provided';
  }
  return String(value);
}

/** "workToImprove" → "Work to improve". */
export function humanizeKey(key: string): string {
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (first: string): string => first.toUpperCase());
}

function text(item: IListItem | undefined, field: string): string {
  const value: unknown = item === undefined ? undefined : item[field];
  return value === undefined || value === null ? '' : String(value);
}

function idOf(item: IListItem | undefined): number | undefined {
  const value: unknown = item === undefined ? undefined : item.Id;
  return typeof value === 'number' ? value : undefined;
}

/** Pairs each intake with the use case carrying its intake id, then appends the unpaired use cases. */
export function buildRecords(intakes: IListItem[], useCases: IListItem[]): IDashboardRecord[] {
  const pairedUseCases: { [id: string]: true } = {};
  const fromIntakes: IDashboardRecord[] = intakes.map((intake: IListItem): IDashboardRecord => {
    const intakeId: string = text(intake, 'IntakeId');
    const useCase: IListItem | undefined = useCases.filter((candidate: IListItem): boolean => {
      const paired: boolean = intakeId !== '' && (text(candidate, 'CoEID') === intakeId || text(candidate, 'Title').indexOf(intakeId) >= 0);
      if (paired) {
        pairedUseCases[text(candidate, 'Id')] = true;
      }
      return paired;
    })[0];
    return {
      key: `intake-${text(intake, 'Id')}`,
      intake,
      useCase,
      title: text(intake, 'Title') || text(useCase, 'Title') || intakeId,
      workflow: text(intake, 'WorkflowType'),
      requestor: text(intake, 'RequestorName') || text(intake, 'RequestorEmail') || text(useCase, 'SubmitterEmail') || 'Unknown',
      requestorEmail: text(intake, 'RequestorEmail') || text(useCase, 'SubmitterEmail'),
      submittedAt: text(intake, 'SubmittedAt') || text(intake, 'Created') || text(useCase, 'Created') || undefined,
      status: text(useCase, 'Status') || text(intake, 'Status') || 'Submitted',
      risk: text(useCase, 'RiskTier') || text(intake, 'Priority') || 'Unrated',
      governance: useCase !== undefined || intake.PilotOnly === false
    };
  });
  const standalone: IDashboardRecord[] = useCases
    .filter((useCase: IListItem): boolean => pairedUseCases[text(useCase, 'Id')] !== true)
    .map(
      (useCase: IListItem): IDashboardRecord => ({
        key: `usecase-${text(useCase, 'Id')}`,
        useCase,
        title: text(useCase, 'Title') || text(useCase, 'CoEID') || `Use case ${text(useCase, 'Id')}`,
        workflow: '',
        requestor: text(useCase, 'SubmitterEmail') || text(useCase, 'BusinessOwnerEmail') || 'Unknown',
        requestorEmail: text(useCase, 'SubmitterEmail') || text(useCase, 'BusinessOwnerEmail'),
        submittedAt: text(useCase, 'Created') || undefined,
        status: text(useCase, 'Status') || 'Submitted',
        risk: text(useCase, 'RiskTier') || 'Unrated',
        governance: true
      })
    );
  return fromIntakes.concat(standalone).sort(
    (a: IDashboardRecord, b: IDashboardRecord): number => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime()
  );
}

function matchesFilter(record: IDashboardRecord, filter: QueueFilter): boolean {
  const status: string = record.status.toLowerCase();
  const risk: string = record.risk.toLowerCase();
  switch (filter) {
    case 'governance':
      return record.governance;
    case 'service':
      return !record.governance;
    case 'attention':
      return risk === 'high' || status.indexOf('information') >= 0 || status.indexOf('rejected') >= 0;
    default:
      return true;
  }
}

function matchesSearch(record: IDashboardRecord, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystack: string = [
    record.title,
    record.requestor,
    record.requestorEmail,
    record.status,
    record.risk,
    text(record.intake, 'IntakeId'),
    text(record.useCase, 'CoEID'),
    text(record.useCase, 'BusinessProblem')
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.indexOf(query) >= 0;
}

type PayloadObject = { [key: string]: unknown };

function parsePayload(raw: unknown): PayloadObject {
  if (!raw) {
    return {};
  }
  if (typeof raw === 'object') {
    return raw as PayloadObject;
  }
  try {
    const parsed: unknown = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? (parsed as PayloadObject) : {};
  } catch {
    return { submission: String(raw) };
  }
}

function answerSections(record: IDashboardRecord | undefined): [string, PayloadObject][] {
  if (record === undefined) {
    return [];
  }
  const payload: PayloadObject = parsePayload(record.intake === undefined ? undefined : record.intake.PayloadJson);
  const candidates: [string, unknown][] = [
    ['Confirmed summary', payload.confirmedSummary],
    ['Submitted answers', payload.originalAnswers || payload.answers]
  ];
  return candidates.filter((entry: [string, unknown]): boolean => Boolean(entry[1]) && typeof entry[1] === 'object') as [string, PayloadObject][];
}

function workflowLabel(record: IDashboardRecord): string {
  return WORKFLOW_LABELS[record.workflow] || record.workflow || 'Governance use case';
}

/** Administrator view: queue of submissions and use cases, record details, and recent decisions. */
export function GovernanceAdminDashboard({ onExit }: IGovernanceAdminDashboardProps): React.ReactElement {
  const { siteUrl, services } = useFrontDoor();
  const governance: typeof services.governance = services.governance;
  const [state, setState] = React.useState<IDashboardState>({ loading: true, data: undefined, message: 'Loading governance data…' });
  const [filter, setFilter] = React.useState<QueueFilter>('all');
  const [search, setSearch] = React.useState<string>('');
  const [selected, setSelected] = React.useState<IDashboardRecord | undefined>(undefined);

  React.useEffect((): (() => void) => {
    let cancelled: boolean = false;
    governance.getAdminDashboardData().then(
      (data: IAdminDashboardData): void => {
        if (!cancelled) {
          setState({ loading: false, data, message: data.message });
        }
      },
      (): void => undefined
    );
    return (): void => {
      cancelled = true;
    };
  }, [governance]);

  const refresh = (): void => {
    setState((current: IDashboardState): IDashboardState => ({ ...current, loading: true, message: 'Refreshing governance data…' }));
    governance.getAdminDashboardData().then(
      (data: IAdminDashboardData): void => setState({ loading: false, data, message: data.message }),
      (): void => undefined
    );
  };

  const data: IAdminDashboardData = state.data ?? EMPTY_DATA;
  const records: IDashboardRecord[] = React.useMemo((): IDashboardRecord[] => buildRecords(data.intakes, data.useCases), [data.intakes, data.useCases]);
  const query: string = search.trim().toLowerCase();
  const visible: IDashboardRecord[] = records.filter((record: IDashboardRecord): boolean => matchesFilter(record, filter) && matchesSearch(record, query));
  const openGovernanceItems: number = data.useCases.filter((useCase: IListItem): boolean => !includes(CLOSED_STATUSES, text(useCase, 'Status').toLowerCase())).length;
  const highPriorityItems: number = records.filter((record: IDashboardRecord): boolean => record.risk.toLowerCase() === 'high').length;
  const sections: [string, PayloadObject][] = answerSections(selected);
  const siteRoot: string = String(siteUrl || '').replace(/\/$/, '');
  const selectedIntakeId: number | undefined = idOf(selected?.intake);
  const selectedUseCaseId: number | undefined = idOf(selected?.useCase);
  const businessProblem: string = text(selected?.useCase, 'BusinessProblem');

  return (
    <div className="ai-admin-dashboard">
      <div className="ai-admin-toolbar">
        <button type="button" className="overture-btn-ghost ai-admin-back" onClick={onExit}>
          <ChevronLeft aria-hidden="true" /> Front Door
        </button>
        <button type="button" className="overture-btn-secondary ai-admin-refresh" onClick={refresh} disabled={state.loading}>
          <RefreshCw className={state.loading ? 'is-spinning' : ''} aria-hidden="true" />
          {state.loading ? 'Refreshing' : 'Refresh'}
        </button>
      </div>
      <header className="ai-admin-header">
        <div>
          <span className="ai-usage-kicker">ADMINISTRATOR VIEW</span>
          <h1>AI CoE Admin Dashboard</h1>
          <p>Review Front Door submissions, governance progress, risk, and recorded decisions.</p>
        </div>
        <span className={`ai-admin-connection ${data.connected ? 'is-connected' : ''}`}>{data.connected ? 'SharePoint connected' : 'Connection issue'}</span>
      </header>
      <section className="ai-admin-metrics" aria-label="AI CoE administration summary">
        <article className="ai-admin-metric is-teal">
          <Inbox aria-hidden="true" />
          <div>
            <strong>{data.intakes.length}</strong>
            <span>Front Door submissions</span>
          </div>
        </article>
        <article className="ai-admin-metric is-blue">
          <Clock3 aria-hidden="true" />
          <div>
            <strong>{openGovernanceItems}</strong>
            <span>Open governance items</span>
          </div>
        </article>
        <article className="ai-admin-metric is-violet">
          <ShieldAlert aria-hidden="true" />
          <div>
            <strong>{highPriorityItems}</strong>
            <span>High-priority items</span>
          </div>
        </article>
        <article className="ai-admin-metric is-gold">
          <CircleCheck aria-hidden="true" />
          <div>
            <strong>{data.decisions.length}</strong>
            <span>Recorded decisions</span>
          </div>
        </article>
      </section>
      {!data.connected && !state.loading && (
        <div className="ai-admin-error" role="alert">
          {state.message}
        </div>
      )}
      <section className="ai-admin-workspace">
        <div className="ai-admin-queue">
          <div className="ai-admin-queue-heading">
            <div>
              <h2>Submission and governance queue</h2>
              <p>{`${visible.length} of ${records.length} records shown`}</p>
            </div>
            <label className="ai-admin-search">
              <Search aria-hidden="true" />
              <span className="sr-only">Search records</span>
              <input value={search} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setSearch(event.target.value)} placeholder="Search records" />
            </label>
          </div>
          <div className="ai-admin-filters" role="group" aria-label="Filter records">
            {FILTERS.map(
              ([key, label]: [QueueFilter, string]): React.ReactElement => (
                <button key={key} type="button" className={filter === key ? 'is-active' : ''} onClick={(): void => setFilter(key)}>
                  {label}
                </button>
              )
            )}
          </div>
          {state.loading ? (
            <div className="ai-admin-empty">Loading live SharePoint records…</div>
          ) : visible.length === 0 ? (
            <div className="ai-admin-empty">No records match this view.</div>
          ) : (
            <div className="ai-admin-records">
              {visible.map(
                (record: IDashboardRecord): React.ReactElement => (
                  <button
                    key={record.key}
                    type="button"
                    className={`ai-admin-record ${selected?.key === record.key ? 'is-selected' : ''}`}
                    onClick={(): void => setSelected(record)}
                  >
                    <span className="ai-admin-record-main">
                      <strong>{record.title}</strong>
                      <small>{`${workflowLabel(record)} · ${record.requestor}`}</small>
                    </span>
                    <span className="ai-admin-record-date">{formatDateTime(record.submittedAt)}</span>
                    <span className={`ai-admin-pill is-${record.risk.toLowerCase().replace(/\s+/g, '-')}`}>{record.risk}</span>
                    <span className="ai-admin-status">{record.status}</span>
                    <ChevronRight aria-hidden="true" />
                  </button>
                )
              )}
            </div>
          )}
        </div>
        <aside className="ai-admin-detail" aria-live="polite">
          {selected ? (
            <>
              <div className="ai-admin-detail-heading">
                <div>
                  <span className="ai-usage-kicker">RECORD DETAIL</span>
                  <h2>{selected.title}</h2>
                </div>
                <button type="button" onClick={(): void => setSelected(undefined)} aria-label="Close record details">
                  <X aria-hidden="true" />
                </button>
              </div>
              <dl className="ai-admin-detail-grid">
                <div>
                  <dt>Status</dt>
                  <dd>{selected.status}</dd>
                </div>
                <div>
                  <dt>Risk / priority</dt>
                  <dd>{selected.risk}</dd>
                </div>
                <div>
                  <dt>Requestor</dt>
                  <dd>{selected.requestor}</dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>{formatDateTime(selected.submittedAt)}</dd>
                </div>
              </dl>
              {businessProblem && (
                <section className="ai-admin-detail-section">
                  <h3>Business problem</h3>
                  <p>{businessProblem}</p>
                </section>
              )}
              {sections.map(
                ([title, values]: [string, PayloadObject]): React.ReactElement => (
                  <section className="ai-admin-detail-section" key={title}>
                    <h3>{title}</h3>
                    <dl className="ai-admin-answer-list">
                      {Object.keys(values).map(
                        (key: string): React.ReactElement => (
                          <div key={key}>
                            <dt>{humanizeKey(key)}</dt>
                            <dd>{formatAnswerValue(values[key])}</dd>
                          </div>
                        )
                      )}
                    </dl>
                  </section>
                )
              )}
              <div className="ai-admin-detail-links">
                {selectedIntakeId !== undefined && (
                  <a href={`${siteRoot}/Lists/AICoEPilotIntakes/DispForm.aspx?ID=${selectedIntakeId}`} target="_blank" rel="noreferrer">
                    Open intake record <ExternalLink aria-hidden="true" />
                  </a>
                )}
                {selectedUseCaseId !== undefined && (
                  <a href={`${siteRoot}/Lists/AI%20CoE%20Use%20Cases/DispForm.aspx?ID=${selectedUseCaseId}`} target="_blank" rel="noreferrer">
                    Open governance record <ExternalLink aria-hidden="true" />
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className="ai-admin-detail-empty">
              <LayoutDashboard aria-hidden="true" />
              <h2>Select a record</h2>
              <p>Choose a submission to see its answers, governance state, and SharePoint records.</p>
            </div>
          )}
        </aside>
      </section>
      <section className="ai-admin-decisions">
        <div>
          <h2>Recent decisions</h2>
          <p>Latest entries from AI CoE Decisions</p>
        </div>
        {data.decisions.length === 0 ? (
          <span>No decisions recorded yet.</span>
        ) : (
          <ul>
            {data.decisions.slice(0, MAX_DECISIONS).map(
              (decision: IListItem): React.ReactElement => (
                <li key={text(decision, 'Id')}>
                  <strong>{text(decision, 'Decision') || text(decision, 'Title')}</strong>
                  <span>{text(decision, 'UseCaseID') || 'Use case not specified'}</span>
                  <time>{formatDateTime(text(decision, 'DecisionDate') || text(decision, 'Created'))}</time>
                </li>
              )
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
