import type { UsageProvider } from '../services/types';
import type { CardTone } from './homeCards';

/** Which usage feed the "AI operations snapshot" strip presents; a web part property. */
export type TelemetryProvider = 'claude' | 'openai' | 'both';

export const TELEMETRY_PROVIDERS: readonly TelemetryProvider[] = ['claude', 'openai', 'both'];
export const DEFAULT_TELEMETRY_PROVIDER: TelemetryProvider = 'claude';

/** Normalises the raw property value; anything unrecognised falls back to Claude. */
export function parseTelemetryProvider(value: unknown): TelemetryProvider {
  const text: string = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return TELEMETRY_PROVIDERS.indexOf(text as TelemetryProvider) >= 0 ? (text as TelemetryProvider) : DEFAULT_TELEMETRY_PROVIDER;
}

export interface ITelemetryTile {
  /** `metricKey` of the usage metric shown on the tile. */
  key: string;
  /** Fallback label and source while the metric has not loaded. */
  label: string;
  source: string;
  tone: CardTone;
  /** The usage feed the tile belongs to; absent for tiles shown in every mode. */
  provider?: UsageProvider;
}

/** Every tile the strip can show, in display order: Claude, then the shipped OpenAI set, then alerts. */
export const TELEMETRY_TILES: readonly ITelemetryTile[] = [
  { key: 'anthropic_api_spend_mtd', label: 'Claude API spend this month', source: 'AI Usage Daily', tone: 'teal', provider: 'anthropic' },
  { key: 'anthropic_api_tokens_mtd', label: 'Claude API tokens this month', source: 'AI Usage Daily', tone: 'blue', provider: 'anthropic' },
  { key: 'anthropic_api_output_tokens_mtd', label: 'Claude output tokens this month', source: 'AI Usage Daily', tone: 'violet', provider: 'anthropic' },
  { key: 'openai_api_spend_mtd', label: 'OpenAI API spend this month', source: 'AI Usage Daily', tone: 'teal', provider: 'openai' },
  { key: 'openai_api_requests_mtd', label: 'OpenAI API requests this month', source: 'AI Usage Daily', tone: 'blue', provider: 'openai' },
  { key: 'openai_api_tokens_mtd', label: 'OpenAI API tokens this month', source: 'AI Usage Daily', tone: 'violet', provider: 'openai' },
  { key: 'open_coe_alerts', label: 'Open CoE alerts', source: 'AI CoE Incidents', tone: 'gold' }
];

const USAGE_PROVIDER_FOR_MODE: { [mode in Exclude<TelemetryProvider, 'both'>]: UsageProvider } = { claude: 'anthropic', openai: 'openai' };

/** The tiles for one mode: four for a single provider, seven when both feeds are shown. */
export function telemetryTilesFor(mode: TelemetryProvider): ITelemetryTile[] {
  return TELEMETRY_TILES.filter(
    (tile: ITelemetryTile): boolean => tile.provider === undefined || mode === 'both' || tile.provider === USAGE_PROVIDER_FOR_MODE[mode]
  );
}

export interface ITelemetryAlertsCopy {
  heading: string;
  empty: string;
}

const NEUTRAL_ALERTS_COPY: ITelemetryAlertsCopy = { heading: 'AI CoE alerts and usage overages', empty: 'No open API or usage overage alerts.' };

/** Alerts panel wording per mode; the OpenAI mode keeps the shipped 1.0.0.7 strings verbatim. */
export const TELEMETRY_ALERTS_COPY: { [mode in TelemetryProvider]: ITelemetryAlertsCopy } = {
  claude: NEUTRAL_ALERTS_COPY,
  openai: { heading: 'AI CoE alerts and ChatGPT / Work overages', empty: 'No open API, ChatGPT, or Work overage alerts.' },
  both: NEUTRAL_ALERTS_COPY
};
