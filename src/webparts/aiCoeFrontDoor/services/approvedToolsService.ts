/**
 * Reads the approved-tools register (1.0.0.18): one row per AI tool the AI CoE has reviewed, with its status, what it
 * is approved for, which kinds of information it may be used with, and its conditions. Operators and site owners keep
 * the list; everyone else only reads it, and so does the front door. The tool check, the approved-tools panel and the
 * AI CoE Assistant agent answer from the same rows, so the page and the agent never disagree about a tool.
 *
 * A row allows only what it says: an allowance column left blank allows nothing, a status the front door does not know
 * reads as under review, and a tool that is not on the list has not been reviewed. Failures become results, never
 * exceptions, and carry a class and a body-free sentence; a site whose list does not exist yet has no approved tools.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { optionalDay, optionalWords } from '../content/values';
import { includes } from '../utils/collections';
import { classifyError, classifyResponse, failureUserMessage } from './failureClass';
import type { FailureClass } from './failureClass';
import { listItemsUrl } from './GovernanceService';
import { APPROVED_TOOLS_LIST_TITLE } from './lists';
import type { IFailureFields, IListItem, IListResponse, IServiceContext } from './types';

/** The statuses an operator may give a tool, in the order the list offers them. */
export const APPROVED_TOOL_STATUSES: readonly ApprovedToolStatus[] = ['Approved', 'Approved with conditions', 'Not approved', 'Under review'];
export type ApprovedToolStatus = 'Approved' | 'Approved with conditions' | 'Not approved' | 'Under review';

/** What a tool may be used with; each is one yes/no column, and a blank column allows nothing. */
export interface IToolAllowances {
  /** Internal business information, or use as part of an ongoing work process. */
  companyInformation: boolean;
  employeeInformation: boolean;
  customerInformation: boolean;
  patientInformation: boolean;
  otherConfidentialInformation: boolean;
  /** Regulated information, such as financial or legal records. */
  regulatedInformation: boolean;
  fileUploads: boolean;
  /** Output shared outside the organization. */
  externalSharing: boolean;
}

/** One reviewed tool as its row records it. */
export interface IApprovedTool {
  /** The stable key a tool check records. */
  id: string;
  /** The name people know the tool by. */
  name: string;
  /** Other names people use for it, one per comma. */
  otherNames: string[];
  vendor?: string;
  status: ApprovedToolStatus;
  approvedFor?: string;
  allows: IToolAllowances;
  conditions?: string;
  notApprovedFor?: string;
  howToGetAccess?: string;
  /** YYYY-MM-DD: when the AI CoE last reviewed the row. */
  lastReviewed?: string;
  reviewedBy?: string;
}

export type ApprovedToolsState = 'ok' | 'unavailable';

export interface IApprovedToolsResult extends IFailureFields {
  state: ApprovedToolsState;
  /** Every reviewed tool, by name; empty when the list is absent or could not be read. */
  tools: IApprovedTool[];
  message: string;
}

export interface IApprovedToolsService {
  getTools(): Promise<IApprovedToolsResult>;
}

/** The columns the register declares; `listsDefinition.test.ts` holds this and the declaration together. */
export const APPROVED_TOOLS_SELECT: string =
  'Id,Title,ToolId,OtherNames,Vendor,Status,ApprovedFor,CompanyInfoAllowed,EmployeeInfoAllowed,CustomerInfoAllowed,PatientInfoAllowed,' +
  'ConfidentialInfoAllowed,RegulatedInfoAllowed,FileUploadsAllowed,ExternalSharingAllowed,Conditions,NotApprovedFor,HowToGetAccess,LastReviewed,ReviewedBy';
/** One page of rows: a register holds tools in the tens. */
export const APPROVED_TOOLS_TOP: number = 200;
const ACCEPT_HEADER: { [name: string]: string } = { Accept: 'application/json;odata=nometadata' };

export function approvedToolsUrl(siteUrl: string): string {
  return `${listItemsUrl(siteUrl, APPROVED_TOOLS_LIST_TITLE)}?$select=${APPROVED_TOOLS_SELECT}&$top=${APPROVED_TOOLS_TOP}`;
}

function readStatus(value: unknown): ApprovedToolStatus {
  const status: string | undefined = optionalWords(value);
  return status !== undefined && includes(APPROVED_TOOL_STATUSES, status as ApprovedToolStatus) ? (status as ApprovedToolStatus) : 'Under review';
}

/** Only a literal yes allows; blank, absent or anything else allows nothing. */
function allowed(value: unknown): boolean {
  return value === true;
}

function setWords(tool: IApprovedTool, key: 'vendor' | 'approvedFor' | 'conditions' | 'notApprovedFor' | 'howToGetAccess' | 'reviewedBy', value: unknown): void {
  const words: string | undefined = optionalWords(value);
  if (words !== undefined) {
    tool[key] = words;
  }
}

export function toApprovedTool(row: IListItem): IApprovedTool | undefined {
  const id: string | undefined = optionalWords(row.ToolId);
  const name: string | undefined = optionalWords(row.Title);
  if (id === undefined || name === undefined) {
    return undefined;
  }
  const otherNames: string[] = (optionalWords(row.OtherNames) ?? '')
    .split(/[,;\n]/)
    .map((part: string): string => part.trim())
    .filter((part: string): boolean => part !== '');
  const tool: IApprovedTool = {
    id,
    name,
    otherNames,
    status: readStatus(row.Status),
    allows: {
      companyInformation: allowed(row.CompanyInfoAllowed),
      employeeInformation: allowed(row.EmployeeInfoAllowed),
      customerInformation: allowed(row.CustomerInfoAllowed),
      patientInformation: allowed(row.PatientInfoAllowed),
      otherConfidentialInformation: allowed(row.ConfidentialInfoAllowed),
      regulatedInformation: allowed(row.RegulatedInfoAllowed),
      fileUploads: allowed(row.FileUploadsAllowed),
      externalSharing: allowed(row.ExternalSharingAllowed)
    }
  };
  setWords(tool, 'vendor', row.Vendor);
  setWords(tool, 'approvedFor', row.ApprovedFor);
  setWords(tool, 'conditions', row.Conditions);
  setWords(tool, 'notApprovedFor', row.NotApprovedFor);
  setWords(tool, 'howToGetAccess', row.HowToGetAccess);
  setWords(tool, 'reviewedBy', row.ReviewedBy);
  const lastReviewed: string | undefined = optionalDay(row.LastReviewed);
  if (lastReviewed !== undefined) {
    tool.lastReviewed = lastReviewed;
  }
  return tool;
}

/** The rows as tools, by name; a row without an id or a name is not a tool, and the first of two ids wins. */
export function toApprovedTools(rows: IListItem[]): IApprovedTool[] {
  const seen: { [id: string]: true } = {};
  const tools: IApprovedTool[] = [];
  for (const row of rows) {
    const tool: IApprovedTool | undefined = toApprovedTool(row);
    if (tool !== undefined && !Object.prototype.hasOwnProperty.call(seen, tool.id.toLowerCase())) {
      seen[tool.id.toLowerCase()] = true;
      tools.push(tool);
    }
  }
  return tools.sort((a: IApprovedTool, b: IApprovedTool): number => a.name.localeCompare(b.name));
}

function failed(failureClass: FailureClass, message: string): IApprovedToolsResult {
  return { state: 'unavailable', tools: [], message, failureClass, userMessage: failureUserMessage(failureClass) };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ApprovedToolsService implements IApprovedToolsService {
  private readonly _context: IServiceContext;

  public constructor(context: IServiceContext) {
    this._context = context;
  }

  public async getTools(): Promise<IApprovedToolsResult> {
    try {
      const response: IListResponse = await this._context.client.get(approvedToolsUrl(this._context.siteUrl), this._context.configuration, { headers: ACCEPT_HEADER });
      if (!response.ok) {
        // The console gets the status and the class only, never the body.
        const failureClass: FailureClass = classifyResponse(response);
        console.error('AI CoE approved tools read failed', `${APPROVED_TOOLS_LIST_TITLE} returned ${response.status} (${failureClass})`);
        return failed(failureClass, `The approved tools could not be read: ${APPROVED_TOOLS_LIST_TITLE} answered ${response.status}.`);
      }
      const data: { value?: unknown } = (await response.json()) as { value?: unknown };
      const rows: IListItem[] = data !== null && typeof data === 'object' && Array.isArray(data.value) ? (data.value as IListItem[]) : [];
      const tools: IApprovedTool[] = toApprovedTools(rows);
      return { state: 'ok', tools, message: `Read ${tools.length} tool${tools.length === 1 ? '' : 's'} from ${APPROVED_TOOLS_LIST_TITLE}.` };
    } catch (error) {
      const failureClass: FailureClass = classifyError(error);
      console.error('AI CoE approved tools read failed', `${failureClass}: ${describeError(error).slice(0, 200)}`);
      return failed(failureClass, `The approved tools could not be read: ${describeError(error)}`);
    }
  }
}
