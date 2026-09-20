import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { createFakeProgramMeasuresService, createPendingProgramMeasuresService } from '../../../../../testing/fakeServices';
import type { IFakeProgramMeasuresService } from '../../../../../testing/fakeServices';
import { renderWithFrontDoor } from '../../../../../testing/renderWithFrontDoor';
import type { IDocumentSettings, IKpiBlock, IVocabulary } from '../../../content/pageContent';
import type { IProgramMeasure, IProgramMeasuresResult } from '../../../services/programMeasuresService';
import { EVIDENCE_PREFIX, KPI_LOADING_TEXT, KpiTilesBlock } from './KpiTilesBlock';

const NOW: Date = new Date('2026-07-15T12:00:00Z');
const SETTINGS: IDocumentSettings = { freshnessDays: 30, minimumCohort: 5 };

const BLOCK: IKpiBlock = {
  type: 'kpi',
  items: [
    { id: 'useful-safe-completion-rate', label: 'Useful safe completion rate' },
    { id: 'median-time-to-useful-outcome', label: 'Median time to a useful outcome' },
    { id: 'repeat-use-useful-completion-rate', label: 'Repeat-use useful completion rate' }
  ],
  unavailableText: 'Measures unavailable: the measures list could not be read.'
};

const MEASURED: IProgramMeasure = {
  id: 'useful-safe-completion-rate',
  title: 'Useful safe completion rate',
  state: 'MEASURED',
  value: 0.62,
  unit: '%',
  periodStart: '2026-04-01',
  periodEnd: '2026-06-30',
  evidenceRef: 'EV-2026-Q2',
  evidenceNote: 'Read from the quarterly review pack.',
  cohortSize: 48
};

const PENDING: IProgramMeasure = {
  id: 'median-time-to-useful-outcome',
  title: 'Median time to a useful outcome',
  state: 'PENDING_BASELINE',
  evidenceNote: 'The first period is not complete.'
};

const NOT_ESTABLISHED: IProgramMeasure = {
  id: 'repeat-use-useful-completion-rate',
  title: 'Repeat-use useful completion rate',
  state: 'NOT_ESTABLISHED',
  evidenceNote: 'No baseline has been agreed with the sponsor.'
};

function answered(measures: IProgramMeasure[]): IProgramMeasuresResult {
  const keyed: { [measureId: string]: IProgramMeasure } = {};
  for (const measure of measures) {
    keyed[measure.id] = measure;
  }
  return { state: 'ok', measures: keyed, message: 'Read.' };
}

const UNAVAILABLE: IProgramMeasuresResult = {
  state: 'unavailable',
  measures: {},
  message: 'The measures list could not be read: AI CoE Program Measures answered 404.',
  failureClass: 'SOURCE',
  userMessage: 'Not available on this site.'
};

function tiles(container: HTMLElement): NodeListOf<HTMLElement> {
  return container.querySelectorAll('.ai-page-kpi > article.ai-metric-card');
}

function valueOf(tile: HTMLElement): string {
  return tile.querySelector('.ai-metric-value')?.textContent ?? '';
}

describe('KpiTilesBlock', () => {
  it('shows a measured number in its unit with the period and the evidence it rests on', async () => {
    const service: IFakeProgramMeasuresService = createFakeProgramMeasuresService(answered([MEASURED, PENDING, NOT_ESTABLISHED]));
    const { container } = renderWithFrontDoor(<KpiTilesBlock block={BLOCK} />, { programMeasures: service, now: NOW, settings: SETTINGS });
    expect(valueOf(tiles(container)[0])).toBe(KPI_LOADING_TEXT);
    await screen.findByText('62%');
    const tile: HTMLElement = tiles(container)[0];
    expect(tile.querySelector('.ai-metric-label')?.textContent).toBe('Useful safe completion rate');
    expect(valueOf(tile)).toBe('62%');
    expect(tile.querySelector('.ai-metric-value')).not.toHaveClass('is-pending');
    // The period and the evidence reference read exactly as a dated fact reads anywhere else on the page.
    expect(tile.querySelector('p.ai-page-freshness')?.textContent).toBe('As of 30 Jun 2026 · EV-2026-Q2');
    // A measured tile asks for no evidence: it has some.
    expect(tile.querySelector('.ai-metric-evidence')).toBeNull();
    // The list is read once for the whole block, not once per tile.
    expect(service.calls).toBe(1);
    expect(tiles(container)).toHaveLength(3);
  });

  it('shows each placeholder as its plain words, with no digit and the evidence it is waiting for', async () => {
    const { container } = renderWithFrontDoor(<KpiTilesBlock block={BLOCK} />, {
      programMeasures: createFakeProgramMeasuresService(answered([PENDING, NOT_ESTABLISHED])),
      now: NOW,
      settings: SETTINGS
    });
    await screen.findByText('Pending baseline');
    const pending: HTMLElement = tiles(container)[1];
    expect(pending.querySelector('.ai-metric-label')?.textContent).toBe('Median time to a useful outcome');
    expect(valueOf(pending)).toBe('Pending baseline');
    expect(pending.querySelector('.ai-metric-value')).toHaveClass('is-pending');
    expect(pending.querySelector('.ai-metric-evidence')?.textContent).toBe(`${EVIDENCE_PREFIX}The first period is not complete.`);
    // No period line: a measure without a number has no period to stand behind.
    expect(pending.querySelector('.ai-page-freshness')).toBeNull();
    const established: HTMLElement = tiles(container)[2];
    expect(valueOf(established)).toBe('Not established');
    expect(established.querySelector('.ai-metric-evidence')?.textContent).toBe(`${EVIDENCE_PREFIX}No baseline has been agreed with the sponsor.`);
    // A measure the list does not carry at all reads as not available, and asks for nothing it cannot name.
    const missing: HTMLElement = tiles(container)[0];
    expect(valueOf(missing)).toBe('Not available');
    expect(missing.querySelector('.ai-metric-evidence')).toBeNull();
    // Nothing on a placeholder tile may read as a figure: the user plane shows no digit anywhere.
    for (const tile of [pending, established, missing]) {
      expect({ id: tile.textContent, digits: /\d/.test(tile.textContent ?? '') }).toEqual({ id: tile.textContent, digits: false });
    }
  });

  it('never shows a zero for a measured row that carries no number', async () => {
    const { container } = renderWithFrontDoor(<KpiTilesBlock block={BLOCK} />, {
      programMeasures: createFakeProgramMeasuresService(answered([{ id: 'useful-safe-completion-rate', title: 'Useful safe completion rate', state: 'MEASURED', unit: '%', evidenceNote: 'The period is being read back.' }])),
      now: NOW,
      settings: SETTINGS
    });
    await screen.findAllByText('Not available');
    expect(valueOf(tiles(container)[0])).toBe('Not available');
    expect(container.textContent).not.toContain('0%');
    expect(tiles(container)[0].querySelector('.ai-metric-evidence')?.textContent).toBe(`${EVIDENCE_PREFIX}The period is being read back.`);
  });

  it('holds back a measure whose group is smaller than the document minimum, measured or not', async () => {
    const small: IProgramMeasure = { ...MEASURED, cohortSize: 3 };
    const { container } = renderWithFrontDoor(<KpiTilesBlock block={BLOCK} />, {
      programMeasures: createFakeProgramMeasuresService(answered([small])),
      now: NOW,
      settings: SETTINGS
    });
    await screen.findByText('Not shown: group too small');
    const tile: HTMLElement = tiles(container)[0];
    expect(valueOf(tile)).toBe('Not shown: group too small');
    // The number, the period and the evidence reference all stay off the page: they would rebuild the measure.
    expect(tile.textContent).not.toContain('62');
    expect(tile.textContent).not.toContain('EV-2026-Q2');
    expect(tile.querySelector('.ai-page-freshness')).toBeNull();
  });

  it('reads every measure as not available when the list is absent, and says so once', async () => {
    const { container } = renderWithFrontDoor(<KpiTilesBlock block={BLOCK} />, {
      programMeasures: createFakeProgramMeasuresService(UNAVAILABLE),
      now: NOW,
      settings: SETTINGS
    });
    const note: HTMLElement = await screen.findByText(BLOCK.unavailableText);
    expect(note).toHaveClass('ai-page-kpi-note');
    expect(container.querySelectorAll('.ai-page-kpi-note')).toHaveLength(1);
    for (const tile of [0, 1, 2]) {
      expect(valueOf(tiles(container)[tile])).toBe('Not available');
    }
    // The failure sentence of the read never reaches the page: the block says what it cannot show, not what broke.
    expect(container.textContent).not.toContain('404');
  });

  it('reads as not available without a service at all, and asks nothing while one is still answering', async () => {
    const { container } = renderWithFrontDoor(<KpiTilesBlock block={BLOCK} />, { now: NOW, settings: SETTINGS });
    expect(valueOf(tiles(container)[0])).toBe('Not available');
    expect(container.querySelector('.ai-page-kpi-note')?.textContent).toBe(BLOCK.unavailableText);
    const pendingService: IFakeProgramMeasuresService = createPendingProgramMeasuresService();
    const waiting = renderWithFrontDoor(<KpiTilesBlock block={BLOCK} />, { programMeasures: pendingService, now: NOW, settings: SETTINGS });
    expect(valueOf(tiles(waiting.container)[0])).toBe(KPI_LOADING_TEXT);
    expect(waiting.container.querySelector('.ai-page-kpi-note')).toBeNull();
    expect(pendingService.calls).toBe(1);
  });

  it('shows the measure id and the state code on the operator plane only', async () => {
    const { container } = renderWithFrontDoor(<KpiTilesBlock block={BLOCK} />, {
      programMeasures: createFakeProgramMeasuresService(answered([MEASURED, PENDING])),
      now: NOW,
      settings: SETTINGS,
      plane: 'operator'
    });
    await screen.findByText('62%');
    const codes: NodeListOf<HTMLElement> = container.querySelectorAll('.ai-metric-codes');
    expect(codes).toHaveLength(3);
    expect(within(codes[0]).getByText('useful-safe-completion-rate')).toHaveClass('ai-metric-id');
    expect(within(codes[0]).getByText('MEASURED')).toHaveClass('ai-metric-state');
    expect(within(codes[1]).getByText('PENDING_BASELINE')).toHaveClass('ai-metric-state');
    // A measure the list does not carry shows the id the page asked for and the state the page had to fall back to.
    expect(within(codes[2]).getByText('repeat-use-useful-completion-rate')).toHaveClass('ai-metric-id');
    expect(within(codes[2]).getByText('NOT_AVAILABLE')).toHaveClass('ai-metric-state');
    const user = renderWithFrontDoor(<KpiTilesBlock block={BLOCK} />, {
      programMeasures: createFakeProgramMeasuresService(answered([MEASURED])),
      now: NOW,
      settings: SETTINGS
    });
    await within(user.container).findByText('62%');
    expect(user.container.querySelector('.ai-metric-codes')).toBeNull();
    expect(user.container.textContent).not.toContain('MEASURED');
  });

  it('marks an illustrative tile with the example pill, in the document wording', async () => {
    const block: IKpiBlock = { ...BLOCK, items: [{ id: 'useful-safe-completion-rate', label: 'Useful safe completion rate', illustrative: true }, BLOCK.items[1]] };
    const { container } = renderWithFrontDoor(<KpiTilesBlock block={block} />, {
      programMeasures: createFakeProgramMeasuresService(answered([MEASURED, PENDING])),
      now: NOW,
      settings: SETTINGS
    });
    await screen.findByText('62%');
    expect(within(tiles(container)[0]).getByText('Example')).toHaveClass('ai-pill-label');
    expect(tiles(container)[1].querySelector('.ai-pill')).toBeNull();
    const vocabulary: IVocabulary = { truthStates: {}, requestStatuses: {}, chrome: { example: 'Illustration' }, roles: {}, telemetry: {} };
    const worded = renderWithFrontDoor(<KpiTilesBlock block={block} />, {
      programMeasures: createFakeProgramMeasuresService(answered([MEASURED])),
      now: NOW,
      settings: SETTINGS,
      vocabulary
    });
    await within(worded.container).findByText('62%');
    expect(within(worded.container).getByText('Illustration')).toHaveClass('ai-pill-label');
  });

  it('falls back to the row title and then to the measure id when the document names no label', async () => {
    const block: IKpiBlock = { type: 'kpi', items: [{ id: 'useful-safe-completion-rate' }, { id: 'unknown-measure' }], unavailableText: BLOCK.unavailableText };
    const { container } = renderWithFrontDoor(<KpiTilesBlock block={block} />, {
      programMeasures: createFakeProgramMeasuresService(answered([MEASURED])),
      now: NOW,
      settings: SETTINGS
    });
    await screen.findByText('62%');
    expect(tiles(container)[0].querySelector('.ai-metric-label')?.textContent).toBe('Useful safe completion rate');
    expect(tiles(container)[1].querySelector('.ai-metric-label')?.textContent).toBe('unknown-measure');
  });
});
