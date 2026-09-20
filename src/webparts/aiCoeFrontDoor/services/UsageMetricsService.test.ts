import { createFakeListClient, InMemoryListStore } from '../../../testing/listStore';
import type { IRecordedRequest } from '../../../testing/listStore';
import type { IServiceContext, IUsageMetric, IUsageMetricsResult } from './types';
import { INCIDENTS_LIST_TITLE, USAGE_LIST_TITLE, UsageMetricsService, usageProvider } from './UsageMetricsService';

const NOW: Date = new Date(Date.UTC(2026, 8, 11, 12, 0, 0));

function createHarness(pageSize?: number): { store: InMemoryListStore; service: UsageMetricsService } {
  const store: InMemoryListStore = new InMemoryListStore([USAGE_LIST_TITLE, INCIDENTS_LIST_TITLE], pageSize);
  const context: IServiceContext = {
    siteUrl: 'https://example.sharepoint.com/sites/demo/',
    user: { displayName: 'Pat', email: 'pat@example.com' },
    client: createFakeListClient(store),
    configuration: 'v1'
  };
  return { store, service: new UsageMetricsService(context, (): Date => NOW) };
}

/** Rows without a Provider column, as the shipped 1.0.0.7 build expected them. */
const usageRows: object[] = [
  { MetricType: 'cost', BucketStart: '2026-09-01T00:00:00Z', Amount: 10.5 },
  { MetricType: 'cost', BucketStart: '2026-09-05T00:00:00Z', Amount: '4.5' },
  { MetricType: 'completions', BucketStart: '2026-09-02T00:00:00Z', Requests: 3, InputTokens: 100, OutputTokens: 50 },
  { MetricType: 'Completions', BucketStartEpoch: Date.UTC(2026, 8, 3) / 1000, Requests: 2, InputTokens: 10, OutputTokens: 5 },
  { MetricType: 'cost', BucketStart: '2026-08-20T00:00:00Z', Amount: 7 },
  { MetricType: 'completions', BucketStart: '2026-08-21T00:00:00Z', Requests: 1, InputTokens: 1, OutputTokens: 1 },
  { MetricType: 'cost', BucketStart: '2026-10-01T00:00:00Z', Amount: 99 },
  { MetricType: 'cost', BucketStart: 'not a date', Amount: 99 },
  { MetricType: 'other', BucketStart: '2026-09-06T00:00:00Z', Amount: 99 }
];

/** Rows as the Claude telemetry flow writes them, mixed with OpenAI, blank and unknown providers. */
const mixedProviderRows: object[] = [
  { Provider: 'anthropic', MetricType: 'cost', BucketStart: '2026-09-01T00:00:00Z', Amount: 12.5, Currency: 'USD' },
  { Provider: 'anthropic', MetricType: 'cost', BucketStart: '2026-09-04T00:00:00Z', Amount: 2.5, Currency: 'USD' },
  { Provider: 'anthropic', MetricType: 'completions', BucketStart: '2026-09-02T00:00:00Z', Model: 'claude-sonnet-5', InputTokens: 1000, OutputTokens: 200 },
  { Provider: 'anthropic', MetricType: 'completions', BucketStart: '2026-09-02T00:00:00Z', Model: 'claude-opus-5', InputTokens: 500, OutputTokens: 100 },
  { Provider: 'anthropic', MetricType: 'cost', BucketStart: '2026-08-15T00:00:00Z', Amount: 5 },
  { Provider: 'anthropic', MetricType: 'completions', BucketStart: '2026-08-15T00:00:00Z', InputTokens: 100, OutputTokens: 50 },
  { Provider: 'OpenAI', MetricType: 'cost', BucketStart: '2026-09-03T00:00:00Z', Amount: 3 },
  { MetricType: 'completions', BucketStart: '2026-09-03T00:00:00Z', Requests: 4, InputTokens: 40, OutputTokens: 2 },
  { Provider: 'azure', MetricType: 'cost', BucketStart: '2026-09-03T00:00:00Z', Amount: 999 }
];

const incidentRows: object[] = [
  { Title: 'Spend spike', Category: 'Cost', Severity: 'High', Status: 'Open', Provider: 'OpenAI', DetectedAt: '2026-09-09T08:00:00Z', Details: 'Overage' },
  { Title: 'Old issue', Status: 'Closed', DetectedAt: '2026-09-01T08:00:00Z' },
  { Status: 'open', DetectedAt: '2026-09-10T08:00:00Z' }
];

const keys = (metrics: IUsageMetric[]): string[] => metrics.map((metric: IUsageMetric): string => metric.metricKey);

describe('usageProvider', () => {
  it('files blank rows under OpenAI, recognises Anthropic and ignores the rest', () => {
    expect(usageProvider({})).toBe('openai');
    expect(usageProvider({ Provider: '' })).toBe('openai');
    expect(usageProvider({ Provider: ' OpenAI ' })).toBe('openai');
    expect(usageProvider({ Provider: 'anthropic' })).toBe('anthropic');
    expect(usageProvider({ Provider: 'Anthropic' })).toBe('anthropic');
    expect(usageProvider({ Provider: 'azure' })).toBeUndefined();
  });
});

describe('UsageMetricsService.getMetrics', () => {
  it('requests both lists with the provider column and the shipped query strings', async () => {
    const { store, service } = createHarness();
    await service.getMetrics();
    const urls: string[] = store.requests.map((request: IRecordedRequest): string => request.url);
    expect(urls).toEqual([
      "https://example.sharepoint.com/sites/demo/_api/web/lists/getbytitle('AI Usage Daily')/items?$select=Provider,MetricType,BucketStartEpoch,BucketStart,BucketEndEpoch,Requests,InputTokens,OutputTokens,Amount,Currency&$orderby=BucketStart desc&$top=5000",
      "https://example.sharepoint.com/sites/demo/_api/web/lists/getbytitle('AI CoE Incidents')/items?$select=Id,Title,Category,Severity,Status,Provider,DetectedAt,Details&$orderby=DetectedAt desc&$top=5000"
    ]);
    expect(store.requests[0].headers).toEqual({ Accept: 'application/json;odata=nometadata' });
  });

  it('aggregates the current and previous UTC month and lists open alerts', async () => {
    const { store, service } = createHarness();
    store.seed(USAGE_LIST_TITLE, usageRows);
    store.seed(INCIDENTS_LIST_TITLE, incidentRows);
    const result: IUsageMetricsResult = await service.getMetrics();

    expect(result.connected).toBe(true);
    expect(result.message).toBe('Usage and incident data loaded from SharePoint.');
    expect(result.metrics).toEqual([
      {
        metricKey: 'openai_api_spend_mtd',
        metricLabel: 'OpenAI API spend this month',
        provider: 'openai',
        source: 'AI Usage Daily',
        currentValue: 15,
        previousValue: 7,
        unit: 'USD',
        periodStart: '2026-09-01T00:00:00.000Z',
        periodEnd: '2026-10-01T00:00:00.000Z',
        scope: 'Organization',
        refreshedAt: '2026-10-01T00:00:00.000Z',
        dataStatus: 'Current'
      },
      {
        metricKey: 'openai_api_requests_mtd',
        metricLabel: 'OpenAI API requests this month',
        provider: 'openai',
        source: 'AI Usage Daily',
        currentValue: 5,
        previousValue: 1,
        unit: 'count',
        periodStart: '2026-09-01T00:00:00.000Z',
        periodEnd: '2026-10-01T00:00:00.000Z',
        scope: 'Organization',
        refreshedAt: '2026-10-01T00:00:00.000Z',
        dataStatus: 'Current'
      },
      {
        metricKey: 'openai_api_tokens_mtd',
        metricLabel: 'OpenAI API tokens this month',
        provider: 'openai',
        source: 'AI Usage Daily',
        currentValue: 165,
        previousValue: 2,
        unit: 'count',
        periodStart: '2026-09-01T00:00:00.000Z',
        periodEnd: '2026-10-01T00:00:00.000Z',
        scope: 'Organization',
        refreshedAt: '2026-10-01T00:00:00.000Z',
        dataStatus: 'Current'
      },
      {
        metricKey: 'open_coe_alerts',
        metricLabel: 'Open CoE alerts',
        source: 'AI CoE Incidents',
        currentValue: 2,
        unit: 'count',
        scope: 'Organization',
        refreshedAt: '2026-09-10T08:00:00Z',
        dataStatus: 'Attention'
      }
    ]);
    expect(result.alerts).toEqual([
      { id: 12, title: 'AI CoE incident', category: 'Incident', severity: 'Info', status: 'open', provider: 'Not specified', detectedAt: '2026-09-10T08:00:00Z', details: '' },
      { id: 10, title: 'Spend spike', category: 'Cost', severity: 'High', status: 'Open', provider: 'OpenAI', detectedAt: '2026-09-09T08:00:00Z', details: 'Overage' }
    ]);
  });

  it('sums each provider separately, Claude first, and ignores unknown providers', async () => {
    const { store, service } = createHarness();
    store.seed(USAGE_LIST_TITLE, mixedProviderRows);
    const result: IUsageMetricsResult = await service.getMetrics();
    expect(keys(result.metrics)).toEqual([
      'anthropic_api_spend_mtd',
      'anthropic_api_tokens_mtd',
      'anthropic_api_output_tokens_mtd',
      'openai_api_spend_mtd',
      'openai_api_requests_mtd',
      'openai_api_tokens_mtd',
      'open_coe_alerts'
    ]);
    const byKey: { [key: string]: IUsageMetric } = {};
    for (const metric of result.metrics) {
      byKey[metric.metricKey] = metric;
    }
    expect(byKey.anthropic_api_spend_mtd).toMatchObject({
      metricLabel: 'Claude API spend this month',
      provider: 'anthropic',
      unit: 'USD',
      currentValue: 15,
      previousValue: 5,
      refreshedAt: '2026-09-04T00:00:00.000Z',
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-10-01T00:00:00.000Z',
      source: 'AI Usage Daily',
      scope: 'Organization',
      dataStatus: 'Current'
    });
    expect(byKey.anthropic_api_tokens_mtd).toMatchObject({ metricLabel: 'Claude API tokens this month', provider: 'anthropic', unit: 'count', currentValue: 1800, previousValue: 150 });
    expect(byKey.anthropic_api_output_tokens_mtd).toMatchObject({ metricLabel: 'Claude output tokens this month', provider: 'anthropic', unit: 'count', currentValue: 300, previousValue: 50 });
    expect(byKey.openai_api_spend_mtd).toMatchObject({ provider: 'openai', unit: 'USD', currentValue: 3, previousValue: 0, refreshedAt: '2026-09-03T00:00:00.000Z' });
    expect(byKey.openai_api_requests_mtd).toMatchObject({ provider: 'openai', currentValue: 4, previousValue: 0 });
    expect(byKey.openai_api_tokens_mtd).toMatchObject({ provider: 'openai', currentValue: 42, previousValue: 0 });
    expect(byKey.open_coe_alerts.provider).toBeUndefined();
  });

  it('reports only the providers that have rows', async () => {
    const { store, service } = createHarness();
    store.seed(
      USAGE_LIST_TITLE,
      mixedProviderRows.filter((row: object): boolean => (row as { Provider?: string }).Provider === 'anthropic')
    );
    const result: IUsageMetricsResult = await service.getMetrics();
    expect(keys(result.metrics)).toEqual(['anthropic_api_spend_mtd', 'anthropic_api_tokens_mtd', 'anthropic_api_output_tokens_mtd', 'open_coe_alerts']);
  });

  it('reports an empty but connected state and a Clear alert count', async () => {
    const { service } = createHarness();
    const result: IUsageMetricsResult = await service.getMetrics();
    expect(result.connected).toBe(true);
    expect(result.message).toBe('The SharePoint lists are connected and awaiting usage data.');
    expect(result.metrics).toEqual([
      { metricKey: 'open_coe_alerts', metricLabel: 'Open CoE alerts', source: 'AI CoE Incidents', currentValue: 0, unit: 'count', scope: 'Organization', refreshedAt: undefined, dataStatus: 'Clear' }
    ]);
    expect(result.alerts).toEqual([]);
  });

  it('follows @odata.nextLink pages', async () => {
    const { store, service } = createHarness(2);
    store.seed(USAGE_LIST_TITLE, usageRows);
    const result: IUsageMetricsResult = await service.getMetrics();
    const usageRequests: IRecordedRequest[] = store.requests.filter((request: IRecordedRequest): boolean => request.list === USAGE_LIST_TITLE);
    expect(usageRequests).toHaveLength(5);
    expect(usageRequests[1].query.$skiptoken).toBe('2');
    expect(result.metrics[0].currentValue).toBe(15);
    expect(result.metrics[1].currentValue).toBe(5);
  });

  it('tolerates one unavailable list', async () => {
    const warnSpy: jest.SpyInstance = jest.spyOn(console, 'warn').mockImplementation((): void => undefined);
    try {
      const usageDown: { store: InMemoryListStore; service: UsageMetricsService } = createHarness();
      usageDown.store.fail(USAGE_LIST_TITLE, 404, 'missing');
      usageDown.store.seed(INCIDENTS_LIST_TITLE, incidentRows);
      const withoutUsage: IUsageMetricsResult = await usageDown.service.getMetrics();
      expect(withoutUsage.connected).toBe(false);
      expect(withoutUsage.message).toBe('One SharePoint data source is unavailable.');
      expect(keys(withoutUsage.metrics)).toEqual(['open_coe_alerts']);
      expect(withoutUsage.alerts).toHaveLength(2);
      expect(withoutUsage.failureClass).toBe('SOURCE');
      expect(withoutUsage.userMessage).toBe('Not available on this site.');
      expect(warnSpy).toHaveBeenCalledWith('AI Usage Daily is unavailable', 'AI Usage Daily returned 404 (SOURCE)');

      const incidentsDown: { store: InMemoryListStore; service: UsageMetricsService } = createHarness();
      incidentsDown.store.fail(INCIDENTS_LIST_TITLE);
      incidentsDown.store.seed(USAGE_LIST_TITLE, usageRows);
      const withoutIncidents: IUsageMetricsResult = await incidentsDown.service.getMetrics();
      expect(keys(withoutIncidents.metrics)).toEqual(['openai_api_spend_mtd', 'openai_api_requests_mtd', 'openai_api_tokens_mtd']);
      expect(withoutIncidents.alerts).toEqual([]);
      expect(withoutIncidents.failureClass).toBe('TRANSIENT');
      expect(withoutIncidents.userMessage).toBe('Not available right now; try again.');
      expect(warnSpy).toHaveBeenCalledWith('AI CoE Incidents is unavailable', 'AI CoE Incidents returned 500 (TRANSIENT)');

      const bothDown: { store: InMemoryListStore; service: UsageMetricsService } = createHarness();
      bothDown.store.fail(USAGE_LIST_TITLE, 403, '{"error":"Access denied token=eyJabc"}');
      bothDown.store.fail(INCIDENTS_LIST_TITLE);
      const nothing: IUsageMetricsResult = await bothDown.service.getMetrics();
      expect(nothing).toEqual({
        connected: false,
        metrics: [],
        alerts: [],
        message: 'SharePoint usage and incident data are unavailable.',
        failureClass: 'PERMISSION',
        userMessage: 'Needs access.'
      });
      expect(warnSpy).toHaveBeenCalledWith('AI Usage Daily is unavailable', 'AI Usage Daily returned 403 (PERMISSION)');

      const connected: { store: InMemoryListStore; service: UsageMetricsService } = createHarness();
      const fine: IUsageMetricsResult = await connected.service.getMetrics();
      expect(fine.connected).toBe(true);
      expect(fine.failureClass).toBeUndefined();
      expect(fine.userMessage).toBeUndefined();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
