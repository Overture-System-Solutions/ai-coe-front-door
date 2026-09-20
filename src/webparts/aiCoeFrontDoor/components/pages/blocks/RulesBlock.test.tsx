import { screen, within } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor } from '../../../../../testing/renderWithFrontDoor';
import type { IRulesBlock } from '../../../content/pageContent';
import { RulesBlock } from './RulesBlock';

const ORDERED: IRulesBlock = {
  type: 'rules',
  title: 'Three rules',
  ordered: true,
  items: [
    { title: 'You decide', text: 'The tool *suggests*; you decide, and you sign what goes out.' },
    { title: 'Check every number', text: 'Against [the source](SitePages/Sources.aspx), every time.' },
    { title: 'Say when you used it' }
  ]
};

describe('RulesBlock', () => {
  it('renders an ordered list of titled items, each title in strong, with the text after it', () => {
    const { container } = renderWithFrontDoor(<RulesBlock block={ORDERED} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Three rules' })).toHaveClass('ai-page-rules-title');
    const list: HTMLElement = container.querySelector('ol.ai-page-rules') as HTMLElement;
    expect(list).not.toBeNull();
    expect(container.querySelector('ul.ai-page-rules')).toBeNull();
    const items: NodeListOf<HTMLElement> = container.querySelectorAll('ol.ai-page-rules > li.ai-page-rule');
    expect(items).toHaveLength(3);
    expect(items[0].querySelector('strong.ai-page-rule-title')?.textContent).toBe('You decide');
    const firstText: HTMLElement = items[0].querySelector('.ai-page-rule-text') as HTMLElement;
    expect(firstText.textContent).toBe('The tool suggests; you decide, and you sign what goes out.');
    expect(firstText.querySelector('em')?.textContent).toBe('suggests');
    expect(within(items[1]).getByRole('link', { name: 'the source' })).toBeInTheDocument();
    expect(items[2].querySelector('strong.ai-page-rule-title')?.textContent).toBe('Say when you used it');
    expect(items[2].querySelector('.ai-page-rule-text')).toBeNull();
  });

  it('renders an unordered list without a heading when the block is not ordered and has no title', () => {
    const { container } = renderWithFrontDoor(<RulesBlock block={{ type: 'rules', ordered: false, items: [{ title: 'Read first' }, { title: 'Then try' }] }} />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(container.querySelector('ol.ai-page-rules')).toBeNull();
    const list: HTMLElement = container.querySelector('ul.ai-page-rules') as HTMLElement;
    expect(list).not.toBeNull();
    expect(container.querySelectorAll('ul.ai-page-rules > li.ai-page-rule > strong.ai-page-rule-title')).toHaveLength(2);
  });
});
