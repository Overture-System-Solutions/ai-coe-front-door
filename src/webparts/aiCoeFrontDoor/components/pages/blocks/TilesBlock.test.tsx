import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../../testing/renderWithFrontDoor';
import type { ITilesBlock } from '../../../content/pageContent';
import type { RouteTable } from '../../../content/routes';
import { TilesBlock } from './TilesBlock';

const BLOCK: ITilesBlock = {
  type: 'tiles',
  items: [
    { title: 'Ask the AI CoE', href: 'https://teams.microsoft.com/l/x', description: 'Talk to us', icon: 'MessageSquare', tone: 'teal' },
    { title: 'Check status', href: 'SitePages/Status.aspx', icon: 'NoSuchIcon', tone: 'blue' }
  ]
};

describe('TilesBlock', () => {
  it('renders every tile as a service-card link with its icon, copy and arrow', () => {
    const { container } = renderWithFrontDoor(<TilesBlock block={BLOCK} />);
    const tiles: NodeListOf<HTMLAnchorElement> = container.querySelectorAll('.ai-page-tiles > a.ai-service-card');
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveClass('ai-service-card--teal');
    expect(tiles[0]).toHaveAttribute('href', 'https://teams.microsoft.com/l/x');
    expect(tiles[0]).toHaveAttribute('target', '_blank');
    expect(tiles[0].querySelector('svg.ai-service-icon')).not.toBeNull();
    expect(tiles[0].querySelector('.ai-service-copy > .ai-service-title')?.textContent).toBe('Ask the AI CoE');
    expect(tiles[0].querySelector('.ai-service-copy > .ai-service-description')?.textContent).toBe('Talk to us');
    expect(tiles[0].querySelector('svg.ai-service-arrow')).not.toBeNull();
    expect(tiles[1]).toHaveClass('ai-service-card--blue');
    expect(tiles[1]).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Status.aspx`);
    expect(tiles[1]).not.toHaveAttribute('target');
    expect(tiles[1].querySelector('.ai-service-description')).toBeNull();
    expect(tiles[1].querySelector('svg.ai-service-icon')).not.toBeNull();
    expect(container.querySelector('.ai-page-tiles--prominent')).toBeNull();
    expect(container.querySelector('.ai-pill')).toBeNull();
  });
});

const ROUTES: RouteTable = {
  guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
  work: { key: 'work', label: 'Work command', state: 'availableNow', note: 'Not yet proved on this site.' },
  assistant: { key: 'assistant', label: 'Ask the assistant', href: 'https://assistant.example/chat', state: 'availableNow', verifiedOn: '2026-09-01', receiptRef: 'TQ-0007' },
  improve: { key: 'improve', label: 'Improve a task', href: 'SitePages/Check-a-tool-or-task.aspx', state: 'availableNow' }
};

const PROMINENT: ITilesBlock = {
  type: 'tiles',
  prominent: true,
  items: [
    { title: 'Get work done', kicker: 'Do', description: 'Say what you need.', route: 'work', icon: 'Lightbulb', tone: 'teal' },
    { title: 'Ask the assistant', kicker: 'Ask', route: 'assistant', note: 'Opens in a new tab.', tone: 'blue' },
    { title: 'Improve a task', kicker: 'Improve', route: 'improve', tone: 'gold' },
    { title: 'Agent builder', state: 'DESIGNED', tone: 'violet' },
    { title: 'Old tool', href: 'https://old.example/', state: 'RETIRED', tone: 'cyan' }
  ]
};

describe('TilesBlock with action states', () => {
  it('lays prominent tiles out three to a row with their kicker, note and state pill', () => {
    const { container } = renderWithFrontDoor(<TilesBlock block={PROMINENT} />, { routes: ROUTES, now: new Date('2026-09-20T12:00:00Z') });
    const grid: HTMLElement = container.querySelector('.ai-page-tiles') as HTMLElement;
    expect(grid).toHaveClass('ai-page-tiles--prominent');
    const cards: NodeListOf<HTMLElement> = grid.querySelectorAll('.ai-service-card');
    expect(cards).toHaveLength(4);
    expect(cards[0].querySelector('p.ai-service-kicker')?.textContent).toBe('Do');
    expect(cards[1].querySelector('span.ai-service-note')?.textContent).toBe('Opens in a new tab.');
    expect(cards[2].querySelector('.ai-service-note')).toBeNull();
    expect(screen.queryByText('Old tool')).not.toBeInTheDocument();
  });

  it('renders a closed tile as a labelled non-link with the pill and the fallback link, never the external href', () => {
    const { container } = renderWithFrontDoor(<TilesBlock block={PROMINENT} />, { routes: ROUTES, now: new Date('2026-09-20T12:00:00Z') });
    const closed: HTMLElement = screen.getByText('Get work done').closest('.ai-service-card') as HTMLElement;
    expect(closed.tagName).toBe('DIV');
    expect(closed).toHaveClass('ai-service-card--closed');
    expect(closed).toHaveAttribute('aria-disabled', 'true');
    expect(closed).not.toHaveAttribute('href');
    expect(closed.querySelector('svg.ai-service-arrow')).toBeNull();
    const pill: HTMLElement = closed.querySelector('.ai-pill') as HTMLElement;
    expect(pill).toHaveClass('ai-pill--amber');
    expect(pill.textContent).toBe('Needs access');
    expect(closed.querySelector('.ai-service-note')?.textContent).toBe('Not yet proved on this site.');
    const fallback: HTMLElement = within(closed).getByRole('link', { name: 'Start a guided request' });
    expect(fallback).toHaveClass('ai-service-fallback');
    expect(fallback).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Explore-an-AI-idea.aspx`);
    expect(fallback).not.toHaveAttribute('target');
    const designed: HTMLElement = screen.getByText('Agent builder').closest('.ai-service-card') as HTMLElement;
    expect(designed).toHaveClass('ai-service-card--closed');
    expect(designed.querySelector('.ai-pill')?.textContent).toBe('Coming: not yet enabled');
    expect(within(designed).queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelectorAll('a[href*="somewhere"], a[href*="old.example"]')).toHaveLength(0);
  });

  it('opens an available external route in a new tab and an on-site route in the same tab, both with the pill', () => {
    renderWithFrontDoor(<TilesBlock block={PROMINENT} />, { routes: ROUTES, now: new Date('2026-09-20T12:00:00Z') });
    const assistant: HTMLElement = screen.getByText('Ask the assistant').closest('a') as HTMLElement;
    expect(assistant).toHaveClass('ai-service-card');
    expect(assistant).not.toHaveClass('ai-service-card--closed');
    expect(assistant).toHaveAttribute('href', 'https://assistant.example/chat');
    expect(assistant).toHaveAttribute('target', '_blank');
    expect(assistant).toHaveAttribute('rel', 'noopener noreferrer');
    expect(assistant.querySelector('.ai-pill')?.textContent).toBe('Available now');
    expect(assistant.querySelector('svg.ai-service-arrow')).not.toBeNull();
    const improve: HTMLElement = screen.getByText('Improve a task').closest('a') as HTMLElement;
    expect(improve).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Check-a-tool-or-task.aspx`);
    expect(improve).not.toHaveAttribute('target');
    expect(improve.querySelector('.ai-pill--green')).not.toBeNull();
  });

  it('closes an off-site route the clock says is not yet proved', () => {
    renderWithFrontDoor(<TilesBlock block={PROMINENT} />, { routes: ROUTES, now: new Date('2026-08-01T12:00:00Z') });
    const assistant: HTMLElement = screen.getByText('Ask the assistant').closest('.ai-service-card') as HTMLElement;
    expect(assistant.tagName).toBe('DIV');
    expect(assistant.querySelector('.ai-pill')?.textContent).toBe('Awaiting source');
  });
});
