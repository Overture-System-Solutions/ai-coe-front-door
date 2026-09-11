import { fireEvent, screen, within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor } from '../../../testing/renderWithFrontDoor';
import { LandingPage } from './LandingPage';

function renderLanding(props: Partial<React.ComponentProps<typeof LandingPage>> = {}, options: Parameters<typeof renderWithFrontDoor>[1] = {}): {
  onSelect: jest.Mock;
  onOpenAdmin: jest.Mock;
} {
  const onSelect: jest.Mock = jest.fn();
  const onOpenAdmin: jest.Mock = jest.fn();
  renderWithFrontDoor(<LandingPage drafts={{}} onSelect={onSelect} onOpenAdmin={onOpenAdmin} {...props} />, options);
  return { onSelect, onOpenAdmin };
}

describe('LandingPage', () => {
  it('shows the hero with the organization badge and scrolls to the paths', () => {
    const scrollIntoView: jest.SpyInstance = jest.spyOn(Element.prototype, 'scrollIntoView');
    try {
      renderLanding();
      expect(screen.getByText('OVERTURE AI COE')).toHaveClass('ai-hero-badge');
      expect(screen.getByRole('heading', { level: 1, name: 'AI, safely put to work.' })).toBeInTheDocument();
      expect(screen.getByText('Ideas, guidance, training, and governance—start in the right place.')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Abstract connected network' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Choose your path' }));
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
      expect((scrollIntoView.mock.instances[0] as HTMLElement).id).toBe('ai-coe-paths');
    } finally {
      scrollIntoView.mockRestore();
    }
  });

  it('uses the neutral badge when no organization is configured', () => {
    renderLanding({}, { organizationName: '' });
    expect(screen.getByText('AI COE')).toHaveClass('ai-hero-badge');
  });

  it('lists the five paths in order and reports draft state on selection', () => {
    const { onSelect } = renderLanding({ drafts: { teamUsage: true } });
    const grid: HTMLElement = screen.getByRole('heading', { name: 'How can we help?' }).nextElementSibling as HTMLElement;
    const cards: HTMLElement[] = within(grid).getAllByRole('button');
    expect(cards.map((card: HTMLElement): string | null => card.querySelector('.ai-service-title')?.textContent ?? null)).toEqual([
      'Explore an AI idea',
      'Check a tool or task',
      'Register team AI use',
      'Get help or training',
      'Share feedback'
    ]);
    expect(cards.map((card: HTMLElement): string | null => card.querySelector('.ai-service-description')?.textContent ?? null)).toEqual([
      'Turn ideas into safe, valuable AI use.',
      'Review tools and tasks for safe use.',
      'Tell us how your team uses AI.',
      'Find guidance, training, and expert support.',
      'Help us improve the AI CoE experience.'
    ]);
    expect(cards[0]).toHaveClass('ai-service-card--teal');
    expect(cards[4]).toHaveClass('ai-service-card--cyan');
    expect(within(cards[2]).getByText('Resume draft')).toHaveClass('ai-draft-badge');
    expect(within(cards[0]).queryByText('Resume draft')).not.toBeInTheDocument();
    fireEvent.click(cards[0]);
    expect(onSelect).toHaveBeenLastCalledWith('idea', false);
    fireEvent.click(cards[2]);
    expect(onSelect).toHaveBeenLastCalledWith('teamUsage', true);
  });

  it('links the resource strip to the policy library and the related paths', () => {
    const { onSelect } = renderLanding({ drafts: { helpTraining: true } }, { siteUrl: 'https://contoso.sharepoint.com/sites/ai/' });
    const strip: HTMLElement = screen.getByRole('navigation', { name: 'Popular AI CoE resources' });
    expect(within(strip).getByRole('link', { name: 'AI policy' })).toHaveAttribute('href', 'https://contoso.sharepoint.com/sites/ai/AICoEPilotPolicies');
    fireEvent.click(within(strip).getByRole('button', { name: 'Approved tools' }));
    expect(onSelect).toHaveBeenLastCalledWith('toolCheck', false);
    fireEvent.click(within(strip).getByRole('button', { name: 'Upcoming training' }));
    expect(onSelect).toHaveBeenLastCalledWith('helpTraining', true);
  });

  it('falls back to a relative policy link without a site url', () => {
    renderLanding({}, { siteUrl: '' });
    expect(screen.getByRole('link', { name: 'AI policy' })).toHaveAttribute('href', '../AICoEPilotPolicies');
  });

  it('shows the administration bar only to site administrators', () => {
    const { onOpenAdmin } = renderLanding({}, { isAdmin: true });
    expect(screen.getByText('AI CoE administration')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open admin dashboard' }));
    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
  });

  it('hides the administration bar from everyone else and still shows telemetry', () => {
    renderLanding();
    expect(screen.queryByText('AI CoE administration')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI operations snapshot' })).toBeInTheDocument();
  });
});
