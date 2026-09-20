import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { createFakeUsageService } from '../../../testing/fakeServices';
import type { IFakeUsageMetricsService } from '../../../testing/fakeServices';
import { renderWithFrontDoor } from '../../../testing/renderWithFrontDoor';
import type { FrontDoorRenderResult, ITestFrontDoorOptions } from '../../../testing/renderWithFrontDoor';
import type { PageLinks } from '../content/pageViews';
import { HomePage, NO_PATHS_TEXT } from './HomePage';
import type { DraftFlags } from './LandingPage';

const SITE: string = 'https://contoso.sharepoint.com/sites/ai';
const PAGES: PageLinks = {
  idea: `${SITE}/SitePages/Explore-an-AI-idea.aspx`,
  toolCheck: `${SITE}/SitePages/Check-a-tool-or-task.aspx`,
  teamUsage: `${SITE}/SitePages/Register-team-AI-use.aspx`,
  helpTraining: `${SITE}/SitePages/Get-help-or-training.aspx`,
  feedback: `${SITE}/SitePages/Share-feedback.aspx`,
  admin: `${SITE}/SitePages/AI-CoE-admin-dashboard.aspx`,
  telemetry: `${SITE}/SitePages/Status.aspx`,
  policy: `${SITE}/SitePages/Policy.aspx`
};

function renderHome(pages: PageLinks, drafts: DraftFlags = {}, options: ITestFrontDoorOptions = {}): FrontDoorRenderResult {
  return renderWithFrontDoor(<HomePage drafts={drafts} pages={pages} />, options);
}

function grid(): HTMLElement {
  return screen.getByRole('heading', { name: 'How can we help?' }).nextElementSibling as HTMLElement;
}

describe('HomePage', () => {
  it('links the mapped paths in home order with icons, copy, tones and draft badges', () => {
    renderHome({ idea: PAGES.idea, teamUsage: PAGES.teamUsage, feedback: PAGES.feedback }, { teamUsage: true });
    const cards: HTMLElement[] = within(grid()).getAllByRole('link');
    expect(cards.map((card: HTMLElement): string | null => card.querySelector('.ai-service-title')?.textContent ?? null)).toEqual([
      'Explore an AI idea',
      'Register team AI use',
      'Share feedback'
    ]);
    expect(cards.map((card: HTMLElement): string | null => card.querySelector('.ai-service-description')?.textContent ?? null)).toEqual([
      'Turn ideas into safe, valuable AI use.',
      'Tell us how your team uses AI.',
      'Help us improve the AI CoE experience.'
    ]);
    expect(cards.map((card: HTMLElement): string | null => card.getAttribute('href'))).toEqual([PAGES.idea, PAGES.teamUsage, PAGES.feedback]);
    expect(cards[0]).toHaveClass('ai-service-card', 'ai-service-card--teal');
    expect(cards[2]).toHaveClass('ai-service-card--cyan');
    expect(cards[0].querySelector('.ai-service-icon')).not.toBeNull();
    expect(cards[0].querySelector('.ai-service-arrow')).not.toBeNull();
    expect(within(cards[1]).getByText('Resume draft')).toHaveClass('ai-draft-badge');
    expect(within(cards[0]).queryByText('Resume draft')).not.toBeInTheDocument();
    expect(within(grid()).queryAllByRole('button')).toHaveLength(0);
  });

  it('leaves the outcome record out of the grid while no outcome page is linked', () => {
    renderHome(PAGES);
    expect(within(grid()).getAllByRole('link')).toHaveLength(5);
    expect(screen.queryByText('Record a task outcome')).not.toBeInTheDocument();
  });

  it('offers the outcome record as a sixth card, last, when the page is linked (decision 16)', () => {
    const outcome: string = `${SITE}/SitePages/Record-an-outcome.aspx`;
    renderHome({ ...PAGES, outcome });
    const cards: HTMLElement[] = within(grid()).getAllByRole('link');
    expect(cards).toHaveLength(6);
    expect(cards[5].querySelector('.ai-service-title')?.textContent).toBe('Record a task outcome');
    expect(cards[5]).toHaveAttribute('href', outcome);
    expect(cards[5].querySelector('.ai-service-icon')).not.toBeNull();
    expect(within(cards[5]).queryByText('Resume draft')).not.toBeInTheDocument();
  });

  it('shows a notice instead of the grid when no path is linked', () => {
    const { container } = renderHome({});
    expect(screen.getByRole('heading', { name: 'How can we help?' })).toBeInTheDocument();
    expect(screen.getByText(NO_PATHS_TEXT).closest('.overture-notice')).not.toBeNull();
    expect(container.querySelector('.ai-home-grid')).toBeNull();
  });

  it('renders no hero, telemetry or page title', () => {
    const usage: IFakeUsageMetricsService = createFakeUsageService();
    renderHome(PAGES, {}, { usage });
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByText('AI, safely put to work.')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Abstract connected network' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'AI operations snapshot' })).not.toBeInTheDocument();
    expect(usage.calls).toBe(0);
  });

  it('links the resource strip to the policy page and the mapped paths', () => {
    renderHome({ policy: PAGES.policy, toolCheck: PAGES.toolCheck });
    const strip: HTMLElement = screen.getByRole('navigation', { name: 'Popular AI CoE resources' });
    expect(within(strip).getByRole('link', { name: 'AI policy' })).toHaveAttribute('href', PAGES.policy);
    expect(within(strip).getByRole('link', { name: 'Approved tools' })).toHaveAttribute('href', PAGES.toolCheck);
    expect(within(strip).getByRole('link', { name: 'AI policy' })).toHaveClass('ai-resource-link');
    expect(within(strip).getByRole('link', { name: 'Approved tools' })).toHaveClass('ai-resource-link');
    expect(within(strip).queryByText('Upcoming training')).not.toBeInTheDocument();
    expect(within(strip).queryByText('AI operations snapshot')).not.toBeInTheDocument();
    expect(strip).not.toHaveClass('ai-resource-strip--four');
    expect(within(strip).queryAllByRole('button')).toHaveLength(0);
  });

  it('links the operations snapshot page from the resource strip and widens the strip to four entries', () => {
    const { unmount } = renderHome({ telemetry: PAGES.telemetry });
    const strip: HTMLElement = screen.getByRole('navigation', { name: 'Popular AI CoE resources' });
    expect(within(strip).getAllByRole('link')).toHaveLength(2);
    expect(within(strip).getByRole('link', { name: 'AI operations snapshot' })).toHaveAttribute('href', PAGES.telemetry);
    expect(within(strip).getByRole('link', { name: 'AI operations snapshot' })).toHaveClass('ai-resource-link');
    expect(strip).not.toHaveClass('ai-resource-strip--four');
    unmount();
    renderHome(PAGES);
    const full: HTMLElement = screen.getByRole('navigation', { name: 'Popular AI CoE resources' });
    expect(within(full).getAllByRole('link').map((link: HTMLElement): string => link.textContent ?? '')).toEqual([
      'AI policy',
      'Approved tools',
      'Upcoming training',
      'AI operations snapshot'
    ]);
    expect(full).toHaveClass('ai-resource-strip', 'ai-resource-strip--four');
  });

  it('falls back to the policy library of the site when no policy page is mapped', () => {
    renderHome({}, {}, { siteUrl: `${SITE}/` });
    const strip: HTMLElement = screen.getByRole('navigation', { name: 'Popular AI CoE resources' });
    expect(within(strip).getAllByRole('link')).toHaveLength(1);
    expect(within(strip).getByRole('link', { name: 'AI policy' })).toHaveAttribute('href', `${SITE}/AICoEPilotPolicies`);
  });

  it('shows the administration bar to administrators with a mapped admin page', () => {
    renderHome({ admin: PAGES.admin }, {}, { isAdmin: true });
    expect(screen.getByText('AI CoE administration')).toBeInTheDocument();
    const link: HTMLElement = screen.getByRole('link', { name: 'Open admin dashboard' });
    expect(link).toHaveAttribute('href', PAGES.admin);
    expect(link).toHaveClass('ai-admin-back');
    expect(link.closest('.ai-home-adminbar')).not.toBeNull();
  });

  it('hides the administration bar without an admin page or for non-administrators', () => {
    const withoutPage: FrontDoorRenderResult = renderHome({ idea: PAGES.idea }, {}, { isAdmin: true });
    expect(screen.queryByText('AI CoE administration')).not.toBeInTheDocument();
    withoutPage.unmount();
    renderHome({ admin: PAGES.admin }, {}, { isAdmin: false });
    expect(screen.queryByText('AI CoE administration')).not.toBeInTheDocument();
  });
});
