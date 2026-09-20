import * as React from 'react';
import { resolveContentHref } from '../../../content/pageContent';
import type { IPieceBlock } from '../../../content/pageContent';
import { PAGE_TARGETS } from '../../../content/pageViews';
import type { PageLinks, PageTarget } from '../../../content/pageViews';
import { useFrontDoor } from '../../../context/FrontDoorContext';
import { HomePage } from '../../HomePage';
import type { DraftFlags } from '../../LandingPage';
import { UsageTelemetryStrip } from '../../UsageTelemetryStrip';
import { MyWork } from '../MyWork';

export interface IPieceBlockProps {
  block: IPieceBlock;
  /** Workflows with a saved draft on this device; shown as badges on the home tiles. */
  drafts: DraftFlags;
}

/**
 * A front-door piece between the content blocks: the home tiles (one per page), the telemetry strip
 * (with the document's kicker when it names one) or the person's own requests. The page links come
 * from the document, so each passes the same href guard as every other block link: a blank target is
 * no tile, a forbidden scheme or a protocol-less host is a dead anchor.
 */
export function PieceBlock({ block, drafts }: IPieceBlockProps): React.ReactElement {
  const { siteUrl } = useFrontDoor();
  if (block.piece === 'telemetry') {
    return <UsageTelemetryStrip kicker={block.kicker} />;
  }
  if (block.piece === 'myWork') {
    return <MyWork />;
  }
  const pages: PageLinks = {};
  for (const target of PAGE_TARGETS) {
    const link: string | undefined = block.pages[target as PageTarget];
    if (link !== undefined && link.trim() !== '') {
      pages[target as PageTarget] = resolveContentHref(siteUrl, link);
    }
  }
  return <HomePage drafts={drafts} pages={pages} />;
}
