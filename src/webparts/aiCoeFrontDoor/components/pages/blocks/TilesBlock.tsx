import * as React from 'react';
import { resolveContentHref } from '../../../content/pageContent';
import type { ITileItem, ITilesBlock } from '../../../content/pageContent';
import { pageIcon } from '../../../content/pageIcons';
import { useFrontDoor } from '../../../context/FrontDoorContext';
import { ArrowRight } from '../../../icons';
import type { LucideIcon } from '../../../icons';
import { anchorProps } from '../Markup';

export interface ITilesBlockProps {
  block: ITilesBlock;
}

/** Quick links as the front door's service cards: same markup and classes as the home tiles. */
export function TilesBlock({ block }: ITilesBlockProps): React.ReactElement {
  const { siteUrl } = useFrontDoor();
  return (
    <div className="ai-page-tiles">
      {block.items.map((item: ITileItem, index: number): React.ReactElement => {
        const Icon: LucideIcon = pageIcon(item.icon);
        return (
          <a key={index} className={`ai-service-card ai-service-card--${item.tone}`} {...anchorProps(siteUrl, resolveContentHref(siteUrl, item.href))}>
            <Icon className="ai-service-icon" aria-hidden="true" />
            <span className="ai-service-copy">
              <span className="ai-service-title">{item.title}</span>
              {item.description !== undefined && <span className="ai-service-description">{item.description}</span>}
            </span>
            <ArrowRight className="ai-service-arrow" aria-hidden="true" />
          </a>
        );
      })}
    </div>
  );
}
