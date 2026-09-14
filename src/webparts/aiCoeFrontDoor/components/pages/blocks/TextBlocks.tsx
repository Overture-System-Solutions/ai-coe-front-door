import * as React from 'react';
import type { IHeadingBlock, IParagraphBlock } from '../../../content/pageContent';
import { Markup } from '../Markup';

export interface IHeadingBlockProps {
  block: IHeadingBlock;
}

export function HeadingBlock({ block }: IHeadingBlockProps): React.ReactElement {
  return block.level === 3 ? <h3 className="ai-page-heading">{block.text}</h3> : <h2 className="ai-page-heading">{block.text}</h2>;
}

export interface IParagraphBlockProps {
  block: IParagraphBlock;
}

export function ParagraphBlock({ block }: IParagraphBlockProps): React.ReactElement {
  return (
    <p className="ai-page-paragraph">
      <Markup text={block.text} />
    </p>
  );
}
