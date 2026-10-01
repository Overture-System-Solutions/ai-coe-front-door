/* eslint-disable no-script-url -- the script URL is the hostile input the href guard is tested against */
import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../../testing/renderWithFrontDoor';
import { createBranding } from '../../../branding/branding';
import type { IHeroBlock } from '../../../content/pageContent';
import type { RouteTable } from '../../../content/routes';
import { HeroBlock } from './HeroBlock';

const BLOCK: IHeroBlock = {
  type: 'hero',
  title: 'What do you need done?',
  text: 'Ask in [Teams](https://teams.microsoft.com/l/x) first.',
  cta: { label: 'Start a request', href: 'SitePages/Requests.aspx' }
};

describe('HeroBlock', () => {
  it('renders the landing page hero with the block title, text and call to action', () => {
    const { container } = renderWithFrontDoor(<HeroBlock block={BLOCK} />);
    const hero: HTMLElement = container.querySelector('section.ai-hero') as HTMLElement;
    expect(hero).toHaveAttribute('aria-labelledby', 'ai-hero-title');
    expect(screen.getByRole('heading', { level: 1, name: 'What do you need done?' })).toHaveAttribute('id', 'ai-hero-title');
    expect(screen.getByText(createBranding('Overture').heroBadge)).toHaveClass('ai-hero-badge');
    expect(hero.querySelector('.ai-hero-copy > p')?.textContent).toBe('Ask in Teams first.');
    expect(within(hero).getByRole('link', { name: 'Teams' })).toHaveAttribute('href', 'https://teams.microsoft.com/l/x');
    const cta: HTMLElement = screen.getByRole('link', { name: 'Start a request' });
    expect(cta).toHaveClass('ai-hero-cta');
    expect(cta).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Requests.aspx`);
    expect(cta.querySelector('svg')).not.toBeNull();
    expect(hero.querySelector('.ai-hero-copy + *')).not.toBeNull();
  });

  it('draws the illustration as decoration: hidden from assistive technology, with no image role or name', () => {
    const { container } = renderWithFrontDoor(<HeroBlock block={BLOCK} />);
    const illustration: HTMLElement = container.querySelector('section.ai-hero > svg.ai-hero-network') as HTMLElement;
    expect(illustration).not.toBeNull();
    expect(illustration).toHaveAttribute('aria-hidden', 'true');
    expect(illustration).not.toHaveAttribute('role');
    expect(illustration).not.toHaveAttribute('aria-label');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { hidden: true, name: 'Abstract connected network' })).not.toBeInTheDocument();
  });

  it('uses the badge from the block and leaves out what the block does not have', () => {
    const { container } = renderWithFrontDoor(<HeroBlock block={{ type: 'hero', title: 'Welcome', badge: 'Private pilot' }} />);
    expect(screen.getByText('Private pilot')).toHaveClass('ai-hero-badge');
    expect(screen.queryByText(createBranding('Overture').heroBadge)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('.ai-hero-copy p')).toBeNull();
    expect(container.querySelector('.ai-pill')).toBeNull();
  });

  it('renders a closed call to action as a labelled non-link with the pill, its note and the fallback link', () => {
    const routes: RouteTable = {
      guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
      work: { key: 'work', label: 'Work command', state: 'availableNow' }
    };
    const { container } = renderWithFrontDoor(<HeroBlock block={{ type: 'hero', title: 'Welcome', cta: { label: 'Get work done', route: 'work', note: 'Until then, use the guided request.' } }} />, { routes });
    const closed: HTMLElement = container.querySelector('.ai-hero-cta') as HTMLElement;
    expect(closed.tagName).toBe('SPAN');
    expect(closed).toHaveClass('ai-hero-cta--closed');
    expect(closed).toHaveAttribute('aria-disabled', 'true');
    expect(closed.textContent).toContain('Get work done');
    expect(closed.querySelector('.ai-pill--amber')?.textContent).toBe('Needs access');
    expect(container.querySelector('.ai-hero-note')?.textContent).toBe('Until then, use the guided request.');
    const fallback: HTMLElement = screen.getByRole('link', { name: 'Start a guided request' });
    expect(fallback).toHaveClass('ai-hero-fallback');
    expect(fallback).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Explore-an-AI-idea.aspx`);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('opens an available route as the call to action, with the pill beside it', () => {
    const routes: RouteTable = {
      guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
      assistant: { key: 'assistant', label: 'Ask the assistant', href: 'https://assistant.example/chat', state: 'availableNow', verifiedOn: '2026-09-01', receiptRef: 'TQ-0007' }
    };
    const { container } = renderWithFrontDoor(<HeroBlock block={{ type: 'hero', title: 'Welcome', cta: { label: 'Ask the assistant', route: 'assistant' } }} />, { routes, now: new Date('2026-09-20T12:00:00Z') });
    const cta: HTMLElement = screen.getByRole('link', { name: 'Ask the assistant' });
    expect(cta).toHaveClass('ai-hero-cta');
    expect(cta).toHaveAttribute('href', 'https://assistant.example/chat');
    expect(cta).toHaveAttribute('target', '_blank');
    expect(cta).toHaveAttribute('rel', 'noopener noreferrer');
    expect(cta.querySelector('.ai-pill')).toBeNull();
    expect(container.querySelector('.ai-hero-state .ai-pill--green')?.textContent).toBe('Available now');
  });

  it('renders a call to action and a text link whose href carries a scheme outside the allow-list as dead anchors in the same tab', () => {
    const hostile: IHeroBlock = {
      type: 'hero',
      title: 'Welcome',
      text: 'Never [run this](javascript:alert(1)).',
      cta: { label: 'Run me', href: 'javascript:alert(1)' }
    };
    const { container } = renderWithFrontDoor(<HeroBlock block={hostile} />);
    const cta: HTMLElement = screen.getByRole('link', { name: 'Run me' });
    expect(cta).toHaveClass('ai-hero-cta');
    expect(cta).toHaveAttribute('href', '#');
    expect(cta).not.toHaveAttribute('target');
    expect(cta).not.toHaveAttribute('rel');
    const textLink: HTMLElement = screen.getByRole('link', { name: 'run this' });
    expect(textLink).toHaveAttribute('href', '#');
    expect(textLink).not.toHaveAttribute('target');
    expect(container.innerHTML).not.toContain('javascript:');
  });

  it('closes a call to action the script marked as needing access, with no link at all', () => {
    const { container } = renderWithFrontDoor(<HeroBlock block={{ type: 'hero', title: 'Welcome', cta: { label: 'Ask the AI CoE', state: 'needsAccess' } }} />);
    expect(container.querySelector('.ai-hero-cta--closed')?.textContent).toContain('Ask the AI CoE');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
