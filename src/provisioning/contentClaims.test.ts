/**
 * @jest-environment node
 */
/**
 * Guards the claims ledger (docs/content-claims.md): one row for every claim the page definition makes
 * that rests on something outside the committed content (an `asOf` date, a `state`, a route, an
 * illustrative item) and for every default literal the built bundle carries as a binding, each row
 * complete, each claim state one of the four the change engine names, no user-plane row prohibited,
 * and every off-site route row naming the receipt reference its proof comes from. The ledger's wording
 * belongs to its owners; this test keeps it complete and current against pages.json and the bundle.
 */
import * as fs from 'fs';
import * as path from 'path';
import { findTenantWords, PROVISIONING_SCAN, readTenantWords } from './tenantWords';
import type { ITenantWords } from './tenantWords';

interface IRawBlock {
  type: string;
  [field: string]: unknown;
}

interface IRawItem {
  [field: string]: unknown;
}

interface IPage {
  key: string;
  blocks?: IRawBlock[];
  plane?: string;
}

interface IPagesDefinition {
  pages: IPage[];
  routes: { [key: string]: IRawItem };
  shared: { footer: IRawBlock[] };
}

/** One parsed ledger row, by column name. */
interface ILedgerRow {
  [column: string]: string;
}

const ROOT: string = process.cwd();
const LEDGER_PATH: string = 'docs/content-claims.md';
const COLUMNS: string[] = ['Key', 'Claim', 'Claim state', 'Class', 'Source', 'Owner', 'Observed', 'Permitted wording', 'Where'];
const CLAIM_STATES: string[] = ['PROVED_NOW', 'ACCEPTED_DESIGN_NOT_LIVE', 'UNPROVED_OR_STALE', 'PROHIBITED'];
const CLASSES: string[] = ['illustrative', 'design', 'binding'];
const ISO_DATE: RegExp = /^20\d\d-\d\d-\d\d$/;
/**
 * The default literals the bundle carries as the blank value of a Branding property (decision 21): both live in
 * `createBranding`, which hands the legacy view the shipped wording and page views neutral wording; the tool guidance
 * and the team-usage summary read the branding and never spell the review system themselves.
 */
const BUNDLE_LITERALS: { key: string; literal: string; files: string[]; readers: string[] }[] = [
  { key: 'bundle/governanceReference', literal: 'governance controls, version 1.1, August 26, 2026', files: ['src/webparts/aiCoeFrontDoor/branding/branding.ts'], readers: [] },
  {
    key: 'bundle/reviewSystemName',
    literal: 'TESS',
    files: ['src/webparts/aiCoeFrontDoor/branding/branding.ts'],
    readers: ['src/webparts/aiCoeFrontDoor/services/toolPolicyEvaluator.ts', 'src/webparts/aiCoeFrontDoor/summaries/teamUsageSummary.ts']
  }
];
/** The item fields that make a claim the ledger must carry: a freshness date, a truth state, an example. */
const CLAIM_FIELDS: string[] = ['asOf', 'state', 'illustrative'];

const definition: IPagesDefinition = JSON.parse(fs.readFileSync(path.join(ROOT, 'sharepoint/pages/pages.json'), 'utf8')) as IPagesDefinition;
const ledgerText: string = fs.readFileSync(path.join(ROOT, LEDGER_PATH), 'utf8');
const tenantWords: ITenantWords = readTenantWords(ROOT);

function splitRow(line: string): string[] {
  const cells: string[] = line.split('|').map((cell: string): string => cell.trim());
  return cells.slice(1, cells.length - 1);
}

/** The rows of the one table whose header is the ledger's column set. */
function parseLedger(text: string): ILedgerRow[] {
  const lines: string[] = text.split(/\r?\n/);
  const rows: ILedgerRow[] = [];
  let inTable: boolean = false;
  for (const line of lines) {
    if (line.indexOf('|') !== 0) {
      inTable = false;
      continue;
    }
    const cells: string[] = splitRow(line);
    if (!inTable) {
      inTable = cells.join('') === COLUMNS.join('');
      continue;
    }
    if (/^:?-+:?$/.test(cells[0])) {
      continue;
    }
    const row: ILedgerRow = {};
    COLUMNS.forEach((column: string, index: number): void => {
      row[column] = cells[index] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

const ledger: ILedgerRow[] = parseLedger(ledgerText);

function rowsFor(key: string): ILedgerRow[] {
  return ledger.filter((row: ILedgerRow): boolean => row.Key === `\`${key}\``);
}

function rowText(row: ILedgerRow): string {
  return COLUMNS.map((column: string): string => row[column]).join(' ');
}

/** The claims pages.json makes through item fields: `<page>/<type>[<block>]/items[<item>].<field>`. */
interface IItemClaim {
  key: string;
  page: string;
  field: string;
  value: unknown;
  illustrative: boolean;
}

function itemClaims(): IItemClaim[] {
  const claims: IItemClaim[] = [];
  const sources: { page: string; blocks: IRawBlock[] }[] = definition.pages
    .map((page: IPage): { page: string; blocks: IRawBlock[] } => ({ page: page.key, blocks: page.blocks ?? [] }))
    .concat([{ page: 'shared', blocks: definition.shared.footer }]);
  for (const source of sources) {
    source.blocks.forEach((block: IRawBlock, blockIndex: number): void => {
      ((block.items ?? []) as IRawItem[]).forEach((item: IRawItem, itemIndex: number): void => {
        for (const field of CLAIM_FIELDS) {
          if (item[field] !== undefined) {
            claims.push({
              key: `${source.page}/${block.type}[${blockIndex}]/items[${itemIndex}].${field}`,
              page: source.page,
              field,
              value: item[field],
              illustrative: item.illustrative === true
            });
          }
        }
      });
    });
  }
  return claims;
}

function offSiteRoutes(): string[] {
  return Object.keys(definition.routes).filter((key: string): boolean => String(definition.routes[key].href).indexOf('{Url:') === 0);
}

function planeOf(key: string): string {
  const pageKey: string = key.split('/')[0];
  const found: IPage | undefined = definition.pages.filter((page: IPage): boolean => page.key === pageKey)[0];
  return found?.plane === 'operator' ? 'operator' : 'user';
}

/** Whether a ledger key still names something in pages.json or the bundle, so a stale row is caught. */
function keyResolves(key: string): boolean {
  const parts: string[] = key.split('/');
  if (parts[0] === 'routes') {
    return parts.length === 2 && definition.routes[parts[1]] !== undefined;
  }
  if (parts[0] === 'bundle') {
    return BUNDLE_LITERALS.filter((literal: { key: string }): boolean => literal.key === key).length === 1;
  }
  const match: RegExpExecArray | null = /^([A-Za-z]+)\/([A-Za-z]+)\[(\d+)\]\/items\[(\d+)\]\.([A-Za-z]+)$/.exec(key);
  if (match === null) {
    return false;
  }
  const [, pageKey, type, blockIndex, itemIndex, field] = match;
  const blocks: IRawBlock[] | undefined =
    pageKey === 'shared' ? definition.shared.footer : definition.pages.filter((page: IPage): boolean => page.key === pageKey)[0]?.blocks;
  const block: IRawBlock | undefined = blocks?.[Number(blockIndex)];
  const item: IRawItem | undefined = block !== undefined && block.type === type ? ((block.items ?? []) as IRawItem[])[Number(itemIndex)] : undefined;
  return item !== undefined && item[field] !== undefined;
}

describe('content claims ledger', () => {
  it('is the markdown table the README will point at, with the nine columns in order', () => {
    expect(ledgerText.indexOf('# ')).toBe(0);
    expect(ledger.length).toBeGreaterThan(0);
    const header: string | undefined = ledgerText.split(/\r?\n/).filter((line: string): boolean => splitRow(line).join(',') === COLUMNS.join(','))[0];
    expect(header).toBeDefined();
    // The four states and the three classes are explained before the table, so a reader needs no other document.
    for (const token of CLAIM_STATES.concat(CLASSES)) {
      expect(ledgerText.indexOf(token)).toBeGreaterThanOrEqual(0);
    }
  });

  it('has every column filled on every row, a known claim state and class, and an ISO observation date', () => {
    for (const row of ledger) {
      for (const column of COLUMNS) {
        expect({ key: row.Key, column, filled: row[column].length > 0 }).toEqual({ key: row.Key, column, filled: true });
      }
      expect(/^`[^`]+`$/.test(row.Key)).toBe(true);
      expect(CLAIM_STATES).toContain(row['Claim state'].replace(/`/g, ''));
      expect(CLASSES).toContain(row.Class.replace(/`/g, ''));
      expect(ISO_DATE.test(row.Observed)).toBe(true);
    }
  });

  it('keys every row so that it still names a route, an item field or a bundle literal', () => {
    const keys: string[] = ledger.map((row: ILedgerRow): string => row.Key.replace(/`/g, ''));
    for (const key of keys) {
      expect({ key, resolves: keyResolves(key) }).toEqual({ key, resolves: true });
    }
    // One row per key: a duplicate would let two states be claimed for one thing.
    expect(keys.slice().sort()).toEqual(keys.filter((key: string, index: number): boolean => keys.indexOf(key) === index).sort());
  });

  it('carries one row per asOf item, per state and per illustrative item in pages.json', () => {
    const claims: IItemClaim[] = itemClaims();
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      const rows: ILedgerRow[] = rowsFor(claim.key);
      expect({ key: claim.key, rows: rows.length }).toEqual({ key: claim.key, rows: 1 });
      if (claim.field === 'asOf' && typeof claim.value === 'string' && claim.value.indexOf('{') === 0) {
        // A dated claim names the parameter its date comes from.
        expect(rowText(rows[0]).indexOf(claim.value)).toBeGreaterThanOrEqual(0);
      }
      if (claim.illustrative) {
        expect(rows[0].Class.replace(/`/g, '')).toBe('illustrative');
      }
    }
  });

  it('marks a row illustrative only for an item pages.json marks illustrative', () => {
    const illustrativeKeys: string[] = itemClaims()
      .filter((claim: IItemClaim): boolean => claim.illustrative)
      .map((claim: IItemClaim): string => claim.key);
    const illustrativeRows: string[] = ledger
      .filter((row: ILedgerRow): boolean => row.Class.replace(/`/g, '') === 'illustrative')
      .map((row: ILedgerRow): string => row.Key.replace(/`/g, ''));
    for (const key of illustrativeRows) {
      expect(illustrativeKeys.filter((candidate: string): boolean => candidate.indexOf(key.replace(/\.[A-Za-z]+$/, '')) === 0).length).toBeGreaterThan(0);
    }
  });

  it('carries one row per route, and the off-site rows name the state and receipt reference tokens', () => {
    const offSite: string[] = offSiteRoutes();
    expect(offSite.sort()).toEqual(['assistant', 'work']);
    for (const key of Object.keys(definition.routes)) {
      const rows: ILedgerRow[] = rowsFor(`routes/${key}`);
      expect({ key, rows: rows.length }).toEqual({ key, rows: 1 });
      const text: string = rowText(rows[0]);
      if (offSite.indexOf(key) >= 0) {
        for (const field of ['state', 'verifiedOn', 'receiptRef']) {
          const token: string = String(definition.routes[key][field]);
          expect(/^\{[A-Za-z]+\}$/.test(token)).toBe(true);
          expect({ key, field, named: text.indexOf(token) >= 0 }).toEqual({ key, field, named: true });
        }
        // Proof comes from the tenant, never from the committed content.
        expect(rows[0].Class.replace(/`/g, '')).toBe('binding');
        expect(rows[0]['Claim state'].replace(/`/g, '')).not.toBe('PROVED_NOW');
      } else {
        expect(String(definition.routes[key].href).indexOf('{Page:')).toBe(0);
        expect(rows[0].Class.replace(/`/g, '')).toBe('design');
      }
    }
  });

  it('lists the two bundle default literals as bindings behind the step 11 properties', () => {
    for (const literal of BUNDLE_LITERALS) {
      for (const file of literal.files) {
        expect(fs.readFileSync(path.join(ROOT, file), 'utf8').indexOf(literal.literal)).toBeGreaterThanOrEqual(0);
      }
      for (const reader of literal.readers) {
        expect({ reader, carriesLiteral: fs.readFileSync(path.join(ROOT, reader), 'utf8').indexOf(literal.literal) >= 0 }).toEqual({ reader, carriesLiteral: false });
        expect(fs.readFileSync(path.join(ROOT, reader), 'utf8')).toContain(`branding.${literal.key.split('/')[1]}`);
      }
      const rows: ILedgerRow[] = rowsFor(literal.key);
      expect({ key: literal.key, rows: rows.length }).toEqual({ key: literal.key, rows: 1 });
      expect(rows[0].Class.replace(/`/g, '')).toBe('binding');
      expect(rows[0].Claim.indexOf(literal.literal)).toBeGreaterThanOrEqual(0);
      const property: string = literal.key.split('/')[1];
      expect(rowText(rows[0]).indexOf(property)).toBeGreaterThanOrEqual(0);
    }
  });

  it('prohibits nothing on the user plane: a prohibited claim is never rendered, it is listed as wording to refuse', () => {
    for (const row of ledger) {
      const key: string = row.Key.replace(/`/g, '');
      if (planeOf(key) === 'user') {
        expect({ key, state: row['Claim state'].replace(/`/g, '') }).not.toEqual({ key, state: 'PROHIBITED' });
      }
    }
    expect(ledgerText.indexOf('## Prohibited wording')).toBeGreaterThan(0);
  });

  it('contains no word of the tenant list', () => {
    for (const list of PROVISIONING_SCAN) {
      expect({ list, found: findTenantWords(ledgerText, tenantWords, [list]) }).toEqual({ list, found: [] });
    }
  });
});
