/**
 * Binding A transport: write one command row, then read that same row until it completes.
 *
 * The UI writes only request fields. `Result` starts as PENDING, `Claimed` as false, `TestRecord` as true for
 * local/UAT. The flow owns claim, response and completion. A poll of a submitted command re-reads that row; it
 * never inserts a second command. A 409/unique-title collision is not a pass until the recovered row is the same
 * command (see `sameCommand` in commandKey.ts). An inaccessible collision is DENIED/INCONCLUSIVE, never a reason
 * to widen permissions.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { listItemsUrl } from '../GovernanceService';
import type { IListItem, IListResponse, IServiceContext } from '../types';
import type { CoreOperation } from './coreContract';
import { COMMAND_LIST_TITLE } from './coreConfig';

export type CommandResultColumn = 'PENDING' | 'PASS' | 'FAIL' | 'DENIED' | 'INCONCLUSIVE' | 'RECONCILIATION_REQUIRED';

export interface ICommandRow {
  id: number;
  title: string;
  operation: CoreOperation;
  workId: string | null;
  requestJson: string;
  responseJson: string;
  result: CommandResultColumn;
  receiptId: string;
  correlationId: string;
  claimed: boolean;
  claimedAt: string | null;
  testRecord: boolean;
  author: string;
}

export type CommandObservation = 'queued' | 'processing' | 'completed' | 'inconclusive';

export function observationOf(row: ICommandRow): CommandObservation {
  if (row.result !== 'PENDING') {
    return 'completed';
  }
  return row.claimed ? 'processing' : 'queued';
}

export interface ISubmitOutcome {
  kind: 'created' | 'recovered' | 'denied' | 'inconclusive';
  row?: ICommandRow;
  httpStatus?: number;
  reason?: string;
}

export interface ICommandTransport {
  readonly label: string;
  submit(row: Omit<ICommandRow, 'id'>): Promise<ISubmitOutcome>;
  readByTitle(title: string): Promise<ICommandRow | undefined>;
  readById(id: number): Promise<ICommandRow | undefined>;
}

const ACCEPT: { [name: string]: string } = { Accept: 'application/json;odata=nometadata' };
const WRITE: { [name: string]: string } = {
  Accept: 'application/json;odata=nometadata',
  'Content-Type': 'application/json;odata=nometadata'
};

function odataText(value: string): string {
  return value.replace(/'/g, "''");
}

function asRow(item: IListItem, fallbackAuthor: string): ICommandRow {
  const id: unknown = item.Id !== undefined ? item.Id : item.ID;
  const claimed: unknown = item.Claimed;
  const work: unknown = item.WorkID;
  return {
    id: typeof id === 'number' ? id : 0,
    title: typeof item.Title === 'string' ? item.Title : '',
    operation: item.Operation as CoreOperation,
    workId: work === null || work === undefined || work === '' ? null : String(work),
    requestJson: typeof item.RequestJson === 'string' ? item.RequestJson : '',
    responseJson: typeof item.ResponseJson === 'string' ? item.ResponseJson : '',
    result: (typeof item.Result === 'string' ? item.Result : 'PENDING') as CommandResultColumn,
    receiptId: typeof item.ReceiptID === 'string' ? item.ReceiptID : '',
    correlationId: typeof item.CorrelationID === 'string' ? item.CorrelationID : '',
    claimed: claimed === true,
    claimedAt: typeof item.ClaimedAt === 'string' ? item.ClaimedAt : null,
    testRecord: item.TestRecord === true,
    author: typeof item.Author === 'string' ? item.Author : fallbackAuthor
  };
}

/**
 * SharePoint REST Binding A. Not used while live mode is disabled; kept so the call sites are real, not interfaces.
 * Ordinary employees never read Definitions to discover the list GUID.
 */
export class SharePointCommandTransport implements ICommandTransport {
  public readonly label: string = 'SharePoint Binding A (command list + polling). Live writes stay gated.';
  private readonly _context: IServiceContext;

  public constructor(context: IServiceContext) {
    this._context = context;
  }

  public async submit(row: Omit<ICommandRow, 'id'>): Promise<ISubmitOutcome> {
    const body: IListItem = {
      Title: row.title,
      Operation: row.operation,
      WorkID: row.workId,
      RequestJson: row.requestJson,
      ResponseJson: '',
      Result: 'PENDING',
      ReceiptID: '',
      CorrelationID: row.correlationId,
      Claimed: false,
      TestRecord: row.testRecord
    };
    try {
      const response: IListResponse = await this._context.client.post(listItemsUrl(this._context.siteUrl, COMMAND_LIST_TITLE), this._context.configuration, {
        headers: WRITE,
        body: JSON.stringify(body)
      });
      if (response.ok) {
        const created: IListItem = (await response.json()) as IListItem;
        return { kind: 'created', row: asRow(created, this._context.user.email), httpStatus: response.status };
      }
      if (response.status === 409 || response.status === 500) {
        const recovered: ICommandRow | undefined = await this.readByTitle(row.title);
        if (recovered === undefined) {
          return { kind: 'denied', httpStatus: response.status, reason: 'A duplicate-key write failed and the existing row could not be read; permissions will not be widened.' };
        }
        return { kind: 'recovered', row: recovered, httpStatus: response.status };
      }
      if (response.status === 401 || response.status === 403) {
        return { kind: 'denied', httpStatus: response.status, reason: 'The command list refused the write.' };
      }
      return { kind: 'inconclusive', httpStatus: response.status, reason: `The command list answered ${response.status}; the write is unconfirmed.` };
    } catch (error) {
      return { kind: 'inconclusive', reason: error instanceof Error ? error.message : String(error) };
    }
  }

  public async readByTitle(title: string): Promise<ICommandRow | undefined> {
    const url: string = `${listItemsUrl(this._context.siteUrl, COMMAND_LIST_TITLE)}?$filter=${encodeURIComponent(`Title eq '${odataText(title)}'`)}&$top=1`;
    const response: IListResponse = await this._context.client.get(url, this._context.configuration, { headers: ACCEPT });
    if (!response.ok) {
      return undefined;
    }
    const data: { value?: unknown } = (await response.json()) as { value?: unknown };
    const rows: IListItem[] = Array.isArray(data.value) ? (data.value as IListItem[]) : [];
    return rows.length === 0 ? undefined : asRow(rows[0], this._context.user.email);
  }

  public async readById(id: number): Promise<ICommandRow | undefined> {
    const url: string = `${listItemsUrl(this._context.siteUrl, COMMAND_LIST_TITLE)}(${id})`;
    const response: IListResponse = await this._context.client.get(url, this._context.configuration, { headers: ACCEPT });
    if (!response.ok) {
      return undefined;
    }
    return asRow((await response.json()) as IListItem, this._context.user.email);
  }
}

/** In-memory command list for local tests and the synthetic workspace. Two callers cannot read each other's rows. */
export class MemoryCommandTransport implements ICommandTransport {
  public readonly label: string = 'Synthetic command list: in-memory Binding A. Not a tenant list.';
  private readonly _rows: ICommandRow[] = [];
  private _nextId: number = 1;
  /** When true, submit stores PENDING and waits for `process(title)`. */
  public deferProcessing: boolean = false;
  public failNextWrite: boolean = false;
  public process: ((row: ICommandRow) => Promise<ICommandRow>) | undefined;

  public constructor(private readonly _caller: string) {}

  public snapshot(): ICommandRow[] {
    return this._rows.map((row: ICommandRow): ICommandRow => ({ ...row }));
  }

  public seed(row: ICommandRow): void {
    this._rows.push({ ...row });
    if (row.id >= this._nextId) {
      this._nextId = row.id + 1;
    }
  }

  public restore(rows: ICommandRow[]): void {
    this._rows.length = 0;
    this._nextId = 1;
    for (const row of rows) {
      this.seed(row);
    }
  }

  public async submit(row: Omit<ICommandRow, 'id'>): Promise<ISubmitOutcome> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      return { kind: 'inconclusive', reason: 'Simulated write timeout after a possible insert.' };
    }
    const existing: ICommandRow | undefined = this._rows.filter((held: ICommandRow): boolean => held.title === row.title)[0];
    if (existing !== undefined) {
      if (existing.author !== this._caller) {
        return { kind: 'denied', httpStatus: 409, reason: 'A command with this key exists and is not readable by this caller.' };
      }
      return { kind: 'recovered', row: { ...existing }, httpStatus: 409 };
    }
    const created: ICommandRow = { ...row, id: this._nextId, author: this._caller, result: 'PENDING', responseJson: '', claimed: false, claimedAt: null };
    this._nextId += 1;
    this._rows.push(created);
    if (!this.deferProcessing && this.process !== undefined) {
      const completed: ICommandRow = await this.process(created);
      const index: number = this._rows.findIndex((held: ICommandRow): boolean => held.id === created.id);
      this._rows[index] = completed;
      return { kind: 'created', row: { ...completed } };
    }
    return { kind: 'created', row: { ...created } };
  }

  public async readByTitle(title: string): Promise<ICommandRow | undefined> {
    const row: ICommandRow | undefined = this._rows.filter((held: ICommandRow): boolean => held.title === title)[0];
    if (row === undefined || row.author !== this._caller) {
      return undefined;
    }
    return { ...row };
  }

  public async readById(id: number): Promise<ICommandRow | undefined> {
    const row: ICommandRow | undefined = this._rows.filter((held: ICommandRow): boolean => held.id === id)[0];
    if (row === undefined || row.author !== this._caller) {
      return undefined;
    }
    return { ...row };
  }

  /** Completes a deferred command with the processor. Polls of the same title see this row. */
  public async complete(title: string): Promise<ICommandRow | undefined> {
    const index: number = this._rows.findIndex((held: ICommandRow): boolean => held.title === title);
    if (index < 0 || this.process === undefined) {
      return undefined;
    }
    this._rows[index] = { ...this._rows[index], claimed: true, claimedAt: new Date().toISOString() };
    const completed: ICommandRow = await this.process(this._rows[index]);
    this._rows[index] = completed;
    return { ...completed };
  }
}
