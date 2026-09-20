import { within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor } from '../../../../../testing/renderWithFrontDoor';
import type { IStatusRowBlock } from '../../../content/pageContent';
import type { RouteTable } from '../../../content/routes';
import { StatusRowBlock } from './StatusRowBlock';

const BLOCK: IStatusRowBlock = {
  type: 'statusRow',
  items: [
    { label: 'Status', text: 'Green. Nothing is blocked.' },
    { label: 'Support', text: 'Ask in [Teams](https://teams.microsoft.com/l/x).' }
  ]
};

const ROUTES: RouteTable = {
  guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
  assistant: { key: 'assistant', label: 'Ask the assistant', href: 'https://assistant.example/chat', state: 'availableNow' }
};

describe('StatusRowBlock', () => {
  it('renders each item as a labelled line', () => {
    const { container } = renderWithFrontDoor(<StatusRowBlock block={BLOCK} />);
    const items: NodeListOf<HTMLElement> = container.querySelectorAll('.ai-page-status > p.ai-page-status-item');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('strong')?.textContent).toBe('Status');
    expect(items[0].textContent).toBe('Status — Green. Nothing is blocked.');
    expect(within(items[1]).getByRole('link', { name: 'Teams' })).toHaveAttribute('href', 'https://teams.microsoft.com/l/x');
    expect(container.querySelector('.ai-pill')).toBeNull();
  });

  it('draws the pill of an item state or route after the text', () => {
    const block: IStatusRowBlock = {
      type: 'statusRow',
      items: [
        { label: 'Assistant', text: 'Answering from approved sources.', route: 'assistant', asOf: '2026-09-01' },
        { label: 'Prompts', text: 'All draft.', state: 'draftOnly' },
        { label: 'Agents', text: 'Not yet.', state: 'DESIGNED' },
        { label: 'Old', text: 'Gone.', state: 'RETIRED' }
      ]
    };
    const { container } = renderWithFrontDoor(<StatusRowBlock block={block} />, { routes: ROUTES, now: new Date('2026-09-20T12:00:00Z') });
    const items: NodeListOf<HTMLElement> = container.querySelectorAll('p.ai-page-status-item');
    expect(items).toHaveLength(4);
    // The off-site route carries no receipt yet, so the line says so instead of "Available now".
    expect(items[0].querySelector('.ai-pill')?.textContent).toBe('Awaiting source');
    expect(items[0].textContent).toBe('Assistant — Answering from approved sources. Awaiting source');
    expect(items[1].querySelector('.ai-pill--blue')?.textContent).toBe('Draft only');
    expect(items[2].querySelector('.ai-pill--amber')?.textContent).toBe('Coming: not yet enabled');
    expect(items[3].querySelector('.ai-pill')).toBeNull();
    expect(within(items[0]).queryByRole('link')).not.toBeInTheDocument();
  });
});
