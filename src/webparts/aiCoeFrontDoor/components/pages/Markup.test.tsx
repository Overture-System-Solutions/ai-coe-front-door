import { screen } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../testing/renderWithFrontDoor';
import { anchorProps, Markup } from './Markup';

describe('Markup', () => {
  it('renders strong, emphasised and linked runs', () => {
    const { container } = renderWithFrontDoor(
      <p>
        <Markup text="Ask **now**, *please*: [Teams](https://teams.microsoft.com/l/x) or [Requests](SitePages/R.aspx) or [top](#paths)." />
      </p>
    );
    const paragraph: HTMLElement = container.querySelector('p') as HTMLElement;
    expect(paragraph.textContent).toBe('Ask now, please: Teams or Requests or top.');
    expect(paragraph.querySelector('strong')?.textContent).toBe('now');
    expect(paragraph.querySelector('em')?.textContent).toBe('please');
    const teams: HTMLElement = screen.getByRole('link', { name: 'Teams' });
    expect(teams).toHaveAttribute('href', 'https://teams.microsoft.com/l/x');
    expect(teams).toHaveAttribute('target', '_blank');
    expect(teams).toHaveAttribute('rel', 'noopener noreferrer');
    const requests: HTMLElement = screen.getByRole('link', { name: 'Requests' });
    expect(requests).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/R.aspx`);
    expect(requests).not.toHaveAttribute('target');
    expect(screen.getByRole('link', { name: 'top' })).toHaveAttribute('href', '#paths');
  });

  it('renders plain text as it is', () => {
    const { container } = renderWithFrontDoor(
      <p>
        <Markup text="Nothing [special] here * at all." />
      </p>
    );
    expect(container.querySelector('p')?.innerHTML).toBe('Nothing [special] here * at all.');
  });

  it('opens only urls on another origin in a new tab', () => {
    expect(anchorProps(TEST_SITE_URL, 'https://x/y')).toEqual({ href: 'https://x/y', target: '_blank', rel: 'noopener noreferrer' });
    expect(anchorProps(TEST_SITE_URL, 'https://contoso.sharepoint.com/sites/other/x.aspx')).toEqual({ href: 'https://contoso.sharepoint.com/sites/other/x.aspx' });
    expect(anchorProps(TEST_SITE_URL, `${TEST_SITE_URL}/SitePages/R.aspx`)).toEqual({ href: `${TEST_SITE_URL}/SitePages/R.aspx` });
    expect(anchorProps(TEST_SITE_URL, 'HTTPS://CONTOSO.sharepoint.com/sites/ai/x')).toEqual({ href: 'HTTPS://CONTOSO.sharepoint.com/sites/ai/x' });
    expect(anchorProps(TEST_SITE_URL, '/sites/ai/SitePages/R.aspx')).toEqual({ href: '/sites/ai/SitePages/R.aspx' });
    expect(anchorProps(TEST_SITE_URL, '#paths')).toEqual({ href: '#paths' });
    expect(anchorProps('', 'https://x/y')).toEqual({ href: 'https://x/y', target: '_blank', rel: 'noopener noreferrer' });
  });
});
