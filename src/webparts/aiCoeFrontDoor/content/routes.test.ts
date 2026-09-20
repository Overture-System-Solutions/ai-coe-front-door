/**
 * The route table: how a route key resolves to a state, a link and a fallback, failing closed to the
 * guided intake in the order the plan's Contracts give (A5, FD-13, CANON-08, PV-11).
 */
import { GUIDED_INTAKE_ROUTE, NO_FALLBACK_LABEL, parseRoutes, resolveRoute } from './routes';
import type { IResolvedRoute, IRouteOptions, IRouteRow, RouteTable } from './routes';
import { parseVocabulary } from './pageContent';

const SITE: string = 'https://contoso.sharepoint.com/sites/ai';
const NOW: Date = new Date('2026-09-20T12:00:00Z');
const OPTIONS: IRouteOptions = { siteUrl: SITE, now: NOW };

const GUIDED: IRouteRow = { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' };

function table(rows: IRouteRow[]): RouteTable {
  const routes: RouteTable = {};
  for (const row of rows) {
    routes[row.key] = row;
  }
  return routes;
}

const FALLBACK_HREF: string = `${SITE}/SitePages/Explore-an-AI-idea.aspx`;

describe('parseRoutes', () => {
  it('keeps rows with a label, trims keys, and drops the rest', () => {
    const routes: RouteTable = parseRoutes({
      ' work ': { label: ' Ask the assistant ', href: ' https://assistant.example/ ', state: 'availableNow', verifiedOn: '2026-09-01', receiptRef: 'TQ-0007', fallback: 'guidedIntake', note: 'Opens in a new tab.', roles: ['leader', ' operator ', 4, ''], carriesReference: true, capabilityId: 'CAP-1' },
      guidedIntake: { label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' },
      noLabel: { href: 'SitePages/x.aspx' },
      blankLabel: { label: '  ', href: 'SitePages/x.aspx' },
      notAnObject: 'x',
      ' ': { label: 'blank key' }
    });
    expect(routes).toEqual({
      work: {
        key: 'work',
        label: 'Ask the assistant',
        href: 'https://assistant.example/',
        state: 'availableNow',
        verifiedOn: '2026-09-01',
        receiptRef: 'TQ-0007',
        fallback: 'guidedIntake',
        note: 'Opens in a new tab.',
        roles: ['leader', 'operator'],
        carriesReference: true,
        capabilityId: 'CAP-1'
      },
      guidedIntake: { key: 'guidedIntake', label: 'Start a guided request', href: 'SitePages/Explore-an-AI-idea.aspx', state: 'availableNow' }
    });
    expect(parseRoutes(undefined)).toEqual({});
    expect(parseRoutes('x')).toEqual({});
    expect(parseRoutes([{ label: 'x' }])).toEqual({});
  });

  it('ignores an unknown state, a malformed date, a non-boolean flag and non-array roles', () => {
    const routes: RouteTable = parseRoutes({
      a: { label: 'A', state: 'bogus', verifiedOn: '20 Sep 2026', carriesReference: 'yes', roles: 'leader' },
      b: { label: 'B', state: 'DESIGNED', verifiedOn: '2026-02-30', carriesReference: false },
      c: { label: 'C', state: ' ACTIVE ', verifiedOn: ' 2026-09-01 ' }
    });
    expect(routes.a).toEqual({ key: 'a', label: 'A' });
    expect(routes.b).toEqual({ key: 'b', label: 'B', state: 'DESIGNED' });
    expect(routes.c).toEqual({ key: 'c', label: 'C', state: 'ACTIVE', verifiedOn: '2026-09-01' });
  });
});

describe('resolveRoute', () => {
  it('sends an unknown key to the guided intake row', () => {
    const routes: RouteTable = table([GUIDED]);
    const route: IResolvedRoute = resolveRoute(routes, 'work', OPTIONS);
    expect(route.key).toBe(GUIDED_INTAKE_ROUTE);
    expect(route.label).toBe('Start a guided request');
    expect(route.state).toBe('availableNow');
    expect(route.pill).toBe('availableNow');
    expect(route.stateLabel).toBe('Available now');
    expect(route.href).toBe(FALLBACK_HREF);
    expect(route.external).toBe(false);
    expect(route.fallback).toBeUndefined();
  });

  it('is not supported, with no link, when there is no guided intake row either', () => {
    const route: IResolvedRoute = resolveRoute({}, 'work', OPTIONS);
    expect(route).toEqual({ key: 'work', label: NO_FALLBACK_LABEL, state: 'notSupported', pill: 'notSupported', stateLabel: 'Not supported', external: false, carriesReference: false });
    expect(NO_FALLBACK_LABEL).toBe('No fallback is configured');
  });

  it('needs access when the row names roles the person does not hold, linking to the fallback', () => {
    const routes: RouteTable = table([GUIDED, { key: 'value', label: 'Enterprise value', href: 'SitePages/Enterprise-value.aspx', state: 'availableNow', roles: ['leader', 'operator'] }]);
    const closed: IResolvedRoute = resolveRoute(routes, 'value', OPTIONS);
    expect(closed.state).toBe('needsAccess');
    expect(closed.pill).toBe('needsAccess');
    expect(closed.stateLabel).toBe('Needs access');
    expect(closed.href).toBe(FALLBACK_HREF);
    expect(closed.fallback).toEqual({ key: 'guidedIntake', label: 'Start a guided request', href: FALLBACK_HREF });
    expect(resolveRoute(routes, 'value', { ...OPTIONS, roles: ['employee'] }).state).toBe('needsAccess');
    const open: IResolvedRoute = resolveRoute(routes, 'value', { ...OPTIONS, roles: ['operator'] });
    expect(open.state).toBe('availableNow');
    expect(open.href).toBe(`${SITE}/SitePages/Enterprise-value.aspx`);
  });

  it('needs access on a blank href, or is not supported when the row says so', () => {
    const routes: RouteTable = table([GUIDED, { key: 'work', label: 'Work command', state: 'availableNow' }, { key: 'agent', label: 'Agent', state: 'notSupported', note: 'Use the guided request.' }]);
    const work: IResolvedRoute = resolveRoute(routes, 'work', OPTIONS);
    expect(work.state).toBe('needsAccess');
    expect(work.href).toBe(FALLBACK_HREF);
    expect(work.label).toBe('Work command');
    const agent: IResolvedRoute = resolveRoute(routes, 'agent', OPTIONS);
    expect(agent.state).toBe('notSupported');
    expect(agent.pill).toBe('notSupported');
    expect(agent.href).toBe(FALLBACK_HREF);
    expect(agent.note).toBe('Use the guided request.');
  });

  it('maps every state other than available now to its own pill and the fallback link', () => {
    const routes: RouteTable = table([
      GUIDED,
      { key: 'designed', label: 'D', href: 'https://tool.example/', state: 'DESIGNED' },
      { key: 'qualified', label: 'Q', href: 'https://tool.example/', state: 'QUALIFIED' },
      { key: 'paused', label: 'P', href: 'SitePages/P.aspx', state: 'PAUSED' },
      { key: 'approval', label: 'A', href: 'SitePages/A.aspx', state: 'needsApproval' },
      { key: 'draft', label: 'Dr', href: 'SitePages/Dr.aspx', state: 'draftOnly' },
      { key: 'noState', label: 'N', href: 'SitePages/N.aspx' }
    ]);
    const designed: IResolvedRoute = resolveRoute(routes, 'designed', OPTIONS);
    expect(designed.state).toBe('needsAccess');
    expect(designed.stateLabel).toBe('Coming: not yet enabled');
    expect(designed.href).toBe(FALLBACK_HREF);
    expect(designed.external).toBe(false);
    expect(resolveRoute(routes, 'qualified', OPTIONS).stateLabel).toBe('Coming: not yet enabled');
    const paused: IResolvedRoute = resolveRoute(routes, 'paused', OPTIONS);
    expect(paused.state).toBe('needsAccess');
    expect(paused.stateLabel).toBe('Paused');
    expect(paused.href).toBe(FALLBACK_HREF);
    const approval: IResolvedRoute = resolveRoute(routes, 'approval', OPTIONS);
    expect(approval.state).toBe('needsApproval');
    expect(approval.pill).toBe('needsApproval');
    expect(approval.stateLabel).toBe('Needs approval');
    expect(approval.href).toBe(FALLBACK_HREF);
    expect(resolveRoute(routes, 'draft', OPTIONS).state).toBe('draftOnly');
    // A row that names no state has not been proved: it fails closed.
    expect(resolveRoute(routes, 'noState', OPTIONS).state).toBe('needsAccess');
  });

  it('drops a retired row, so its key resolves like an unknown one', () => {
    const routes: RouteTable = table([GUIDED, { key: 'old', label: 'Old tool', href: 'https://old.example/', state: 'RETIRED', verifiedOn: '2026-01-01', receiptRef: 'TQ-1' }]);
    const route: IResolvedRoute = resolveRoute(routes, 'old', OPTIONS);
    expect(route.key).toBe('guidedIntake');
    expect(route.state).toBe('availableNow');
    expect(resolveRoute(table([{ ...GUIDED, state: 'RETIRED' }]), 'old', OPTIONS).state).toBe('notSupported');
  });

  it('opens an off-site route only with a verified date and a receipt reference', () => {
    const base: IRouteRow = { key: 'assistant', label: 'Ask the assistant', href: 'https://assistant.example/chat', state: 'availableNow' };
    const unverified: IResolvedRoute = resolveRoute(table([GUIDED, base]), 'assistant', OPTIONS);
    expect(unverified.state).toBe('needsAccess');
    expect(unverified.pill).toBe('awaitingSource');
    expect(unverified.stateLabel).toBe('Awaiting source');
    expect(unverified.href).toBe(FALLBACK_HREF);
    expect(unverified.external).toBe(false);
    const noReceipt: IResolvedRoute = resolveRoute(table([GUIDED, { ...base, verifiedOn: '2026-09-01' }]), 'assistant', OPTIONS);
    expect(noReceipt.pill).toBe('awaitingSource');
    const noDate: IResolvedRoute = resolveRoute(table([GUIDED, { ...base, receiptRef: 'TQ-0007' }]), 'assistant', OPTIONS);
    expect(noDate.pill).toBe('awaitingSource');
    // A verification dated after today proves nothing yet.
    const future: IResolvedRoute = resolveRoute(table([GUIDED, { ...base, verifiedOn: '2026-09-21', receiptRef: 'TQ-0007' }]), 'assistant', OPTIONS);
    expect(future.pill).toBe('awaitingSource');
    const proven: IResolvedRoute = resolveRoute(table([GUIDED, { ...base, verifiedOn: '2026-09-20', receiptRef: 'TQ-0007' }]), 'assistant', OPTIONS);
    expect(proven.state).toBe('availableNow');
    expect(proven.pill).toBe('availableNow');
    expect(proven.href).toBe('https://assistant.example/chat');
    expect(proven.external).toBe(true);
    expect(proven.fallback).toBeUndefined();
    const active: IResolvedRoute = resolveRoute(table([GUIDED, { ...base, state: 'ACTIVE', verifiedOn: '2026-09-01', receiptRef: 'TQ-0007' }]), 'assistant', OPTIONS);
    expect(active.state).toBe('availableNow');
    expect(active.external).toBe(true);
  });

  it('opens a site-relative route without a date or receipt, and a same-origin URL counts as on site', () => {
    const routes: RouteTable = table([
      GUIDED,
      { key: 'improve', label: 'Improve a task', href: 'SitePages/Check-a-tool-or-task.aspx', state: 'availableNow' },
      { key: 'same', label: 'Same origin', href: `${SITE}/SitePages/Status.aspx`, state: 'AVAILABLE' },
      { key: 'root', label: 'Root path', href: '/sites/other/x.aspx', state: 'availableNow' }
    ]);
    const improve: IResolvedRoute = resolveRoute(routes, 'improve', OPTIONS);
    expect(improve.state).toBe('availableNow');
    expect(improve.href).toBe(`${SITE}/SitePages/Check-a-tool-or-task.aspx`);
    expect(improve.external).toBe(false);
    expect(resolveRoute(routes, 'same', OPTIONS).external).toBe(false);
    expect(resolveRoute(routes, 'same', OPTIONS).state).toBe('availableNow');
    expect(resolveRoute(routes, 'root', OPTIONS).state).toBe('availableNow');
  });

  it('honours the row fallback, never falls back to itself, and carries the reference flag', () => {
    const routes: RouteTable = table([
      GUIDED,
      { key: 'improve', label: 'Improve a task', href: 'SitePages/Check-a-tool-or-task.aspx', state: 'availableNow', carriesReference: true },
      { key: 'work', label: 'Work command', state: 'availableNow', fallback: 'improve' },
      { key: 'loop', label: 'Loop', state: 'needsApproval', fallback: 'loop' },
      { key: 'missing', label: 'Missing', state: 'needsApproval', fallback: 'nowhere' }
    ]);
    const work: IResolvedRoute = resolveRoute(routes, 'work', OPTIONS);
    expect(work.href).toBe(`${SITE}/SitePages/Check-a-tool-or-task.aspx`);
    expect(work.fallback).toEqual({ key: 'improve', label: 'Improve a task', href: `${SITE}/SitePages/Check-a-tool-or-task.aspx` });
    expect(work.carriesReference).toBe(false);
    expect(resolveRoute(routes, 'improve', OPTIONS).carriesReference).toBe(true);
    const loop: IResolvedRoute = resolveRoute(routes, 'loop', OPTIONS);
    expect(loop.href).toBeUndefined();
    expect(loop.fallback).toBeUndefined();
    expect(resolveRoute(routes, 'missing', OPTIONS).href).toBeUndefined();
  });

  it('takes the pill wording from the document vocabulary', () => {
    const routes: RouteTable = table([GUIDED, { key: 'assistant', label: 'Ask', href: 'https://assistant.example/', state: 'availableNow' }, { key: 'agent', label: 'Agent', state: 'notSupported' }]);
    const vocabulary: IRouteOptions['vocabulary'] = parseVocabulary({ chrome: { awaitingSource: 'Proof pending' }, truthStates: { notSupported: { label: 'Not offered' }, availableNow: { label: 'Ready' } } });
    expect(resolveRoute(routes, 'assistant', { ...OPTIONS, vocabulary }).stateLabel).toBe('Proof pending');
    expect(resolveRoute(routes, 'agent', { ...OPTIONS, vocabulary }).stateLabel).toBe('Not offered');
    expect(resolveRoute(routes, 'guidedIntake', { ...OPTIONS, vocabulary }).stateLabel).toBe('Ready');
  });

  it('defaults the clock to today when none is given', () => {
    const routes: RouteTable = table([GUIDED, { key: 'assistant', label: 'Ask', href: 'https://assistant.example/', state: 'availableNow', verifiedOn: '2000-01-01', receiptRef: 'TQ-1' }]);
    expect(resolveRoute(routes, 'assistant', { siteUrl: SITE }).state).toBe('availableNow');
  });
});
