import type { CardTone } from './homeCards';

export interface ITelemetryTile {
  /** `metricKey` of the usage metric shown on the tile. */
  key: string;
  /** Fallback label and source while the metric has not loaded. */
  label: string;
  source: string;
  tone: CardTone;
}

/** The four tiles of the "AI operations snapshot" strip, in display order. */
export const TELEMETRY_TILES: readonly ITelemetryTile[] = [
  { key: 'openai_api_spend_mtd', label: 'OpenAI API spend this month', source: 'AI Usage Daily', tone: 'teal' },
  { key: 'openai_api_requests_mtd', label: 'OpenAI API requests this month', source: 'AI Usage Daily', tone: 'blue' },
  { key: 'openai_api_tokens_mtd', label: 'OpenAI API tokens this month', source: 'AI Usage Daily', tone: 'violet' },
  { key: 'open_coe_alerts', label: 'Open CoE alerts', source: 'AI CoE Incidents', tone: 'gold' }
];
