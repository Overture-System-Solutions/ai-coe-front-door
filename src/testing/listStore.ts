/**
 * In-memory stand-in for the SharePoint REST list endpoints the web part uses. Supports the OData
 * options the services send (`$select`, `$orderby`, `$top`), optional paging through
 * `@odata.nextLink`, injected failures, and records every request for assertions.
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
  query: { [name: string]: string };
  headers: { [name: string]: string };
  body: unknown;
}

interface IListFailure {
  status: number;
  body: string;
}

const ITEMS_URL: RegExp = /getbytitle\('((?:[^']|'')*)'\)\/items(?:\?(.*))?$/;
const FILE_URL: RegExp = /GetFileByServerRelativeUrl\('((?:[^']|'')*)'\)\/\$value$/i;

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

export class InMemoryListStore {
  public readonly requests: IRecordedRequest[] = [];
  private readonly _lists: { [title: string]: IStoredItem[] } = {};
  private readonly _failures: { [title: string]: IListFailure } = {};
  private readonly _files: { [serverRelativePath: string]: string } = {};
  private readonly _pageSize: number | undefined;
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

  public items(title: string): IStoredItem[] {
    return this._lists[title].slice();
  }

  /** Makes a file readable through `GetFileByServerRelativeUrl('<path>')/$value`. */
  public seedFile(serverRelativePath: string, body: string): void {
    this._files[serverRelativePath] = body;
  }

  /** Makes every request to the list fail with the given status and body. */
  public fail(title: string, status: number = 500, body: string = 'boom'): void {
    this._failures[title] = { status, body };
  }

  public async request(method: 'GET' | 'POST', url: string, options: IListRequestOptions): Promise<IListResponse> {
    const fileMatch: RegExpExecArray | null = FILE_URL.exec(url);
    if (fileMatch) {
      const file: string = fileMatch[1].replace(/''/g, "'");
      this.requests.push({ method, url, list: undefined, file, query: {}, headers: options.headers, body: undefined });
      return Object.prototype.hasOwnProperty.call(this._files, file) ? respond(200, this._files[file]) : respond(404, 'File not found');
    }
    const match: RegExpExecArray | null = ITEMS_URL.exec(url);
    const list: string | undefined = match ? match[1].replace(/''/g, "'") : undefined;
    const query: { [name: string]: string } = parseQuery(match ? match[2] : undefined);
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
      return respond(201, created);
    }
    return respond(200, this._page(list, url, query));
  }

  private _page(list: string, url: string, query: { [name: string]: string }): { value: object[]; '@odata.nextLink'?: string } {
    let items: IStoredItem[] = this._lists[list].slice();
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
    const value: object[] = page.map((item: IStoredItem): object => {
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
    });
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
