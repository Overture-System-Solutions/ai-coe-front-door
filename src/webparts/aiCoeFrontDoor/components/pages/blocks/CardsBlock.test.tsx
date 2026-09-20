import { within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor } from '../../../../../testing/renderWithFrontDoor';
import type { ICardsBlock } from '../../../content/pageContent';
import { CardsBlock } from './CardsBlock';

const BLOCK: ICardsBlock = {
  type: 'cards',
  columns: 3,
  items: [
    { title: 'Summarise a thread', kicker: '2 minutes', body: ['First **bold**.', 'Second.'], meta: 'Copilot Chat · [source](https://s/x)', tone: 'gold' },
    { title: 'Bare', body: [], tone: 'teal' }
  ]
};

describe('CardsBlock', () => {
  it('renders a grid of toned articles with kicker, title, paragraphs and meta line', () => {
    const { container } = renderWithFrontDoor(<CardsBlock block={BLOCK} />);
    const grid: HTMLElement = container.querySelector('.ai-page-cards') as HTMLElement;
    expect(grid).toHaveClass('ai-page-cards--3');
    const cards: NodeListOf<HTMLElement> = grid.querySelectorAll('article.ai-page-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveClass('ai-page-card--gold');
    expect(cards[0].querySelector('.ai-page-card-kicker')?.textContent).toBe('2 minutes');
    expect(within(cards[0]).getByRole('heading', { level: 3, name: 'Summarise a thread' })).toBeInTheDocument();
    const paragraphs: NodeListOf<HTMLElement> = cards[0].querySelectorAll('.ai-page-card-body > p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].querySelector('strong')?.textContent).toBe('bold');
    expect(paragraphs[1].textContent).toBe('Second.');
    const meta: HTMLElement = cards[0].querySelector('.ai-page-card-meta') as HTMLElement;
    expect(meta.textContent).toBe('Copilot Chat · source');
    expect(within(meta).getByRole('link', { name: 'source' })).toHaveAttribute('href', 'https://s/x');
    expect(cards[1]).toHaveClass('ai-page-card--teal');
    expect(cards[1].querySelector('.ai-page-card-kicker')).toBeNull();
    expect(cards[1].querySelector('.ai-page-card-body')).toBeNull();
    expect(cards[1].querySelector('.ai-page-card-meta')).toBeNull();
  });

  it('carries no column modifier for two columns', () => {
    const { container } = renderWithFrontDoor(<CardsBlock block={{ ...BLOCK, columns: 2 }} />);
    expect(container.querySelector('.ai-page-cards')).not.toHaveClass('ai-page-cards--3');
    expect(container.querySelector('.ai-page-freshness')).toBeNull();
  });

  it('draws the freshness line of a dated card after its meta line, against the document clock and threshold', () => {
    const block: ICardsBlock = {
      type: 'cards',
      columns: 2,
      items: [
        { title: 'Current', body: ['x'], meta: 'Boundary.', tone: 'teal', asOf: '2026-09-01', source: 'AI CoE check' },
        { title: 'Stale', body: ['y'], tone: 'gold', asOf: '2026-08-01', source: 'AI CoE check' },
        { title: 'Undated', body: ['z'], tone: 'cyan', source: 'AI CoE check' },
        { title: 'Example', body: ['w'], tone: 'blue', asOf: '2026-09-10', illustrative: true }
      ]
    };
    const { container } = renderWithFrontDoor(<CardsBlock block={block} />, { now: new Date('2026-09-19T12:00:00Z') });
    const cards: NodeListOf<HTMLElement> = container.querySelectorAll('article.ai-page-card');
    expect(cards).toHaveLength(4);
    const current: HTMLElement = cards[0].querySelector('p.ai-page-freshness') as HTMLElement;
    expect(current.textContent).toBe('As of 1 Sep 2026 · AI CoE check');
    expect(current.previousElementSibling).toHaveClass('ai-page-card-meta');
    expect(cards[0].lastElementChild).toBe(current);
    expect(cards[0].querySelector('.ai-pill')).toBeNull();
    expect(cards[1].querySelector('p.ai-page-freshness')?.textContent).toBe('As of 1 Aug 2026 · AI CoE check Needs refresh');
    expect(cards[1].querySelector('.ai-pill--amber')).not.toBeNull();
    expect(cards[2].querySelector('p.ai-page-freshness')?.textContent).toBe('Awaiting source Do not infer progress.');
    expect(cards[2].textContent).not.toContain('As of');
    expect(cards[3].querySelector('p.ai-page-freshness')?.textContent).toBe('As of 10 Sep 2026 Example');
    expect(cards[3].querySelector('.ai-pill--blue')).not.toBeNull();
  });

  it('applies the freshness threshold of the document settings', () => {
    const block: ICardsBlock = { type: 'cards', columns: 2, items: [{ title: 'Dated', body: [], tone: 'teal', asOf: '2026-09-01' }] };
    const { container } = renderWithFrontDoor(<CardsBlock block={block} />, { now: new Date('2026-09-19T12:00:00Z'), settings: { freshnessDays: 7, minimumCohort: 5 } });
    expect(container.querySelector('p.ai-page-freshness')?.textContent).toBe('As of 1 Sep 2026 Needs refresh');
  });
});
