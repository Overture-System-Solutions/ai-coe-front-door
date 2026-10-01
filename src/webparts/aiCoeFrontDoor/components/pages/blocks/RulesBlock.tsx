import * as React from 'react';
import type { IRuleItem, IRulesBlock } from '../../../content/pageContent';
import { Markup } from '../Markup';

export interface IRulesBlockProps {
  block: IRulesBlock;
}

/** The rules people are asked to keep: a numbered (or bulleted) set of titled items with an optional title above. */
export function RulesBlock({ block }: IRulesBlockProps): React.ReactElement {
  const items: React.ReactElement[] = block.items.map((item: IRuleItem, index: number): React.ReactElement => (
    <li key={index} className="ai-page-rule">
      <strong className="ai-page-rule-title">{item.title}</strong>
      {item.text !== undefined && (
        <span className="ai-page-rule-text">
          <Markup text={item.text} />
        </span>
      )}
    </li>
  ));
  return (
    <>
      {block.title !== undefined && <h3 className="ai-page-rules-title">{block.title}</h3>}
      {block.ordered ? <ol className="ai-page-rules">{items}</ol> : <ul className="ai-page-rules">{items}</ul>}
    </>
  );
}
