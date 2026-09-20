import * as React from 'react';
import { resolveRoute } from '../content/routes';
import type { IResolvedRoute, IRouteOptions } from '../content/routes';
import { useFrontDoor } from '../context/FrontDoorContext';
import { ArrowRight } from '../icons';
import { anchorProps } from '../components/pages/Markup';
import { usePageDocument } from '../components/pages/PageDocumentContext';
import { StatusPill } from './StatusPill';

export interface IRouteCardProps {
  /** The key of the route to continue with; resolved against the document's route list, failing closed. */
  routeKey: string;
  /** The record reference to show for copying; appended to the link only when the route row says so. */
  reference?: string;
}

export const CONTINUE_WITH: string = 'Continue with';
export const REFERENCE_KEY: string = 'Reference';
/** The query parameter that carries the record reference to a destination whose row declares `carriesReference`. */
export const REFERENCE_PARAMETER: string = 'ref';

/** The route's own link with the reference appended when the row allows it; user text never joins a link. */
export function handOffHref(route: IResolvedRoute, reference: string | undefined): string | undefined {
  const href: string | undefined = route.href;
  if (href === undefined || !route.carriesReference || reference === undefined || reference === '') {
    return href;
  }
  return `${href}${href.indexOf('?') >= 0 ? '&' : '?'}${REFERENCE_PARAMETER}=${encodeURIComponent(reference)}`;
}

/**
 * The hand-off card after a saved submission: where to continue, resolved through the route list
 * exactly as a tile is, so a destination that is not proved here stays closed with its state and
 * the fallback. The reference is shown as text for copying; it joins the link only for a row that
 * declares `carriesReference`, and only an off-site link opens in a new tab.
 */
export function RouteCard({ routeKey, reference }: IRouteCardProps): React.ReactElement {
  const { siteUrl } = useFrontDoor();
  const { routes, now, vocabulary, roles } = usePageDocument();
  const options: IRouteOptions = { siteUrl, now, vocabulary, roles };
  const route: IResolvedRoute = resolveRoute(routes, routeKey, options);
  const open: boolean = route.state === 'availableNow' && route.href !== undefined;
  const href: string | undefined = open ? handOffHref(route, reference) : undefined;
  const title: string = `${CONTINUE_WITH} ${route.label}`;
  return (
    <section className={open ? 'ai-route-card' : 'ai-route-card ai-route-card--closed'} aria-label={title}>
      <h3 className="ai-route-card-title">{title}</h3>
      {reference !== undefined && reference !== '' && (
        <p className="ai-route-card-reference">
          <span className="ai-route-card-key">{REFERENCE_KEY}</span> <code>{reference}</code>
        </p>
      )}
      <p className="ai-route-card-state">
        <StatusPill state={route.pill} label={route.stateLabel} />
      </p>
      {route.note !== undefined && <p className="ai-route-card-note">{route.note}</p>}
      {href !== undefined && (
        <a className="ai-route-card-link" {...anchorProps(siteUrl, href)}>
          {route.label} <ArrowRight aria-hidden="true" focusable="false" />
        </a>
      )}
      {!open && route.fallback !== undefined && (
        <a className="ai-route-card-fallback" href={route.fallback.href}>
          {route.fallback.label}
        </a>
      )}
    </section>
  );
}
