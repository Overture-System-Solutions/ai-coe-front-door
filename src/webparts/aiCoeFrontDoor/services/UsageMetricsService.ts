import { classifyError, failureLogDetail, failureUserMessage, statusError } from './failureClass';
import type { FailureClass } from './failureClass';
import { listItemsUrl } from './GovernanceService';
import type { IListItem, IListResponse, IServiceContext, IUsageAlert, IUsageMetric, IUsageMetricsResult, IUsageMetricsService, UsageProvider } from './types';

export const USAGE_LIST_TITLE: string = 'AI Usage Daily';
export const INCIDENTS_LIST_TITLE: string = 'AI CoE Incidents';

const ACCEPT_HEADER: { [name: string]: string } = { Accept: 'application/json;odata=nometadata' };

const USAGE_QUERY: string = `$select=${['Provider', 'MetricType', 'BucketStartEpoch', 'BucketStart', 'BucketEndEpoch', 'Requests', 'InputTokens', 'OutputTokens', 'Amount', 'Currency'].join(',')}&$orderby=BucketStart desc&$top=5000`;
const INCIDENTS_QUERY: string = `$select=${['Id', 'Title', 'Category', 'Severity', 'Status', 'Provider', 'DetectedAt', 'Details'].join(',')}&$orderby=DetectedAt desc&$top=5000`;

interface IPeriodTotals {
  amount: number;
  requests: number;
  tokens: number;
  outputTokens: number;
}

interface IProviderMetricSpec {
  metricKey: string;
  metricLabel: string;
  unit: 'USD' | 'count';
  select: (totals: IPeriodTotals) => number;
}

interface IProviderMetrics {
  provider: UsageProvider;
  metrics: IProviderMetricSpec[];
}

/**
 * The tiles each feed can fill, in display order. Anthropic's usage report carries no request
 * counts, so the Claude set shows output tokens where the shipped OpenAI set showed requests.
 */
const PROVIDER_METRICS: readonly IProviderMetrics[] = [
  {
    provider: 'anthropic',
    metrics: [
      { metricKey: 'anthropic_api_spend_mtd', metricLabel: 'Claude API spend this month', unit: 'USD', select: (totals: IPeriodTotals): number => totals.amount },
      { metricKey: 'anthropic_api_tokens_mtd', metricLabel: 'Claude API tokens this month', unit: 'count', select: (totals: IPeriodTotals): number => totals.tokens },
      { metricKey: 'anthropic_api_output_tokens_mtd', metricLabel: 'Claude output tokens this month', unit: 'count', select: (totals: IPeriodTotals): number => totals.outputTokens }
    ]
  },
  {
    provider: 'openai',
    metrics: [
      { metricKey: 'openai_api_spend_mtd', metricLabel: 'OpenAI API spend this month', unit: 'USD', select: (totals: IPeriodTotals): number => totals.amount },
      { metricKey: 'openai_api_requests_mtd', metricLabel: 'OpenAI API requests this month', unit: 'count', select: (totals: IPeriodTotals): number => totals.requests },
      { metricKey: 'openai_api_tokens_mtd', metricLabel: 'OpenAI API tokens this month', unit: 'count', select: (totals: IPeriodTotals): number => totals.tokens }
    ]
  }
];

interface IFetchOutcome {
  succeeded: boolean;
  value: IListItem[];
  error?: unknown;
}

export function numberValue(value: unknown): number {
  const parsed: number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown): number {
  if (!value) {
    return 0;
  }
  const time: number = new Date(value as string).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** The bucket start of a usage row: ISO `BucketStart` first, then the epoch seconds fallback. */
export function bucketDate(item: IListItem): Date | undefined {
  if (item.BucketStart) {
    const fromIso: Date = new Date(item.BucketStart as string);
    if (!Number.isNaN(fromIso.getTime())) {
      return fromIso;
    }
  }
  if (typeof item.BucketStartEpoch === 'number') {
    const fromEpoch: Date = new Date(1000 * item.BucketStartEpoch);
    if (!Number.isNaN(fromEpoch.getTime())) {
      return fromEpoch;
    }
  }
  return undefined;
}

/**
 * The feed a usage row belongs to. Rows without a `Provider` are the OpenAI feed the shipped build
 * assumed; unrecognised providers are left out rather than counted under the wrong tile.
 */
export function usageProvider(item: IListItem): UsageProvider | undefined {
  const provider: string = String(item.Provider || '')
    .trim()
    .toLowerCase();
  if (provider === '' || provider === 'openai') {
    return 'openai';
  }
  if (provider === 'anthropic') {
    return 'anthropic';
  }
  return undefined;
}

export function sumPeriod(items: IListItem[], start: Date, end: Date): IPeriodTotals {
  return items.reduce(
    (totals: IPeriodTotals, item: IListItem): IPeriodTotals => {
      const date: Date | undefined = bucketDate(item);
      if (!date || date < start || date >= end) {
        return totals;
      }
      const metricType: string = String(item.MetricType || '').toLowerCase();
      if (metricType === 'cost') {
        totals.amount += numberValue(item.Amount);
      }
      if (metricType === 'completions') {
        totals.requests += numberValue(item.Requests);
        totals.tokens += numberValue(item.InputTokens) + numberValue(item.OutputTokens);
        totals.outputTokens += numberValue(item.OutputTokens);
      }
      return totals;
    },
    { amount: 0, requests: 0, tokens: 0, outputTokens: 0 }
  );
}

export function latestBucketStart(items: IListItem[]): string | undefined {
  const latest: Date | undefined = items.reduce((current: Date | undefined, item: IListItem): Date | undefined => {
    const date: Date | undefined = bucketDate(item);
    return date && (!current || date > current) ? date : current;
  }, undefined);
  return latest === undefined ? undefined : latest.toISOString();
}

export function mapAlert(item: IListItem): IUsageAlert {
  return {
    id: numberValue(item.Id),
    title: String(item.Title || 'AI CoE incident'),
    category: String(item.Category || 'Incident'),
    severity: String(item.Severity || 'Info'),
    status: String(item.Status || 'Open'),
    provider: String(item.Provider || 'Not specified'),
    detectedAt: typeof item.DetectedAt === 'string' ? item.DetectedAt : undefined,
    details: String(item.Details || '')
  };
}

/**
 * Month-to-date and previous-month totals (UTC months) per feed, Claude first. A feed without rows
 * contributes nothing, so its tiles keep showing "Awaiting data".
 */
export function buildUsageMetrics(items: IListItem[], now: Date): IUsageMetric[] {
  const monthStart: Date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart: Date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const previousMonthStart: Date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const metrics: IUsageMetric[] = [];
  for (const feed of PROVIDER_METRICS) {
    const rows: IListItem[] = items.filter((item: IListItem): boolean => usageProvider(item) === feed.provider);
    if (rows.length === 0) {
      continue;
    }
    const current: IPeriodTotals = sumPeriod(rows, monthStart, nextMonthStart);
    const previous: IPeriodTotals = sumPeriod(rows, previousMonthStart, monthStart);
    const shared: Pick<IUsageMetric, 'provider' | 'source' | 'periodStart' | 'periodEnd' | 'scope' | 'refreshedAt' | 'dataStatus'> = {
      provider: feed.provider,
      source: USAGE_LIST_TITLE,
      periodStart: monthStart.toISOString(),
      periodEnd: nextMonthStart.toISOString(),
      scope: 'Organization',
      refreshedAt: latestBucketStart(rows),
      dataStatus: 'Current'
    };
    for (const spec of feed.metrics) {
      metrics.push({ metricKey: spec.metricKey, metricLabel: spec.metricLabel, currentValue: spec.select(current), previousValue: spec.select(previous), unit: spec.unit, ...shared });
    }
  }
  return metrics;
}

/** Reads the usage and incident lists that the companion Power Automate solutions maintain. */
export class UsageMetricsService implements IUsageMetricsService {
  private readonly _context: IServiceContext;
  private readonly _clock: () => Date;

  public constructor(context: IServiceContext, clock: () => Date = (): Date => new Date()) {
    this._context = context;
    this._clock = clock;
  }

  public async getMetrics(): Promise<IUsageMetricsResult> {
    const [usage, incidents] = await Promise.all([
      this._tryGetAllItems(USAGE_LIST_TITLE, USAGE_QUERY),
      this._tryGetAllItems(INCIDENTS_LIST_TITLE, INCIDENTS_QUERY)
    ]);
    // The console gets the status and the class only, never a response body.
    if (!usage.succeeded) {
      console.warn('AI Usage Daily is unavailable', failureLogDetail(usage.error));
    }
    if (!incidents.succeeded) {
      console.warn('AI CoE Incidents is unavailable', failureLogDetail(incidents.error));
    }
    const alerts: IUsageAlert[] = incidents.value
      .filter((item: IListItem): boolean => String(item.Status || '').toLowerCase() === 'open')
      .map(mapAlert)
      .sort((left: IUsageAlert, right: IUsageAlert): number => dateValue(right.detectedAt) - dateValue(left.detectedAt));
    const metrics: IUsageMetric[] = buildUsageMetrics(usage.value, this._clock());
    if (incidents.succeeded) {
      metrics.push({
        metricKey: 'open_coe_alerts',
        metricLabel: 'Open CoE alerts',
        source: INCIDENTS_LIST_TITLE,
        currentValue: alerts.length,
        unit: 'count',
        scope: 'Organization',
        refreshedAt: alerts[0]?.detectedAt,
        dataStatus: alerts.length > 0 ? 'Attention' : 'Clear'
      });
    }
    const connected: boolean = usage.succeeded && incidents.succeeded;
    const message: string = connected
      ? usage.value.length > 0
        ? 'Usage and incident data loaded from SharePoint.'
        : 'The SharePoint lists are connected and awaiting usage data.'
      : usage.succeeded || incidents.succeeded
        ? 'One SharePoint data source is unavailable.'
        : 'SharePoint usage and incident data are unavailable.';
    if (connected) {
      return { connected, metrics, alerts, message };
    }
    // The usage feed is the strip's main source, so its failure names the class when both lists failed.
    const failureClass: FailureClass = classifyError(usage.succeeded ? incidents.error : usage.error);
    return { connected, metrics, alerts, message, failureClass, userMessage: failureUserMessage(failureClass) };
  }

  private async _tryGetAllItems(listTitle: string, query: string): Promise<IFetchOutcome> {
    try {
      return { succeeded: true, value: await this._getAllItems(listTitle, query) };
    } catch (error) {
      return { succeeded: false, value: [], error };
    }
  }

  /** Follows `@odata.nextLink` until the list is exhausted. */
  private async _getAllItems(listTitle: string, query: string): Promise<IListItem[]> {
    let url: string | undefined = `${listItemsUrl(this._context.siteUrl, listTitle)}?${query}`;
    const items: IListItem[] = [];
    while (url) {
      const response: IListResponse = await this._context.client.get(url, this._context.configuration, { headers: ACCEPT_HEADER });
      if (!response.ok) {
        const body: string = await response.text();
        throw statusError(listTitle, response.status, body.slice(0, 240));
      }
      const page: { value?: IListItem[]; '@odata.nextLink'?: string; 'odata.nextLink'?: string } = (await response.json()) as {
        value?: IListItem[];
        '@odata.nextLink'?: string;
        'odata.nextLink'?: string;
      };
      items.push(...(page.value || []));
      url = page['@odata.nextLink'] || page['odata.nextLink'];
    }
    return items;
  }
}
