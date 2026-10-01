/**
 * Client for the intake drafting Power Automate flow, which turns the idea answers into a
 * twelve-field draft summary through the organization's own model connection. The browser never
 * holds a model key: the flow is reached through an HTTP trigger that requires a Microsoft Entra
 * token for the flow service, which the web part obtains from the framework.
 */
import { IDEA_SUMMARY_FIELDS } from '../summaries/ideaSummary';
import type { IIdeaSummaryDraft } from '../summaries/ideaSummary';
import { includes } from '../utils/collections';
import { answerSteps } from '../workflows/formEngine';
import type { AnswerValue, IAnswers, IStep, IWorkflowDefinition } from '../workflows/types';
import { createRecordId } from './recordId';

/** Token audience of the Power Automate service in the public cloud; the trailing slash is required. */
export const FLOW_SERVICE_RESOURCE: string = 'https://service.flow.microsoft.com/';

export const DRAFT_SCHEMA_VERSION: '1.0' = '1.0';

/** The answer fields the flow's request schema accepts (it rejects any other property). */
export const IDEA_DRAFT_ANSWER_KEYS: readonly string[] = [
  'workToImprove',
  'painPoints',
  'peopleInvolved',
  'frequency',
  'timeSpent',
  'systemsInvolved',
  'informationUsed',
  'informationCategories',
  'aiAlreadyUsed',
  'aiToolName',
  'desiredOutcome',
  'successMeasure',
  'hasDeadlineSponsor',
  'deadlineSponsorDetail',
  'anythingElse'
];

export interface IIdeaDraftRequest {
  schemaVersion: '1.0';
  workflowId: 'idea';
  requestId: string;
  /** The flow only accepts synthetic demonstration data; the flag is part of its contract. */
  demoDataOnly: true;
  answers: { [key: string]: string | string[] };
}

/** Where a draft came from; stored with the submission so reviewers can tell AI drafts apart. */
export interface IDraftProvenance {
  provider: string;
  model: string;
  responseId: string;
  requestId: string;
  draftOnly: boolean;
  humanReviewRequired: boolean;
}

export interface IIdeaDraftResult {
  draft: IIdeaSummaryDraft;
  provenance: IDraftProvenance;
}

export type DraftFailureKind = 'invalid-request' | 'too-large' | 'unauthorized' | 'not-found' | 'unavailable' | 'invalid-response' | 'network';

export class DraftServiceError extends Error {
  public readonly kind: DraftFailureKind;
  public readonly status: number | undefined;
  public readonly code: string | undefined;

  public constructor(kind: DraftFailureKind, message: string, status?: number, code?: string) {
    super(message);
    // Required for instanceof to work on ES5 targets.
    Object.setPrototypeOf(this, DraftServiceError.prototype);
    this.name = 'DraftServiceError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export interface IDraftHttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

/** The one call the service needs; the web part adapts the framework's Entra-authenticated client to it. */
export interface IDraftHttpClient {
  post(url: string, body: string): Promise<IDraftHttpResponse>;
}

export interface IIdeaDraftService {
  draftIdea(definition: IWorkflowDefinition, answers: IAnswers): Promise<IIdeaDraftResult>;
}

function hasContent(value: AnswerValue): boolean {
  return Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim() !== '';
}

/** Only the answers of visible questions the flow knows about; blanks and unshown conditional questions are left out. */
export function buildIdeaDraftRequest(definition: IWorkflowDefinition, answers: IAnswers, requestId: string): IIdeaDraftRequest {
  const request: IIdeaDraftRequest = { schemaVersion: DRAFT_SCHEMA_VERSION, workflowId: 'idea', requestId, demoDataOnly: true, answers: {} };
  for (const step of answerSteps(definition, answers)) {
    const value: AnswerValue = answers[step.id];
    if (step.type !== 'notice' && includes(IDEA_DRAFT_ANSWER_KEYS, step.id) && value !== undefined && hasContent(value)) {
      request.answers[step.id] = value;
    }
  }
  return request;
}

function statusKind(status: number): DraftFailureKind {
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

function parseJson(body: string): { [key: string]: unknown } | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === 'object' ? (parsed as { [key: string]: unknown }) : undefined;
  } catch {
    return undefined;
  }
}

function errorCode(payload: { [key: string]: unknown } | undefined): string | undefined {
  if (payload === undefined) {
    return undefined;
  }
  if (typeof payload.code === 'string') {
    return payload.code;
  }
  const nested: unknown = payload.error;
  if (typeof nested === 'string') {
    return nested;
  }
  if (nested && typeof nested === 'object' && typeof (nested as { code?: unknown }).code === 'string') {
    return (nested as { code: string }).code;
  }
  return undefined;
}

function readDraft(value: unknown): IIdeaSummaryDraft | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const source: { [key: string]: unknown } = value as { [key: string]: unknown };
  const draft: { [key: string]: string } = {};
  for (const field of IDEA_SUMMARY_FIELDS) {
    const text: unknown = source[field.key];
    if (typeof text !== 'string' || text.trim() === '') {
      return undefined;
    }
    draft[field.key] = text;
  }
  return draft as IIdeaSummaryDraft;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Turns the flow's response into a draft, or throws a DraftServiceError describing why it cannot. */
export function parseIdeaDraftResponse(status: number, body: string, requestId: string): IIdeaDraftResult {
  const payload: { [key: string]: unknown } | undefined = parseJson(body);
  if (status < 200 || status >= 300) {
    const kind: DraftFailureKind = statusKind(status);
    return raise(new DraftServiceError(kind, `The draft flow answered ${status}.`, status, errorCode(payload)));
  }
  const draft: IIdeaSummaryDraft | undefined = payload === undefined || payload.ok !== true ? undefined : readDraft(payload.draft);
  if (payload === undefined || draft === undefined) {
    return raise(new DraftServiceError('invalid-response', 'The draft flow returned an incomplete draft.', status));
  }
  const echoedRequestId: string = readString(payload.requestId);
  if (echoedRequestId !== '' && echoedRequestId !== requestId) {
    return raise(new DraftServiceError('invalid-response', 'The draft flow answered a different request.', status));
  }
  return {
    draft,
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

function raise(error: DraftServiceError): never {
  throw error;
}

/** Calls the flow's HTTP trigger with the framework-issued Entra token. */
export class ClaudeDraftService implements IIdeaDraftService {
  private readonly _url: string;
  private readonly _client: () => Promise<IDraftHttpClient>;
  private readonly _requestId: () => string;

  public constructor(url: string, client: () => Promise<IDraftHttpClient>, requestId: () => string = (): string => createRecordId('draft')) {
    this._url = url;
    this._client = client;
    this._requestId = requestId;
  }

  public async draftIdea(definition: IWorkflowDefinition, answers: IAnswers): Promise<IIdeaDraftResult> {
    const request: IIdeaDraftRequest = buildIdeaDraftRequest(definition, answers, this._requestId());
    let response: IDraftHttpResponse;
    let body: string;
    try {
      const client: IDraftHttpClient = await this._client();
      response = await client.post(this._url, JSON.stringify(request));
      body = await response.text();
    } catch (error) {
      throw new DraftServiceError('network', `The draft flow could not be reached: ${error instanceof Error ? error.message : String(error)}`);
    }
    return parseIdeaDraftResponse(response.status, body, request.requestId);
  }
}

/** A service for the configured trigger URL, or undefined when the web part has none (plain summaries). */
export function createIdeaDraftService(url: string | undefined, client: () => Promise<IDraftHttpClient>): IIdeaDraftService | undefined {
  const trimmed: string = (url ?? '').trim();
  return trimmed === '' ? undefined : new ClaudeDraftService(trimmed, client);
}

/** Convenience for callers that only have the visible steps at hand. */
export function draftAnswerSteps(definition: IWorkflowDefinition, answers: IAnswers): IStep[] {
  return answerSteps(definition, answers).filter((step: IStep): boolean => includes(IDEA_DRAFT_ANSWER_KEYS, step.id));
}
