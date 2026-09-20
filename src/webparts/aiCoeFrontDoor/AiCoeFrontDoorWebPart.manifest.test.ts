/**
 * Pins the web part manifest: the shipped identity, the legacy defaults every new instance starts
 * from, and the toolbox entries. Read with `fs` because the source manifest carries `//` comments.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FRONT_DOOR_VIEWS } from './content/pageViews';

interface IManifestEntry {
  groupId: string;
  group: { default: string };
  title: { default: string };
  description: { default: string };
  officeFabricIconFontName: string;
  properties: { [name: string]: unknown };
}

interface IManifest {
  id: string;
  alias: string;
  componentType: string;
  requiresCustomScript: boolean;
  supportedHosts: string[];
  supportsThemeVariants: boolean;
  preconfiguredEntries: IManifestEntry[];
}

const ROOT: string = process.cwd();
const WEB_PART_ID: string = 'cf2e5904-0703-4fe4-ae5a-ec012d6fa689';

function readManifest(file: string): IManifest {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '')) as IManifest;
}

const LEGACY_PROPERTIES: { [name: string]: unknown } = {
  organizationName: '',
  // Blank reproduces the shipped wording in the legacy view and neutral wording in page views (decision 21).
  governanceReference: '',
  reviewSystemName: '',
  // Blank binds no site group, so every person keeps the employee role and a site owner the operator role (decision 8).
  roleGroups: '',
  // Blank sets no palette token, so the shipped colours stand; a tenant's colours are a parameter, never code (decision 11).
  paletteOverrides: '',
  draftServiceUrl: '',
  telemetryProvider: 'claude',
  view: 'legacy',
  layout: 'wide',
  returnUrl: '',
  pageIdea: '',
  pageToolCheck: '',
  pageTeamUsage: '',
  pageHelpTraining: '',
  pageFeedback: '',
  pageTelemetry: '',
  pageAdmin: '',
  pagePolicy: '',
  // The outcome record is a page link like the others, set on the home instance by the script (decision 16).
  pageOutcome: '',
  pageKey: '',
  contentUrl: 'SiteAssets/ai-coe-pages.json'
};

describe('AiCoeFrontDoorWebPart manifest', () => {
  const source: IManifest = readManifest(path.join(ROOT, 'src/webparts/aiCoeFrontDoor/AiCoeFrontDoorWebPart.manifest.json'));
  const built: IManifest = readManifest(path.join(ROOT, `dist/${WEB_PART_ID}.manifest.json`));

  it('keeps the shipped identity', () => {
    expect(source.id).toBe(WEB_PART_ID);
    expect(source.alias).toBe('AiCoeFrontDoorWebPart');
    expect(source.componentType).toBe('WebPart');
    expect(source.requiresCustomScript).toBe(false);
    expect(source.supportedHosts).toEqual(['SharePointWebPart', 'SharePointFullPage']);
    expect(source.supportsThemeVariants).toBe(true);
  });

  it('presets the legacy view with blank page properties on the default entry', () => {
    const entry: IManifestEntry = source.preconfiguredEntries[0];
    expect(entry.title.default).toBe('AI CoE Front Door');
    expect(entry.groupId).toBe('5c03119e-3074-46fd-976b-c60198311f70');
    expect(entry.properties).toEqual(LEGACY_PROPERTIES);
  });

  it('offers one toolbox entry per piece on the same component and group', () => {
    const entries: IManifestEntry[] = source.preconfiguredEntries;
    expect(entries.map((entry: IManifestEntry): unknown => entry.properties.view)).toEqual(FRONT_DOOR_VIEWS);
    expect(entries.map((entry: IManifestEntry): string => entry.title.default)).toEqual([
      'AI CoE Front Door',
      'AI CoE: Home tiles',
      'AI CoE: Explore an AI idea',
      'AI CoE: Check a tool or task',
      'AI CoE: Register team AI use',
      'AI CoE: Get help or training',
      'AI CoE: Share feedback',
      'AI CoE: AI operations snapshot',
      'AI CoE: Administrator dashboard',
      'AI CoE: Content page',
      'AI CoE: Record a task outcome'
    ]);
    expect(entries).toHaveLength(11);
    for (const entry of entries) {
      expect(entry.groupId).toBe('5c03119e-3074-46fd-976b-c60198311f70');
      expect(entry.group.default).toBe('AI Center of Excellence');
      expect(entry.officeFabricIconFontName).toBe('EntryView');
      expect(entry.description.default.length).toBeGreaterThan(0);
      expect(entry.properties).toEqual({ ...LEGACY_PROPERTIES, view: entry.properties.view });
      expect(JSON.stringify(entry).indexOf('Overture')).toBe(-1);
    }
  });

  it('matches the manifest the build wrote to dist', () => {
    expect(built.id).toBe(WEB_PART_ID);
    expect(built.preconfiguredEntries.map((entry: IManifestEntry): string => entry.title.default)).toEqual(
      source.preconfiguredEntries.map((entry: IManifestEntry): string => entry.title.default)
    );
    expect(built.preconfiguredEntries.map((entry: IManifestEntry): { [name: string]: unknown } => entry.properties)).toEqual(
      source.preconfiguredEntries.map((entry: IManifestEntry): { [name: string]: unknown } => entry.properties)
    );
  });
});
