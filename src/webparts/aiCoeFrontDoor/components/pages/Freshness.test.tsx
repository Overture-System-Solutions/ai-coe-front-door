/**
 * The freshness line under a fact: "As of <date> · <source>", the needs-refresh pill once the date
 * is older than the document's threshold, the awaiting-source pill for a source with no date, and
 * the example pill for an illustrative item. Nothing renders for an item that says nothing about its age.
 */
import * as React from 'react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import type { IVocabulary } from '../../content/pageContent';
import { DO_NOT_INFER_TEXT, Freshness } from './Freshness';

const NOW: Date = new Date('2026-09-19T12:00:00Z');

/** The freshness line's text, or undefined when the line is not there. */
function lineText(container: HTMLElement): string | undefined {
  return container.querySelector('p.ai-page-freshness')?.textContent ?? undefined;
}

describe('Freshness', () => {
  it('renders nothing for an item without a date, a source or the example flag', () => {
    const { container } = renderWithFrontDoor(<Freshness />, { now: NOW });
    expect(container.innerHTML).toBe('');
  });

  it('writes the as-of date and the source without a pill while the date is current', () => {
    const { container } = renderWithFrontDoor(<Freshness asOf="2026-09-01" source="AI CoE check" />, { now: NOW });
    expect(lineText(container)).toBe('As of 1 Sep 2026 · AI CoE check');
    expect(container.querySelector('.ai-pill')).toBeNull();
  });

  it('writes the date alone when there is no source', () => {
    const { container } = renderWithFrontDoor(<Freshness asOf="2026-09-01" />, { now: NOW });
    expect(lineText(container)).toBe('As of 1 Sep 2026');
  });

  it('adds the needs-refresh pill once the date is older than the threshold', () => {
    const { container } = renderWithFrontDoor(<Freshness asOf="2026-08-05" source="AI CoE check" />, { now: NOW });
    expect(lineText(container)).toBe('As of 5 Aug 2026 · AI CoE check Needs refresh');
    expect(container.querySelector('.ai-pill--amber .ai-pill-label')?.textContent).toBe('Needs refresh');
  });

  it('honours the freshness threshold of the document settings', () => {
    const { container } = renderWithFrontDoor(<Freshness asOf="2026-09-01" />, { now: NOW, settings: { freshnessDays: 7, minimumCohort: 5 } });
    expect(container.querySelector('.ai-pill-label')?.textContent).toBe('Needs refresh');
  });

  it('marks a source without a date as awaiting its source and says not to infer progress', () => {
    const { container } = renderWithFrontDoor(<Freshness source="AI CoE check" />, { now: NOW });
    expect(lineText(container)).toBe(`Awaiting source ${DO_NOT_INFER_TEXT}`);
    expect(DO_NOT_INFER_TEXT).toBe('Do not infer progress.');
    expect(container.querySelector('.ai-pill--amber .ai-pill-label')?.textContent).toBe('Awaiting source');
    expect(container.textContent).not.toContain('As of');
  });

  it('marks an illustrative item as an example after its date', () => {
    const { container } = renderWithFrontDoor(<Freshness asOf="2026-09-01" source="Made up" illustrative={true} />, { now: NOW });
    expect(lineText(container)).toBe('As of 1 Sep 2026 · Made up Example');
    expect(container.querySelector('.ai-pill--blue .ai-pill-label')?.textContent).toBe('Example');
  });

  it('shows the example pill on its own for an illustrative item without a date or a source', () => {
    const { container } = renderWithFrontDoor(<Freshness illustrative={true} />, { now: NOW });
    expect(lineText(container)).toBe('Example');
  });

  it('takes the pill wording from the document vocabulary', () => {
    const vocabulary: IVocabulary = { truthStates: {}, requestStatuses: {}, chrome: { needsRefresh: 'Out of date', awaitingSource: 'No source yet', example: 'Sample' }, roles: {}, telemetry: {} };
    const stale = renderWithFrontDoor(<Freshness asOf="2026-01-01" illustrative={true} />, { now: NOW, vocabulary });
    expect(lineText(stale.container)).toBe('As of 1 Jan 2026 Out of date Sample');
    stale.unmount();
    const awaiting = renderWithFrontDoor(<Freshness source="x" />, { now: NOW, vocabulary });
    expect(lineText(awaiting.container)).toBe(`No source yet ${DO_NOT_INFER_TEXT}`);
  });
});
