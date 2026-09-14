import * as React from 'react';
import type { IPieceBlock } from '../../../content/pageContent';
import { PAGE_TARGETS, resolvePageUrl } from '../../../content/pageViews';
import type { PageLinks, PageTarget } from '../../../content/pageViews';
import { useFrontDoor } from '../../../context/FrontDoorContext';
import { HomePage } from '../../HomePage';
import type { DraftFlags } from '../../LandingPage';
import { UsageTelemetryStrip } from '../../UsageTelemetryStrip';

export interface IPieceBlockProps {
  block: IPieceBlock;
  /** Workflows with a saved draft on this device; shown as badges on the home tiles. */
  drafts: DraftFlags;
}

/** A front-door piece between the content blocks: the home tiles (one per page) or the telemetry strip. */
export function PieceBlock({ block, drafts }: IPieceBlockProps): React.ReactElement {
  const { siteUrl } = useFrontDoor();
  if (block.piece === 'telemetry') {
    return <UsageTelemetryStrip />;
  }
  const pages: PageLinks = {};
  for (const target of PAGE_TARGETS) {
    const url: string | undefined = resolvePageUrl(siteUrl, block.pages[target as PageTarget]);
    if (url !== undefined) {
      pages[target as PageTarget] = url;
    }
  }
  return <HomePage drafts={drafts} pages={pages} />;
}
