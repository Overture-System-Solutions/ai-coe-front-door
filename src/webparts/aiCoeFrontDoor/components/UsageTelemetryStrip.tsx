import * as React from 'react';
import { TELEMETRY_ALERTS_COPY, telemetryTilesFor } from '../content/telemetryTiles';
import type { ITelemetryAlertsCopy, ITelemetryTile } from '../content/telemetryTiles';
import { useFrontDoor } from '../context/FrontDoorContext';
import { CircleCheck } from '../icons';
import type { IUsageAlert, IUsageMetric, IUsageMetricsResult } from '../services/types';
import { usePageDocument } from './pages/PageDocumentContext';

export interface IUsageTelemetryStripProps {
  /**
   * The small line above the heading. Blank keeps the shipped line; a page that names one also names
   * its tiles through `vocabulary.telemetry` (by metric key), so the page names the feed, never a provider.
   */
  kicker?: string;
}

export const DEFAULT_TELEMETRY_KICKER: string = 'LIVE GOVERNANCE TELEMETRY';

interface ITelemetryState {
  loading: boolean;
  metrics: IUsageMetric[];
  alerts: IUsageAlert[];
  connected: boolean;
  message: string;
}

const INITIAL_STATE: ITelemetryState = { loading: true, metrics: [], alerts: [], connected: false, message: 'Connecting to SharePoint…' };
const MAX_ALERTS: number = 3;
const MAX_DETAIL_LENGTH: number = 220;

/** "Updated Sep 1, 2026" for a parseable timestamp. */
export function formatRefreshedAt(value: string | undefined): string {
  if (!value) {
    return 'Not refreshed yet';
  }
  const date: Date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Refresh date unavailable'
    : `Updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

/** Currency for USD metrics, otherwise a plain number with at most one decimal. */
export function formatMetricValue(metric: IUsageMetric | undefined): string {
  if (metric === undefined || typeof metric.currentValue !== 'number') {
    return 'Awaiting data';
  }
  if (String(metric.unit).toUpperCase() === 'USD') {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      metric.currentValue
    );
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(metric.currentValue);
}

/** Change against the previous period; the alerts tile describes open incidents instead. */
export function formatDelta(metric: IUsageMetric | undefined): string {
  if (metric?.metricKey === 'open_coe_alerts' && typeof metric.currentValue === 'number') {
    return metric.currentValue === 0 ? 'No open incidents' : `${metric.currentValue} requiring attention`;
  }
  if (metric === undefined || typeof metric.currentValue !== 'number' || typeof metric.previousValue !== 'number') {
    return 'No comparison yet';
  }
  if (metric.previousValue === 0) {
    return metric.currentValue === 0 ? 'No change' : 'First measured activity';
  }
  const change: number = ((metric.currentValue - metric.previousValue) / metric.previousValue) * 100;
  return `${change > 0 ? '+' : ''}${change.toFixed(1)}% vs prior period`;
}

/** Collapses whitespace and cuts long alert details to 220 characters. */
export function truncateDetails(details: string | undefined): string {
  if (!details) {
    return 'No additional details supplied.';
  }
  const text: string = String(details).replace(/\s+/g, ' ').trim();
  return text.length > MAX_DETAIL_LENGTH ? `${text.slice(0, MAX_DETAIL_LENGTH - 3)}…` : text;
}

function metricsByKey(metrics: IUsageMetric[]): { [key: string]: IUsageMetric } {
  const byKey: { [key: string]: IUsageMetric } = {};
  for (const item of metrics) {
    byKey[item.metricKey] = item;
  }
  return byKey;
}

function connectionLabel(state: ITelemetryState): string {
  if (state.loading) {
    return 'Connecting…';
  }
  return state.connected ? 'SharePoint connected' : 'Connection issue';
}

/**
 * The "AI operations snapshot" section of the landing page: the metric tiles of the selected usage
 * feed (four for one provider, seven for both) and open alerts. The service always returns every
 * feed it finds; the mode only decides which tiles are shown.
 */
export function UsageTelemetryStrip({ kicker }: IUsageTelemetryStripProps = {}): React.ReactElement {
  const { services, telemetryProvider } = useFrontDoor();
  const { vocabulary } = usePageDocument();
  const { usage } = services;
  const tiles: ITelemetryTile[] = telemetryTilesFor(telemetryProvider);
  const alertsCopy: ITelemetryAlertsCopy = TELEMETRY_ALERTS_COPY[telemetryProvider];
  const [state, setState] = React.useState<ITelemetryState>(INITIAL_STATE);
  const pageKicker: string = typeof kicker === 'string' ? kicker.trim() : '';
  const kickerText: string = pageKicker === '' ? DEFAULT_TELEMETRY_KICKER : pageKicker;
  // Only a page that names its own kicker names its tiles; the legacy landing page keeps the feed labels verbatim.
  const tileLabel = (tile: ITelemetryTile, item: IUsageMetric | undefined): string =>
    pageKicker !== '' && Object.prototype.hasOwnProperty.call(vocabulary.telemetry, tile.key) ? vocabulary.telemetry[tile.key] : item?.metricLabel || tile.label;

  React.useEffect((): (() => void) => {
    let cancelled: boolean = false;
    usage.getMetrics().then(
      (result: IUsageMetricsResult): void => {
        if (!cancelled) {
          setState({
            loading: false,
            metrics: result.metrics || [],
            alerts: result.alerts || [],
            connected: result.connected,
            message: result.message || 'SharePoint telemetry refresh completed.'
          });
        }
      },
      (): void => undefined
    );
    return (): void => {
      cancelled = true;
    };
  }, [usage]);

  const byKey: { [key: string]: IUsageMetric } = metricsByKey(state.metrics);

  return (
    <section className="ai-usage-section" aria-labelledby="ai-usage-heading">
      <div className="ai-usage-heading-row">
        <div>
          <span className="ai-usage-kicker">{kickerText}</span>
          <h2 id="ai-usage-heading">AI operations snapshot</h2>
        </div>
        <span className={`ai-usage-connection ${state.connected ? 'is-connected' : ''}`}>{connectionLabel(state)}</span>
      </div>
      <div className="ai-usage-grid" aria-live="polite">
        {tiles.map((tile: ITelemetryTile): React.ReactElement => {
          const item: IUsageMetric | undefined = byKey[tile.key];
          const pending: boolean = state.loading || item === undefined || typeof item.currentValue !== 'number';
          return (
            <article key={tile.key} className={`ai-metric-card ai-metric-card--${tile.tone}`}>
              <div className="ai-metric-topline">
                <span className="ai-metric-label">{tileLabel(tile, item)}</span>
                <span className={`ai-metric-status ${pending ? 'is-pending' : 'is-current'}`}>{pending ? 'Pending' : item?.dataStatus || 'Current'}</span>
              </div>
              <strong className={`ai-metric-value ${pending ? 'is-pending' : ''}`}>{state.loading ? 'Loading…' : formatMetricValue(item)}</strong>
              <span className="ai-metric-delta">{formatDelta(item)}</span>
              <div className="ai-metric-meta">
                <span>{item?.source || tile.source}</span>
                <span>{formatRefreshedAt(item?.refreshedAt)}</span>
              </div>
            </article>
          );
        })}
      </div>
      <div className="ai-alerts-panel" aria-live="polite">
        <div className="ai-alerts-heading">
          <strong>{alertsCopy.heading}</strong>
          <span>
            {state.alerts.length} open organization alert{state.alerts.length === 1 ? '' : 's'}
          </span>
        </div>
        {state.loading ? (
          <p className="ai-alerts-empty">Loading alerts…</p>
        ) : state.alerts.length === 0 ? (
          <div className="ai-alerts-clear">
            <CircleCheck aria-hidden="true" />
            <span>{alertsCopy.empty}</span>
          </div>
        ) : (
          <div className="ai-alert-list">
            {state.alerts.slice(0, MAX_ALERTS).map(
              (item: IUsageAlert): React.ReactElement => (
                <article className="ai-alert-item" key={item.id || `${item.title}-${item.detectedAt}`}>
                  <div className="ai-alert-item-heading">
                    <strong>{item.title}</strong>
                    <span className={`ai-alert-severity is-${String(item.severity).toLowerCase()}`}>{item.severity}</span>
                  </div>
                  <p>{truncateDetails(item.details)}</p>
                  <div className="ai-alert-meta">
                    <span>{item.provider}</span>
                    <span>{item.category}</span>
                    <span>{formatRefreshedAt(item.detectedAt)}</span>
                  </div>
                </article>
              )
            )}
          </div>
        )}
      </div>
      <p className="ai-usage-note">
        {state.message} Aggregate operational metrics and notification metadata only; prompts, conversations, and response content are not stored here.
      </p>
    </section>
  );
}
