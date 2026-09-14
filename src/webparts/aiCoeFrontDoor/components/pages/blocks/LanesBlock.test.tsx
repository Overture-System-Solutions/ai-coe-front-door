import { within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor } from '../../../../../testing/renderWithFrontDoor';
import type { ILanesBlock } from '../../../content/pageContent';
import { LanesBlock } from './LanesBlock';

const BLOCK: ILanesBlock = {
  type: 'lanes',
  items: [
    { tone: 'green', title: 'Green: just do it', body: ['Public information.', 'Your own notes.'], note: 'No form needed.' },
    { tone: 'amber', title: 'Amber: ask first', body: ['Internal documents.'], badge: 'Ask' },
    { tone: 'red', title: 'Red: not yet', body: [] }
  ]
};

describe('LanesBlock', () => {
  it('renders one toned article per lane with optional badge and note', () => {
    const { container } = renderWithFrontDoor(<LanesBlock block={BLOCK} />);
    const lanes: NodeListOf<HTMLElement> = container.querySelectorAll('.ai-page-lanes > article.ai-page-lane');
    expect(lanes).toHaveLength(3);
    expect(lanes[0]).toHaveClass('ai-page-lane--green');
    expect(lanes[1]).toHaveClass('ai-page-lane--amber');
    expect(lanes[2]).toHaveClass('ai-page-lane--red');
    expect(within(lanes[0]).getByRole('heading', { level: 3, name: 'Green: just do it' })).toBeInTheDocument();
    expect(lanes[0].querySelectorAll('.ai-page-lane-body > p')).toHaveLength(2);
    expect(lanes[0].querySelector('.ai-page-lane-note')?.textContent).toBe('No form needed.');
    expect(lanes[0].querySelector('.ai-page-lane-badge')).toBeNull();
    expect(lanes[1].querySelector('.ai-page-lane-badge')?.textContent).toBe('Ask');
    expect(lanes[1].querySelector('.ai-page-lane-note')).toBeNull();
    expect(lanes[2].querySelector('.ai-page-lane-body')).toBeNull();
  });
});
