import { createFakeListClient, InMemoryListStore } from '../../../testing/listStore';
import type { IRecordedRequest } from '../../../testing/listStore';
import { parseRoleGroups } from '../content/roles';
import type { RoleGroupMap } from '../content/roles';
import { RoleResolver, siteGroupsUrl } from './roleResolver';
import type { IRoleResolution } from './roleResolver';
import type { IListClient, IListRequestOptions, IListResponse, IServiceContext } from './types';

const SITE: string = 'https://contoso.sharepoint.com/sites/ai';
const GROUPS: string = 'leader=AI CoE Leaders;operator=AI CoE Operators;designAuthority=AI CoE Design Authority';

function contextFor(client: IListClient): IServiceContext {
  return { siteUrl: SITE, user: { displayName: 'Ada Example', email: 'ada@contoso.com' }, client, configuration: 'v1' };
}

function createHarness(titles: readonly string[], roleGroups: string = GROUPS): { store: InMemoryListStore; resolver: RoleResolver } {
  const store: InMemoryListStore = new InMemoryListStore([]);
  store.setGroups(titles);
  return { store, resolver: new RoleResolver(contextFor(createFakeListClient(store)), parseRoleGroups(roleGroups)) };
}

function groupReads(store: InMemoryListStore): IRecordedRequest[] {
  return store.requests.filter((request: IRecordedRequest): boolean => request.groups === true);
}

/** Runs `run` with `console.error` silenced (the resolver logs every refused read, status only). */
async function silenced<T>(run: (errorSpy: jest.SpyInstance) => Promise<T>): Promise<T> {
  const errorSpy: jest.SpyInstance = jest.spyOn(console, 'error').mockImplementation((): void => undefined);
  try {
    return await run(errorSpy);
  } finally {
    errorSpy.mockRestore();
  }
}

describe('siteGroupsUrl', () => {
  it('asks the web for the titles of the signed-in person\'s groups and nothing else', () => {
    expect(siteGroupsUrl(SITE)).toBe(`${SITE}/_api/web/currentuser/groups?$select=Title`);
    expect(siteGroupsUrl(`${SITE}/`)).toBe(`${SITE}/_api/web/currentuser/groups?$select=Title`);
  });
});

describe('RoleResolver', () => {
  it('reads the site groups once and gives every role whose group the person is in', async () => {
    const { store, resolver } = createHarness(['AI CoE Leaders', 'AI CoE Operators', 'Everyone else']);
    const resolution: IRoleResolution = await resolver.resolve({ isAdmin: false });
    expect(resolution).toEqual({ roles: ['employee', 'leader', 'operator'], resolution: 'resolved' });
    const reads: IRecordedRequest[] = groupReads(store);
    expect(reads).toHaveLength(1);
    expect(reads[0].url).toBe(siteGroupsUrl(SITE));
    expect(reads[0].method).toBe('GET');
  });

  it('answers a second caller from the first read, so one page makes one request', async () => {
    const { store, resolver } = createHarness(['AI CoE Leaders']);
    const [first, second] = await Promise.all([resolver.resolve({ isAdmin: false }), resolver.resolve({ isAdmin: false })]);
    const third: IRoleResolution = await resolver.resolve({ isAdmin: false });
    expect(first).toEqual({ roles: ['employee', 'leader'], resolution: 'resolved' });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(groupReads(store)).toHaveLength(1);
  });

  it('matches the group titles case-insensitively and ignores the surrounding spaces', async () => {
    const { resolver } = createHarness(['  ai coe operators  ']);
    expect(await resolver.resolve({ isAdmin: false })).toEqual({ roles: ['employee', 'operator'], resolution: 'resolved' });
  });

  it('gives everyone the employee role and nothing else when no group of theirs is bound', async () => {
    const { resolver } = createHarness(['Site Visitors']);
    expect(await resolver.resolve({ isAdmin: false })).toEqual({ roles: ['employee'], resolution: 'resolved' });
  });

  it('adds operator for a site owner without asking about a permission itself', async () => {
    const { store, resolver } = createHarness(['Site Visitors']);
    // The web part checks manageWeb once and passes the answer in; the resolver holds no permission API at all.
    expect(await resolver.resolve({ isAdmin: true })).toEqual({ roles: ['employee', 'operator'], resolution: 'resolved' });
    expect(JSON.stringify(store.requests).indexOf('permission')).toBe(-1);
  });

  it('never names a role the person holds twice, whichever way they hold it', async () => {
    const { resolver } = createHarness(['AI CoE Operators', 'AI CoE Leaders']);
    expect(await resolver.resolve({ isAdmin: true })).toEqual({ roles: ['employee', 'leader', 'operator'], resolution: 'resolved' });
  });

  it('leaves the design authority unheld until a site group is bound to it', async () => {
    const bound = await createHarness(['AI CoE Design Authority']).resolver.resolve({ isAdmin: false });
    expect(bound).toEqual({ roles: ['employee', 'designAuthority'], resolution: 'resolved' });
    const unbound = await createHarness(['AI CoE Design Authority'], 'leader=AI CoE Leaders').resolver.resolve({ isAdmin: false });
    expect(unbound).toEqual({ roles: ['employee'], resolution: 'resolved' });
  });

  it('asks nothing at all when the property binds no group', async () => {
    const { store, resolver } = createHarness(['AI CoE Leaders'], '');
    expect(await resolver.resolve({ isAdmin: false })).toEqual({ roles: ['employee'], resolution: 'resolved' });
    expect(store.requests).toEqual([]);
  });

  it('falls back to the employee role alone when the read is refused', async () => {
    await silenced(async (errorSpy: jest.SpyInstance): Promise<void> => {
      const { store, resolver } = createHarness(['AI CoE Leaders']);
      store.denyGroups();
      expect(await resolver.resolve({ isAdmin: false })).toEqual({ roles: ['employee'], resolution: 'unresolved' });
      expect(errorSpy).toHaveBeenCalled();
      // The console gets the status and the class, never the response body.
      expect(String(errorSpy.mock.calls[0][1])).toContain('403');
      expect(String(errorSpy.mock.calls[0][1])).not.toContain('Access denied');
    });
  });

  it('keeps the role a site owner holds by permission even when the read fails', async () => {
    await silenced(async (): Promise<void> => {
      const { store, resolver } = createHarness(['AI CoE Leaders']);
      store.denyGroups(500);
      expect(await resolver.resolve({ isAdmin: true })).toEqual({ roles: ['employee', 'operator'], resolution: 'unresolved' });
    });
  });

  it('treats a network error and an answer that is not a list of groups as unresolved', async () => {
    await silenced(async (): Promise<void> => {
      const broken: IListClient = {
        get: (): Promise<IListResponse> => Promise.reject(new Error('network down')),
        post: (): Promise<IListResponse> => Promise.reject(new Error('network down'))
      };
      const offline: RoleResolver = new RoleResolver(contextFor(broken), parseRoleGroups(GROUPS));
      expect(await offline.resolve({ isAdmin: false })).toEqual({ roles: ['employee'], resolution: 'unresolved' });

      const nonsense: IListClient = {
        get: (_url: string, _configuration: unknown, _options: IListRequestOptions): Promise<IListResponse> =>
          Promise.resolve({ ok: true, status: 200, json: async (): Promise<unknown> => 'not a group list', text: async (): Promise<string> => 'not a group list' }),
        post: (): Promise<IListResponse> => Promise.reject(new Error('never posted'))
      };
      const confused: RoleResolver = new RoleResolver(contextFor(nonsense), parseRoleGroups(GROUPS));
      expect(await confused.resolve({ isAdmin: false })).toEqual({ roles: ['employee'], resolution: 'resolved' });
    });
  });

  it('remembers each answer under the permission it was asked with', async () => {
    const { store, resolver } = createHarness(['AI CoE Leaders']);
    const map: RoleGroupMap = parseRoleGroups(GROUPS);
    expect(map.leader).toBe('AI CoE Leaders');
    expect(await resolver.resolve({ isAdmin: false })).toEqual({ roles: ['employee', 'leader'], resolution: 'resolved' });
    expect(await resolver.resolve({ isAdmin: true })).toEqual({ roles: ['employee', 'leader', 'operator'], resolution: 'resolved' });
    expect(groupReads(store)).toHaveLength(1);
  });
});
