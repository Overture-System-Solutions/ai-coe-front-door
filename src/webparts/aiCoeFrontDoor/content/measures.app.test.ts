import { presentAppMeasure } from './measures';
import type { IProgramMeasure } from '../services/programMeasuresService';

const row: IProgramMeasure = { id: 'non-person-fixture', title: 'System measurement fixture', state: 'MEASURED', value: 9, evidenceRef: 'fixture-receipt', periodStart: '2026-09-01', periodEnd: '2026-09-22' };
const policy = { now: new Date('2026-09-23T00:00:00Z'), minimumCohort: 5, freshnessDays: 30 };

describe('explicit app measure privacy policy', () => {
  it('allows a declared non-person metric without treating an absent cohort as that declaration', () => {
    expect(presentAppMeasure(row, policy).value).toBe('Not available');
    expect(presentAppMeasure(row, { ...policy, privacy: 'nonPerson' }).value).toBe('9');
    expect(presentAppMeasure({ ...row, evidenceRef: undefined }, { ...policy, privacy: 'nonPerson' }).value).toBe('Not available');
  });

  it('never exempts a row that actually records a small sensitive cohort', () => {
    expect(presentAppMeasure({ ...row, cohortSize: 2 }, { ...policy, privacy: 'nonPerson' }).value).toBe('Not shown: group too small');
  });
});
