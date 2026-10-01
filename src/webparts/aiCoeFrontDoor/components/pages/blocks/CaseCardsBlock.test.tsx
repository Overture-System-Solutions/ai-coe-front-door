/**
 * The case cards: one article per case with its id, the state pill, the title, the description, the
 * historical stage and health, the source date, the next action and the caption. An `AWAITING_SOURCE`
 * case carries the awaiting-source pill; every other code renders through the plain status table;
 * the code itself is shown beside the pill on the operator plane only. A source date older than the
 * document's freshness threshold adds the needs-refresh pill and, when the item gives no caption,
 * says not to infer progress. No date is invented when the source date is absent.
 */
import { within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor } from '../../../../../testing/renderWithFrontDoor';
import type { ICaseCardItem, ICaseCardsBlock, IVocabulary } from '../../../content/pageContent';
import { CaseCardsBlock, STALE_CASE_CAPTION } from './CaseCardsBlock';

const NOW: Date = new Date('2026-09-19T12:00:00Z');

const EXAMPLE: ICaseCardItem = {
  id: 'EXAMPLE-01',
  title: 'Example case: a proof-of-value programme',
  description: 'Shows how a case looks when its latest evidence is older than the freshness threshold.',
  state: 'AWAITING_SOURCE',
  historicalStage: 'Validate',
  historicalHealth: 'amber',
  sourceDate: '2026-08-28',
  nextAction: 'Read the latest authoritative source before updating the case.',
  caption: 'Do not infer progress',
  illustrative: true
};

/** A dated case without a caption or the example flag, so the stale defaults can be seen. */
const DATED: ICaseCardItem = { id: 'C-1', title: 'A dated case', state: 'AWAITING_SOURCE', historicalStage: 'Validate', historicalHealth: 'amber', sourceDate: '2026-08-28' };

function block(...items: ICaseCardItem[]): ICaseCardsBlock {
  return { type: 'caseCards', items };
}

function pillLabels(card: HTMLElement): string[] {
  const labels: string[] = [];
  card.querySelectorAll('.ai-pill .ai-pill-label').forEach((label: Element): void => {
    labels.push(label.textContent ?? '');
  });
  return labels;
}

function tags(card: HTMLElement): string[] {
  const texts: string[] = [];
  card.querySelectorAll('.ai-case-tag').forEach((tag: Element): void => {
    texts.push(tag.textContent ?? '');
  });
  return texts;
}

describe('CaseCardsBlock', () => {
  it('draws one article per case: id, pills, title, description, tags, next action and caption, in that order', () => {
    const { container } = renderWithFrontDoor(<CaseCardsBlock block={block(EXAMPLE)} />, { now: NOW, settings: { freshnessDays: 60, minimumCohort: 5 } });
    expect(container.querySelector('.ai-page-cases')).not.toBeNull();
    const cards: NodeListOf<HTMLElement> = container.querySelectorAll('article.ai-case-card');
    expect(cards).toHaveLength(1);
    const card: HTMLElement = cards[0];
    expect(card).toHaveClass('ai-case-card--amber');
    const head: HTMLElement = card.querySelector('.ai-case-head') as HTMLElement;
    expect(head.querySelector('code.ai-case-id')?.textContent).toBe('EXAMPLE-01');
    expect(card.firstElementChild).toBe(head);
    // The user plane: the awaiting-source pill and the example pill, no code; the date is 22 days old, under the 60-day threshold.
    expect(pillLabels(card)).toEqual(['Awaiting source', 'Example']);
    expect(card.querySelector('.ai-pill-code')).toBeNull();
    expect(head.querySelector('.ai-pill--amber')).not.toBeNull();
    expect(head.querySelector('.ai-pill--blue')).not.toBeNull();
    expect(within(card).getByRole('heading', { level: 3, name: 'Example case: a proof-of-value programme' })).toBeInTheDocument();
    expect(card.querySelector('p.ai-case-description')?.textContent).toBe('Shows how a case looks when its latest evidence is older than the freshness threshold.');
    expect(tags(card)).toEqual(['Historical stage: Validate', 'Historical health: Amber', 'Source: 28 Aug 2026']);
    expect(card.querySelector('.ai-case-tag--amber')?.textContent).toBe('Historical health: Amber');
    const footer: HTMLElement = card.querySelector('.ai-case-footer') as HTMLElement;
    expect(footer.querySelector('p.ai-case-next')?.textContent).toBe('Next: Read the latest authoritative source before updating the case.');
    expect(footer.querySelector('p.ai-case-caption')?.textContent).toBe('Do not infer progress');
    expect(card.lastElementChild).toBe(footer);
    expect(card.textContent).not.toContain('As of');
    expect(card.textContent).not.toContain('Needs refresh');
  });

  it('adds the needs-refresh pill once the source date is older than the freshness threshold, and the caption "Do not infer progress" when none is given', () => {
    const current = renderWithFrontDoor(<CaseCardsBlock block={block(DATED)} />, { now: NOW });
    const currentCard: HTMLElement = current.container.querySelector('article.ai-case-card') as HTMLElement;
    expect(pillLabels(currentCard)).toEqual(['Awaiting source']);
    expect(currentCard.querySelector('.ai-case-footer')).toBeNull();
    expect(currentCard.querySelector('.ai-case-caption')).toBeNull();
    current.unmount();
    // Seven days: 28 Aug is stale on 19 Sep.
    const stale = renderWithFrontDoor(<CaseCardsBlock block={block(DATED)} />, { now: NOW, settings: { freshnessDays: 7, minimumCohort: 5 } });
    const staleCard: HTMLElement = stale.container.querySelector('article.ai-case-card') as HTMLElement;
    expect(pillLabels(staleCard)).toEqual(['Awaiting source', 'Needs refresh']);
    expect(staleCard.querySelectorAll('.ai-pill--amber')).toHaveLength(2);
    expect(staleCard.querySelector('p.ai-case-caption')?.textContent).toBe(STALE_CASE_CAPTION);
    expect(STALE_CASE_CAPTION).toBe('Do not infer progress.');
    expect(tags(staleCard)).toEqual(['Historical stage: Validate', 'Historical health: Amber', 'Source: 28 Aug 2026']);
    stale.unmount();
    // A given caption stays as written when the date is stale.
    const captioned = renderWithFrontDoor(<CaseCardsBlock block={block(EXAMPLE)} />, { now: NOW, settings: { freshnessDays: 7, minimumCohort: 5 } });
    const captionedCard: HTMLElement = captioned.container.querySelector('article.ai-case-card') as HTMLElement;
    expect(pillLabels(captionedCard)).toEqual(['Awaiting source', 'Needs refresh', 'Example']);
    expect(captionedCard.querySelectorAll('p.ai-case-caption')).toHaveLength(1);
    expect(captionedCard.querySelector('p.ai-case-caption')?.textContent).toBe('Do not infer progress');
  });

  it('invents no date when the source date is absent, and renders any other code through the plain status table', () => {
    const { container } = renderWithFrontDoor(
      <CaseCardsBlock block={block({ id: 'C-2', title: 'Under way', state: 'IN_DELIVERY', historicalHealth: 'green', nextAction: 'Wait for the next review.' }, { id: 'C-3', title: 'Bare', state: 'DRAFT' })} />,
      { now: NOW, settings: { freshnessDays: 1, minimumCohort: 5 } }
    );
    const cards: NodeListOf<HTMLElement> = container.querySelectorAll('article.ai-case-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveClass('ai-case-card--green');
    expect(pillLabels(cards[0])).toEqual(['Under way']);
    expect(cards[0].querySelector('.ai-pill--green')).not.toBeNull();
    expect(cards[0].querySelector('.ai-pill-code')).toBeNull();
    expect(tags(cards[0])).toEqual(['Historical health: Green']);
    expect(cards[0].textContent).not.toContain('Source:');
    expect(cards[0].textContent).not.toContain('As of');
    expect(cards[0].textContent).not.toContain('Needs refresh');
    expect(cards[0].querySelector('p.ai-case-next')?.textContent).toBe('Next: Wait for the next review.');
    expect(cards[0].querySelector('.ai-case-caption')).toBeNull();
    // A case that says nothing beyond its id, title and state: no tone modifier, no description, no tags, no footer.
    expect(cards[1].className).toBe('ai-case-card');
    expect(pillLabels(cards[1])).toEqual(['Draft']);
    expect(cards[1].querySelector('.ai-case-description')).toBeNull();
    expect(cards[1].querySelector('.ai-case-tags')).toBeNull();
    expect(cards[1].querySelector('.ai-case-footer')).toBeNull();
  });

  it('appends the code beside the pill on the operator plane only', () => {
    const { container } = renderWithFrontDoor(<CaseCardsBlock block={block(EXAMPLE, { id: 'C-2', title: 'Under way', state: 'IN_DELIVERY' })} />, { now: NOW, plane: 'operator', settings: { freshnessDays: 60, minimumCohort: 5 } });
    const cards: NodeListOf<HTMLElement> = container.querySelectorAll('article.ai-case-card');
    expect(pillLabels(cards[0])).toEqual(['Awaiting source', 'Example']);
    const codes: NodeListOf<HTMLElement> = cards[0].querySelectorAll('code.ai-pill-code');
    expect(codes).toHaveLength(1);
    expect(codes[0].textContent).toBe('AWAITING_SOURCE');
    expect(cards[1].querySelector('.ai-pill-label')?.textContent).toBe('Under way');
    expect(cards[1].querySelector('code.ai-pill-code')?.textContent).toBe('IN_DELIVERY');
  });

  it('takes the pill wording from the document vocabulary', () => {
    const vocabulary: IVocabulary = {
      truthStates: {},
      requestStatuses: { IN_DELIVERY: 'Building' },
      chrome: { awaitingSource: 'No source yet', needsRefresh: 'Out of date', example: 'Sample' },
      roles: {},
      telemetry: {}
    };
    const { container } = renderWithFrontDoor(<CaseCardsBlock block={block(EXAMPLE, { id: 'C-2', title: 'Under way', state: 'IN_DELIVERY' })} />, { now: NOW, vocabulary, settings: { freshnessDays: 7, minimumCohort: 5 } });
    const cards: NodeListOf<HTMLElement> = container.querySelectorAll('article.ai-case-card');
    expect(pillLabels(cards[0])).toEqual(['No source yet', 'Out of date', 'Sample']);
    expect(pillLabels(cards[1])).toEqual(['Building']);
  });
});
