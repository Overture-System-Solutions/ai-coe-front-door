import { createFakeListClient, InMemoryListStore } from './listStore';
import type { IRecordedRequest, IStoredItem } from './listStore';
import type { IListClient, IListResponse } from '../webparts/aiCoeFrontDoor/services/types';

const INTAKES: string = 'AI CoE Pilot Intakes';
const USE_CASES: string = 'AI CoE Use Cases';
const USAGE: string = 'AI Usage Daily';
const SITE: string = 'https://contoso.sharepoint.com/sites/ai';
const HEADERS: { [name: string]: string } = { Accept: 'application/json;odata=nometadata' };

function itemsUrl(title: string, suffix: string = ''): string {
  return `${SITE}/_api/web/lists/getbytitle('${title.replace(/'/g, "''")}')/items${suffix}`;
}

function filterUrl(title: string, field: string, value: string): string {
  return itemsUrl(title, `?$select=Id,${field}&$filter=${encodeURIComponent(`${field} eq '${value.replace(/'/g, "''")}'`)}`);
}

async function getValue(client: IListClient, url: string): Promise<{ status: number; value: IStoredItem[] }> {
  const response: IListResponse = await client.get(url, 'v1', { headers: HEADERS });
  const data: { value?: IStoredItem[] } = response.ok ? ((await response.json()) as { value?: IStoredItem[] }) : {};
  return { status: response.status, value: data.value ?? [] };
}

function createStore(): { store: InMemoryListStore; client: IListClient } {
  const store: InMemoryListStore = new InMemoryListStore([INTAKES, USE_CASES, USAGE]);
  return { store, client: createFakeListClient(store) };
}

describe('InMemoryListStore $filter', () => {
  it("answers `$filter=IntakeId eq 'X'` with the matching rows only", async () => {
    const { store, client } = createStore();
    store.seed(INTAKES, [
      { IntakeId: 'OVT-AICOE-20260911-AAAAAAAA', Title: 'first' },
      { IntakeId: 'OVT-AICOE-20260911-BBBBBBBB', Title: 'second' },
      { IntakeId: 'OVT-AICOE-20260911-AAAAAAAA', Title: 'third' }
    ]);
    const hits: { status: number; value: IStoredItem[] } = await getValue(client, filterUrl(INTAKES, 'IntakeId', 'OVT-AICOE-20260911-AAAAAAAA'));
    expect(hits.status).toBe(200);
    expect(hits.value).toEqual([{ Id: 1, IntakeId: 'OVT-AICOE-20260911-AAAAAAAA' }, { Id: 3, IntakeId: 'OVT-AICOE-20260911-AAAAAAAA' }]);
    const misses: { status: number; value: IStoredItem[] } = await getValue(client, filterUrl(INTAKES, 'IntakeId', 'OVT-AICOE-20260911-CCCCCCCC'));
    expect(misses.status).toBe(200);
    expect(misses.value).toEqual([]);
  });

  it('reads a doubled apostrophe in the filter value as one apostrophe', async () => {
    const { store, client } = createStore();
    store.seed(USE_CASES, [{ CoEID: "O'Brien", Title: 'one' }, { CoEID: 'OBrien', Title: 'two' }]);
    const url: string = filterUrl(USE_CASES, 'CoEID', "O'Brien");
    expect(url).toContain("O''Brien");
    const hits: { status: number; value: IStoredItem[] } = await getValue(client, url);
    expect(hits.value).toEqual([{ Id: 1, CoEID: "O'Brien" }]);
    const recorded: IRecordedRequest = store.requests[0];
    expect(recorded.list).toBe(USE_CASES);
    expect(recorded.query.$filter).toBe("CoEID eq 'O''Brien'");
  });

  it('applies the filter before ordering and $top', async () => {
    const { store, client } = createStore();
    store.seed(INTAKES, [
      { RequestorEmail: 'pat@contoso.com', SubmittedAt: '2026-09-01T00:00:00.000Z', Title: 'older' },
      { RequestorEmail: 'sam@contoso.com', SubmittedAt: '2026-09-05T00:00:00.000Z', Title: 'other' },
      { RequestorEmail: 'pat@contoso.com', SubmittedAt: '2026-09-10T00:00:00.000Z', Title: 'newer' }
    ]);
    const url: string = itemsUrl(INTAKES, `?$select=Title&$filter=${encodeURIComponent("RequestorEmail eq 'pat@contoso.com'")}&$orderby=SubmittedAt%20desc&$top=1`);
    const page: { status: number; value: IStoredItem[] } = await getValue(client, url);
    expect(page.value).toEqual([{ Title: 'newer' }]);
  });
});

describe('InMemoryListStore items(<Id>)', () => {
  it('answers one item by id, projected by $select', async () => {
    const { store, client } = createStore();
    store.seed(INTAKES, [{ IntakeId: 'A', Title: 'first', Modified: '2026-09-11T14:30:00.000Z' }, { IntakeId: 'B', Title: 'second', Modified: '2026-09-11T14:31:00.000Z' }]);
    const response: IListResponse = await client.get(itemsUrl(INTAKES, '(2)?$select=Id,IntakeId,Modified'), 'v1', { headers: HEADERS });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ Id: 2, IntakeId: 'B', Modified: '2026-09-11T14:31:00.000Z' });
    const recorded: IRecordedRequest = store.requests[0];
    expect(recorded.list).toBe(INTAKES);
    expect(recorded.query).toEqual({ $select: 'Id,IntakeId,Modified' });
  });

  it('answers 404 for an id the list does not hold', async () => {
    const { store, client } = createStore();
    store.seed(INTAKES, [{ IntakeId: 'A' }]);
    const response: IListResponse = await client.get(itemsUrl(INTAKES, '(7)'), 'v1', { headers: HEADERS });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Item does not exist');
  });

  it('still answers 404 List not found for a list the store does not hold', async () => {
    const { client } = createStore();
    const response: IListResponse = await client.get(itemsUrl('AI CoE Nowhere', '(1)'), 'v1', { headers: HEADERS });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('List not found');
  });
});

describe('InMemoryListStore deny', () => {
  it('answers 403 Access denied for GET and POST on the denied list only', async () => {
    const { store, client } = createStore();
    store.seed(INTAKES, [{ IntakeId: 'A' }]);
    store.seed(USE_CASES, [{ CoEID: 'A' }]);
    store.deny(INTAKES);
    const read: IListResponse = await client.get(itemsUrl(INTAKES), 'v1', { headers: HEADERS });
    expect(read.status).toBe(403);
    expect(await read.text()).toBe('Access denied');
    const write: IListResponse = await client.post(itemsUrl(INTAKES), 'v1', { headers: HEADERS, body: JSON.stringify({ IntakeId: 'B' }) });
    expect(write.status).toBe(403);
    expect(store.items(INTAKES)).toHaveLength(1);
    const other: { status: number; value: IStoredItem[] } = await getValue(client, itemsUrl(USE_CASES));
    expect(other.status).toBe(200);
    expect(other.value).toHaveLength(1);
  });

  it('takes another status when asked', async () => {
    const { store, client } = createStore();
    store.deny(USAGE, 401);
    const read: IListResponse = await client.get(itemsUrl(USAGE), 'v1', { headers: HEADERS });
    expect(read.status).toBe(401);
  });

  it('recover() lets the list answer again, keeping its rows and its hooks', async () => {
    const { store, client } = createStore();
    store.seed(INTAKES, [{ IntakeId: 'A' }]);
    let hooks: number = 0;
    store.afterPost(INTAKES, (): void => {
      hooks += 1;
    });
    store.deny(INTAKES);
    expect((await client.get(itemsUrl(INTAKES), 'v1', { headers: HEADERS })).status).toBe(403);
    store.recover(INTAKES);
    const read: { status: number; value: IStoredItem[] } = await getValue(client, itemsUrl(INTAKES));
    expect(read.status).toBe(200);
    expect(read.value).toHaveLength(1);
    const write: IListResponse = await client.post(itemsUrl(INTAKES), 'v1', { headers: HEADERS, body: JSON.stringify({ IntakeId: 'B' }) });
    expect(write.status).toBe(201);
    expect(hooks).toBe(1);
    // Recovering a list that was never failed is harmless.
    store.recover(USE_CASES);
    expect((await getValue(client, itemsUrl(USE_CASES))).status).toBe(200);
  });
});

describe('InMemoryListStore afterPost', () => {
  it('runs the hook after the POST is committed, with the created item', async () => {
    const { store, client } = createStore();
    const seen: { count: number; item: IStoredItem | undefined }[] = [];
    store.afterPost(INTAKES, (item: IStoredItem): void => {
      seen.push({ count: store.items(INTAKES).length, item });
    });
    const write: IListResponse = await client.post(itemsUrl(INTAKES), 'v1', { headers: HEADERS, body: JSON.stringify({ IntakeId: 'A' }) });
    expect(write.status).toBe(201);
    expect(seen).toEqual([{ count: 1, item: { Id: 1, IntakeId: 'A' } }]);
    await client.post(itemsUrl(USE_CASES), 'v1', { headers: HEADERS, body: JSON.stringify({ CoEID: 'A' }) });
    expect(seen).toHaveLength(1);
  });

  it('lets the hook fail the readback that follows the write', async () => {
    const { store, client } = createStore();
    store.afterPost(INTAKES, (): void => {
      store.fail(INTAKES, 500, 'boom');
    });
    const write: IListResponse = await client.post(itemsUrl(INTAKES), 'v1', { headers: HEADERS, body: JSON.stringify({ IntakeId: 'A' }) });
    expect(write.status).toBe(201);
    expect(store.items(INTAKES)).toHaveLength(1);
    const readback: IListResponse = await client.get(itemsUrl(INTAKES, '(1)?$select=Id,IntakeId,Modified'), 'v1', { headers: HEADERS });
    expect(readback.status).toBe(500);
  });

  it('does not run the hook when the POST was refused', async () => {
    const { store, client } = createStore();
    const hook: jest.Mock = jest.fn();
    store.afterPost(INTAKES, hook);
    store.deny(INTAKES);
    await client.post(itemsUrl(INTAKES), 'v1', { headers: HEADERS, body: JSON.stringify({ IntakeId: 'A' }) });
    expect(hook).not.toHaveBeenCalled();
  });
});

describe('InMemoryListStore trimTo', () => {
  function seedPeople(store: InMemoryListStore): void {
    store.seed(INTAKES, [
      { IntakeId: 'A', RequestorEmail: 'pat@contoso.com', Title: 'mine' },
      { IntakeId: 'B', RequestorEmail: 'sam@contoso.com', Title: 'theirs' },
      { IntakeId: 'C', RequestorEmail: 'PAT@contoso.com', Title: 'mine too' }
    ]);
    store.seed(USE_CASES, [{ CoEID: 'A', SubmitterEmail: 'pat@contoso.com' }, { CoEID: 'B', SubmitterEmail: 'sam@contoso.com' }]);
    store.seed(USAGE, [{ Provider: 'openai', Amount: 1 }]);
  }

  it('returns only the rows whose RequestorEmail matches the trimmed reader', async () => {
    const { store, client } = createStore();
    seedPeople(store);
    store.trimTo('pat@contoso.com');
    const rows: { status: number; value: IStoredItem[] } = await getValue(client, itemsUrl(INTAKES, '?$select=IntakeId'));
    expect(rows.value).toEqual([{ IntakeId: 'A' }, { IntakeId: 'C' }]);
    const filtered: { status: number; value: IStoredItem[] } = await getValue(client, filterUrl(INTAKES, 'IntakeId', 'B'));
    expect(filtered.value).toEqual([]);
  });

  it('trims use cases by SubmitterEmail and leaves rows without a person column visible', async () => {
    const { store, client } = createStore();
    seedPeople(store);
    store.trimTo('pat@contoso.com');
    const useCases: { status: number; value: IStoredItem[] } = await getValue(client, itemsUrl(USE_CASES, '?$select=CoEID'));
    expect(useCases.value).toEqual([{ CoEID: 'A' }]);
    const usage: { status: number; value: IStoredItem[] } = await getValue(client, itemsUrl(USAGE));
    expect(usage.value).toHaveLength(1);
  });

  it('answers 404 when the trimmed reader asks for another person\'s item by id', async () => {
    const { store, client } = createStore();
    seedPeople(store);
    store.trimTo('pat@contoso.com');
    const own: IListResponse = await client.get(itemsUrl(INTAKES, '(1)?$select=Id,IntakeId'), 'v1', { headers: HEADERS });
    expect(own.status).toBe(200);
    const foreign: IListResponse = await client.get(itemsUrl(INTAKES, '(2)?$select=Id,IntakeId'), 'v1', { headers: HEADERS });
    expect(foreign.status).toBe(404);
  });

  it('keeps the store itself complete', async () => {
    const { store } = createStore();
    seedPeople(store);
    store.trimTo('pat@contoso.com');
    expect(store.items(INTAKES)).toHaveLength(3);
  });
});
