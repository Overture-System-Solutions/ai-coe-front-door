import { act, screen, within } from '@testing-library/react';
import * as React from 'react';
import { createDeferred, createFakeUsageService } from '../../../testing/fakeServices';
import type { IDeferred } from '../../../testing/fakeServices';
import { renderWithFrontDoor } from '../../../testing/renderWithFrontDoor';
import type { IUsageAlert, IUsageMetric, IUsageMetricsResult } from '../services/types';
import { formatDelta, formatMetricValue, formatRefreshedAt, truncateDetails, UsageTelemetryStrip } from './UsageTelemetryStrip';

function metric(overrides: Partial<IUsageMetric>): IUsageMetric {
  return {
    metricKey: 'openai_api_spend_mtd',
    metricLabel: 'OpenAI API spend this month',
    source: 'AI Usage Daily',
    currentValue: 0,
    unit: 'count',
    scope: 'Organization',
    dataStatus: 'Current',
    ...overrides
  };
}

function alert(overrides: Partial<IUsageAlert>): IUsageAlert {
  return {
    id: 1,
    title: 'ChatGPT seat overage',
    category: 'Overage',
    severity: 'High',
    status: 'Open',
    provider: 'OpenAI',
    detectedAt: '2026-09-02T08:00:00Z',
    details: 'Seats exceeded.',
    ...overrides
  };
}

const usd: Intl.NumberFormat = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const count: Intl.NumberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function updatedOn(iso: string): string {
  return `Updated ${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('UsageTelemetryStrip formatting', () => {
  it('formats values, deltas, dates and details as the shipped build did', () => {
    expect(formatMetricValue(undefined)).toBe('Awaiting data');
    expect(formatMetricValue(metric({ unit: 'USD', currentValue: 1234.5 }))).toBe(usd.format(1234.5));
    expect(formatMetricValue(metric({ currentValue: 12345.67 }))).toBe(count.format(12345.67));
    expect(formatDelta(undefined)).toBe('No comparison yet');
    expect(formatDelta(metric({ currentValue: 5 }))).toBe('No comparison yet');
    expect(formatDelta(metric({ currentValue: 0, previousValue: 0 }))).toBe('No change');
    expect(formatDelta(metric({ currentValue: 5, previousValue: 0 }))).toBe('First measured activity');
    expect(formatDelta(metric({ currentValue: 110, previousValue: 100 }))).toBe('+10.0% vs prior period');
    expect(formatDelta(metric({ currentValue: 90, previousValue: 100 }))).toBe('-10.0% vs prior period');
    expect(formatDelta(metric({ metricKey: 'open_coe_alerts', currentValue: 0 }))).toBe('No open incidents');
    expect(formatDelta(metric({ metricKey: 'open_coe_alerts', currentValue: 3 }))).toBe('3 requiring attention');
    expect(formatRefreshedAt(undefined)).toBe('Not refreshed yet');
    expect(formatRefreshedAt('yesterday')).toBe('Refresh date unavailable');
    expect(formatRefreshedAt('2026-09-01T12:00:00Z')).toBe(updatedOn('2026-09-01T12:00:00Z'));
    expect(truncateDetails('')).toBe('No additional details supplied.');
    expect(truncateDetails('  spaced   out\n text ')).toBe('spaced out text');
    const long: string = 'x'.repeat(230);
    expect(truncateDetails(long)).toBe(`${'x'.repeat(217)}…`);
    expect(truncateDetails('y'.repeat(220))).toBe('y'.repeat(220));
  });
});

describe('UsageTelemetryStrip', () => {
  it('shows the connecting state until the service answers', async () => {
    const deferred: IDeferred<IUsageMetricsResult> = createDeferred<IUsageMetricsResult>();
    renderWithFrontDoor(<UsageTelemetryStrip />, { usage: createFakeUsageService(deferred.promise) });
    expect(screen.getByText('LIVE GOVERNANCE TELEMETRY')).toHaveClass('ai-usage-kicker');
    expect(screen.getByText('Connecting…')).not.toHaveClass('is-connected');
    expect(screen.getAllByText('Pending')).toHaveLength(4);
    expect(screen.getAllByText('Loading…')).toHaveLength(4);
    expect(screen.getByText('Loading alerts…')).toBeInTheDocument();
    expect(screen.getByText(/^Connecting to SharePoint… Aggregate operational metrics/)).toHaveClass('ai-usage-note');
    await act(async () => {
      deferred.resolve({ connected: true, metrics: [], alerts: [], message: 'SharePoint telemetry refresh completed.' });
      await deferred.promise;
    });
    expect(screen.getByText('SharePoint connected')).toHaveClass('is-connected');
    expect(screen.getAllByText('Awaiting data')).toHaveLength(4);
    expect(screen.getAllByText('No comparison yet')).toHaveLength(4);
    expect(screen.getAllByText('Not refreshed yet')).toHaveLength(4);
  });

  it('renders the four tiles from the metrics and the empty alerts state', async () => {
    const result: IUsageMetricsResult = {
      connected: true,
      message: 'SharePoint telemetry refresh completed.',
      alerts: [],
      metrics: [
        metric({ metricKey: 'openai_api_spend_mtd', metricLabel: 'API spend', unit: 'USD', currentValue: 1250, previousValue: 1000, refreshedAt: '2026-09-01T12:00:00Z' }),
        metric({ metricKey: 'openai_api_requests_mtd', currentValue: 42, previousValue: 0, dataStatus: 'Attention' }),
        metric({ metricKey: 'open_coe_alerts', metricLabel: 'Open CoE alerts', source: 'AI CoE Incidents', currentValue: 0 })
      ]
    };
    renderWithFrontDoor(<UsageTelemetryStrip />, { usage: createFakeUsageService(result) });
    await flush();
    const tiles: HTMLElement[] = screen.getAllByRole('article');
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toHaveClass('ai-metric-card--teal');
    expect(within(tiles[0]).getByText('API spend')).toHaveClass('ai-metric-label');
    expect(within(tiles[0]).getByText(usd.format(1250))).toHaveClass('ai-metric-value');
    expect(within(tiles[0]).getByText('+25.0% vs prior period')).toHaveClass('ai-metric-delta');
    expect(within(tiles[0]).getByText('Current')).toHaveClass('is-current');
    expect(within(tiles[0]).getByText(updatedOn('2026-09-01T12:00:00Z'))).toBeInTheDocument();
    expect(within(tiles[1]).getByText('Attention')).toBeInTheDocument();
    expect(within(tiles[1]).getByText('First measured activity')).toBeInTheDocument();
    expect(within(tiles[2]).getByText('OpenAI API tokens this month')).toBeInTheDocument();
    expect(within(tiles[2]).getByText('Pending')).toHaveClass('is-pending');
    expect(within(tiles[2]).getByText('Awaiting data')).toHaveClass('is-pending');
    expect(within(tiles[2]).getByText('AI Usage Daily')).toBeInTheDocument();
    expect(within(tiles[3]).getByText('No open incidents')).toBeInTheDocument();
    expect(screen.getByText('0 open organization alerts')).toBeInTheDocument();
    expect(screen.getByText('No open API, ChatGPT, or Work overage alerts.')).toBeInTheDocument();
    expect(screen.getByText('SharePoint telemetry refresh completed. Aggregate operational metrics and notification metadata only; prompts, conversations, and response content are not stored here.')).toBeInTheDocument();
  });

  it('lists at most three alerts and reports connection problems', async () => {
    const result: IUsageMetricsResult = {
      connected: false,
      message: 'SharePoint telemetry is unavailable: AI Usage Daily could not be read.',
      metrics: [],
      alerts: [
        alert({ id: 1, title: 'First', details: 'd'.repeat(230) }),
        alert({ id: 2, title: 'Second', severity: 'Medium', details: '' }),
        alert({ id: 3, title: 'Third', detectedAt: undefined }),
        alert({ id: 4, title: 'Fourth' })
      ]
    };
    renderWithFrontDoor(<UsageTelemetryStrip />, { usage: createFakeUsageService(result) });
    await flush();
    expect(screen.getByText('Connection issue')).not.toHaveClass('is-connected');
    expect(screen.getByText('4 open organization alerts')).toBeInTheDocument();
    const items: HTMLElement[] = Array.prototype.slice.call(document.querySelectorAll('.ai-alert-item'));
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('First')).toBeInTheDocument();
    expect(within(items[0]).getByText('High')).toHaveClass('is-high');
    expect(within(items[0]).getByText(`${'d'.repeat(217)}…`)).toBeInTheDocument();
    expect(within(items[0]).getByText(updatedOn('2026-09-02T08:00:00Z'))).toBeInTheDocument();
    expect(within(items[1]).getByText('No additional details supplied.')).toBeInTheDocument();
    expect(within(items[1]).getByText('Medium')).toHaveClass('is-medium');
    expect(within(items[2]).getByText('Not refreshed yet')).toBeInTheDocument();
    expect(screen.queryByText('Fourth')).not.toBeInTheDocument();
    expect(screen.getByText(/^SharePoint telemetry is unavailable: AI Usage Daily could not be read\. Aggregate/)).toBeInTheDocument();
  });

  it('uses the singular for one alert', async () => {
    renderWithFrontDoor(<UsageTelemetryStrip />, { usage: createFakeUsageService({ connected: true, metrics: [], alerts: [alert({})], message: 'ok' }) });
    await flush();
    expect(screen.getByText('1 open organization alert')).toBeInTheDocument();
  });

  it('ignores a response that arrives after unmounting', async () => {
    const deferred: IDeferred<IUsageMetricsResult> = createDeferred<IUsageMetricsResult>();
    const error: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
    try {
      const { unmount } = renderWithFrontDoor(<UsageTelemetryStrip />, { usage: createFakeUsageService(deferred.promise) });
      unmount();
      await act(async () => {
        deferred.resolve({ connected: true, metrics: [], alerts: [], message: 'late' });
        await deferred.promise;
      });
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
