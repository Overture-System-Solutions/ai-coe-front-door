import { within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor } from '../../../../../testing/renderWithFrontDoor';
import type { IStatusRowBlock } from '../../../content/pageContent';
import { StatusRowBlock } from './StatusRowBlock';

const BLOCK: IStatusRowBlock = {
  type: 'statusRow',
  items: [
    { label: 'Status', text: 'Green. Nothing is blocked.' },
    { label: 'Support', text: 'Ask in [Teams](https://teams.microsoft.com/l/x).' }
  ]
};

describe('StatusRowBlock', () => {
  it('renders each item as a labelled line', () => {
    const { container } = renderWithFrontDoor(<StatusRowBlock block={BLOCK} />);
    const items: NodeListOf<HTMLElement> = container.querySelectorAll('.ai-page-status > p.ai-page-status-item');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('strong')?.textContent).toBe('Status');
    expect(items[0].textContent).toBe('Status — Green. Nothing is blocked.');
    expect(within(items[1]).getByRole('link', { name: 'Teams' })).toHaveAttribute('href', 'https://teams.microsoft.com/l/x');
  });
});
