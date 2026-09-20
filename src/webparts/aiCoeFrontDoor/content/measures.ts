/**
 * Turns a program measure into the words a tile shows. Two rules decide everything here. A number
 * appears only for a row that says it is measured and carries one, so a missing number reads as
 * "Not available" and never as zero. And a measure covering fewer people than the document's minimum
 * is held back with "Not shown: group too small", whatever the row claims, so no one is identified
 * by a small group (DS-45). Every other state has its own plain placeholder.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { IProgramMeasure } from '../services/programMeasuresService';
import { kpiPlaceholderLabel } from './truthStates';
import type { KpiState } from './truthStates';

/** The unit that is written as a proportion and shown as a percentage. */
const PERCENT: string = '%';

/** True when the measure names a group smaller than the document's minimum; a measure with no group is never held back. */
export function suppress(measure: IProgramMeasure | undefined, minimumCohort: number): boolean {
  return measure !== undefined && measure.cohortSize !== undefined && measure.cohortSize < minimumCohort;
}

/**
 * The state a tile actually shows: the group minimum first, then the row's own state, except that a
 * row claiming to be measured without a number has measured nothing and reads as not available.
 */
export function effectiveState(measure: IProgramMeasure | undefined, minimumCohort: number): KpiState {
  if (measure === undefined) {
    return 'NOT_AVAILABLE';
  }
  if (suppress(measure, minimumCohort)) {
    return 'INSUFFICIENT_VOLUME';
  }
  if (measure.state === 'MEASURED' && measure.value === undefined) {
    return 'NOT_AVAILABLE';
  }
  return measure.state;
}

/** A number without the noise floating-point arithmetic leaves behind: at most two decimal places. */
function plainNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * The number as the tile reads it: a `%` measure written as a proportion (0.62) becomes 62%, one
 * already written as a percentage (62) stays 62%, and any other unit follows its number as a word.
 * So 1 with the unit `%` is the whole and reads 100%; one percent is written 0.01. The convention is
 * stated where the number is recorded: the measures list description in pages.json and the README.
 */
function withUnit(value: number, unit: string | undefined): string {
  if (unit === PERCENT) {
    const percent: number = value >= 0 && value <= 1 ? value * 100 : value;
    return `${String(Math.round(percent * 10) / 10)}${PERCENT}`;
  }
  return unit === undefined ? plainNumber(value) : `${plainNumber(value)} ${unit}`;
}

/** What the tile shows: the measured number in its unit, or the plain placeholder of its effective state. */
export function formatMeasure(measure: IProgramMeasure | undefined, minimumCohort: number): string {
  const state: KpiState = effectiveState(measure, minimumCohort);
  if (measure === undefined || state !== 'MEASURED' || measure.value === undefined) {
    return kpiPlaceholderLabel(state, undefined);
  }
  return withUnit(measure.value, measure.unit);
}
