import * as React from 'react';
import type { IStatusItem, IStatusRowBlock } from '../../../content/pageContent';
import { Markup } from '../Markup';

export interface IStatusRowBlockProps {
  block: IStatusRowBlock;
}

/** Short labelled lines side by side, such as "Status" and "Support" at the foot of a page. */
export function StatusRowBlock({ block }: IStatusRowBlockProps): React.ReactElement {
  return (
    <div className="ai-page-status">
      {block.items.map((item: IStatusItem, index: number): React.ReactElement => (
        <p key={index} className="ai-page-status-item">
          <strong>{item.label}</strong>
          {' — '}
          <Markup text={item.text} />
        </p>
      ))}
    </div>
  );
}
