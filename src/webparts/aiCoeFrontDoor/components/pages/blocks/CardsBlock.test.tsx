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
  });
});
