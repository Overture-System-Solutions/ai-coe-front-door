/**
 * How Claude's analysis reads (1.0.0.18): the summary in short paragraphs at a readable width, each case to look at
 * first as a card linked to its case, and the patterns and the gaps side by side.
 */
import * as React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithFrontDoor } from '../../../../testing/renderWithFrontDoor';
import { createFakeMyWorkService } from '../../../../testing/fakeServices';
import type { RoleId } from '../../content/roles';
import type { ICaseAnalysisResult } from '../../services/caseAnalysisService';
import type { IRoleResolution, IRoleResolver } from '../../services/roleResolver';
import { AppShell } from './AppShell';
import { summaryParagraphs } from './AppCaseAnalysis';

const LONG_SUMMARY: string =
  'Seven cases are open and two of them need a decision this week. Ticket replies has waited twelve days on a restricted-data review. ' +
  'Change notes is missing its risk tier and cannot be triaged. The rest are moving normally. ' +
  'Most delays come from information requests that nobody has chased. A weekly chase would clear half of them.';

const RESULT: ICaseAnalysisResult = {
  analysis: {
    summary: LONG_SUMMARY,
    priorities: [
      { coeId: 'OVT-AICOE-20260920-AAAA1111', title: 'Ticket replies', whyItMatters: 'High risk, restricted data, waiting 12 days.', suggestedNextStep: 'Schedule the review.' },
      { coeId: 'OVT-AICOE-20260915-BBBB2222', title: 'Change notes', whyItMatters: 'Needs information for 20 days.', suggestedNextStep: 'Chase the submitter.' }
    ],
    patterns: ['Most open cases wait on information.'],
    gaps: ['One case has no risk tier.']
  },
  caseCount: 7,
  truncated: false,
  asOf: '2026-09-25T14:00:00Z',
  provenance: { provider: 'anthropic', model: 'claude-sonnet-5', responseId: 'msg_01', requestId: 'analysis-1', draftOnly: true, humanReviewRequired: true }
};

function resolver(roles: RoleId[]): IRoleResolver {
  return { resolve: async (): Promise<IRoleResolution> => ({ roles, resolution: 'resolved' }) };
}

describe('summaryParagraphs', () => {
  it('keeps the paragraphs Claude wrote', () => {
    expect(summaryParagraphs('First part.\n\nSecond part.')).toEqual(['First part.', 'Second part.']);
    expect(summaryParagraphs('Short and single.')).toEqual(['Short and single.']);
  });

  it('breaks one long paragraph into short ones of at most two sentences', () => {
    const paragraphs: string[] = summaryParagraphs(LONG_SUMMARY);
    expect(paragraphs.length).toBe(3);
    expect(paragraphs.join(' ')).toBe(LONG_SUMMARY);
    expect(paragraphs[0]).toBe('Seven cases are open and two of them need a decision this week. Ticket replies has waited twelve days on a restricted-data review.');
  });
});

describe('the analysis layout (1.0.0.18)', () => {
  it('shows the summary in paragraphs, links each case to look at first, and sets the two lists side by side', async () => {
    const caseLinks: jest.Mock = jest.fn().mockResolvedValue({ 'OVT-AICOE-20260920-AAAA1111': 'https://contoso.sharepoint.com/sites/ai/Lists/AI CoE Use Cases/DispForm.aspx?ID=4' });
    const myWork = { ...createFakeMyWorkService(), caseLinks };
    const view = renderWithFrontDoor(<AppShell settings={{ view: 'app', layout: 'wide', pages: {} }} />, {
      roleResolver: resolver(['employee', 'leader']),
      caseAnalysis: { analyze: jest.fn().mockResolvedValue(RESULT) },
      myWork
    });
    await act(async (): Promise<void> => undefined);
    fireEvent.click(view.getByRole('tab', { name: 'Cases', exact: true }));
    await act(async (): Promise<void> => {
      fireEvent.click(screen.getByRole('button', { name: 'Ask Claude' }));
    });
    const summary: Element | null = view.container.querySelector('.ai-app-analysis-summary');
    expect(summary?.querySelectorAll('p')).toHaveLength(3);
    expect(caseLinks).toHaveBeenCalledWith(['OVT-AICOE-20260920-AAAA1111', 'OVT-AICOE-20260915-BBBB2222']);
    const ranked: HTMLElement = screen.getByRole('list', { name: 'Cases to look at first' });
    const first: HTMLAnchorElement = await within(ranked).findByRole('link', { name: /Ticket replies/ });
    expect(first.getAttribute('href')).toBe('https://contoso.sharepoint.com/sites/ai/Lists/AI CoE Use Cases/DispForm.aspx?ID=4');
    expect(first.getAttribute('target')).toBe('_blank');
    // A case the reader cannot open stays a card without a link.
    const cards: HTMLElement[] = within(ranked).getAllByRole('listitem');
    expect(within(cards[1]).queryByRole('link')).toBeNull();
    const lists: Element | null = view.container.querySelector('.ai-app-analysis-lists');
    expect(lists?.classList.contains('ai-app-split')).toBe(true);
    expect(Array.from(lists?.querySelectorAll('h4') ?? []).map((heading: Element): string => heading.textContent ?? '')).toEqual(['Patterns', 'What the records cannot tell you']);
  });
});
