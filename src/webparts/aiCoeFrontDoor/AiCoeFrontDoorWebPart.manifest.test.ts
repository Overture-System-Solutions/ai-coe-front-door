/**
 * Pins the web part manifest: the shipped identity, the legacy defaults every new instance starts
 * from, and the toolbox entries. Read with `fs` because the source manifest carries `//` comments.
 */
import * as fs from 'fs';
import * as path from 'path';

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
  pagePolicy: ''
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
