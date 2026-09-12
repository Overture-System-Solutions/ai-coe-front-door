import type { SubmissionWorkflowType } from '../workflows/types';

/** Outcome of writing a submission to SharePoint. `connected` is false when the write failed. */
export interface ISubmissionResult {
  connected: boolean;
  intakeId?: string;
  itemId?: number;
  itemUrl?: string;
  governanceItemId?: number;
  governanceItemUrl?: string;
  message: string;
}

/** A SharePoint list item as returned by the REST API with `odata=nometadata`. */
export interface IListItem {
  [field: string]: unknown;
}

export interface IAdminDashboardData {
  connected: boolean;
  intakes: IListItem[];
  useCases: IListItem[];
  decisions: IListItem[];
  message: string;
}

export interface IGovernanceService {
  submitWorkflow(workflowType: SubmissionWorkflowType, payload: unknown): Promise<ISubmissionResult>;
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

export interface IUsageMetricsResult {
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
