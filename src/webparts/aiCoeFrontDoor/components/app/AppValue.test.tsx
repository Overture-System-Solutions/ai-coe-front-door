import * as React from 'react';
import { act } from '@testing-library/react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import { createFakeProgramMeasuresService } from '../../../../testing/fakeServices';
import type { IProgramMeasure } from '../../services/programMeasuresService';
import { AppValue } from './AppValue';

const now = new Date('2026-09-23T12:00:00Z');
const supported: IProgramMeasure = { id: 'useful-safe-completion-rate', title: 'Completion', state: 'MEASURED', value: 0.62, unit: '%', evidenceRef: 'scorecard-2026-09', periodStart: '2026-09-01', periodEnd: '2026-09-22', cohortSize: 12 };
async function show(measure: IProgramMeasure): Promise<ReturnType<typeof renderWithFrontDoor>> {
  const programMeasures = createFakeProgramMeasuresService({ state: 'ok', measures: { [measure.id]: measure }, message: 'fixture' });
  const view = renderWithFrontDoor(<AppValue />, { programMeasures, now });
  await act(async (): Promise<void> => undefined);
  return view;
}

describe('AppValue evidence gate', () => {
  it.each([
    { evidenceRef: undefined }, { evidenceRef: ' ' }, { periodStart: undefined }, { periodEnd: undefined },
    { periodStart: '2026-09-23' }, { periodEnd: '2026-09-24' }, { periodStart: '2026-08-01', periodEnd: '2026-08-10' },
    { cohortSize: undefined }, { cohortSize: NaN }, { value: Infinity }
  ])('withholds a number without current evidence, a valid period and privacy metadata: %j', async (override: Partial<IProgramMeasure>) => {
    const { container } = await show({ ...supported, ...override });
    expect(container.textContent).not.toContain('62%');
    expect(container.textContent).not.toContain('Infinity');
    expect(container.textContent).toContain('Not available');
  });

  it('shows the recorded measure with evidence AND period, without calling the value verified', async () => {
    const { container } = await show(supported);
    expect(container.textContent).toContain('62%');
    expect(container.textContent).toContain('scorecard-2026-09');
    expect(container.textContent).toContain('2026-09-01');
    expect(container.textContent).toContain('2026-09-22');
    expect(container.textContent).toContain('not independently verified');
  });

  it('suppresses a sensitive small cohort even if its row claims to be measured', async () => {
    const { container } = await show({ ...supported, cohortSize: 2 });
    expect(container.textContent).not.toContain('62%');
    expect(container.textContent).toContain('Not shown: group too small');
  });
});
