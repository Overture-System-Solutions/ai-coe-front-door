import * as React from 'react';
import { resolveAction } from '../../../content/actions';
import type { ResolvedAction } from '../../../content/actions';
import type { ITileItem, ITilesBlock } from '../../../content/pageContent';
import { pageIcon } from '../../../content/pageIcons';
import type { IRouteOptions } from '../../../content/routes';
import { useFrontDoor } from '../../../context/FrontDoorContext';
import { StatusPill } from '../../../controls/StatusPill';
import { ArrowRight } from '../../../icons';
import type { LucideIcon } from '../../../icons';
import { anchorProps } from '../Markup';
import { usePageDocument } from '../PageDocumentContext';

export interface ITilesBlockProps {
  block: ITilesBlock;
}

interface ITileProps {
  item: ITileItem;
  action: ResolvedAction;
  siteUrl: string;
}

/** The words of a tile: kicker, title, description, the state pill, the note, and the fallback link of a closed tile. */
function TileCopy({ item, action }: Pick<ITileProps, 'item' | 'action'>): React.ReactElement {
  const note: string | undefined = item.note ?? action.note;
  return (
    <div className="ai-service-copy">
      {item.kicker !== undefined && <p className="ai-service-kicker">{item.kicker}</p>}
      <span className="ai-service-title">{item.title}</span>
      {item.description !== undefined && <span className="ai-service-description">{item.description}</span>}
      {action.pill !== undefined && (
        <span className="ai-service-state">
          <StatusPill state={action.pill} label={action.stateLabel} />
        </span>
      )}
      {note !== undefined && <span className="ai-service-note">{note}</span>}
      {action.kind === 'closed' && action.fallback !== undefined && (
        <a className="ai-service-fallback" href={action.fallback.href}>
          {action.fallback.label}
        </a>
      )}
    </div>
  );
}

function Tile({ item, action, siteUrl }: ITileProps): React.ReactElement {
  const Icon: LucideIcon = pageIcon(item.icon);
  const toneClass: string = `ai-service-card ai-service-card--${item.tone}`;
  if (action.kind === 'closed') {
    // A labelled non-link: the promise stays visible, the state says why it is closed, the fallback says where to go instead.
    return (
      <div className={`${toneClass} ai-service-card--closed`} aria-disabled="true">
        <Icon className="ai-service-icon" aria-hidden="true" />
        <TileCopy item={item} action={action} />
      </div>
    );
  }
  return (
    <a className={toneClass} {...anchorProps(siteUrl, action.href)}>
      <Icon className="ai-service-icon" aria-hidden="true" />
      <TileCopy item={item} action={action} />
      <ArrowRight className="ai-service-arrow" aria-hidden="true" />
    </a>
  );
}

/**
 * Quick links as the front door's service cards: same markup and classes as the home tiles. Each
 * tile resolves its action against the document's route list (`route` wins over `href` and
 * `state`); a closed tile keeps its label and shows its pill and fallback instead of a link.
 */
export function TilesBlock({ block }: ITilesBlockProps): React.ReactElement {
  const { siteUrl } = useFrontDoor();
  const { routes, now, vocabulary, roles } = usePageDocument();
  const options: IRouteOptions = { siteUrl, now, vocabulary, roles };
  const tiles: React.ReactElement[] = [];
  block.items.forEach((item: ITileItem, index: number): void => {
    const action: ResolvedAction | undefined = resolveAction(item, routes, options);
    if (action !== undefined) {
      tiles.push(<Tile key={index} item={item} action={action} siteUrl={siteUrl} />);
    }
  });
  return <div className={block.prominent === true ? 'ai-page-tiles ai-page-tiles--prominent' : 'ai-page-tiles'}>{tiles}</div>;
}
