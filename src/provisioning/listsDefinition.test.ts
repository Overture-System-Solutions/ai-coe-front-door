/**
 * Cross-checks the declarative `lists` section of pages.json against the web part that reads those lists:
 * the titles are the constants of `services/lists.ts`, every column a service selects exists on the list
 * (the feature's own schema for the intake list, the declaration for a list the script creates), the
 * choices of a Choice column are the vocabulary the renderer maps, and no declaration names a tenant.
 * Static reading only; nothing here touches a site.
 */
import * as fs from 'fs';
import * as path from 'path';
import { KPI_STATES } from '../webparts/aiCoeFrontDoor/content/truthStates';
import {
  CORRECTION_CATEGORIES,
  OUTCOME_COLUMNS,
  OUTCOME_VALUES,
  REVIEW_STATES,
  ROUTE_AVAILABILITY
} from '../webparts/aiCoeFrontDoor/content/workflows/outcome';
import { INTAKES_LIST_TITLE, OUTCOME_RECORDS_LIST_TITLE, OWN_ITEMS_SECURITY, PROGRAM_MEASURES_LIST_TITLE } from '../webparts/aiCoeFrontDoor/services/lists';
import { MY_WORK_SELECT } from '../webparts/aiCoeFrontDoor/services/myWorkService';
import { findTenantWords, PROVISIONING_SCAN, readTenantWords } from './tenantWords';
import type { ITenantWords } from './tenantWords';

interface IListField {
  name: string;
  type: string;
  choices?: string[];
  indexed?: boolean;
  required?: boolean;
  unique?: boolean;
}

interface IListDefinition {
  title: string;
  description: string;
  fields: IListField[];
  /** `ownItems` (1.0.0.15): the script secures the list it created, as it secures the two intake lists. */
  security?: string;
  /** The `group` parameters whose site groups read every row of the list. */
  fullControlGroups?: string[];
  /** Built-in columns taken off the default view, because SharePoint records them on every item. */
  hideFromDefaultView?: string[];
}

const ROOT: string = process.cwd();
const PAGES_DIR: string = path.join(ROOT, 'sharepoint/pages');
const WEB_PART_DIR: string = path.join(ROOT, 'src/webparts/aiCoeFrontDoor');
const definition: { lists: IListDefinition[] } = JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'pages.json'), 'utf8')) as { lists: IListDefinition[] };
const tenantWords: ITenantWords = readTenantWords(ROOT);

/** The columns every list carries without declaring them; a service may select them anywhere. */
const BUILT_IN_COLUMNS: string[] = ['Id', 'ID', 'Title', 'Created', 'Modified', 'Author', 'Editor'];
/**
 * The columns the program measures service selects (Contracts § SharePoint lists). The service itself arrives in
 * step 24; until it does, this is the pinned contract, and the last case below tightens it to the service's own
 * `$select` the moment the file exists, so the two can never drift apart.
 */
const PROGRAM_MEASURES_SELECT: string[] = ['Id', 'Title', 'MeasureId', 'Value', 'Unit', 'State', 'PeriodStart', 'PeriodEnd', 'EvidenceRef', 'EvidenceNote', 'CohortSize'];
const PROGRAM_MEASURES_SERVICE: string = path.join(WEB_PART_DIR, 'services/programMeasuresService.ts');

function listOf(title: string): IListDefinition {
  const found: IListDefinition | undefined = definition.lists.filter((list: IListDefinition): boolean => list.title === title)[0];
  if (found === undefined) {
    throw new Error(`pages.json declares no list titled "${title}".`);
  }
  return found;
}

function columnNames(list: IListDefinition): string[] {
  return list.fields.map((field: IListField): string => field.name);
}

describe('declared lists and the services that read them', () => {
  it('names each list by the constant the web part reads it with, never by a literal', () => {
    // A rename has one home: services/lists.ts. The page definition and the script take the title from here, so a
    // list the script creates and a list the web part reads can never be two different lists.
    expect(PROGRAM_MEASURES_LIST_TITLE).toBe('AI CoE Program Measures');
    expect(OUTCOME_RECORDS_LIST_TITLE).toBe('AI CoE Outcome Records');
    expect(definition.lists.map((list: IListDefinition): string => list.title)).toEqual([PROGRAM_MEASURES_LIST_TITLE, OUTCOME_RECORDS_LIST_TITLE]);
    // The intake list is not declared here: the package feature provisions it and the script only secures it.
    expect(definition.lists.map((list: IListDefinition): string => list.title)).not.toContain(INTAKES_LIST_TITLE);
  });

  it('carries every column the reading service selects', () => {
    // The program measures list, created by the script from this declaration.
    const measures: IListDefinition = listOf(PROGRAM_MEASURES_LIST_TITLE);
    const declared: string[] = columnNames(measures);
    for (const column of PROGRAM_MEASURES_SELECT) {
      const known: boolean = declared.indexOf(column) >= 0 || BUILT_IN_COLUMNS.indexOf(column) >= 0;
      expect({ column, known }).toEqual({ column, known: true });
    }
    // And nothing is declared that no one reads: a column nobody selects is a column nobody can explain.
    for (const column of declared) {
      expect(PROGRAM_MEASURES_SELECT).toContain(column);
    }
    // The intake list, provisioned by the package feature: my work selects only columns its schema declares.
    const schema: string = fs.readFileSync(path.join(ROOT, 'sharepoint/assets/intake-schema.xml'), 'utf8');
    const schemaColumns: string[] = (schema.match(/Name="[A-Za-z]+"/g) ?? []).map((entry: string): string => entry.slice('Name="'.length, -1));
    for (const column of MY_WORK_SELECT.split(',')) {
      const known: boolean = schemaColumns.indexOf(column) >= 0 || BUILT_IN_COLUMNS.indexOf(column) >= 0;
      expect({ column, known }).toEqual({ column, known: true });
    }
  });

  it('carries every column one outcome record writes, and no column the record does not write (1.0.0.15)', () => {
    // The record is content-free by construction: the list can hold nothing the workflow does not offer as a choice,
    // so the declaration and `OUTCOME_COLUMNS` are the same list of columns, `Title` apart (SharePoint's own).
    const outcomes: IListDefinition = listOf(OUTCOME_RECORDS_LIST_TITLE);
    const declared: string[] = columnNames(outcomes);
    for (const column of OUTCOME_COLUMNS) {
      const known: boolean = declared.indexOf(column) >= 0 || BUILT_IN_COLUMNS.indexOf(column) >= 0;
      expect({ column, known }).toEqual({ column, known: true });
    }
    for (const column of declared) {
      expect(OUTCOME_COLUMNS).toContain(column);
    }
    // The key is the row's identity, as the measure key is: indexed and required. It is deliberately NOT unique.
    // SharePoint refuses item-level read security on a list carrying a field that enforces unique values, because
    // telling someone their value collides would name a row it will not show them, so a list secured 'ownItems'
    // cannot have one. Nothing rests on the database guard: a retry finds its own row by reading the key back
    // (`services/GovernanceService.ts`), and the generated id already carries a random suffix.
    const key: IListField = outcomes.fields[0];
    expect({ name: key.name, indexed: key.indexed, required: key.required, unique: key.unique }).toEqual({
      name: 'OutcomeId',
      indexed: true,
      required: true,
      unique: undefined
    });
    // No person column is declared: the submitter is only in SharePoint's own Created By, which the list hides.
    expect(JSON.stringify(outcomes).toLowerCase()).not.toContain('email');
    expect(outcomes.hideFromDefaultView).toEqual(['Author', 'Editor']);
  });

  it('gives the outcome record the vocabularies the workflow offers, so no answer can fall outside the column', () => {
    const outcomes: IListDefinition = listOf(OUTCOME_RECORDS_LIST_TITLE);
    const choicesOf = (name: string): string[] | undefined => outcomes.fields.filter((field: IListField): boolean => field.name === name)[0].choices;
    expect(choicesOf('Outcome')).toEqual(OUTCOME_VALUES.slice());
    expect(choicesOf('ReviewState')).toEqual(REVIEW_STATES.slice());
    expect(choicesOf('CorrectionCategory')).toEqual(CORRECTION_CATEGORIES.slice());
    expect(choicesOf('RouteAvailability')).toEqual(ROUTE_AVAILABILITY.slice());
  });

  it('secures the list it creates: each person reads their own row, operators and owners read them all', () => {
    // Decision 16: the record is pseudonymous at best, so the list the script creates is put under the same
    // item-level security as the intake lists, by its own declaration rather than by a second section.
    const outcomes: IListDefinition = listOf(OUTCOME_RECORDS_LIST_TITLE);
    expect(outcomes.security).toBe(OWN_ITEMS_SECURITY);
    expect(outcomes.fullControlGroups).toEqual(['OperatorsGroup']);
    // The measures list is read-only for everyone and carries no security declaration of its own.
    expect(listOf(PROGRAM_MEASURES_LIST_TITLE).security).toBeUndefined();
  });

  it('never declares a unique column on a list it secures, which SharePoint refuses outright', () => {
    // `Set-PnPList -ReadSecurity 2` fails with "A list for which users can only view their own items cannot have
    // fields that enforce unique values": SharePoint will not report a collision against a row it will not show.
    // The combination is therefore unbuildable, not merely unwise, and a run that declared it would stop part-way
    // with the list already stripped of its inheritance. A secured list keeps `indexed` and `required` on its key.
    for (const list of definition.lists) {
      const unique: string[] = list.fields.filter((field: IListField): boolean => field.unique === true).map((field: IListField): string => field.name);
      expect({ title: list.title, secured: list.security === OWN_ITEMS_SECURITY, unique }).toEqual({
        title: list.title,
        secured: list.security === OWN_ITEMS_SECURITY,
        unique: list.security === OWN_ITEMS_SECURITY ? [] : unique
      });
    }
    // The measures list is not secured, so its key keeps the guard: the rule is about the combination, not the flag.
    expect(listOf(PROGRAM_MEASURES_LIST_TITLE).fields.filter((field: IListField): boolean => field.unique === true).map((field: IListField): string => field.name)).toEqual(['MeasureId']);
  });

  it('gives each Choice column the vocabulary the web part maps, in the same order', () => {
    // The placeholder table decides what a tile shows for each state; a value the table does not know would read
    // "Not available" with no way for an operator to tell why, so the two lists are the same list.
    const state: IListField = listOf(PROGRAM_MEASURES_LIST_TITLE).fields.filter((field: IListField): boolean => field.name === 'State')[0];
    expect(state.type).toBe('Choice');
    expect(state.choices).toEqual(KPI_STATES.slice());
  });

  it('describes each list in tenant-free words', () => {
    for (const list of definition.lists) {
      const text: string = `${list.title} ${list.description} ${columnNames(list).join(' ')}`;
      for (const scan of PROVISIONING_SCAN) {
        expect({ list: list.title, scan, found: findTenantWords(text, tenantWords, [scan]) }).toEqual({ list: list.title, scan, found: [] });
      }
      // A description says what the rows are and who fills them in, so an operator opening the list knows its purpose.
      expect(list.description.length).toBeGreaterThan(40);
      expect(list.description.charAt(list.description.length - 1)).toBe('.');
    }
  });

  it('matches the reading service $select once that service exists (step 24 tightens this pin)', () => {
    if (!fs.existsSync(PROGRAM_MEASURES_SERVICE)) {
      // Until step 24 the contract above is the pin; this case then reads the service and compares the two.
      expect(PROGRAM_MEASURES_SELECT[0]).toBe('Id');
      return;
    }
    const source: string = fs.readFileSync(PROGRAM_MEASURES_SERVICE, 'utf8');
    const match: RegExpExecArray | null = /_SELECT: string = '([^']+)'/.exec(source);
    expect(match).not.toBeNull();
    expect((match as RegExpExecArray)[1].split(',')).toEqual(PROGRAM_MEASURES_SELECT);
  });
});
