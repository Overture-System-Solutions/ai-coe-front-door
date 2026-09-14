import { screen } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor } from '../../../../../testing/renderWithFrontDoor';
import { HeadingBlock, ParagraphBlock } from './TextBlocks';

describe('text blocks', () => {
  it('renders headings at the requested level', () => {
    renderWithFrontDoor(
      <>
        <HeadingBlock block={{ type: 'heading', level: 2, text: 'The three lanes' }} />
        <HeadingBlock block={{ type: 'heading', level: 3, text: 'Green' }} />
      </>
    );
    expect(screen.getByRole('heading', { level: 2, name: 'The three lanes' })).toHaveClass('ai-page-heading');
    expect(screen.getByRole('heading', { level: 3, name: 'Green' })).toHaveClass('ai-page-heading');
  });

  it('renders a paragraph with in-text markup', () => {
    const { container } = renderWithFrontDoor(<ParagraphBlock block={{ type: 'paragraph', text: 'Read the **policy** in [the library](SitePages/P.aspx).' }} />);
    const paragraph: HTMLElement = container.querySelector('p.ai-page-paragraph') as HTMLElement;
    expect(paragraph.textContent).toBe('Read the policy in the library.');
    expect(paragraph.querySelector('strong')?.textContent).toBe('policy');
    expect(screen.getByRole('link', { name: 'the library' })).toBeInTheDocument();
  });
});
