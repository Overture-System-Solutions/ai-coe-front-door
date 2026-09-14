import * as React from 'react';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../../testing/renderWithFrontDoor';
import type { ITilesBlock } from '../../../content/pageContent';
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
  });
});
