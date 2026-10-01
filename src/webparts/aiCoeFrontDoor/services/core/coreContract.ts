/**
 * The UI ⇄ flow interface contract v0.1.1 (candidate), as this client enforces it at run time: the five operations,
 * their request and response envelopes, and strict validators for each.
 *
 * Source of truth: `CW-AICOE-UI-FLOW-CONTRACT-v0.1.1-2026-09-21/ui-flow-contract.schema.json`, frozen under the
 * review evidence and copied byte-for-byte to `backend/core-compatibility/contract-v0.1.1/`. The validators below
 * mirror it property for property, `additionalProperties: false` included, and are checked against the contract's
 * 23 fixture pairs and the actual generated flow definitions by `coreConformance.test.ts`.
 *
 * Two deliberate departures, both recorded in `backend/core-compatibility/CONTRACT_AMENDMENT_v0.1.2-proposal.md`
 * rather than smuggled into the code: validation is **by operation** (the schema's public root `oneOf` rejects two
 * legitimate error pairs because two operations overlap), and the `Work` projection an employee is shown drops
 * `RelatedWorkIDs` (foreign work identifiers are not for employee views).
 *
 * Nothing here trusts a value because it arrived typed. A response row is read as unknown and either validates or
 * is refused as malformed; a refused row is never shown as a status.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { CANONICAL_ID, CANONICAL_WORK_ID } from '../../content/workIdentity';
import type { WorkStage } from '../../content/workIdentity';
import { SHA256_HEX } from '../../content/actionEnvelope';

export type CoreOperation = 'CreateOrResumeWork' | 'GetWorkStatus' | 'ListMyWork' | 'SubmitEvidenceResponse' | 'RequestDecisionReadiness';
export const CORE_OPERATIONS: readonly CoreOperation[] = ['CreateOrResumeWork', 'GetWorkStatus', 'ListMyWork', 'SubmitEvidenceResponse', 'RequestDecisionReadiness'];

export const CONTRACT_VERSION: string = 'v0.1.1';

/** Every request carries this. `IdempotencyKey` is the command list's Title (unique); see `commandKey.ts`. */
export interface ICoreContext {
  CorrelationID: string;
  IdempotencyKey: string;
  ClientVersion: string;
  TenantLabel: string;
  TestRecord?: boolean;
}

export type DataClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export const DATA_CLASSIFICATIONS: readonly DataClassification[] = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];

export interface IS1 {
  Title: string;
  SourceChannel: string;
  ProblemStatement?: string | null;
  DesiredOutcome?: string | null;
  Requester?: string | null;
  Department?: string | null;
  Sponsor?: string | null;
  AccountableOwner?: string | null;
  SourceRefs?: string[];
  DecisionRequested?: string | null;
  Risks?: string[];
  DataClassification?: DataClassification;
}

export interface ICreateOrResumeRequest {
  Context: ICoreContext;
  S1: IS1;
  WorkID?: string | null;
}

export interface IGetWorkStatusRequest {
  Context: ICoreContext;
  WorkID: string;
}

export interface IListMyWorkRequest {
  Context: ICoreContext;
  Requester: string;
}

export type KnownAssumedUnknown = 'KNOWN' | 'ASSUMED' | 'UNKNOWN' | 'MIXED';
export const KNOWN_ASSUMED_UNKNOWN: readonly KnownAssumedUnknown[] = ['KNOWN', 'ASSUMED', 'UNKNOWN', 'MIXED'];

export interface ISubmitEvidenceRequest {
  Context: ICoreContext;
  WorkID: string;
  EvidencePacketID: string;
  Response: string;
  KnownAssumedUnknown: KnownAssumedUnknown;
}

export interface IRequestReadinessRequest {
  Context: ICoreContext;
  WorkID: string;
  PayloadHash?: string;
  EvidenceSetHash?: string;
}

export type CoreRequest = ICreateOrResumeRequest | IGetWorkStatusRequest | IListMyWorkRequest | ISubmitEvidenceRequest | IRequestReadinessRequest;

export const WORK_STATES: readonly string[] = [
  'DRAFT',
  'CLARIFYING',
  'READY_FOR_TRIAGE',
  'EVIDENCE_BUILDING',
  'AWAITING_SME',
  'NOT_DECISION_READY',
  'DECISION_READY',
  'READY_FOR_AI_COE',
  'READY_FOR_ARB',
  'READY_FOR_ELT',
  'APPROVED',
  'APPROVED_WITH_CONDITIONS',
  'DEFERRED',
  'REJECTED',
  'PROJECT_ACTIVATING',
  'IN_DELIVERY',
  'AT_RISK',
  'BLOCKED',
  'VALUE_REVIEW',
  'OPERATING',
  'IMPROVEMENT_PROPOSED',
  'REVALIDATION_REQUIRED',
  'RETIRED'
];
export const STAGES: readonly WorkStage[] = ['INTAKE', 'EVIDENCE', 'DECISION', 'DELIVERY', 'VALUE', 'IMPROVEMENT', 'CLOSED'];
export type EmployeeStatus = 'Done' | 'Need one answer' | 'Ready for you' | 'Started' | 'With the right reviewer' | 'Working';
export const EMPLOYEE_STATUSES: readonly EmployeeStatus[] = ['Done', 'Need one answer', 'Ready for you', 'Started', 'With the right reviewer', 'Working'];
export type DuplicateStatus = 'NOT_CHECKED' | 'UNIQUE' | 'POSSIBLE_DUPLICATE' | 'CONFIRMED_DUPLICATE' | 'RELATED_NOT_DUPLICATE';
export const DUPLICATE_STATUSES: readonly DuplicateStatus[] = ['NOT_CHECKED', 'UNIQUE', 'POSSIBLE_DUPLICATE', 'CONFIRMED_DUPLICATE', 'RELATED_NOT_DUPLICATE'];
export type PacketStatus = 'OPEN' | 'ASSIGNED' | 'AWAITING_RESPONSE' | 'RETURNED' | 'VALIDATED' | 'REJECTED' | 'EXPIRED' | 'NOT_APPLICABLE';
export const PACKET_STATUSES: readonly PacketStatus[] = ['OPEN', 'ASSIGNED', 'AWAITING_RESPONSE', 'RETURNED', 'VALIDATED', 'REJECTED', 'EXPIRED', 'NOT_APPLICABLE'];
export type ReadinessState = 'NOT_READY' | 'READY' | 'REVALIDATION_REQUIRED' | 'NOT_APPLICABLE';
export const READINESS_STATES: readonly ReadinessState[] = ['NOT_READY', 'READY', 'REVALIDATION_REQUIRED', 'NOT_APPLICABLE'];
export type ErrorResult = 'FAIL' | 'DENIED' | 'INCONCLUSIVE' | 'RECONCILIATION_REQUIRED';
export const ERROR_RESULTS: readonly ErrorResult[] = ['FAIL', 'DENIED', 'INCONCLUSIVE', 'RECONCILIATION_REQUIRED'];

/** The full projection as the contract returns it. */
export interface IWorkProjection {
  WorkID: string;
  Title: string;
  Stage: WorkStage;
  State: string;
  EmployeeStatus: EmployeeStatus;
  Lane: string | null;
  NextAction: string | null;
  NextOwner: string | null;
  NextDate: string | null;
  Version: number;
  LastValidatedAt: string;
  OpenEvidenceGaps?: string[];
  DuplicateStatus?: DuplicateStatus;
  RelatedWorkIDs?: string[];
}

/** What an employee view is shown: the projection without foreign work identifiers or anything diagnostic. */
export interface IEmployeeWork {
  workId: string;
  title: string;
  stage: WorkStage;
  state: string;
  employeeStatus: EmployeeStatus;
  nextAction: string | null;
  nextOwner: string | null;
  nextDate: string | null;
  version: number;
  lastValidatedAt: string;
  openEvidenceGaps: string[];
  duplicateStatus: DuplicateStatus | undefined;
}

export interface ICoreError {
  Result: ErrorResult;
  ErrorClass: string;
  Message: string;
  ReceiptID: string;
  RetryAllowed: boolean;
  RetryAfterSeconds?: number;
}

export interface ICreateOrResumeSuccess {
  Result: 'PASS';
  ReceiptID: string;
  Work: IWorkProjection;
  Created: boolean;
  ClarificationRequired: string[];
}

export interface IGetWorkStatusSuccess {
  Result: 'PASS';
  ReceiptID: string;
  Work: IWorkProjection;
}

export interface IListMyWorkSuccess {
  Result: 'PASS';
  ReceiptID: string;
  Items: IWorkProjection[];
  Work?: IWorkProjection;
}

export interface ISubmitEvidenceSuccess {
  Result: 'PASS';
  ReceiptID: string;
  Work: IWorkProjection;
  PacketStatus: PacketStatus;
}

export interface IRequestReadinessSuccess {
  Result: 'PASS';
  ReceiptID: string;
  Work: IWorkProjection;
  DecisionReadinessState: ReadinessState;
  BlockingGates: string[];
  DecisionPacketID: string | null;
}

export type SuccessOf<O extends CoreOperation> = O extends 'CreateOrResumeWork'
  ? ICreateOrResumeSuccess
  : O extends 'GetWorkStatus'
    ? IGetWorkStatusSuccess
    : O extends 'ListMyWork'
      ? IListMyWorkSuccess
      : O extends 'SubmitEvidenceResponse'
        ? ISubmitEvidenceSuccess
        : IRequestReadinessSuccess;

export type CoreResponse = ICreateOrResumeSuccess | IGetWorkStatusSuccess | IListMyWorkSuccess | ISubmitEvidenceSuccess | IRequestReadinessSuccess | ICoreError;

export interface IContractIssue {
  path: string;
  message: string;
}

export interface IContractCheck<T> {
  valid: boolean;
  errors: string[];
  value?: T;
}

type Raw = { [key: string]: unknown };

const DATE_TIME: RegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isObject(value: unknown): value is Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function strict(value: unknown, path: string, issues: IContractIssue[], required: readonly string[], optional: readonly string[]): Raw | undefined {
  if (!isObject(value)) {
    issues.push({ path, message: 'must be an object.' });
    return undefined;
  }
  for (const key of required) {
    if (!(key in value)) {
      issues.push({ path: `${path}.${key}`, message: 'is required.' });
    }
  }
  for (const key of Object.keys(value)) {
    if (required.indexOf(key) < 0 && optional.indexOf(key) < 0) {
      issues.push({ path: `${path}.${key}`, message: 'is not in the contract (additionalProperties: false).' });
    }
  }
  return value;
}

function str(value: unknown, path: string, issues: IContractIssue[], options: { min?: number; pattern?: RegExp; nullable?: boolean } = {}): string | null | undefined {
  if (value === null && options.nullable === true) {
    return null;
  }
  if (typeof value !== 'string') {
    issues.push({ path, message: options.nullable === true ? 'must be a string or null.' : 'must be a string.' });
    return undefined;
  }
  if (options.min !== undefined && value.length < options.min) {
    issues.push({ path, message: `must be at least ${options.min} characters.` });
    return undefined;
  }
  if (options.pattern !== undefined && !options.pattern.test(value)) {
    issues.push({ path, message: `does not match ${options.pattern.source}.` });
    return undefined;
  }
  return value;
}

function strArray(value: unknown, path: string, issues: IContractIssue[], options: { pattern?: RegExp; unique?: boolean; min?: number } = {}): string[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'must be an array.' });
    return undefined;
  }
  const out: string[] = [];
  for (let index: number = 0; index < value.length; index += 1) {
    const item: string | null | undefined = str(value[index], `${path}[${index}]`, issues, { min: options.min, pattern: options.pattern });
    if (typeof item === 'string') {
      out.push(item);
    }
  }
  if (options.unique === true && new Set(out).size !== out.length) {
    issues.push({ path, message: 'must not repeat an item (uniqueItems).' });
  }
  return out.length === value.length ? out : undefined;
}

function enumOf<T extends string>(value: unknown, path: string, issues: IContractIssue[], allowed: readonly T[]): T | undefined {
  if (typeof value !== 'string' || allowed.indexOf(value as T) < 0) {
    issues.push({ path, message: `must be one of ${allowed.join(', ')}.` });
    return undefined;
  }
  return value as T;
}

function bool(value: unknown, path: string, issues: IContractIssue[]): boolean | undefined {
  if (typeof value !== 'boolean') {
    issues.push({ path, message: 'must be a boolean.' });
    return undefined;
  }
  return value;
}

function format(issues: readonly IContractIssue[]): string[] {
  return issues.map((issue: IContractIssue): string => `${issue.path} ${issue.message}`);
}

export function parseContext(value: unknown, path: string, issues: IContractIssue[]): ICoreContext | undefined {
  const raw: Raw | undefined = strict(value, path, issues, ['CorrelationID', 'IdempotencyKey', 'ClientVersion', 'TenantLabel'], ['TestRecord']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const CorrelationID: string | null | undefined = str(raw.CorrelationID, `${path}.CorrelationID`, issues, { min: 1, pattern: CANONICAL_ID });
  const IdempotencyKey: string | null | undefined = str(raw.IdempotencyKey, `${path}.IdempotencyKey`, issues, { min: 8 });
  const ClientVersion: string | null | undefined = str(raw.ClientVersion, `${path}.ClientVersion`, issues, { min: 1 });
  const TenantLabel: string | null | undefined = str(raw.TenantLabel, `${path}.TenantLabel`, issues, { min: 1 });
  const TestRecord: boolean | undefined = raw.TestRecord === undefined ? undefined : bool(raw.TestRecord, `${path}.TestRecord`, issues);
  if (issues.length !== before || typeof CorrelationID !== 'string' || typeof IdempotencyKey !== 'string' || typeof ClientVersion !== 'string' || typeof TenantLabel !== 'string') {
    return undefined;
  }
  const context: ICoreContext = { CorrelationID, IdempotencyKey, ClientVersion, TenantLabel };
  if (TestRecord !== undefined) {
    context.TestRecord = TestRecord;
  }
  return context;
}

export function parseS1(value: unknown, path: string, issues: IContractIssue[]): IS1 | undefined {
  const raw: Raw | undefined = strict(value, path, issues, ['Title', 'SourceChannel'], [
    'ProblemStatement',
    'DesiredOutcome',
    'Requester',
    'Department',
    'Sponsor',
    'AccountableOwner',
    'SourceRefs',
    'DecisionRequested',
    'Risks',
    'DataClassification'
  ]);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const s1: IS1 = { Title: '', SourceChannel: '' };
  const title: string | null | undefined = str(raw.Title, `${path}.Title`, issues, { min: 1 });
  const channel: string | null | undefined = str(raw.SourceChannel, `${path}.SourceChannel`, issues, { min: 1 });
  for (const key of ['ProblemStatement', 'DesiredOutcome', 'Requester', 'Department', 'Sponsor', 'AccountableOwner', 'DecisionRequested'] as const) {
    if (raw[key] !== undefined) {
      const parsed: string | null | undefined = str(raw[key], `${path}.${key}`, issues, { nullable: true });
      if (parsed !== undefined) {
        s1[key] = parsed;
      }
    }
  }
  if (raw.SourceRefs !== undefined) {
    s1.SourceRefs = strArray(raw.SourceRefs, `${path}.SourceRefs`, issues, { unique: true, min: 1 });
  }
  if (raw.Risks !== undefined) {
    s1.Risks = strArray(raw.Risks, `${path}.Risks`, issues, { unique: true, min: 1, pattern: CANONICAL_ID });
  }
  if (raw.DataClassification !== undefined) {
    s1.DataClassification = enumOf(raw.DataClassification, `${path}.DataClassification`, issues, DATA_CLASSIFICATIONS);
  }
  if (issues.length !== before || typeof title !== 'string' || typeof channel !== 'string') {
    return undefined;
  }
  s1.Title = title;
  s1.SourceChannel = channel;
  return s1;
}

function workIdField(value: unknown, path: string, issues: IContractIssue[]): string | undefined {
  const parsed: string | null | undefined = str(value, path, issues, { min: 1, pattern: CANONICAL_WORK_ID });
  return typeof parsed === 'string' ? parsed : undefined;
}

export function parseRequest(operation: CoreOperation, value: unknown): IContractCheck<CoreRequest> {
  const issues: IContractIssue[] = [];
  let result: CoreRequest | undefined;
  switch (operation) {
    case 'CreateOrResumeWork': {
      const raw: Raw | undefined = strict(value, 'request', issues, ['Context', 'S1'], ['WorkID']);
      if (raw !== undefined) {
        const Context: ICoreContext | undefined = parseContext(raw.Context, 'request.Context', issues);
        const S1: IS1 | undefined = parseS1(raw.S1, 'request.S1', issues);
        let WorkID: string | null | undefined;
        if (raw.WorkID === undefined) {
          WorkID = undefined;
        } else if (raw.WorkID === null) {
          WorkID = null;
        } else {
          WorkID = workIdField(raw.WorkID, 'request.WorkID', issues);
        }
        if (Context !== undefined && S1 !== undefined && issues.length === 0) {
          result = raw.WorkID === undefined ? { Context, S1 } : { Context, S1, WorkID: WorkID ?? null };
        }
      }
      break;
    }
    case 'GetWorkStatus': {
      const raw: Raw | undefined = strict(value, 'request', issues, ['Context', 'WorkID'], []);
      if (raw !== undefined) {
        const Context: ICoreContext | undefined = parseContext(raw.Context, 'request.Context', issues);
        const WorkID: string | undefined = workIdField(raw.WorkID, 'request.WorkID', issues);
        if (Context !== undefined && WorkID !== undefined && issues.length === 0) {
          result = { Context, WorkID };
        }
      }
      break;
    }
    case 'ListMyWork': {
      const raw: Raw | undefined = strict(value, 'request', issues, ['Context', 'Requester'], []);
      if (raw !== undefined) {
        const Context: ICoreContext | undefined = parseContext(raw.Context, 'request.Context', issues);
        const Requester: string | null | undefined = str(raw.Requester, 'request.Requester', issues, { min: 1 });
        if (Context !== undefined && typeof Requester === 'string' && issues.length === 0) {
          result = { Context, Requester };
        }
      }
      break;
    }
    case 'SubmitEvidenceResponse': {
      const raw: Raw | undefined = strict(value, 'request', issues, ['Context', 'WorkID', 'EvidencePacketID', 'Response', 'KnownAssumedUnknown'], []);
      if (raw !== undefined) {
        const Context: ICoreContext | undefined = parseContext(raw.Context, 'request.Context', issues);
        const WorkID: string | undefined = workIdField(raw.WorkID, 'request.WorkID', issues);
        const EvidencePacketID: string | null | undefined = str(raw.EvidencePacketID, 'request.EvidencePacketID', issues, { min: 1, pattern: CANONICAL_ID });
        const Response: string | null | undefined = str(raw.Response, 'request.Response', issues, { min: 1 });
        const KAU: KnownAssumedUnknown | undefined = enumOf(raw.KnownAssumedUnknown, 'request.KnownAssumedUnknown', issues, KNOWN_ASSUMED_UNKNOWN);
        if (Context !== undefined && WorkID !== undefined && typeof EvidencePacketID === 'string' && typeof Response === 'string' && KAU !== undefined && issues.length === 0) {
          result = { Context, WorkID, EvidencePacketID, Response, KnownAssumedUnknown: KAU };
        }
      }
      break;
    }
    case 'RequestDecisionReadiness': {
      const raw: Raw | undefined = strict(value, 'request', issues, ['Context', 'WorkID'], ['PayloadHash', 'EvidenceSetHash']);
      if (raw !== undefined) {
        const Context: ICoreContext | undefined = parseContext(raw.Context, 'request.Context', issues);
        const WorkID: string | undefined = workIdField(raw.WorkID, 'request.WorkID', issues);
        const request: IRequestReadinessRequest | undefined = Context === undefined || WorkID === undefined ? undefined : { Context, WorkID };
        if (raw.PayloadHash !== undefined) {
          const hash: string | null | undefined = str(raw.PayloadHash, 'request.PayloadHash', issues, { pattern: SHA256_HEX });
          if (request !== undefined && typeof hash === 'string') {
            request.PayloadHash = hash;
          }
        }
        if (raw.EvidenceSetHash !== undefined) {
          const hash: string | null | undefined = str(raw.EvidenceSetHash, 'request.EvidenceSetHash', issues, { pattern: SHA256_HEX });
          if (request !== undefined && typeof hash === 'string') {
            request.EvidenceSetHash = hash;
          }
        }
        if (request !== undefined && issues.length === 0) {
          result = request;
        }
      }
      break;
    }
    default: {
      const exhaustive: never = operation;
      issues.push({ path: 'operation', message: `unknown operation ${String(exhaustive)}.` });
    }
  }
  return { valid: issues.length === 0 && result !== undefined, errors: format(issues), value: result };
}

export function parseWorkProjection(value: unknown, path: string, issues: IContractIssue[]): IWorkProjection | undefined {
  const raw: Raw | undefined = strict(value, path, issues, ['WorkID', 'Title', 'Stage', 'State', 'EmployeeStatus', 'Lane', 'NextAction', 'NextOwner', 'NextDate', 'Version', 'LastValidatedAt'], [
    'OpenEvidenceGaps',
    'DuplicateStatus',
    'RelatedWorkIDs'
  ]);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const WorkID: string | undefined = workIdField(raw.WorkID, `${path}.WorkID`, issues);
  const Title: string | null | undefined = str(raw.Title, `${path}.Title`, issues);
  const Stage: WorkStage | undefined = enumOf(raw.Stage, `${path}.Stage`, issues, STAGES);
  const State: string | undefined = enumOf(raw.State, `${path}.State`, issues, WORK_STATES);
  const EmployeeStatus: EmployeeStatus | undefined = enumOf(raw.EmployeeStatus, `${path}.EmployeeStatus`, issues, EMPLOYEE_STATUSES);
  const Lane: string | null | undefined = str(raw.Lane, `${path}.Lane`, issues, { nullable: true });
  const NextAction: string | null | undefined = str(raw.NextAction, `${path}.NextAction`, issues, { nullable: true });
  const NextOwner: string | null | undefined = str(raw.NextOwner, `${path}.NextOwner`, issues, { nullable: true });
  const NextDate: string | null | undefined = str(raw.NextDate, `${path}.NextDate`, issues, { nullable: true });
  const Version: unknown = raw.Version;
  if (typeof Version !== 'number' || !Number.isInteger(Version) || Version < 1) {
    issues.push({ path: `${path}.Version`, message: 'must be an integer of 1 or more.' });
  }
  const LastValidatedAt: string | null | undefined = str(raw.LastValidatedAt, `${path}.LastValidatedAt`, issues, { pattern: DATE_TIME });
  const OpenEvidenceGaps: string[] | undefined = raw.OpenEvidenceGaps === undefined ? undefined : strArray(raw.OpenEvidenceGaps, `${path}.OpenEvidenceGaps`, issues);
  const DuplicateStatus: DuplicateStatus | undefined = raw.DuplicateStatus === undefined ? undefined : enumOf(raw.DuplicateStatus, `${path}.DuplicateStatus`, issues, DUPLICATE_STATUSES);
  const RelatedWorkIDs: string[] | undefined = raw.RelatedWorkIDs === undefined ? undefined : strArray(raw.RelatedWorkIDs, `${path}.RelatedWorkIDs`, issues, { unique: true, min: 1, pattern: CANONICAL_WORK_ID });
  if (issues.length !== before || WorkID === undefined || typeof Title !== 'string' || Stage === undefined || State === undefined || EmployeeStatus === undefined || Lane === undefined || NextAction === undefined || NextOwner === undefined || NextDate === undefined || typeof Version !== 'number' || typeof LastValidatedAt !== 'string') {
    return undefined;
  }
  const work: IWorkProjection = { WorkID, Title, Stage, State, EmployeeStatus, Lane, NextAction, NextOwner, NextDate, Version, LastValidatedAt };
  if (OpenEvidenceGaps !== undefined) {
    work.OpenEvidenceGaps = OpenEvidenceGaps;
  }
  if (DuplicateStatus !== undefined) {
    work.DuplicateStatus = DuplicateStatus;
  }
  if (RelatedWorkIDs !== undefined) {
    work.RelatedWorkIDs = RelatedWorkIDs;
  }
  return work;
}

export function parseError(value: unknown, path: string, issues: IContractIssue[]): ICoreError | undefined {
  const raw: Raw | undefined = strict(value, path, issues, ['Result', 'ErrorClass', 'Message', 'ReceiptID', 'RetryAllowed'], ['RetryAfterSeconds']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const Result: ErrorResult | undefined = enumOf(raw.Result, `${path}.Result`, issues, ERROR_RESULTS);
  const ErrorClass: string | null | undefined = str(raw.ErrorClass, `${path}.ErrorClass`, issues, { min: 1 });
  const Message: string | null | undefined = str(raw.Message, `${path}.Message`, issues);
  const ReceiptID: string | null | undefined = str(raw.ReceiptID, `${path}.ReceiptID`, issues, { min: 1, pattern: CANONICAL_ID });
  const RetryAllowed: boolean | undefined = bool(raw.RetryAllowed, `${path}.RetryAllowed`, issues);
  let RetryAfterSeconds: number | undefined;
  if (raw.RetryAfterSeconds !== undefined) {
    if (typeof raw.RetryAfterSeconds !== 'number' || !Number.isInteger(raw.RetryAfterSeconds) || raw.RetryAfterSeconds < 0) {
      issues.push({ path: `${path}.RetryAfterSeconds`, message: 'must be an integer of 0 or more.' });
    } else {
      RetryAfterSeconds = raw.RetryAfterSeconds;
    }
  }
  if (issues.length !== before || Result === undefined || typeof ErrorClass !== 'string' || typeof Message !== 'string' || typeof ReceiptID !== 'string' || RetryAllowed === undefined) {
    return undefined;
  }
  const error: ICoreError = { Result, ErrorClass, Message, ReceiptID, RetryAllowed };
  if (RetryAfterSeconds !== undefined) {
    error.RetryAfterSeconds = RetryAfterSeconds;
  }
  return error;
}

/**
 * Reads a response row for one operation. The operation is the discriminator (the contract's own root `oneOf` is
 * ambiguous between operations); within an operation, `Result` picks the success or the error branch.
 */
export function parseResponse(operation: CoreOperation, value: unknown): IContractCheck<CoreResponse> {
  const issues: IContractIssue[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: ['response must be an object.'] };
  }
  if (value.Result !== 'PASS') {
    const error: ICoreError | undefined = parseError(value, 'response', issues);
    return { valid: issues.length === 0 && error !== undefined, errors: format(issues), value: error };
  }
  let result: CoreResponse | undefined;
  switch (operation) {
    case 'CreateOrResumeWork': {
      const raw: Raw | undefined = strict(value, 'response', issues, ['Result', 'ReceiptID', 'Work', 'Created', 'ClarificationRequired'], []);
      if (raw !== undefined) {
        const ReceiptID: string | null | undefined = str(raw.ReceiptID, 'response.ReceiptID', issues, { min: 1, pattern: CANONICAL_ID });
        const Work: IWorkProjection | undefined = parseWorkProjection(raw.Work, 'response.Work', issues);
        const Created: boolean | undefined = bool(raw.Created, 'response.Created', issues);
        const ClarificationRequired: string[] | undefined = strArray(raw.ClarificationRequired, 'response.ClarificationRequired', issues);
        if (typeof ReceiptID === 'string' && Work !== undefined && Created !== undefined && ClarificationRequired !== undefined && issues.length === 0) {
          result = { Result: 'PASS', ReceiptID, Work, Created, ClarificationRequired };
        }
      }
      break;
    }
    case 'GetWorkStatus': {
      const raw: Raw | undefined = strict(value, 'response', issues, ['Result', 'ReceiptID', 'Work'], []);
      if (raw !== undefined) {
        const ReceiptID: string | null | undefined = str(raw.ReceiptID, 'response.ReceiptID', issues, { min: 1, pattern: CANONICAL_ID });
        const Work: IWorkProjection | undefined = parseWorkProjection(raw.Work, 'response.Work', issues);
        if (typeof ReceiptID === 'string' && Work !== undefined && issues.length === 0) {
          result = { Result: 'PASS', ReceiptID, Work };
        }
      }
      break;
    }
    case 'ListMyWork': {
      const raw: Raw | undefined = strict(value, 'response', issues, ['Result', 'ReceiptID', 'Items'], ['Work']);
      if (raw !== undefined) {
        const ReceiptID: string | null | undefined = str(raw.ReceiptID, 'response.ReceiptID', issues, { min: 1, pattern: CANONICAL_ID });
        const Items: IWorkProjection[] = [];
        if (!Array.isArray(raw.Items)) {
          issues.push({ path: 'response.Items', message: 'must be an array.' });
        } else {
          for (let index: number = 0; index < raw.Items.length; index += 1) {
            const item: IWorkProjection | undefined = parseWorkProjection(raw.Items[index], `response.Items[${index}]`, issues);
            if (item !== undefined) {
              Items.push(item);
            }
          }
        }
        const Work: IWorkProjection | undefined = raw.Work === undefined ? undefined : parseWorkProjection(raw.Work, 'response.Work', issues);
        if (typeof ReceiptID === 'string' && issues.length === 0) {
          result = Work === undefined ? { Result: 'PASS', ReceiptID, Items } : { Result: 'PASS', ReceiptID, Items, Work };
        }
      }
      break;
    }
    case 'SubmitEvidenceResponse': {
      const raw: Raw | undefined = strict(value, 'response', issues, ['Result', 'ReceiptID', 'Work', 'PacketStatus'], []);
      if (raw !== undefined) {
        const ReceiptID: string | null | undefined = str(raw.ReceiptID, 'response.ReceiptID', issues, { min: 1, pattern: CANONICAL_ID });
        const Work: IWorkProjection | undefined = parseWorkProjection(raw.Work, 'response.Work', issues);
        const PacketStatus: PacketStatus | undefined = enumOf(raw.PacketStatus, 'response.PacketStatus', issues, PACKET_STATUSES);
        if (typeof ReceiptID === 'string' && Work !== undefined && PacketStatus !== undefined && issues.length === 0) {
          result = { Result: 'PASS', ReceiptID, Work, PacketStatus };
        }
      }
      break;
    }
    case 'RequestDecisionReadiness': {
      const raw: Raw | undefined = strict(value, 'response', issues, ['Result', 'ReceiptID', 'Work', 'DecisionReadinessState', 'BlockingGates', 'DecisionPacketID'], []);
      if (raw !== undefined) {
        const ReceiptID: string | null | undefined = str(raw.ReceiptID, 'response.ReceiptID', issues, { min: 1, pattern: CANONICAL_ID });
        const Work: IWorkProjection | undefined = parseWorkProjection(raw.Work, 'response.Work', issues);
        const DecisionReadinessState: ReadinessState | undefined = enumOf(raw.DecisionReadinessState, 'response.DecisionReadinessState', issues, READINESS_STATES);
        const BlockingGates: string[] | undefined = strArray(raw.BlockingGates, 'response.BlockingGates', issues);
        let DecisionPacketID: string | null | undefined;
        if (raw.DecisionPacketID === null) {
          DecisionPacketID = null;
        } else {
          const id: string | null | undefined = str(raw.DecisionPacketID, 'response.DecisionPacketID', issues, { min: 1, pattern: CANONICAL_ID });
          DecisionPacketID = typeof id === 'string' ? id : undefined;
        }
        if (typeof ReceiptID === 'string' && Work !== undefined && DecisionReadinessState !== undefined && BlockingGates !== undefined && DecisionPacketID !== undefined && issues.length === 0) {
          result = { Result: 'PASS', ReceiptID, Work, DecisionReadinessState, BlockingGates, DecisionPacketID };
        }
      }
      break;
    }
    default: {
      const exhaustive: never = operation;
      issues.push({ path: 'operation', message: `unknown operation ${String(exhaustive)}.` });
    }
  }
  return { valid: issues.length === 0 && result !== undefined, errors: format(issues), value: result };
}

export function isCoreError(response: CoreResponse): response is ICoreError {
  return response.Result !== 'PASS';
}

/** The employee view of a projection: no foreign work identifiers, no diagnostics. */
export function toEmployeeWork(work: IWorkProjection): IEmployeeWork {
  return {
    workId: work.WorkID,
    title: work.Title,
    stage: work.Stage,
    state: work.State,
    employeeStatus: work.EmployeeStatus,
    nextAction: work.NextAction,
    nextOwner: work.NextOwner,
    nextDate: work.NextDate,
    version: work.Version,
    lastValidatedAt: work.LastValidatedAt,
    openEvidenceGaps: work.OpenEvidenceGaps ?? [],
    duplicateStatus: work.DuplicateStatus
  };
}

/** The receipt every failure envelope of the shipped flow writes when nothing auditable exists. Not a receipt. */
export const NO_RECEIPT: string = 'RCPT-NONE';

/** The error classes the shipped flow emits outside the contract's examples; each is handled by name, never as "nothing written". */
export const FLOW_FAILURE: string = 'FLOW_FAILURE';
export const UNSUPPORTED_OPERATION: string = 'UNSUPPORTED_OPERATION';
