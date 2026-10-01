/**
 * Reads the signed-in person's own requests from the pilot intake list: the rows whose
 * `RequestorEmail` is theirs, newest first, projected to the columns a status line needs (never the
 * payload). Item-level read security on the list trims what the server returns, so a person sees
 * their own rows and nothing else; the service never widens that. Failures become results, never
 * exceptions, and carry a class and a body-free sentence: a refused read is `denied`, anything else
 * `unavailable`, and a page never shows a number for either.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { caseLinksFor, myCaseLinks, requestLinks, requestLinksFor } from './recordLinks';
import type { SubmissionWorkflowType } from '../workflows/types';
import { classifyError, classifyResponse, failureUserMessage } from './failureClass';
import type { FailureClass } from './failureClass';
import { INTAKES_LIST_TITLE, listItemsUrl, workflowLabel } from './GovernanceService';
import type { IFailureFields, IListItem, IListResponse, IServiceContext } from './types';

/** What the read came to: the rows, a refusal, or no answer worth a number. */
export type MyWorkState = 'ok' | 'denied' | 'unavailable';

/** One request of the person's, as the status line shows it. */
export interface IMyWorkItem {
  id: number;
  title: string;
  /** The record reference (`IntakeId`). */
  reference: string;
  workflowType: string;
  /** The workflow's name as the front door labels it; the raw type when unknown. */
  workflowLabel: string;
  /** The list's status code; the page renders its plain wording. */
  status: string;
  submittedAt?: string;
  modified?: string;
}

export interface IMyWorkResult extends IFailureFields {
  state: MyWorkState;
  items: IMyWorkItem[];
  message: string;
}

/** Where a card of My requests links to (1.0.0.18): the case a request opened, or the request's own row. */
export interface IRecordLink {
  url: string;
  kind: 'case' | 'request';
}

export interface IMyWorkService {
  getMine(): Promise<IMyWorkResult>;
  /** The link of each request by item id; a request with no resolvable link is absent. Never throws. */
  recordLinks?(items: readonly IMyWorkItem[]): Promise<{ [itemId: number]: IRecordLink }>;
  /** The link of each named case the reader can see, by reference. Never throws. */
  caseLinks?(references: readonly string[]): Promise<{ [reference: string]: string }>;
  /** The link of each named request the reader can see, by reference (1.0.0.19). Never throws. */
  requestLinksFor?(references: readonly string[]): Promise<{ [reference: string]: string }>;
}

/** The columns a status line needs; the payload column is never asked for. */
export const MY_WORK_SELECT: string = 'Id,Title,IntakeId,WorkflowType,Status,SubmittedAt,Modified';
export const MY_WORK_TOP: number = 20;
const MY_WORK_ORDER: string = 'SubmittedAt desc';
const ACCEPT_HEADER: { [name: string]: string } = { Accept: 'application/json;odata=nometadata' };

/** The intake rows of one requestor, newest first, at most twenty; apostrophes in the email are doubled for OData. */
export function myWorkUrl(siteUrl: string, email: string): string {
  const filter: string = encodeURIComponent(`RequestorEmail eq '${email.replace(/'/g, "''")}'`);
  return `${listItemsUrl(siteUrl, INTAKES_LIST_TITLE)}?$filter=${filter}&$select=${MY_WORK_SELECT}&$orderby=${encodeURIComponent(MY_WORK_ORDER)}&$top=${MY_WORK_TOP}`;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function toItem(row: IListItem): IMyWorkItem {
  const id: unknown = row.Id !== undefined ? row.Id : row.ID;
  const workflowType: string = text(row.WorkflowType);
  const item: IMyWorkItem = {
    id: typeof id === 'number' ? id : 0,
    title: text(row.Title),
    reference: text(row.IntakeId),
    workflowType,
    workflowLabel: workflowLabel(workflowType as SubmissionWorkflowType),
    status: text(row.Status)
  };
  const submittedAt: string | undefined = optionalText(row.SubmittedAt);
  if (submittedAt !== undefined) {
    item.submittedAt = submittedAt;
  }
  const modified: string | undefined = optionalText(row.Modified);
  if (modified !== undefined) {
    item.modified = modified;
  }
  return item;
}

function failed(failureClass: FailureClass, message: string): IMyWorkResult {
  return { state: failureClass === 'PERMISSION' ? 'denied' : 'unavailable', items: [], message, failureClass, userMessage: failureUserMessage(failureClass) };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class MyWorkService implements IMyWorkService {
  private readonly _context: IServiceContext;

  public constructor(context: IServiceContext) {
    this._context = context;
  }

  public async recordLinks(items: readonly IMyWorkItem[]): Promise<{ [itemId: number]: IRecordLink }> {
    const links: { [itemId: number]: IRecordLink } = {};
    try {
      const email: string = text(this._context.user.email).trim();
      const cases: { [reference: string]: string } = email === '' ? {} : await myCaseLinks(this._context, email);
      const rows: { [itemId: number]: string } = await requestLinks(this._context, items.map((item: IMyWorkItem): number => item.id));
      for (const item of items) {
        const caseUrl: string | undefined = item.reference === '' ? undefined : cases[item.reference];
        if (caseUrl !== undefined) {
          links[item.id] = { url: caseUrl, kind: 'case' };
        } else if (rows[item.id] !== undefined) {
          links[item.id] = { url: rows[item.id], kind: 'request' };
        }
      }
    } catch {
      // No links: the cards stay, unlinked.
    }
    return links;
  }

  public caseLinks(references: readonly string[]): Promise<{ [reference: string]: string }> {
    return caseLinksFor(this._context, references);
  }

  public requestLinksFor(references: readonly string[]): Promise<{ [reference: string]: string }> {
    return requestLinksFor(this._context, references);
  }

  public async getMine(): Promise<IMyWorkResult> {
    const email: string = text(this._context.user.email).trim();
    if (email === '') {
      // Without an email there is no row that could be the person's; asking would match nothing or, worse, everything blank.
      return failed('IMPLEMENTATION', 'The request list was not read: the signed-in account has no email address.');
    }
    try {
      const response: IListResponse = await this._context.client.get(myWorkUrl(this._context.siteUrl, email), this._context.configuration, { headers: ACCEPT_HEADER });
      if (!response.ok) {
        // The console gets the status and the class only, never the body.
        const failureClass: FailureClass = classifyResponse(response);
        console.error('AI CoE request list read failed', `${INTAKES_LIST_TITLE} returned ${response.status} (${failureClass})`);
        return failed(failureClass, `The request list could not be read: ${INTAKES_LIST_TITLE} answered ${response.status}.`);
      }
      const data: { value?: unknown } = (await response.json()) as { value?: unknown };
      const rows: IListItem[] = data !== null && typeof data === 'object' && Array.isArray(data.value) ? (data.value as IListItem[]) : [];
      return { state: 'ok', items: rows.map(toItem), message: `Read ${rows.length} request${rows.length === 1 ? '' : 's'} from ${INTAKES_LIST_TITLE}.` };
    } catch (error) {
      const failureClass: FailureClass = classifyError(error);
      console.error('AI CoE request list read failed', `${failureClass}: ${describeError(error).slice(0, 200)}`);
      return failed(failureClass, `The request list could not be read: ${describeError(error)}`);
    }
  }
}
