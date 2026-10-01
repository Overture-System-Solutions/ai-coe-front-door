import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../../testing/renderWithFrontDoor';
import type { ICardsBlock } from '../../../content/pageContent';
import type { RouteTable } from '../../../content/routes';
import { CardsBlock } from './CardsBlock';

const ROUTES: RouteTable = {
  guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
  work: { key: 'work', label: 'Work command', state: 'availableNow', note: 'Not yet proved on this site.' },
  assistant: { key: 'assistant', label: 'Ask the assistant', href: 'https://assistant.example/chat', state: 'availableNow', verifiedOn: '2026-09-01', receiptRef: 'TQ-0007' }
};

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

describe('CardsBlock with action states', () => {
  const block: ICardsBlock = {
    type: 'cards',
    columns: 2,
    items: [
      { title: 'Routed and closed', body: ['The work route is not proved here.'], meta: 'Boundary.', tone: 'teal', route: 'work', asOf: '2026-09-01', source: 'AI CoE check' },
      { title: 'Closed by state', body: ['Nothing here runs by itself.'], tone: 'gold', state: 'notSupported' },
      { title: 'Routed and open', body: ['The assistant is proved.'], tone: 'blue', route: 'assistant' },
      { title: 'Plain', body: ['No claim.'], tone: 'cyan' },
      { title: 'Plain link', body: ['A link is not a claim.'], tone: 'violet', href: 'SitePages/Status.aspx' },
      { title: 'Retired', body: ['Gone.'], tone: 'teal', state: 'RETIRED' }
    ]
  };

  it('resolves a routed card like a tile: the pill, the route note and the fallback link when closed, and the card keeps its words', () => {
    const { container } = renderWithFrontDoor(<CardsBlock block={block} />, { routes: ROUTES, now: new Date('2026-09-19T12:00:00Z') });
    const cards: NodeListOf<HTMLElement> = container.querySelectorAll('article.ai-page-card');
    expect(cards).toHaveLength(6);
    const closed: HTMLElement = cards[0];
    expect(closed).toHaveClass('ai-page-card--closed');
    expect(closed.tagName).toBe('ARTICLE');
    expect(closed).not.toHaveAttribute('href');
    expect(within(closed).getByRole('heading', { level: 3, name: 'Routed and closed' })).toBeInTheDocument();
    expect(closed.querySelector('.ai-page-card-body')?.textContent).toBe('The work route is not proved here.');
    const state: HTMLElement = closed.querySelector('p.ai-page-card-state') as HTMLElement;
    const pill: HTMLElement = state.querySelector('.ai-pill') as HTMLElement;
    expect(pill).toHaveClass('ai-pill--amber');
    expect(pill.textContent).toBe('Needs access');
    expect(state.querySelector('.ai-page-card-note')?.textContent).toBe('Not yet proved on this site.');
    const fallback: HTMLElement = within(state).getByRole('link', { name: 'Start a guided request' });
    expect(fallback).toHaveClass('ai-page-card-fallback');
    expect(fallback).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Explore-an-AI-idea.aspx`);
    expect(fallback).not.toHaveAttribute('target');
    // Order inside the card: kicker, title, body, meta, the state line, then the freshness line last.
    expect(state.previousElementSibling).toHaveClass('ai-page-card-meta');
    expect(state.nextElementSibling).toHaveClass('ai-page-freshness');
    expect(closed.lastElementChild).toHaveClass('ai-page-freshness');
    expect(closed.querySelector('p.ai-page-freshness')?.textContent).toBe('As of 1 Sep 2026 · AI CoE check');
    // The external href of a closed route never reaches the page.
    expect(container.innerHTML).not.toContain('assistant.example');
  });

  it('closes a card by its state alone, with no fallback, and drops a retired state', () => {
    const { container } = renderWithFrontDoor(<CardsBlock block={block} />, { routes: ROUTES, now: new Date('2026-09-19T12:00:00Z') });
    const cards: NodeListOf<HTMLElement> = container.querySelectorAll('article.ai-page-card');
    const byState: HTMLElement = cards[1];
    expect(byState).toHaveClass('ai-page-card--closed');
    expect(byState.querySelector('.ai-pill')).toHaveClass('ai-pill--red');
    expect(byState.querySelector('.ai-pill')?.textContent).toBe('Not supported');
    expect(byState.querySelector('.ai-page-card-fallback')).toBeNull();
    expect(byState.querySelector('.ai-page-card-note')).toBeNull();
    expect(byState.querySelector('.ai-page-freshness')).toBeNull();
    // A retired state is no state: the card stays, its state line does not.
    const retired: HTMLElement = cards[5];
    expect(retired).not.toHaveClass('ai-page-card--closed');
    expect(retired.querySelector('.ai-page-card-state')).toBeNull();
    expect(screen.getByText('Retired')).toBeInTheDocument();
  });

  it('draws only the pill for an open route and nothing for a card that makes no claim', () => {
    const { container } = renderWithFrontDoor(<CardsBlock block={block} />, { routes: ROUTES, now: new Date('2026-09-19T12:00:00Z') });
    const cards: NodeListOf<HTMLElement> = container.querySelectorAll('article.ai-page-card');
    const open: HTMLElement = cards[2];
    expect(open).not.toHaveClass('ai-page-card--closed');
    expect(open.querySelector('.ai-pill')).toHaveClass('ai-pill--green');
    expect(open.querySelector('.ai-pill')?.textContent).toBe('Available now');
    // A card is a fact, not a control: the open route's link is carried by the tiles and the hero, never by the card.
    expect(open.querySelector('a')).toBeNull();
    expect(container.innerHTML).not.toContain('assistant.example');
    for (const plain of [cards[3], cards[4]]) {
      expect(plain).not.toHaveClass('ai-page-card--closed');
      expect(plain.querySelector('.ai-page-card-state')).toBeNull();
      expect(plain.querySelector('.ai-pill')).toBeNull();
    }
  });

  it('reads the pill wording from the document vocabulary', () => {
    const { container } = renderWithFrontDoor(<CardsBlock block={{ ...block, items: [block.items[1]] }} />, {
      routes: ROUTES,
      vocabulary: { truthStates: { notSupported: { label: 'Not here' } }, requestStatuses: {}, chrome: {}, roles: {}, telemetry: {} }
    });
    expect(container.querySelector('.ai-pill')?.textContent).toBe('Not here');
  });
});
