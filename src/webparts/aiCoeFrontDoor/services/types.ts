import type { SubmissionPieceType, SubmissionWorkflowType } from '../workflows/types';
import type { FailureClass } from './failureClass';

/**
 * What a failed read or write carries beside its shipped `message`: the class of the failure and a
 * sentence with no response body in it. Absent when the call succeeded.
 */
export interface IFailureFields {
  failureClass?: FailureClass;
  userMessage?: string;
}

/**
 * What a submission came to: `saved` once the row was written and read back, `pending` when the
 * write was accepted but the readback did not confirm it (the row may exist; a retry under the same
 * identifier finds it and never writes twice), `failed` when nothing was accepted.
 */
export type SubmissionState = 'saved' | 'pending' | 'failed';

export interface ISubmitOptions {
  /**
   * The identifier of an earlier attempt. The service looks for the rows that attempt may have left
   * before writing anything, so a retry completes the record instead of duplicating it.
   */
  intakeId?: string;
}

/**
 * Outcome of writing a submission to SharePoint. `connected` is true only for a saved submission;
 * `state` says which of the three outcomes it was (absent on a result from before the readback,
 * which `submissionState` reads through `connected`).
 */
export interface ISubmissionResult extends IFailureFields {
  connected: boolean;
  state?: SubmissionState;
  intakeId?: string;
  itemId?: number;
  itemUrl?: string;
  governanceItemId?: number;
  governanceItemUrl?: string;
  /** When the row was confirmed: its `Modified` stamp as read back, else the moment of the submission. */
  savedAt?: string;
  /** The workflow version written with the row. */
  version?: string;
  message: string;
}

/** The state of any result, including one that predates `state`: connected means saved, anything else failed. */
export function submissionState(result: ISubmissionResult): SubmissionState {
  return result.state ?? (result.connected ? 'saved' : 'failed');
}

/** A SharePoint list item as returned by the REST API with `odata=nometadata`. */
export interface IListItem {
  [field: string]: unknown;
}

export interface IAdminDashboardData extends IFailureFields {
  connected: boolean;
  intakes: IListItem[];
  useCases: IListItem[];
  decisions: IListItem[];
  message: string;
}

export interface IRecoveredSubmission {
  attempt: { workflowType: SubmissionPieceType; payload: unknown; intakeId: string };
  result: ISubmissionResult;
}

export interface IGovernanceService {
  /** Recover an unfinished, server-stored intent without submitting a new request. */
  restoreSubmission?(): Promise<IRecoveredSubmission | undefined>;
  submitWorkflow(workflowType: SubmissionWorkflowType, payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult>;
  /**
   * Writes one outcome record (the answers of the outcome piece) to its own list: choices only, no
   * person named, keyed by `OutcomeId` and read back before it is reported saved. `options.intakeId`
   * carries that key on a retry, so a pending record completes instead of being written twice.
   */
  submitOutcome(payload: unknown, options?: ISubmitOptions): Promise<ISubmissionResult>;
  getAdminDashboardData(): Promise<IAdminDashboardData>;
}

export type MetricDataStatus = 'Current' | 'Attention' | 'Clear';

/** The usage feeds the AI Usage Daily list can carry, as written in its `Provider` column. */
export type UsageProvider = 'anthropic' | 'openai';

export interface IUsageMetric {
  metricKey: string;
  metricLabel: string;
  source: string;
  /** The feed a usage metric was summed from; absent for the incidents metric. */
  provider?: UsageProvider;
  currentValue: number;
  previousValue?: number;
  unit: 'USD' | 'count';
  periodStart?: string;
  periodEnd?: string;
  scope: string;
  refreshedAt?: string;
  dataStatus: MetricDataStatus;
}

export interface IUsageAlert {
  id: number;
  title: string;
  category: string;
  severity: string;
  status: string;
  provider: string;
  detectedAt: string | undefined;
  details: string;
}

export interface IUsageMetricsResult extends IFailureFields {
  connected: boolean;
  metrics: IUsageMetric[];
  alerts: IUsageAlert[];
  message: string;
}

export interface IUsageMetricsService {
  getMetrics(): Promise<IUsageMetricsResult>;
}

/** Minimal structural view of SPHttpClient responses used by the services (and easy to fake in tests). */
export interface IListResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface IListRequestOptions {
  headers: { [name: string]: string };
  body?: string;
}

/** The subset of `SPHttpClient` the services rely on; `configuration` is passed through untouched. */
export interface IListClient {
  get(url: string, configuration: unknown, options: IListRequestOptions): Promise<IListResponse>;
  post(url: string, configuration: unknown, options: IListRequestOptions): Promise<IListResponse>;
}

/** The parts of the SPFx web part context the services read. */
export interface IServiceContext {
  siteUrl: string;
  user: { displayName: string; email: string };
  client: IListClient;
  configuration: unknown;
}
