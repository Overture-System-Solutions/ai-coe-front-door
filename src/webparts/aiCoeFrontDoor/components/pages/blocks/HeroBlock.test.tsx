import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../../testing/renderWithFrontDoor';
import { createBranding } from '../../../branding/branding';
import type { IHeroBlock } from '../../../content/pageContent';
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

  it('uses the badge from the block and leaves out what the block does not have', () => {
    const { container } = renderWithFrontDoor(<HeroBlock block={{ type: 'hero', title: 'Welcome', badge: 'Private pilot' }} />);
    expect(screen.getByText('Private pilot')).toHaveClass('ai-hero-badge');
    expect(screen.queryByText(createBranding('Overture').heroBadge)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('.ai-hero-copy p')).toBeNull();
  });
});
