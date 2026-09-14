import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { createFakeUsageService } from '../../../../../testing/fakeServices';
import { renderWithFrontDoor, TEST_SITE_URL } from '../../../../../testing/renderWithFrontDoor';
import type { IPieceBlock } from '../../../content/pageContent';
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

  it('embeds the telemetry strip', async () => {
    const { container } = renderWithFrontDoor(<PieceBlock block={{ type: 'piece', piece: 'telemetry', pages: {} }} drafts={{}} />, { usage: createFakeUsageService() });
    expect(container.querySelector('section.ai-usage-section')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'AI operations snapshot' })).toBeInTheDocument();
    await screen.findByText('SharePoint connected');
    expect(container.querySelector('.ai-home-grid')).toBeNull();
  });
});
