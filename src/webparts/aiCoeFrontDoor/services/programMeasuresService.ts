/**
 * Reads the program measures an operator records by hand, one row per measure, keyed by the measure
 * id the page asks for. The front door only reads this list: it never writes a row and never derives
 * a number of its own. A row says what state its measure is in, and a state the front door does not
 * know reads as not available, so a page shows a number only for a row that claims to be measured
 * and carries one. Failures become results, never exceptions, and carry a class and a body-free
 * sentence; a site whose script has not created the list yet simply has no measures.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { optionalDay, optionalNumber, optionalWords } from '../content/values';
import { KPI_STATES } from '../content/truthStates';
import type { KpiState } from '../content/truthStates';
import { includes } from '../utils/collections';
import { classifyError, classifyResponse, failureUserMessage } from './failureClass';
import type { FailureClass } from './failureClass';
import { listItemsUrl } from './GovernanceService';
import { PROGRAM_MEASURES_LIST_TITLE } from './lists';
import type { IFailureFields, IListItem, IListResponse, IServiceContext } from './types';

/** What the read came to: the rows, or no rows worth a number. */
export type ProgramMeasuresState = 'ok' | 'unavailable';

/** One program measure as its row records it; every field but the id and the state may be absent. */
export interface IProgramMeasure {
  /** The `MeasureId` a `kpi` item names. */
  id: string;
  title: string;
  state: KpiState;
  /** The number itself, present only when the row carries one; a blank stays absent. */
  value?: number;
  /** `%`, `minutes`, `days`: how the number is read. */
  unit?: string;
  /** YYYY-MM-DD: the period the measure covers. */
  periodStart?: string;
  periodEnd?: string;
  /** The reference of the evidence behind the number. */
  evidenceRef?: string;
  /** What evidence a measure without a number is waiting for. */
  evidenceNote?: string;
  /** How many people the measure covers; a small group is suppressed by the document's minimum. */
  cohortSize?: number;
}

/** The measures of a site by measure id; empty when the list is absent or could not be read. */
export interface IProgramMeasuresResult extends IFailureFields {
  state: ProgramMeasuresState;
  measures: { [measureId: string]: IProgramMeasure };
  message: string;
}

export interface IProgramMeasuresService {
  getMeasures(): Promise<IProgramMeasuresResult>;
}

/** The columns the measures list declares; `listsDefinition.test.ts` holds this and the declaration together. */
export const MEASURES_SELECT: string = 'Id,Title,MeasureId,Value,Unit,State,PeriodStart,PeriodEnd,EvidenceRef,EvidenceNote,CohortSize';
/** One page of rows: a program has measures in the tens, never in the thousands. */
export const MEASURES_TOP: number = 100;
const ACCEPT_HEADER: { [name: string]: string } = { Accept: 'application/json;odata=nometadata' };

/** Every measure row of the site, projected to the declared columns. */
export function measuresUrl(siteUrl: string): string {
  return `${listItemsUrl(siteUrl, PROGRAM_MEASURES_LIST_TITLE)}?$select=${MEASURES_SELECT}&$top=${MEASURES_TOP}`;
}

/** The state the row claims, when the front door knows it; anything else is not available. */
function readState(value: unknown): KpiState {
  const code: string | undefined = optionalWords(value);
  return code !== undefined && includes(KPI_STATES, code as KpiState) ? (code as KpiState) : 'NOT_AVAILABLE';
}

function toMeasure(id: string, row: IListItem): IProgramMeasure {
  const measure: IProgramMeasure = { id, title: optionalWords(row.Title) ?? id, state: readState(row.State) };
  const value: number | undefined = optionalNumber(row.Value);
  if (value !== undefined) {
    measure.value = value;
  }
  const unit: string | undefined = optionalWords(row.Unit);
  if (unit !== undefined) {
    measure.unit = unit;
  }
  const periodStart: string | undefined = optionalDay(row.PeriodStart);
  if (periodStart !== undefined) {
    measure.periodStart = periodStart;
  }
  const periodEnd: string | undefined = optionalDay(row.PeriodEnd);
  if (periodEnd !== undefined) {
    measure.periodEnd = periodEnd;
  }
  const evidenceRef: string | undefined = optionalWords(row.EvidenceRef);
  if (evidenceRef !== undefined) {
    measure.evidenceRef = evidenceRef;
  }
  const evidenceNote: string | undefined = optionalWords(row.EvidenceNote);
  if (evidenceNote !== undefined) {
    measure.evidenceNote = evidenceNote;
  }
  const cohortSize: number | undefined = optionalNumber(row.CohortSize);
  if (cohortSize !== undefined) {
    measure.cohortSize = cohortSize;
  }
  return measure;
}

/** The rows by measure id; a row without one names no measure, and the first of two that share one wins. */
function byMeasureId(rows: IListItem[]): { [measureId: string]: IProgramMeasure } {
  const measures: { [measureId: string]: IProgramMeasure } = {};
  for (const row of rows) {
    const id: string | undefined = optionalWords(row.MeasureId);
    if (id !== undefined && !Object.prototype.hasOwnProperty.call(measures, id)) {
      measures[id] = toMeasure(id, row);
    }
  }
  return measures;
}

function failed(failureClass: FailureClass, message: string): IProgramMeasuresResult {
  return { state: 'unavailable', measures: {}, message, failureClass, userMessage: failureUserMessage(failureClass) };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ProgramMeasuresService implements IProgramMeasuresService {
  private readonly _context: IServiceContext;

  public constructor(context: IServiceContext) {
    this._context = context;
  }

  public async getMeasures(): Promise<IProgramMeasuresResult> {
    try {
      const response: IListResponse = await this._context.client.get(measuresUrl(this._context.siteUrl), this._context.configuration, { headers: ACCEPT_HEADER });
      if (!response.ok) {
        // The console gets the status and the class only, never the body.
        const failureClass: FailureClass = classifyResponse(response);
        console.error('AI CoE measures list read failed', `${PROGRAM_MEASURES_LIST_TITLE} returned ${response.status} (${failureClass})`);
        return failed(failureClass, `The measures list could not be read: ${PROGRAM_MEASURES_LIST_TITLE} answered ${response.status}.`);
      }
      const data: { value?: unknown } = (await response.json()) as { value?: unknown };
      const rows: IListItem[] = data !== null && typeof data === 'object' && Array.isArray(data.value) ? (data.value as IListItem[]) : [];
      const measures: { [measureId: string]: IProgramMeasure } = byMeasureId(rows);
      const count: number = Object.keys(measures).length;
      return { state: 'ok', measures, message: `Read ${count} measure${count === 1 ? '' : 's'} from ${PROGRAM_MEASURES_LIST_TITLE}.` };
    } catch (error) {
      const failureClass: FailureClass = classifyError(error);
      console.error('AI CoE measures list read failed', `${failureClass}: ${describeError(error).slice(0, 200)}`);
      return failed(failureClass, `The measures list could not be read: ${describeError(error)}`);
    }
  }
}
