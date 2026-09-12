import { DEFAULT_TELEMETRY_PROVIDER, parseTelemetryProvider, TELEMETRY_ALERTS_COPY, TELEMETRY_PROVIDERS, TELEMETRY_TILES, telemetryTilesFor } from './telemetryTiles';
import type { ITelemetryTile } from './telemetryTiles';

const key = (tile: ITelemetryTile): string => tile.key;
const CLAUDE_KEYS: string[] = ['anthropic_api_spend_mtd', 'anthropic_api_tokens_mtd', 'anthropic_api_output_tokens_mtd'];
const OPENAI_KEYS: string[] = ['openai_api_spend_mtd', 'openai_api_requests_mtd', 'openai_api_tokens_mtd'];

describe('telemetry provider modes', () => {
  it('defaults to Claude and accepts the three modes case-insensitively', () => {
    expect(DEFAULT_TELEMETRY_PROVIDER).toBe('claude');
    expect(TELEMETRY_PROVIDERS).toEqual(['claude', 'openai', 'both']);
    expect(parseTelemetryProvider(undefined)).toBe('claude');
    expect(parseTelemetryProvider('')).toBe('claude');
    expect(parseTelemetryProvider(' OpenAI ')).toBe('openai');
    expect(parseTelemetryProvider('both')).toBe('both');
    expect(parseTelemetryProvider('azure')).toBe('claude');
    expect(parseTelemetryProvider(42)).toBe('claude');
  });

  it('selects the tiles for each mode, Claude first and the alerts tile last', () => {
    expect(TELEMETRY_TILES.map(key)).toEqual([...CLAUDE_KEYS, ...OPENAI_KEYS, 'open_coe_alerts']);
    expect(telemetryTilesFor('claude').map(key)).toEqual([...CLAUDE_KEYS, 'open_coe_alerts']);
    expect(telemetryTilesFor('openai').map(key)).toEqual([...OPENAI_KEYS, 'open_coe_alerts']);
    expect(telemetryTilesFor('both').map(key)).toEqual([...CLAUDE_KEYS, ...OPENAI_KEYS, 'open_coe_alerts']);
    for (const mode of ['claude', 'openai'] as const) {
      expect(telemetryTilesFor(mode).map((tile: ITelemetryTile): string => tile.tone)).toEqual(['teal', 'blue', 'violet', 'gold']);
    }
    expect(telemetryTilesFor('both').map((tile: ITelemetryTile): string | undefined => tile.provider)).toEqual([
      'anthropic',
      'anthropic',
      'anthropic',
      'openai',
      'openai',
      'openai',
      undefined
    ]);
  });

  it('keeps the shipped wording for OpenAI and provider-neutral wording otherwise', () => {
    expect(telemetryTilesFor('openai').map((tile: ITelemetryTile): string => tile.label)).toEqual([
      'OpenAI API spend this month',
      'OpenAI API requests this month',
      'OpenAI API tokens this month',
      'Open CoE alerts'
    ]);
    expect(telemetryTilesFor('claude').map((tile: ITelemetryTile): string => tile.label)).toEqual([
      'Claude API spend this month',
      'Claude API tokens this month',
      'Claude output tokens this month',
      'Open CoE alerts'
    ]);
    expect(telemetryTilesFor('claude').map((tile: ITelemetryTile): string => tile.source)).toEqual(['AI Usage Daily', 'AI Usage Daily', 'AI Usage Daily', 'AI CoE Incidents']);
    expect(TELEMETRY_ALERTS_COPY.openai).toEqual({ heading: 'AI CoE alerts and ChatGPT / Work overages', empty: 'No open API, ChatGPT, or Work overage alerts.' });
    expect(TELEMETRY_ALERTS_COPY.claude).toEqual({ heading: 'AI CoE alerts and usage overages', empty: 'No open API or usage overage alerts.' });
    expect(TELEMETRY_ALERTS_COPY.both).toEqual(TELEMETRY_ALERTS_COPY.claude);
  });
});
