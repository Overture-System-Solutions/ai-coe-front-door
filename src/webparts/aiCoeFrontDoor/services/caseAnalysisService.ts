/**
 * Client for the case analysis Power Automate flow: an executive asks a question about the open business cases and
 * the flow answers with Claude's ranked analysis.
 *
 * The browser sends only the question. The flow reads the open governance records itself, with its own SharePoint
 * connection, and hands Claude their structured fields alone (reference, title, status, risk tier, data sensitivity,
 * the two flags, estimated cost, review date and the two timestamps). No request text written by a submitter leaves
 * the list, which keeps the rule that a leader is given a measured view rather than other people's words. The browser
 * never holds a model key: the trigger is reached with the Entra token the framework issues for the flow service,
 * exactly as the idea draft is.
 *
 * Every field of the answer is checked here against the same limits the flow validates, so an answer that drifted
 * from the contract is refused rather than drawn.
 */
import type { IDraftHttpClient, IDraftHttpResponse, IDraftProvenance } from './draftService';
import { createRecordId } from './recordId';

export const CASE_ANALYSIS_SCHEMA_VERSION: '1.0' = '1.0';

/** The longest question the flow accepts; the text box stops here too. */
export const CASE_ANALYSIS_QUESTION_LIMIT: number = 1500;

/** The question the button starts from. The executive may change it before asking. */
export const DEFAULT_CASE_ANALYSIS_QUESTION: string =
  'Which open business cases should I look at first, and why? Rank the most important ones by risk, cost and how long ' +
  'they have waited, and point out anything that is blocked, overdue for review or missing information.';

/** The most records the flow reads; a larger portfolio is reported as truncated. */
export const CASE_ANALYSIS_MAX_CASES: number = 200;

const MAX_PRIORITIES: number = 10;
const MAX_NOTES: number = 8;
const MAX_SUMMARY: number = 2000;
const MAX_ITEM: number = 600;
const MAX_REFERENCE: number = 40;

export interface ICaseAnalysisRequest {
  schemaVersion: '1.0';
  workflowId: 'caseAnalysis';
  requestId: string;
  /** The flow accepts synthetic demonstration data only; the flag is part of its contract, as it is for the idea draft. */
  demoDataOnly: true;
  question: string;
}

/** One case Claude ranked, cited by the reference the record carries. */
export interface ICasePriority {
  coeId: string;
  title: string;
  whyItMatters: string;
  suggestedNextStep: string;
}

export interface ICaseAnalysis {
  summary: string;
  priorities: ICasePriority[];
  patterns: string[];
  gaps: string[];
}

export interface ICaseAnalysisResult {
  /** Undefined when there were no open cases to read; the flow then asks Claude nothing. */
  analysis: ICaseAnalysis | undefined;
  caseCount: number;
  truncated: boolean;
  /** When the flow read the records, as it reported it. */
  asOf: string;
  provenance: IDraftProvenance;
}

export type CaseAnalysisFailureKind =
  | 'invalid-request'
  | 'too-large'
  | 'unauthorized'
  | 'not-found'
  | 'cases-unavailable'
  | 'unavailable'
  | 'invalid-response'
  | 'network'
  | 'not-permitted';

export class CaseAnalysisError extends Error {
  public readonly kind: CaseAnalysisFailureKind;
  public readonly status: number | undefined;
  public readonly code: string | undefined;

  public constructor(kind: CaseAnalysisFailureKind, message: string, status?: number, code?: string) {
    super(message);
    // Required for instanceof to work on ES5 targets.
    Object.setPrototypeOf(this, CaseAnalysisError.prototype);
    this.name = 'CaseAnalysisError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export interface ICaseAnalysisService {
  analyze(question: string): Promise<ICaseAnalysisResult>;
}

/** What a person reads when the analysis cannot be shown, by cause. None names a group, a list or a status code. */
export function caseAnalysisFailureText(kind: CaseAnalysisFailureKind): string {
  switch (kind) {
    case 'invalid-request':
      return 'The question could not be sent. Keep it under 1,500 characters and try again.';
    case 'too-large':
      return 'The question is too long to send. Shorten it and try again.';
    case 'unauthorized':
    case 'not-permitted':
      return 'The case analysis is not available to you. Ask the AI CoE if you think it should be.';
    case 'not-found':
      return 'The case analysis flow could not be found. Ask the AI CoE to check that it is turned on.';
    case 'cases-unavailable':
      return 'The open business cases could not be read, so nothing was sent to Claude. Try again later.';
    case 'invalid-response':
      return 'Claude\'s answer did not match what this page expects, so it is not shown. Try again.';
    case 'network':
      return 'The case analysis flow could not be reached. Check your connection and try again.';
    default:
      return 'Claude could not produce an analysis this time. Nothing was changed. Try again later.';
  }
}

function blank(value: string): boolean {
  return value.trim() === '';
}

/** The request for one question; a blank or over-long question is refused before anything is sent. */
export function buildCaseAnalysisRequest(question: string, requestId: string): ICaseAnalysisRequest {
  const trimmed: string = question.trim();
  if (trimmed === '' || trimmed.length > CASE_ANALYSIS_QUESTION_LIMIT) {
    throw new CaseAnalysisError('invalid-request', 'The question is blank or too long.');
  }
  return { schemaVersion: CASE_ANALYSIS_SCHEMA_VERSION, workflowId: 'caseAnalysis', requestId, demoDataOnly: true, question: trimmed };
}

function statusKind(status: number, code: string | undefined): CaseAnalysisFailureKind {
  if (code === 'CASES_UNAVAILABLE') {
    return 'cases-unavailable';
  }
  if (status === 400) {
    return 'invalid-request';
  }
  if (status === 413) {
    return 'too-large';
  }
  if (status === 401 || status === 403) {
    return 'unauthorized';
  }
  if (status === 404) {
    return 'not-found';
  }
  return 'unavailable';
}

type JsonObject = { [key: string]: unknown };

function parseJson(body: string): JsonObject | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as JsonObject) : undefined;
  } catch {
    return undefined;
  }
}

function errorCode(payload: JsonObject | undefined): string | undefined {
  const nested: unknown = payload === undefined ? undefined : payload.error;
  if (nested && typeof nested === 'object' && typeof (nested as { code?: unknown }).code === 'string') {
    return (nested as { code: string }).code;
  }
  return undefined;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** A non-blank string no longer than `limit`, or undefined. */
function boundedText(value: unknown, limit: number): string | undefined {
  return typeof value === 'string' && !blank(value) && value.length <= limit ? value : undefined;
}

function readPriority(value: unknown): ICasePriority | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const source: JsonObject = value as JsonObject;
  const coeId: string | undefined = boundedText(source.coeId, MAX_REFERENCE);
  const title: string | undefined = boundedText(source.title, MAX_ITEM);
  const whyItMatters: string | undefined = boundedText(source.whyItMatters, MAX_ITEM);
  const suggestedNextStep: string | undefined = boundedText(source.suggestedNextStep, MAX_ITEM);
  return coeId === undefined || title === undefined || whyItMatters === undefined || suggestedNextStep === undefined
    ? undefined
    : { coeId, title, whyItMatters, suggestedNextStep };
}

function readNotes(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_NOTES) {
    return undefined;
  }
  const notes: (string | undefined)[] = value.map((note: unknown): string | undefined => boundedText(note, MAX_ITEM));
  return notes.every((note: string | undefined): boolean => note !== undefined) ? (notes as string[]) : undefined;
}

function readAnalysis(value: unknown): ICaseAnalysis | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const source: JsonObject = value as JsonObject;
  const summary: string | undefined = boundedText(source.summary, MAX_SUMMARY);
  if (summary === undefined || !Array.isArray(source.priorities) || source.priorities.length > MAX_PRIORITIES) {
    return undefined;
  }
  const priorities: (ICasePriority | undefined)[] = source.priorities.map(readPriority);
  const patterns: string[] | undefined = readNotes(source.patterns);
  const gaps: string[] | undefined = readNotes(source.gaps);
  if (priorities.some((priority: ICasePriority | undefined): boolean => priority === undefined) || patterns === undefined || gaps === undefined) {
    return undefined;
  }
  return { summary, priorities: priorities as ICasePriority[], patterns, gaps };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= CASE_ANALYSIS_MAX_CASES;
}

/** Turns the flow's answer into a result, or throws a CaseAnalysisError saying why it cannot. */
export function parseCaseAnalysisResponse(status: number, body: string, requestId: string): ICaseAnalysisResult {
  const payload: JsonObject | undefined = parseJson(body);
  if (status < 200 || status >= 300) {
    const code: string | undefined = errorCode(payload);
    throw new CaseAnalysisError(statusKind(status, code), `The case analysis flow answered ${status}.`, status, code);
  }
  const invalid = (reason: string): CaseAnalysisError => new CaseAnalysisError('invalid-response', reason, status);
  if (payload === undefined || payload.ok !== true || payload.schemaVersion !== CASE_ANALYSIS_SCHEMA_VERSION) {
    throw invalid('The case analysis flow did not return a completed answer.');
  }
  const echoed: string = readString(payload.requestId);
  if (echoed !== '' && echoed !== requestId) {
    throw invalid('The case analysis flow answered a different request.');
  }
  if (!isCount(payload.caseCount) || typeof payload.truncated !== 'boolean' || boundedText(payload.asOf, 64) === undefined) {
    throw invalid('The case analysis flow did not say what it read.');
  }
  let analysis: ICaseAnalysis | undefined;
  if (payload.caseCount === 0) {
    if (payload.analysis !== null && payload.analysis !== undefined) {
      throw invalid('The case analysis flow analyzed cases it did not read.');
    }
  } else {
    analysis = readAnalysis(payload.analysis);
    if (analysis === undefined) {
      throw invalid('The case analysis flow returned an incomplete analysis.');
    }
  }
  return {
    analysis,
    caseCount: payload.caseCount,
    truncated: payload.truncated,
    asOf: readString(payload.asOf),
    provenance: {
      provider: readString(payload.provider),
      model: readString(payload.model),
      responseId: readString(payload.responseId),
      requestId,
      draftOnly: payload.draftOnly === true,
      humanReviewRequired: payload.humanReviewRequired === true
    }
  };
}

/** Calls the flow's HTTP trigger with the framework-issued Entra token. */
export class ClaudeCaseAnalysisService implements ICaseAnalysisService {
  private readonly _url: string;
  private readonly _client: () => Promise<IDraftHttpClient>;
  private readonly _requestId: () => string;

  public constructor(url: string, client: () => Promise<IDraftHttpClient>, requestId: () => string = (): string => createRecordId('analysis')) {
    this._url = url;
    this._client = client;
    this._requestId = requestId;
  }

  public async analyze(question: string): Promise<ICaseAnalysisResult> {
    const request: ICaseAnalysisRequest = buildCaseAnalysisRequest(question, this._requestId());
    let response: IDraftHttpResponse;
    let body: string;
    try {
      const client: IDraftHttpClient = await this._client();
      response = await client.post(this._url, JSON.stringify(request));
      body = await response.text();
    } catch (error) {
      throw new CaseAnalysisError('network', `The case analysis flow could not be reached: ${error instanceof Error ? error.message : String(error)}`);
    }
    return parseCaseAnalysisResponse(response.status, body, request.requestId);
  }
}

/** A service for the configured trigger URL, or undefined when the web part has none (the panel then says so). */
export function createCaseAnalysisService(url: string | undefined, client: () => Promise<IDraftHttpClient>): ICaseAnalysisService | undefined {
  const trimmed: string = (url ?? '').trim();
  return trimmed === '' ? undefined : new ClaudeCaseAnalysisService(trimmed, client);
}
