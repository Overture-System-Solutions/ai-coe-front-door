/**
 * The migration acceptance rule of the portability and migration contract (reference document 24, § 8): if the
 * first tenant disappeared tomorrow and this component had to be deployed elsewhere, what would be thrown away?
 * The target answer is tenant configuration, credentials, identities, bindings and branding only. This test builds
 * the inventory of everything tenant-bound the front door takes in (every pages.json parameter with its kind,
 * every web part property that is not a page-view property, every list title the services read) and holds the
 * README to documenting each under "## Rebind to another tenant"; every literal the bundle still carries from the
 * first tenant is a recorded exception under "## Portability exceptions" with an owner and a migration treatment
 * (GOV-113); and the README itself carries no word of the tenant list beyond the documented identifiers.
 */
import * as fs from 'fs';
import * as path from 'path';
import { findTenantWords, readTenantWords } from '../provisioning/tenantWords';
import type { ITenantWords } from '../provisioning/tenantWords';
import { DECISIONS_LIST_TITLE, INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE } from '../webparts/aiCoeFrontDoor/services/GovernanceService';
import { PROGRAM_MEASURES_LIST_TITLE } from '../webparts/aiCoeFrontDoor/services/lists';
import { INCIDENTS_LIST_TITLE, USAGE_LIST_TITLE } from '../webparts/aiCoeFrontDoor/services/UsageMetricsService';

const ROOT: string = process.cwd();
const readme: string = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const tenantWords: ITenantWords = readTenantWords(ROOT);

/** The properties that place a piece on a page; they bind to the site's pages, not to a tenant. */
const PAGE_VIEW_PROPERTIES: RegExp = /^(view|layout|returnUrl|page[A-Z][A-Za-z]*|pageKey|contentUrl)$/;

/** Reference document 24, § 9: the migration pattern, quoted as written. */
const REBIND_ORDER: string = 'EXPORT / PACKAGE -> REBIND TENANT CONFIG -> REAUTHORIZE CONNECTIONS -> REMAP IDENTITIES / SOURCES -> REQUALIFY -> ACTIVATE';

/** Reference document 24, § 8: the target answer, quoted as written. */
const THROWN_AWAY_ANSWER: string = 'tenant configuration, credentials, identities, bindings and branding only';

/** Every literal the bundle still carries from the first tenant, each a recorded exception (GOV-113). */
const PORTABILITY_EXCEPTIONS: string[] = [
  'TESS',
  'version 1.1, August 26, 2026',
  'OVT-AICOE-',
  'overture-ai-coe-front-door:draft:',
  'overture-ai-coe-pilot',
  'Claude API spend this month',
  'OpenAI API spend this month'
];

interface IPagesDefinition {
  parameters: { [name: string]: { kind: string } };
}

function section(heading: string): string {
  const start: number = readme.indexOf(`\n${heading}\n`);
  if (start < 0) {
    throw new Error(`README has no "${heading}" section.`);
  }
  const rest: string = readme.slice(start + 1 + heading.length + 1);
  const next: number = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

function tableRows(text: string): string[][] {
  return text
    .split('\n')
    .filter((line: string): boolean => /^\|/.test(line) && !/^\|\s*-/.test(line))
    .map((line: string): string[] => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell: string): string => cell.trim()));
}

function readManifestProperties(): string[] {
  const text: string = fs.readFileSync(path.join(ROOT, 'src/webparts/aiCoeFrontDoor/AiCoeFrontDoorWebPart.manifest.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const manifest: { preconfiguredEntries: { properties: { [name: string]: unknown } }[] } = JSON.parse(text);
  return Object.keys(manifest.preconfiguredEntries[0].properties);
}

describe('what would be thrown away', () => {
  const definition: IPagesDefinition = JSON.parse(fs.readFileSync(path.join(ROOT, 'sharepoint/pages/pages.json'), 'utf8'));
  const rebind = (): string => section('## Rebind to another tenant');
  const exceptions = (): string => section('## Portability exceptions');

  it('quotes the rebind order and the target answer of the migration acceptance rule', () => {
    expect(rebind()).toContain(REBIND_ORDER);
    expect(rebind()).toContain(THROWN_AWAY_ANSWER);
    expect(rebind()).not.toContain('REBUILD FROM SCRATCH');
  });

  it('documents every pages.json parameter with its kind, its home and what blank means', () => {
    const rows: string[][] = tableRows(rebind());
    expect(rows[0]).toEqual(['Input', 'Home', 'Kind', 'Blank means']);
    const names: string[] = Object.keys(definition.parameters);
    expect(names.length).toBeGreaterThan(30);
    for (const name of names) {
      const row: string[] | undefined = rows.filter((cells: string[]): boolean => cells[0] === `\`${name}\``)[0];
      expect({ name, row }).toEqual({ name, row: [`\`${name}\``, expect.stringContaining('parameters.json'), definition.parameters[name].kind, expect.stringMatching(/\S/)] });
    }
  });

  it('documents every tenant-bound web part property and every list title the services read', () => {
    const rows: string[][] = tableRows(rebind());
    const properties: string[] = readManifestProperties().filter((name: string): boolean => !PAGE_VIEW_PROPERTIES.test(name));
    expect(properties.slice().sort()).toEqual([
      'draftServiceUrl',
      'governanceReference',
      'organizationName',
      'paletteOverrides',
      'reviewSystemName',
      'roleGroups',
      'telemetryProvider'
    ]);
    for (const name of properties) {
      const row: string[] | undefined = rows.filter((cells: string[]): boolean => cells[0] === `\`${name}\``)[0];
      expect({ name, row }).toEqual({ name, row: [`\`${name}\``, expect.stringContaining('property'), 'property', expect.stringMatching(/\S/)] });
    }
    // The measures list is the first the script itself creates (1.0.0.14); it is a tenant's own rows like the rest.
    for (const title of [INTAKES_LIST_TITLE, USE_CASES_LIST_TITLE, DECISIONS_LIST_TITLE, USAGE_LIST_TITLE, INCIDENTS_LIST_TITLE, PROGRAM_MEASURES_LIST_TITLE]) {
      const row: string[] | undefined = rows.filter((cells: string[]): boolean => cells[0] === title)[0];
      expect({ title, row }).toEqual({ title, row: [title, expect.stringMatching(/\S/), 'list', expect.stringMatching(/\S/)] });
    }
  });

  it('records every literal the bundle still carries from the first tenant with an owner and a migration treatment', () => {
    const rows: string[][] = tableRows(exceptions());
    expect(rows[0]).toEqual(['Exception', 'Where', 'Owner', 'Migration treatment']);
    for (const exception of PORTABILITY_EXCEPTIONS) {
      const row: string[] | undefined = rows.filter((cells: string[]): boolean => cells[0].indexOf(exception) >= 0)[0];
      expect({ exception, row }).toEqual({ exception, row: [expect.stringContaining(exception), expect.stringMatching(/\S/), expect.stringMatching(/\S/), expect.stringMatching(/\S/)] });
    }
    // The word list itself is the one file that is not tenant-neutral, and the README says so where the exceptions are.
    expect(exceptions()).toContain('src/provisioning/tenantWords.json');
    expect(exceptions()).toContain('deliberately not tenant-neutral');
    expect(exceptions()).toContain('GOV-113');
  });

  it('ships the sample parameters blank', () => {
    const sample: { [name: string]: string } = JSON.parse(fs.readFileSync(path.join(ROOT, 'sharepoint/pages/parameters.sample.json'), 'utf8'));
    expect(Object.keys(sample).sort()).toEqual(Object.keys(definition.parameters).sort());
    for (const name of Object.keys(sample)) {
      expect({ name, value: sample[name] }).toEqual({ name, value: '' });
    }
  });

  it('keeps the README free of tenant words beyond the documented identifiers', () => {
    // The package, draft-key and DOM-scope identifiers carry the vendor word by contract (README "Branding"), so that
    // one client word is exempt; every other client name, tenant host, roster surname and case id is not.
    const readmeWords: ITenantWords = {
      clientWords: tenantWords.clientWords.filter((word: string): boolean => word !== 'overture'),
      bundlePhrases: tenantWords.bundlePhrases,
      hosts: tenantWords.hosts,
      people: tenantWords.people,
      caseIds: tenantWords.caseIds,
      secretPatterns: tenantWords.secretPatterns
    };
    expect(readmeWords.clientWords.length).toBe(tenantWords.clientWords.length - 1);
    for (const list of ['clientWords', 'hosts', 'people', 'caseIds'] as const) {
      expect({ list, found: findTenantWords(readme, readmeWords, [list]) }).toEqual({ list, found: [] });
    }
  });
});
