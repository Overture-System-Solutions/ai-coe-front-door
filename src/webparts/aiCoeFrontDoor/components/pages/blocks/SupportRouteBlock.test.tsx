import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../../testing/renderWithFrontDoor';
import type { ISupportRouteBlock } from '../../../content/pageContent';
import { NOT_YET_NAMED, REPORT_HEADING, STOP_HEADING, SUPPORT_TITLE, SupportRouteBlock } from './SupportRouteBlock';

const FULL: ISupportRouteBlock = {
  type: 'supportRoute',
  label: 'Ask in the pilot channel',
  href: 'https://teams.microsoft.com/l/channel/contoso',
  stopWhen: ['the signed-in account or destination is unclear', 'someone else\'s information appears', 'a source is missing'],
  reportFields: ['the task type', 'the time', 'the status shown', 'what you expected'],
  routes: [
    { issue: 'Wrong identity, audience or access', owner: 'Identity owner', action: 'Stop; do not widen access' },
    { issue: 'Outcome is uncertain after an action', action: 'Reconcile the native state before retrying' },
    { issue: 'A claim looks wrong', owner: 'Claims owner' }
  ]
};

describe('SupportRouteBlock', () => {
  it('renders a support section with a heading, the route as a link, the stop list, what to include and the routing grid', () => {
    const { container } = renderWithFrontDoor(<SupportRouteBlock block={FULL} />);
    const section: HTMLElement = container.querySelector('section.ai-page-support') as HTMLElement;
    expect(section).not.toBeNull();
    expect(within(section).getByRole('heading', { level: 2, name: SUPPORT_TITLE })).toBeInTheDocument();
    expect(SUPPORT_TITLE).toBe('Support');
    const link: HTMLElement = within(section).getByRole('link', { name: 'Ask in the pilot channel' });
    expect(link).toHaveAttribute('href', 'https://teams.microsoft.com/l/channel/contoso');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(section).getByRole('heading', { level: 3, name: STOP_HEADING })).toBeInTheDocument();
    expect(within(section).getByRole('heading', { level: 3, name: REPORT_HEADING })).toBeInTheDocument();
    expect(REPORT_HEADING).toBe('What to include');
    const stop: NodeListOf<HTMLElement> = section.querySelectorAll('ul.ai-page-support-stop > li');
    expect(Array.prototype.map.call(stop, (item: HTMLElement): string | null => item.textContent)).toEqual(FULL.stopWhen);
    const report: NodeListOf<HTMLElement> = section.querySelectorAll('ul.ai-page-support-report > li');
    expect(Array.prototype.map.call(report, (item: HTMLElement): string | null => item.textContent)).toEqual(FULL.reportFields);
    // The routing grid is a description list, never a table element or role.
    const grid: HTMLElement = section.querySelector('dl.ai-page-support-grid') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(section.querySelector('table')).toBeNull();
    expect(section.querySelector('[role="table"]')).toBeNull();
    const issues: NodeListOf<HTMLElement> = grid.querySelectorAll('dt');
    expect(Array.prototype.map.call(issues, (item: HTMLElement): string | null => item.textContent)).toEqual([
      'Wrong identity, audience or access',
      'Outcome is uncertain after an action',
      'A claim looks wrong'
    ]);
    const rows: NodeListOf<HTMLElement> = grid.querySelectorAll('.ai-page-support-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelector('dd.ai-page-support-owner')?.textContent).toContain('Identity owner');
    expect(rows[0].querySelector('dd.ai-page-support-action')?.textContent).toContain('Stop; do not widen access');
    // A blank owner is said to be blank, never left as an empty cell.
    expect(rows[1].querySelector('dd.ai-page-support-owner')?.textContent).toContain(NOT_YET_NAMED);
    expect(NOT_YET_NAMED).toBe('not yet named');
    expect(rows[1].querySelector('dd.ai-page-support-action')?.textContent).toContain('Reconcile the native state before retrying');
    expect(rows[2].querySelector('dd.ai-page-support-owner')?.textContent).toContain('Claims owner');
    expect(rows[2].querySelector('dd.ai-page-support-action')).toBeNull();
  });

  it('shows the route as a plain label without a link and leaves out empty lists and an empty grid', () => {
    const { container } = renderWithFrontDoor(<SupportRouteBlock block={{ type: 'supportRoute', label: 'Ask the AI CoE', stopWhen: [], reportFields: [], routes: [] }} />);
    const section: HTMLElement = container.querySelector('section.ai-page-support') as HTMLElement;
    expect(within(section).getByRole('heading', { level: 2, name: 'Support' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(section.querySelector('.ai-page-support-route')?.textContent).toBe('Ask the AI CoE');
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    expect(section.querySelector('ul')).toBeNull();
    expect(section.querySelector('dl')).toBeNull();
  });

  it('resolves a site path against the site and keeps it in the same tab', () => {
    renderWithFrontDoor(<SupportRouteBlock block={{ type: 'supportRoute', label: 'Get help or training', href: 'SitePages/Get-help-or-training.aspx', stopWhen: [], reportFields: [], routes: [] }} />);
    const link: HTMLElement = screen.getByRole('link', { name: 'Get help or training' });
    expect(link).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Get-help-or-training.aspx`);
    expect(link).not.toHaveAttribute('target');
  });
});
