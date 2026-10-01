import { screen } from '@testing-library/react';
import * as React from 'react';
import { renderWithFrontDoor } from '../../../../../testing/renderWithFrontDoor';
import type { INoticeBlock } from '../../../content/pageContent';
import { NoticeBlock } from './NoticeBlock';

describe('NoticeBlock', () => {
  it('renders a caution as a note aside with its title in strong and its text with markup', () => {
    const block: INoticeBlock = {
      type: 'notice',
      tone: 'caution',
      title: 'Data boundary',
      text: 'Keep **personal data** out of every prompt; see [the policy](SitePages/Policy.aspx).'
    };
    const { container } = renderWithFrontDoor(<NoticeBlock block={block} />);
    const aside: HTMLElement = container.querySelector('aside.ai-page-notice.ai-page-notice--caution[role="note"]') as HTMLElement;
    expect(aside).not.toBeNull();
    expect(screen.getByRole('note')).toBe(aside);
    const title: HTMLElement = aside.querySelector('strong.ai-page-notice-title') as HTMLElement;
    expect(title.textContent).toBe('Data boundary');
    const text: HTMLElement = aside.querySelector('p.ai-page-notice-text') as HTMLElement;
    expect(text.textContent).toBe('Keep personal data out of every prompt; see the policy.');
    expect(text.querySelector('strong')?.textContent).toBe('personal data');
    expect(screen.getByRole('link', { name: 'the policy' })).toBeInTheDocument();
  });

  it('renders an info notice without a title', () => {
    const { container } = renderWithFrontDoor(<NoticeBlock block={{ type: 'notice', tone: 'info', text: 'Nothing here is graded.' }} />);
    const aside: HTMLElement = container.querySelector('aside.ai-page-notice.ai-page-notice--info[role="note"]') as HTMLElement;
    expect(aside).not.toBeNull();
    expect(aside.querySelector('.ai-page-notice-title')).toBeNull();
    expect(aside.querySelector('strong')).toBeNull();
    expect(aside.querySelector('p.ai-page-notice-text')?.textContent).toBe('Nothing here is graded.');
  });
});
