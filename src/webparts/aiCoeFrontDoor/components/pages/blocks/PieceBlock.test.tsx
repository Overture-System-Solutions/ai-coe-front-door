/* eslint-disable no-script-url -- the script URL is the hostile input the href guard is tested against */
import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { createFakeMyWorkService, createFakeUsageService } from '../../../../../testing/fakeServices';
import type { IFakeMyWorkService } from '../../../../../testing/fakeServices';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../../testing/renderWithFrontDoor';
import type { IPieceBlock, IVocabulary } from '../../../content/pageContent';
import type { IUsageMetricsResult } from '../../../services/types';
import { MY_WORK_HEADING } from '../MyWork';
import { PieceBlock } from './PieceBlock';

describe('PieceBlock', () => {
  it('embeds the home tiles with the document links resolved and draft badges applied', () => {
    const block: IPieceBlock = {
      type: 'piece',
      piece: 'home',
      pages: { idea: 'SitePages/Explore-an-AI-idea.aspx', feedback: 'SitePages/Share-feedback.aspx', telemetry: 'https://contoso.sharepoint.com/sites/ai/SitePages/Status.aspx' }
    };
    const { container } = renderWithFrontDoor(<PieceBlock block={block} drafts={{ idea: true }} />);
    expect(container.querySelector('.ai-home-grid')).not.toBeNull();
    const idea: HTMLElement = screen.getByText('Explore an AI idea').closest('a') as HTMLElement;
    expect(idea).toHaveAttribute('href', `${TEST_SITE_URL}/SitePages/Explore-an-AI-idea.aspx`);
    expect(within(idea).getByText('Resume draft')).toBeInTheDocument();
    expect(within(screen.getByText('Share feedback').closest('a') as HTMLElement).queryByText('Resume draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Check a tool or task')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AI operations snapshot' })).toHaveAttribute('href', 'https://contoso.sharepoint.com/sites/ai/SitePages/Status.aspx');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('renders a dead link for a page target with a forbidden scheme or a protocol-less host', () => {
    const block: IPieceBlock = {
      type: 'piece',
      piece: 'home',
      pages: { idea: 'javascript:alert(1)', feedback: '//evil.example/SitePages/Share-feedback.aspx', telemetry: 'data:text/html,hi', toolCheck: '  ' }
    };
    const { container } = renderWithFrontDoor(<PieceBlock block={block} drafts={{}} />);
    expect(screen.getByText('Explore an AI idea').closest('a')).toHaveAttribute('href', '#');
    expect(screen.getByText('Share feedback').closest('a')).toHaveAttribute('href', '#');
    expect(screen.getByRole('link', { name: 'AI operations snapshot' })).toHaveAttribute('href', '#');
    // A blank target is no link at all, as before.
    expect(screen.queryByText('Check a tool or task')).not.toBeInTheDocument();
    const anchors: HTMLAnchorElement[] = Array.prototype.slice.call(container.querySelectorAll('a'));
    expect(anchors.length).toBeGreaterThan(3);
    for (const anchor of anchors) {
      expect(anchor.getAttribute('href') ?? '').not.toMatch(/evil|javascript|data:/);
    }
  });

  it('embeds the telemetry strip', async () => {
    const { container } = renderWithFrontDoor(<PieceBlock block={{ type: 'piece', piece: 'telemetry', pages: {} }} drafts={{}} />, { usage: createFakeUsageService() });
    expect(container.querySelector('section.ai-usage-section')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'AI operations snapshot' })).toBeInTheDocument();
    await screen.findByText('SharePoint connected');
    expect(container.querySelector('.ai-home-grid')).toBeNull();
    // Without a kicker the strip keeps the shipped line, as the legacy landing page does.
    expect(screen.getByText('LIVE GOVERNANCE TELEMETRY')).toHaveClass('ai-usage-kicker');
  });

  it('replaces the telemetry kicker with the one the document names and labels the tiles from the vocabulary', async () => {
    const result: IUsageMetricsResult = {
      connected: true,
      metrics: [{ metricKey: 'openai_api_spend_mtd', metricLabel: 'OpenAI API spend this month', source: 'AI Usage Daily', currentValue: 3, unit: 'USD', scope: 'Organization', dataStatus: 'Current' }],
      alerts: [],
      message: 'ok'
    };
    const vocabulary: IVocabulary = { truthStates: {}, requestStatuses: {}, chrome: {}, roles: {}, telemetry: { openai_api_spend_mtd: 'Usage feed spend this month' } };
    renderWithFrontDoor(<PieceBlock block={{ type: 'piece', piece: 'telemetry', pages: {}, kicker: 'Diagnostics: usage feed' }} drafts={{}} />, {
      usage: createFakeUsageService(result),
      vocabulary,
      pageView: true
    });
    await screen.findByText('SharePoint connected');
    expect(screen.getByText('Diagnostics: usage feed')).toHaveClass('ai-usage-kicker');
    expect(screen.queryByText('LIVE GOVERNANCE TELEMETRY')).not.toBeInTheDocument();
    expect(screen.getByText('Usage feed spend this month')).toHaveClass('ai-metric-label');
    expect(screen.queryByText('OpenAI API spend this month')).not.toBeInTheDocument();
    // A tile the vocabulary does not name keeps its feed label.
    expect(screen.getByText('OpenAI API requests this month')).toHaveClass('ai-metric-label');
  });

  it('embeds the my-work piece', async () => {
    const service: IFakeMyWorkService = createFakeMyWorkService({ state: 'ok', items: [], message: 'Read.' });
    const { container } = renderWithFrontDoor(<PieceBlock block={{ type: 'piece', piece: 'myWork', pages: {} }} drafts={{}} />, { myWork: service, pageView: true });
    expect(screen.getByRole('region', { name: MY_WORK_HEADING })).toHaveClass('ai-page-mywork');
    await screen.findByText('No requests from you yet.');
    expect(service.calls).toBe(1);
    expect(container.querySelector('.ai-home-grid')).toBeNull();
    expect(container.querySelector('section.ai-usage-section')).toBeNull();
  });
});
