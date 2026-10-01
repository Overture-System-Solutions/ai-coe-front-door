import * as React from 'react';
import { resolveAction } from '../../../content/actions';
import type { ResolvedAction } from '../../../content/actions';
import type { ICardItem, ICardsBlock } from '../../../content/pageContent';
import type { IRouteOptions, RoutePill } from '../../../content/routes';
import { useFrontDoor } from '../../../context/FrontDoorContext';
import { StatusPill } from '../../../controls/StatusPill';
import { Freshness } from '../Freshness';
import { Markup } from '../Markup';
import { usePageDocument } from '../PageDocumentContext';

export interface ICardsBlockProps {
  block: ICardsBlock;
}

interface ICardStateProps {
  action: ResolvedAction;
  pill: RoutePill;
  label: string;
}

/**
 * The state of a card that names a state or a route, resolved like a tile: the pill, the route's
 * note and, when closed, the fallback link. A card is a fact, not a control, so an open route draws
 * its pill and no link (the tiles and the hero carry the link); a plain link has no pill, makes no
 * claim and draws nothing here.
 */
function CardState({ action, pill, label }: ICardStateProps): React.ReactElement {
  return (
    <p className="ai-page-card-state">
      <StatusPill state={pill} label={label} />
      {action.note !== undefined && <span className="ai-page-card-note">{action.note}</span>}
      {action.kind === 'closed' && action.fallback !== undefined && (
        <a className="ai-page-card-fallback" href={action.fallback.href}>
          {action.fallback.label}
        </a>
      )}
    </p>
  );
}

/**
 * Two or three columns of toned cards: kicker, title, paragraphs, an emphasised closing line, the
 * state line of a card that names a state or a route (resolved against the document's route list,
 * `route` winning over `href` and `state`, exactly as a tile does) and, for a card that says when and
 * where its fact was read, the freshness line last.
 */
export function CardsBlock({ block }: ICardsBlockProps): React.ReactElement {
  const { siteUrl } = useFrontDoor();
  const { routes, now, vocabulary, roles } = usePageDocument();
  const options: IRouteOptions = { siteUrl, now, vocabulary, roles };
  const gridClass: string = block.columns === 3 ? 'ai-page-cards ai-page-cards--3' : 'ai-page-cards';
  return (
    <div className={gridClass}>
      {block.items.map((item: ICardItem, index: number): React.ReactElement => {
        const action: ResolvedAction | undefined = resolveAction(item, routes, options);
        const closed: boolean = action !== undefined && action.kind === 'closed';
        return (
          <article key={index} className={`ai-page-card ai-page-card--${item.tone}${closed ? ' ai-page-card--closed' : ''}`}>
            {item.kicker !== undefined && <p className="ai-page-card-kicker">{item.kicker}</p>}
            <h3>{item.title}</h3>
            {item.body.length > 0 && (
              <div className="ai-page-card-body">
                {item.body.map((paragraph: string, paragraphIndex: number): React.ReactElement => (
                  <p key={paragraphIndex}>
                    <Markup text={paragraph} />
                  </p>
                ))}
              </div>
            )}
            {item.meta !== undefined && (
              <p className="ai-page-card-meta">
                <Markup text={item.meta} />
              </p>
            )}
            {action !== undefined && action.pill !== undefined && action.stateLabel !== undefined && <CardState action={action} pill={action.pill} label={action.stateLabel} />}
            <Freshness asOf={item.asOf} source={item.source} illustrative={item.illustrative} />
          </article>
        );
      })}
    </div>
  );
}
