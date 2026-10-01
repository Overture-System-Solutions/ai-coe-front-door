/**
 * Action states on tiles, the hero call to action and status items: `route` wins over `href` and
 * `state`; a plain `href` stays a plain link as before; a closed item keeps its label and its fallback.
 */
import { resolveAction, resolvePill } from './actions';
import type { IActionSource, ResolvedAction } from './actions';
import { parseVocabulary } from './pageContent';
import type { IRouteOptions, RouteTable } from './routes';

const SITE: string = 'https://contoso.sharepoint.com/sites/ai';
const NOW: Date = new Date('2026-09-20T12:00:00Z');
const OPTIONS: IRouteOptions = { siteUrl: SITE, now: NOW };
const GUIDED_HREF: string = `${SITE}/SitePages/Explore-an-AI-idea.aspx`;

const ROUTES: RouteTable = {
  guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
  work: { key: 'work', label: 'Work command', state: 'availableNow', note: 'Not yet proved here.' },
  assistant: { key: 'assistant', label: 'Ask the assistant', href: 'https://assistant.example/chat', state: 'availableNow', verifiedOn: '2026-09-01', receiptRef: 'TQ-0007' },
  status: { key: 'status', label: 'Status', href: 'SitePages/Status.aspx', state: 'availableNow' }
};

function action(item: IActionSource, routes: RouteTable = ROUTES): ResolvedAction | undefined {
  return resolveAction(item, routes, OPTIONS);
}

describe('resolveAction', () => {
  it('keeps a filled href without state or route as a plain link, as before', () => {
    expect(action({ href: 'SitePages/Status.aspx' })).toEqual({ kind: 'link', href: `${SITE}/SitePages/Status.aspx`, external: false });
    expect(action({ href: 'https://teams.microsoft.com/l/x' })).toEqual({ kind: 'link', href: 'https://teams.microsoft.com/l/x', external: true });
    expect(action({ href: '  ' })).toBeUndefined();
    expect(action({})).toBeUndefined();
  });

  it('lets the route win over href and state', () => {
    const open: ResolvedAction | undefined = action({ href: 'https://somewhere.else/', state: 'notSupported', route: 'status' });
    expect(open).toEqual({ kind: 'link', href: `${SITE}/SitePages/Status.aspx`, external: false, pill: 'availableNow', stateLabel: 'Available now' });
    const closed: ResolvedAction | undefined = action({ href: 'https://somewhere.else/', route: 'work' });
    expect(closed).toEqual({
      kind: 'closed',
      state: 'needsAccess',
      pill: 'needsAccess',
      stateLabel: 'Needs access',
      fallback: { key: 'guidedIntake', label: 'Start a guided request', href: GUIDED_HREF },
      note: 'Not yet proved here.'
    });
    const external: ResolvedAction | undefined = action({ route: 'assistant' });
    expect(external).toEqual({ kind: 'link', href: 'https://assistant.example/chat', external: true, pill: 'availableNow', stateLabel: 'Available now' });
    expect(action({ route: 'unknown' })).toEqual({ kind: 'link', href: GUIDED_HREF, external: false, pill: 'availableNow', stateLabel: 'Available now' });
    expect(action({ route: 'work' }, {})).toEqual({ kind: 'closed', state: 'notSupported', pill: 'notSupported', stateLabel: 'Not supported' });
  });

  it('closes a blank href with a state and drops a retired one', () => {
    expect(action({ state: 'needsAccess' })).toEqual({ kind: 'closed', state: 'needsAccess', pill: 'needsAccess', stateLabel: 'Needs access' });
    expect(action({ href: '', state: 'needsApproval' })).toEqual({ kind: 'closed', state: 'needsApproval', pill: 'needsApproval', stateLabel: 'Needs approval' });
    expect(action({ state: 'DESIGNED' })).toEqual({ kind: 'closed', state: 'needsAccess', pill: 'needsAccess', stateLabel: 'Coming: not yet enabled' });
    expect(action({ href: 'SitePages/x.aspx', state: 'PAUSED' })).toEqual({ kind: 'closed', state: 'needsAccess', pill: 'needsAccess', stateLabel: 'Paused' });
    expect(action({ href: 'SitePages/x.aspx', state: 'RETIRED' })).toBeUndefined();
    // Available with nothing to open is not available: it fails closed.
    expect(action({ state: 'availableNow' })).toEqual({ kind: 'closed', state: 'needsAccess', pill: 'needsAccess', stateLabel: 'Needs access' });
  });

  it('opens a filled href whose state is available, with the pill', () => {
    expect(action({ href: 'SitePages/x.aspx', state: 'availableNow' })).toEqual({ kind: 'link', href: `${SITE}/SitePages/x.aspx`, external: false, pill: 'availableNow', stateLabel: 'Available now' });
    expect(action({ href: 'https://tool.example/', state: 'ACTIVE' })).toEqual({ kind: 'link', href: 'https://tool.example/', external: true, pill: 'availableNow', stateLabel: 'Available now' });
  });

  it('reads the pill wording from the vocabulary', () => {
    const vocabulary: IRouteOptions['vocabulary'] = parseVocabulary({ truthStates: { needsAccess: { label: 'Ask for access' } } });
    expect(resolveAction({ state: 'needsAccess' }, ROUTES, { ...OPTIONS, vocabulary })).toEqual({ kind: 'closed', state: 'needsAccess', pill: 'needsAccess', stateLabel: 'Ask for access' });
  });
});

describe('resolvePill', () => {
  it('gives a status item the pill of its state or route, and nothing without either', () => {
    expect(resolvePill({}, ROUTES, OPTIONS)).toBeUndefined();
    expect(resolvePill({ href: 'SitePages/x.aspx' }, ROUTES, OPTIONS)).toBeUndefined();
    expect(resolvePill({ state: 'availableNow' }, ROUTES, OPTIONS)).toEqual({ pill: 'availableNow', label: 'Available now' });
    expect(resolvePill({ state: 'QUALIFIED' }, ROUTES, OPTIONS)).toEqual({ pill: 'needsAccess', label: 'Coming: not yet enabled' });
    expect(resolvePill({ state: 'RETIRED' }, ROUTES, OPTIONS)).toBeUndefined();
    expect(resolvePill({ route: 'work' }, ROUTES, OPTIONS)).toEqual({ pill: 'needsAccess', label: 'Needs access' });
    expect(resolvePill({ route: 'assistant' }, ROUTES, OPTIONS)).toEqual({ pill: 'availableNow', label: 'Available now' });
    expect(resolvePill({ state: 'notSupported', route: 'assistant' }, ROUTES, OPTIONS)).toEqual({ pill: 'availableNow', label: 'Available now' });
  });
});
