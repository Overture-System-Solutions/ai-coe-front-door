import type { IProgramMeasure } from '../services/programMeasuresService';
import { effectiveState, formatMeasure, suppress } from './measures';

const MINIMUM: number = 5;

function measure(overrides: Partial<IProgramMeasure> = {}): IProgramMeasure {
  return { id: 'useful-safe-completion-rate', title: 'Useful safe completion rate', state: 'MEASURED', value: 0.62, unit: '%', ...overrides };
}

describe('suppress', () => {
  it('holds back a measure whose group is smaller than the document minimum', () => {
    expect(suppress(measure({ cohortSize: 3 }), MINIMUM)).toBe(true);
    expect(suppress(measure({ cohortSize: 0 }), MINIMUM)).toBe(true);
    expect(suppress(measure({ cohortSize: 4 }), MINIMUM)).toBe(true);
    expect(suppress(measure({ cohortSize: 5 }), MINIMUM)).toBe(false);
    expect(suppress(measure({ cohortSize: 48 }), MINIMUM)).toBe(false);
  });

  it('holds back nothing when the row names no group, and nothing at all without a measure', () => {
    // A measure of a program, not of people, carries no group size; suppression is for the ones that do.
    expect(suppress(measure(), MINIMUM)).toBe(false);
    expect(suppress(undefined, MINIMUM)).toBe(false);
  });
});

describe('effectiveState', () => {
  it('is the row state, unless the group is too small or the number is missing', () => {
    expect(effectiveState(measure(), MINIMUM)).toBe('MEASURED');
    expect(effectiveState(measure({ cohortSize: 3 }), MINIMUM)).toBe('INSUFFICIENT_VOLUME');
    // A row that claims to be measured and carries no number has not measured anything.
    expect(effectiveState(measure({ value: undefined }), MINIMUM)).toBe('NOT_AVAILABLE');
    expect(effectiveState(measure({ state: 'PENDING_BASELINE', value: undefined }), MINIMUM)).toBe('PENDING_BASELINE');
    expect(effectiveState(measure({ state: 'NOT_ESTABLISHED' }), MINIMUM)).toBe('NOT_ESTABLISHED');
    // A group too small outranks the row's own state: the number must not be reconstructed from it.
    expect(effectiveState(measure({ state: 'NOT_ESTABLISHED', cohortSize: 2 }), MINIMUM)).toBe('INSUFFICIENT_VOLUME');
    expect(effectiveState(undefined, MINIMUM)).toBe('NOT_AVAILABLE');
  });
});

describe('formatMeasure', () => {
  it('shows a measured number in its unit', () => {
    expect(formatMeasure(measure(), MINIMUM)).toBe('62%');
    expect(formatMeasure(measure({ value: 0.625 }), MINIMUM)).toBe('62.5%');
    expect(formatMeasure(measure({ value: 1 }), MINIMUM)).toBe('100%');
    expect(formatMeasure(measure({ value: 0 }), MINIMUM)).toBe('0%');
    // A percentage written as a percentage, not as a proportion, is shown as it was written.
    expect(formatMeasure(measure({ value: 62 }), MINIMUM)).toBe('62%');
    expect(formatMeasure(measure({ value: 18, unit: 'minutes' }), MINIMUM)).toBe('18 minutes');
    expect(formatMeasure(measure({ value: 12.5, unit: 'minutes' }), MINIMUM)).toBe('12.5 minutes');
    expect(formatMeasure(measure({ value: 7, unit: undefined }), MINIMUM)).toBe('7');
  });

  it('shows the plain placeholder wherever there is no measured number', () => {
    expect(formatMeasure(measure({ state: 'NOT_ESTABLISHED' }), MINIMUM)).toBe('Not established');
    expect(formatMeasure(measure({ state: 'PENDING_BASELINE' }), MINIMUM)).toBe('Pending baseline');
    expect(formatMeasure(measure({ state: 'NOT_AVAILABLE' }), MINIMUM)).toBe('Not available');
    expect(formatMeasure(measure({ state: 'INSUFFICIENT_VOLUME' }), MINIMUM)).toBe('Not shown: group too small');
    expect(formatMeasure(measure({ cohortSize: 3 }), MINIMUM)).toBe('Not shown: group too small');
    // The rule the whole page rests on: a missing number is never a zero.
    expect(formatMeasure(measure({ value: undefined }), MINIMUM)).toBe('Not available');
    expect(formatMeasure(undefined, MINIMUM)).toBe('Not available');
    for (const text of ['Not established', 'Pending baseline', 'Not available', 'Not shown: group too small']) {
      expect(/\d/.test(text)).toBe(false);
    }
  });
});
