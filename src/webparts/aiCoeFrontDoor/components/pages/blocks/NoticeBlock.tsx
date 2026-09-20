import * as React from 'react';
import type { INoticeBlock } from '../../../content/pageContent';
import { Markup } from '../Markup';

export interface INoticeBlockProps {
  block: INoticeBlock;
}

/**
 * A notice set apart from the page's prose as a note aside: the tone is carried by the left edge
 * and the title, never by colour alone, and the text keeps its in-text markup.
 */
export function NoticeBlock({ block }: INoticeBlockProps): React.ReactElement {
  return (
    <aside className={`ai-page-notice ai-page-notice--${block.tone}`} role="note">
      {block.title !== undefined && <strong className="ai-page-notice-title">{block.title}</strong>}
      <p className="ai-page-notice-text">
        <Markup text={block.text} />
      </p>
    </aside>
  );
}
