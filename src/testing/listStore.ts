/**
 * In-memory stand-in for the SharePoint REST list endpoints the web part uses. Supports the OData
 * options the services send (`$select`, `$orderby`, `$top`, a one-field `$filter ... eq '...'`),
 * `items(<Id>)` reads, optional paging through `@odata.nextLink`, injected failures (`fail`,
 * `deny`, lifted again by `recover`), a hook that runs after a POST is committed (`afterPost`),
 * item-level read trimming (`trimTo`), the site groups of the signed-in person (`setGroups`,
 * `denyGroups`, read through `_api/web/currentuser/groups`), and records every request for assertions.
 * Test support only: never bundled into the web part.
 */
import type { IListClient, IListRequestOptions, IListResponse } from '../webparts/aiCoeFrontDoor/services/types';

export interface IStoredItem {
  Id: number;
  [field: string]: unknown;
}

export interface IRecordedRequest {
  method: 'GET' | 'POST';
  url: string;
  list: string | undefined;
  /** Server-relative path when the request read a file instead of a list. */
  file?: string;
  /** True when the request read the site groups of the signed-in person instead of a list. */
  groups?: true;
  query: { [name: string]: string };
  headers: { [name: string]: string };
  body: unknown;
}

interface IListFailure {
  status: number;
  body: string;
}

/** Runs after a POST to the list has been committed, with the created item. */
export type AfterPostHook = (item: IStoredItem) => void;

/** The columns that name the person a row belongs to, in the lists the web part writes. */
const PERSON_FIELDS: readonly string[] = ['RequestorEmail', 'SubmitterEmail'];

const ITEMS_URL: RegExp = /getbytitle\('((?:[^']|'')*)'\)\/items(?:\((\d+)\))?(?:\?(.*))?$/;
const GROUPS_URL: RegExp = /\/_api\/web\/currentuser\/groups(?:\?(.*))?$/i;
const FILE_URL: RegExp = /GetFileByServerRelativeUrl\('((?:[^']|'')*)'\)\/\$value$/i;
const EQ_FILTER: RegExp = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+eq\s+'((?:[^']|'')*)'\s*$/;

function parseQuery(raw: string | undefined): { [name: string]: string } {
  const query: { [name: string]: string } = {};
  if (!raw) {
    return query;
  }
  for (const pair of raw.split('&')) {
    const separator: number = pair.indexOf('=');
    const name: string = decodeURIComponent(separator < 0 ? pair : pair.slice(0, separator));
    const value: string = separator < 0 ? '' : decodeURIComponent(pair.slice(separator + 1));
    query[name] = value;
  }
  return query;
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) {
    return 0;
  }
  if (left === undefined || left === null) {
    return -1;
  }
  if (right === undefined || right === null) {
    return 1;
  }
  return String(left) < String(right) ? -1 : 1;
}

function respond(status: number, data: unknown): IListResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async (): Promise<unknown> => data,
    text: async (): Promise<string> => (typeof data === 'string' ? data : JSON.stringify(data))
  };
}

function project(item: IStoredItem, select: string[] | undefined): object {
  if (select === undefined) {
    return item;
  }
  const projected: { [field: string]: unknown } = {};
  for (const field of select) {
    if (Object.prototype.hasOwnProperty.call(item, field)) {
      projected[field] = item[field];
    }
  }
  return projected;
}

/** Applies a `$filter=<Field> eq '<value>'` clause; any other filter shape matches nothing, as a typo would on the server. */
function matchesFilter(item: IStoredItem, filter: string | undefined): boolean {
  if (filter === undefined) {
    return true;
  }
  const match: RegExpExecArray | null = EQ_FILTER.exec(filter);
  if (match === null) {
    return false;
  }
  const value: string = match[2].replace(/''/g, "'");
  const field: unknown = item[match[1]];
  return field !== undefined && field !== null && String(field) === value;
}

export class InMemoryListStore {
  public readonly requests: IRecordedRequest[] = [];
  private readonly _lists: { [title: string]: IStoredItem[] } = {};
  private readonly _failures: { [title: string]: IListFailure } = {};
  private readonly _afterPost: { [title: string]: AfterPostHook } = {};
  private readonly _files: { [serverRelativePath: string]: string } = {};
  private readonly _pageSize: number | undefined;
  private _reader: string | undefined;
  private _groups: IStoredItem[] = [];
  private _groupsFailure: IListFailure | undefined;
  private _nextId: number = 1;

  public constructor(titles: readonly string[], pageSize?: number) {
    for (const title of titles) {
      this._lists[title] = [];
    }
    this._pageSize = pageSize;
  }

  /** Adds items to a list, assigning ids where missing. */
  public seed(title: string, items: readonly object[]): void {
    for (const item of items) {
      this._lists[title].push({ Id: this._nextId++, ...item } as IStoredItem);
    }
  }

  /** Every row the list holds, untrimmed: what the server stores, not what a reader sees. */
  public items(title: string): IStoredItem[] {
    return this._lists[title].slice();
  }

  /** Makes a file readable through `GetFileByServerRelativeUrl('<path>')/$value`. */
  public seedFile(serverRelativePath: string, body: string): void {
    this._files[serverRelativePath] = body;
  }

  /**
   * The site groups `_api/web/currentuser/groups` reports for the signed-in person, in the order
   * given; each gets an id, as the server assigns one. Seeding again replaces the whole membership.
   */
  public setGroups(titles: readonly string[]): void {
    this._groups = titles.map((title: string): IStoredItem => ({ Id: this._nextId++, Title: title }));
  }

  /** Refuses every read of the site groups, as a web whose membership the person may not read does. */
  public denyGroups(status: number = 403): void {
    this._groupsFailure = { status, body: 'Access denied' };
  }

  /** Makes every request to the list fail with the given status and body. */
  public fail(title: string, status: number = 500, body: string = 'boom'): void {
    this._failures[title] = { status, body };
  }

  /** Refuses every GET and POST to the list, as a list the reader holds no permission on does (403 by default). */
  public deny(title: string, status: number = 403): void {
    this.fail(title, status, 'Access denied');
  }

  /** Lets a failed or denied list answer again; its rows and hooks stay (for a retry after an outage). */
  public recover(title: string): void {
    delete this._failures[title];
  }

  /** Registers a hook that runs after each POST to the list is committed (for example to fail the readback that follows). */
  public afterPost(title: string, hook: AfterPostHook): void {
    this._afterPost[title] = hook;
  }

  /**
   * Simulates item-level read security for one reader: GETs return only the rows whose person
   * column (`RequestorEmail`, `SubmitterEmail`) matches the email, case-insensitively; rows with
   * no person column stay visible. Writes and the stored rows are unaffected.
   */
  public trimTo(email: string): void {
    this._reader = email.toLowerCase();
  }

  public async request(method: 'GET' | 'POST', url: string, options: IListRequestOptions): Promise<IListResponse> {
    const fileMatch: RegExpExecArray | null = FILE_URL.exec(url);
    if (fileMatch) {
      const file: string = fileMatch[1].replace(/''/g, "'");
      this.requests.push({ method, url, list: undefined, file, query: {}, headers: options.headers, body: undefined });
      return Object.prototype.hasOwnProperty.call(this._files, file) ? respond(200, this._files[file]) : respond(404, 'File not found');
    }
    const groupsMatch: RegExpExecArray | null = GROUPS_URL.exec(url);
    if (groupsMatch) {
      const groupsQuery: { [name: string]: string } = parseQuery(groupsMatch[1]);
      this.requests.push({ method, url, list: undefined, groups: true, query: groupsQuery, headers: options.headers, body: undefined });
      if (this._groupsFailure) {
        return respond(this._groupsFailure.status, this._groupsFailure.body);
      }
      const select: string[] | undefined = groupsQuery.$select ? groupsQuery.$select.split(',') : undefined;
      return respond(200, { value: this._groups.map((group: IStoredItem): object => project(group, select)) });
    }
    const match: RegExpExecArray | null = ITEMS_URL.exec(url);
    const list: string | undefined = match ? match[1].replace(/''/g, "'") : undefined;
    const itemId: number | undefined = match && match[2] !== undefined ? Number(match[2]) : undefined;
    const query: { [name: string]: string } = parseQuery(match ? match[3] : undefined);
    const body: unknown = options.body === undefined ? undefined : JSON.parse(options.body);
    this.requests.push({ method, url, list, query, headers: options.headers, body });

    if (list === undefined || !Object.prototype.hasOwnProperty.call(this._lists, list)) {
      return respond(404, 'List not found');
    }
    const failure: IListFailure | undefined = this._failures[list];
    if (failure) {
      return respond(failure.status, failure.body);
    }
    if (method === 'POST') {
      const created: IStoredItem = { ...(body as object), Id: this._nextId++ } as IStoredItem;
      this._lists[list].push(created);
      const hook: AfterPostHook | undefined = this._afterPost[list];
      if (hook !== undefined) {
        hook(created);
      }
      return respond(201, created);
    }
    if (itemId !== undefined) {
      return this._item(list, itemId, query);
    }
    return respond(200, this._page(list, url, query));
  }

  /** The rows of a list as the current reader sees them. */
  private _visible(list: string): IStoredItem[] {
    const reader: string | undefined = this._reader;
    if (reader === undefined) {
      return this._lists[list].slice();
    }
    return this._lists[list].filter((item: IStoredItem): boolean => {
      for (const field of PERSON_FIELDS) {
        const value: unknown = item[field];
        if (typeof value === 'string') {
          return value.toLowerCase() === reader;
        }
      }
      return true;
    });
  }

  private _item(list: string, itemId: number, query: { [name: string]: string }): IListResponse {
    const found: IStoredItem | undefined = this._visible(list).filter((item: IStoredItem): boolean => item.Id === itemId)[0];
    if (found === undefined) {
      return respond(404, 'Item does not exist');
    }
    return respond(200, project(found, query.$select ? query.$select.split(',') : undefined));
  }

  private _page(list: string, url: string, query: { [name: string]: string }): { value: object[]; '@odata.nextLink'?: string } {
    let items: IStoredItem[] = this._visible(list).filter((item: IStoredItem): boolean => matchesFilter(item, query.$filter));
    const orderBy: string | undefined = query.$orderby;
    if (orderBy) {
      const [field, direction] = orderBy.split(/\s+/);
      const factor: number = direction && direction.toLowerCase() === 'desc' ? -1 : 1;
      items.sort((left: IStoredItem, right: IStoredItem): number => factor * compareValues(left[field], right[field]));
    }
    const top: number = query.$top ? Number(query.$top) : items.length;
    items = items.slice(0, top);
    const skip: number = query.$skiptoken ? Number(query.$skiptoken) : 0;
    const end: number = this._pageSize === undefined ? items.length : Math.min(items.length, skip + this._pageSize);
    const page: IStoredItem[] = items.slice(skip, end);
    const select: string[] | undefined = query.$select ? query.$select.split(',') : undefined;
    const value: object[] = page.map((item: IStoredItem): object => project(item, select));
    const result: { value: object[]; '@odata.nextLink'?: string } = { value };
    if (end < items.length) {
      const base: string = url.replace(/&\$skiptoken=\d+/, '');
      result['@odata.nextLink'] = `${base}&$skiptoken=${end}`;
    }
    return result;
  }
}

/** An `IListClient` whose GET and POST calls are served by the store. */
export function createFakeListClient(store: InMemoryListStore): IListClient {
  return {
    get: (url: string, _configuration: unknown, options: IListRequestOptions): Promise<IListResponse> => store.request('GET', url, options),
    post: (url: string, _configuration: unknown, options: IListRequestOptions): Promise<IListResponse> => store.request('POST', url, options)
  };
}
