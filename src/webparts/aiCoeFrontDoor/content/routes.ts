/**
 * The route list: named destinations (`work`, `assistant`, `guidedIntake`, `improve`, `value`) that
 * tiles, the hero call to action, status items and the work command point at by key. A row carries
 * its truth state; an off-site row also needs a verification date and the tenant qualification
 * receipt reference before it opens. Resolution fails closed: anything not proved becomes a closed
 * action that links to the fallback row, the guided intake by default.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { includes } from '../utils/collections';
import { isExternalHref, resolveContentHref } from './links';
import type { IVocabulary } from './pageContent';
import { asObject, ownKeys, readFlag, readIsoDate, readStringList, readText, setOptional } from './rawJson';
import type { Raw } from './rawJson';
import { activationLabel, chromeLabel, readState, truthStateLabel } from './truthStates';
import type { ActivationCode, ChromePillKey, StateCode, TruthStateKey } from './truthStates';

export const GUIDED_INTAKE_ROUTE: string = 'guidedIntake';
export const NO_FALLBACK_LABEL: string = 'No fallback is configured';

export interface IRouteRow {
  key: string;
  label: string;
  /** Site path or full URL; absent means the destination is not linked (yet). */
  href?: string;
  /** A truth-state key or an activation code; absent means unproved. */
  state?: StateCode;
  /** YYYY-MM-DD: when the off-site destination was last proved in this environment. */
  verifiedOn?: string;
  /** The tenant qualification receipt reference behind `verifiedOn`; operator-entered until a capability list exists. */
  receiptRef?: string;
  /** Route key to send people to while this one is closed; the guided intake by default. */
  fallback?: string;
  /** Short line shown with the action; in-text markup is not applied. */
  note?: string;
  /** Role ids that may use the route; absent means everyone. */
  roles?: string[];
  /** Lets the hand-off card append the record reference to the href. */
  carriesReference?: true;
  /** Reserved for the capability list. */
  capabilityId?: string;
}

export type RouteTable = { [key: string]: IRouteRow };

/** The pill a resolved route or action draws: a truth state, or the awaiting-source chrome pill. */
export type RoutePill = TruthStateKey | ChromePillKey;

export interface IRouteFallback {
  key: string;
  label: string;
  href: string;
}

export interface IResolvedRoute {
  /** The row that answered: the requested key, the guided intake when that key is unknown. */
  key: string;
  label: string;
  state: TruthStateKey;
  pill: RoutePill;
  /** The words the pill shows: the state label, the activation wording, or the awaiting-source label. */
  stateLabel: string;
  /** The row's own link when available now; otherwise the fallback's link, when there is one. */
  href?: string;
  note?: string;
  /** True when the link opens another origin (only an available off-site route). */
  external: boolean;
  /** The row people are sent to while this one is closed. */
  fallback?: IRouteFallback;
  carriesReference: boolean;
}

export interface IRouteOptions {
  siteUrl: string;
  /** Role ids the person holds; absent means none. */
  roles?: string[];
  /** The clock a verification date is checked against; today by default. */
  now?: Date;
  vocabulary?: IVocabulary;
}

/** What a state code looks like on a page: the truth state behind it, the pill and its words; a retired code shows nothing. */
export interface IStateLook {
  state: TruthStateKey;
  pill: RoutePill;
  label: string;
}

export function stateLook(code: StateCode, vocabulary?: IVocabulary): IStateLook | undefined {
  switch (code) {
    case 'DESIGNED':
    case 'QUALIFIED':
    case 'PAUSED':
      return { state: 'needsAccess', pill: 'needsAccess', label: activationLabel(code as ActivationCode, vocabulary) ?? '' };
    case 'AVAILABLE':
    case 'ACTIVE':
    case 'availableNow':
      return { state: 'availableNow', pill: 'availableNow', label: truthStateLabel('availableNow', vocabulary) };
    case 'RETIRED':
      return undefined;
    default:
      return { state: code, pill: code, label: truthStateLabel(code, vocabulary) };
  }
}

function readRow(key: string, raw: Raw): IRouteRow | undefined {
  const label: string | undefined = readText(raw.label);
  if (label === undefined) {
    return undefined;
  }
  const row: IRouteRow = { key, label };
  setOptional(row, 'href', readText(raw.href));
  const state: StateCode | undefined = readState(raw.state);
  if (state !== undefined) {
    row.state = state;
  }
  setOptional(row, 'verifiedOn', readIsoDate(raw.verifiedOn));
  setOptional(row, 'receiptRef', readText(raw.receiptRef));
  setOptional(row, 'fallback', readText(raw.fallback));
  setOptional(row, 'note', readText(raw.note));
  if (Array.isArray(raw.roles)) {
    row.roles = readStringList(raw.roles);
  }
  if (readFlag(raw.carriesReference) === true) {
    row.carriesReference = true;
  }
  setOptional(row, 'capabilityId', readText(raw.capabilityId));
  return row;
}

/** The routes section: rows keyed as written (trimmed); a row without a label is dropped, unknown states ignored. */
export function parseRoutes(value: unknown): RouteTable {
  const raw: Raw | undefined = asObject(value);
  const routes: RouteTable = {};
  if (raw !== undefined) {
    for (const rawKey of ownKeys(raw)) {
      const key: string | undefined = readText(rawKey);
      const entry: Raw | undefined = asObject(raw[rawKey]);
      const row: IRouteRow | undefined = key === undefined || entry === undefined ? undefined : readRow(key, entry);
      if (row !== undefined) {
        routes[row.key] = row;
      }
    }
  }
  return routes;
}

/** The row with that key, unless it is retired (a retired row is not rendered anywhere). */
function liveRow(routes: RouteTable, key: string): IRouteRow | undefined {
  const row: IRouteRow | undefined = Object.prototype.hasOwnProperty.call(routes, key) ? routes[key] : undefined;
  return row === undefined || row.state === 'RETIRED' ? undefined : row;
}

function fallbackOf(routes: RouteTable, row: IRouteRow, siteUrl: string): IRouteFallback | undefined {
  const key: string = row.fallback ?? GUIDED_INTAKE_ROUTE;
  const target: IRouteRow | undefined = key === row.key ? undefined : liveRow(routes, key);
  if (target === undefined || target.href === undefined) {
    return undefined;
  }
  return { key: target.key, label: target.label, href: resolveContentHref(siteUrl, target.href) };
}

function isVerified(row: IRouteRow, now: Date): boolean {
  const verifiedOn: string | undefined = readIsoDate(row.verifiedOn);
  return verifiedOn !== undefined && Date.parse(`${verifiedOn}T00:00:00Z`) <= now.getTime();
}

function holdsAnyRole(row: IRouteRow, held: string[] | undefined): boolean {
  if (row.roles === undefined || row.roles.length === 0) {
    return true;
  }
  const roles: string[] = held ?? [];
  return row.roles.some((role: string): boolean => includes(roles, role));
}

function closedRoute(row: IRouteRow, look: IStateLook, fallback: IRouteFallback | undefined): IResolvedRoute {
  const route: IResolvedRoute = { key: row.key, label: row.label, state: look.state, pill: look.pill, stateLabel: look.label, external: false, carriesReference: row.carriesReference === true };
  if (fallback !== undefined) {
    route.href = fallback.href;
    route.fallback = fallback;
  }
  setOptional(route, 'note', row.note);
  return route;
}

function resolveRow(routes: RouteTable, row: IRouteRow, options: IRouteOptions): IResolvedRoute {
  const vocabulary: IVocabulary | undefined = options.vocabulary;
  const fallback: IRouteFallback | undefined = fallbackOf(routes, row, options.siteUrl);
  const needsAccess: IStateLook = stateLook('needsAccess', vocabulary) as IStateLook;
  if (!holdsAnyRole(row, options.roles)) {
    return closedRoute(row, needsAccess, fallback);
  }
  if (row.href === undefined) {
    return closedRoute(row, row.state === 'notSupported' ? (stateLook('notSupported', vocabulary) as IStateLook) : needsAccess, fallback);
  }
  const look: IStateLook | undefined = row.state === undefined ? undefined : stateLook(row.state, vocabulary);
  if (look === undefined) {
    // No state, or a code that says nothing: the destination has not been proved.
    return closedRoute(row, needsAccess, fallback);
  }
  if (look.state !== 'availableNow') {
    return closedRoute(row, look, fallback);
  }
  const external: boolean = isExternalHref(options.siteUrl, row.href);
  if (external && (row.receiptRef === undefined || !isVerified(row, options.now ?? new Date()))) {
    return closedRoute(row, { state: 'needsAccess', pill: 'awaitingSource', label: chromeLabel('awaitingSource', vocabulary) }, fallback);
  }
  const route: IResolvedRoute = {
    key: row.key,
    label: row.label,
    state: 'availableNow',
    pill: 'availableNow',
    stateLabel: look.label,
    href: resolveContentHref(options.siteUrl, row.href),
    external,
    carriesReference: row.carriesReference === true
  };
  setOptional(route, 'note', row.note);
  return route;
}

/**
 * Resolves a route key in the plan's order: an unknown key goes to the guided intake (or is not
 * supported when there is none); a row closed by roles, a blank link, a state other than available,
 * or a missing proof for an off-site link keeps its label and links to its fallback; only an available
 * row yields its own link, and only an off-site one opens in a new tab.
 */
export function resolveRoute(routes: RouteTable, key: string, options: IRouteOptions): IResolvedRoute {
  const row: IRouteRow | undefined = liveRow(routes, key) ?? liveRow(routes, GUIDED_INTAKE_ROUTE);
  if (row === undefined) {
    const notSupported: IStateLook = stateLook('notSupported', options.vocabulary) as IStateLook;
    return { key, label: NO_FALLBACK_LABEL, state: 'notSupported', pill: 'notSupported', stateLabel: notSupported.label, external: false, carriesReference: false };
  }
  return resolveRow(routes, row, options);
}
