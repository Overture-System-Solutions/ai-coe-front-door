import * as React from 'react';
import type { PageBlock } from '../../content/pageContent';
import type { DraftFlags } from '../LandingPage';
import { CardsBlock } from './blocks/CardsBlock';
import { HeroBlock } from './blocks/HeroBlock';
import { LanesBlock } from './blocks/LanesBlock';
import { NoticeBlock } from './blocks/NoticeBlock';
import { PieceBlock } from './blocks/PieceBlock';
import { RulesBlock } from './blocks/RulesBlock';
import { StatusRowBlock } from './blocks/StatusRowBlock';
import { SupportRouteBlock } from './blocks/SupportRouteBlock';
import { HeadingBlock, ParagraphBlock } from './blocks/TextBlocks';
import { TilesBlock } from './blocks/TilesBlock';
import { WorkCommandBlock } from './blocks/WorkCommandBlock';

export interface IBlockListProps {
  blocks: PageBlock[];
  /** Draft badges for an embedded home piece; none where no piece can appear (the shared footer). */
  drafts: DraftFlags;
}

/** One block as its component; the piece takes the draft badges, every other block reads the document context. */
export function renderBlock(block: PageBlock, drafts: DraftFlags): React.ReactElement {
  switch (block.type) {
    case 'hero':
      return <HeroBlock block={block} />;
    case 'heading':
      return <HeadingBlock block={block} />;
    case 'paragraph':
      return <ParagraphBlock block={block} />;
    case 'tiles':
      return <TilesBlock block={block} />;
    case 'cards':
      return <CardsBlock block={block} />;
    case 'lanes':
      return <LanesBlock block={block} />;
    case 'statusRow':
      return <StatusRowBlock block={block} />;
    case 'workCommand':
      return <WorkCommandBlock block={block} />;
    case 'notice':
      return <NoticeBlock block={block} />;
    case 'rules':
      return <RulesBlock block={block} />;
    case 'supportRoute':
      return <SupportRouteBlock block={block} />;
    default:
      return <PieceBlock block={block} drafts={drafts} />;
  }
}

/** The blocks in document order, each in its typed wrapper, as a content page and the shared footer draw them. */
export function BlockList({ blocks, drafts }: IBlockListProps): React.ReactElement {
  return (
    <>
      {blocks.map(
        (block: PageBlock, index: number): React.ReactElement => (
          <div key={index} className={`ai-page-block ai-page-block--${block.type}`}>
            {renderBlock(block, drafts)}
          </div>
        )
      )}
    </>
  );
}
