import * as React from 'react';
import { resolveAction } from '../../../content/actions';
import type { ResolvedAction } from '../../../content/actions';
import type { IHeroBlock, IHeroCta } from '../../../content/pageContent';
import type { IRouteOptions } from '../../../content/routes';
import { useFrontDoor } from '../../../context/FrontDoorContext';
import { HeroNetworkSvg } from '../../../controls/HeroNetworkSvg';
import { StatusPill } from '../../../controls/StatusPill';
import { ArrowRight } from '../../../icons';
import { anchorProps, Markup } from '../Markup';
import { usePageDocument } from '../PageDocumentContext';

export interface IHeroBlockProps {
  block: IHeroBlock;
}

interface IHeroActionProps {
  cta: IHeroCta;
  action: ResolvedAction;
  siteUrl: string;
}

/** The call to action: a link when the route is open (its pill beside it), a labelled non-link with the pill and the fallback when closed. */
function HeroAction({ cta, action, siteUrl }: IHeroActionProps): React.ReactElement {
  const note: string | undefined = cta.note ?? action.note;
  if (action.kind === 'closed') {
    return (
      <>
        <span className="ai-hero-cta ai-hero-cta--closed" aria-disabled="true">
          {cta.label} <StatusPill state={action.pill} label={action.stateLabel} />
        </span>
        {note !== undefined && <p className="ai-hero-note">{note}</p>}
        {action.fallback !== undefined && (
          <a className="ai-hero-fallback" href={action.fallback.href}>
            {action.fallback.label}
          </a>
        )}
      </>
    );
  }
  return (
    <>
      <a className="ai-hero-cta" {...anchorProps(siteUrl, action.href)}>
        {cta.label} <ArrowRight aria-hidden="true" />
      </a>
      {action.pill !== undefined && (
        <span className="ai-hero-state">
          <StatusPill state={action.pill} label={action.stateLabel} />
        </span>
      )}
      {note !== undefined && <p className="ai-hero-note">{note}</p>}
    </>
  );
}

/** The landing page hero with the document's words; one per page, since the title id is shared with the landing page. */
export function HeroBlock({ block }: IHeroBlockProps): React.ReactElement {
  const { branding, siteUrl } = useFrontDoor();
  const { routes, now, vocabulary, roles } = usePageDocument();
  const options: IRouteOptions = { siteUrl, now, vocabulary, roles };
  const action: ResolvedAction | undefined = block.cta === undefined ? undefined : resolveAction(block.cta, routes, options);
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
        {block.cta !== undefined && action !== undefined && <HeroAction cta={block.cta} action={action} siteUrl={siteUrl} />}
      </div>
      <HeroNetworkSvg decorative={true} />
    </section>
  );
}
