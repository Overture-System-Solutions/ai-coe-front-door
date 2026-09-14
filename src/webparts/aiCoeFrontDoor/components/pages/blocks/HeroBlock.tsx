import * as React from 'react';
import { resolveContentHref } from '../../../content/pageContent';
import type { IHeroBlock } from '../../../content/pageContent';
import { useFrontDoor } from '../../../context/FrontDoorContext';
import { HeroNetworkSvg } from '../../../controls/HeroNetworkSvg';
import { ArrowRight } from '../../../icons';
import { anchorProps, Markup } from '../Markup';

export interface IHeroBlockProps {
  block: IHeroBlock;
}

/** The landing page hero with the document's words; one per page, since the title id is shared with the landing page. */
export function HeroBlock({ block }: IHeroBlockProps): React.ReactElement {
  const { branding, siteUrl } = useFrontDoor();
  return (
    <section className="ai-hero" aria-labelledby="ai-hero-title">
      <div className="ai-hero-copy">
        <span className="ai-hero-badge">{block.badge ?? branding.heroBadge}</span>
        <h1 id="ai-hero-title">{block.title}</h1>
        {block.text !== undefined && (
          <p>
            <Markup text={block.text} />
          </p>
        )}
        {block.cta !== undefined && (
          <a className="ai-hero-cta" {...anchorProps(siteUrl, resolveContentHref(siteUrl, block.cta.href))}>
            {block.cta.label} <ArrowRight aria-hidden="true" />
          </a>
        )}
      </div>
      <HeroNetworkSvg />
    </section>
  );
}
