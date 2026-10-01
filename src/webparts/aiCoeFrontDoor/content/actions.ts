/**
 * Action states on tiles, the hero call to action and status items. `route` wins over `href` and
 * `state`; a filled `href` without either stays a plain link as before; an item with a state and no
 * link is a labelled non-link (closed) that shows its pill; a retired item is not rendered.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { isExternalHref, resolveContentHref } from './links';
import { readText, setOptional } from './rawJson';
import { resolveRoute, stateLook } from './routes';
import type { IResolvedRoute, IRouteFallback, IRouteOptions, IStateLook, RoutePill, RouteTable } from './routes';
import type { StateCode, TruthStateKey } from './truthStates';

/** The fields an item may carry to say where it leads and whether that is proved. */
export interface IActionSource {
  href?: string;
  state?: StateCode;
  route?: string;
}

export interface ILinkAction {
  kind: 'link';
  href: string;
  external: boolean;
  /** Present when the link came with a state or a route; a plain link has none. */
  pill?: RoutePill;
  stateLabel?: string;
  note?: string;
}

export interface IClosedAction {
  kind: 'closed';
  state: TruthStateKey;
  pill: RoutePill;
  stateLabel: string;
  fallback?: IRouteFallback;
  note?: string;
}

export type ResolvedAction = ILinkAction | IClosedAction;

function fromRoute(route: IResolvedRoute): ResolvedAction {
  if (route.state === 'availableNow' && route.href !== undefined) {
    const link: ILinkAction = { kind: 'link', href: route.href, external: route.external, pill: route.pill, stateLabel: route.stateLabel };
    setOptional(link, 'note', route.note);
    return link;
  }
  const closed: IClosedAction = { kind: 'closed', state: route.state, pill: route.pill, stateLabel: route.stateLabel };
  if (route.fallback !== undefined) {
    closed.fallback = route.fallback;
  }
  setOptional(closed, 'note', route.note);
  return closed;
}

function closedBy(look: IStateLook): IClosedAction {
  return { kind: 'closed', state: look.state, pill: look.pill, stateLabel: look.label };
}

/** How an item renders: an open link, a closed non-link with its pill and fallback, or nothing at all. */
export function resolveAction(item: IActionSource, routes: RouteTable, options: IRouteOptions): ResolvedAction | undefined {
  const route: string | undefined = readText(item.route);
  if (route !== undefined) {
    return fromRoute(resolveRoute(routes, route, options));
  }
  const href: string | undefined = readText(item.href);
  if (item.state === undefined) {
    return href === undefined ? undefined : { kind: 'link', href: resolveContentHref(options.siteUrl, href), external: isExternalHref(options.siteUrl, href) };
  }
  const look: IStateLook | undefined = stateLook(item.state, options.vocabulary);
  if (look === undefined) {
    return undefined;
  }
  if (look.state !== 'availableNow') {
    return closedBy(look);
  }
  if (href === undefined) {
    // Available with nothing to open is not available: fail closed.
    return closedBy(stateLook('needsAccess', options.vocabulary) as IStateLook);
  }
  return { kind: 'link', href: resolveContentHref(options.siteUrl, href), external: isExternalHref(options.siteUrl, href), pill: look.pill, stateLabel: look.label };
}

export interface IPillLook {
  pill: RoutePill;
  label: string;
}

/** The pill a fact (a status item, a card) draws for its state or route; nothing without either, nothing for a retired one. */
export function resolvePill(item: IActionSource, routes: RouteTable, options: IRouteOptions): IPillLook | undefined {
  const route: string | undefined = readText(item.route);
  if (route !== undefined) {
    const resolved: IResolvedRoute = resolveRoute(routes, route, options);
    return { pill: resolved.pill, label: resolved.stateLabel };
  }
  if (item.state === undefined) {
    return undefined;
  }
  const look: IStateLook | undefined = stateLook(item.state, options.vocabulary);
  return look === undefined ? undefined : { pill: look.pill, label: look.label };
}
