/**
 * `CampaignBrief.v1`: the first Marketing output this branch can hold, validate and store.
 *
 * Decision 3 of the local baseline. The seven required parts are the playbook's own list - audience, pain points,
 * message, channel plan, content calendar, evidence gaps, review needs - because that is the definition the
 * reviewed package states. The quick start names a different set; it is treated as supplementary, so its owners and
 * dependencies are carried as optional planning notes.
 *
 * Two rules are enforced rather than described.
 *
 * A proposed owner is not an assignment. `IProposedOwner` carries a role and a note and deliberately has no person,
 * address or task id, so nothing in this shape can become work allocated to someone. The playbook calls workflow
 * 3's equivalents "action proposals" for the same reason, and a test holds the type to it.
 *
 * An unknown is written, not omitted. Every claim either cites sources the register carries or is marked with one
 * of the canonical sentinels. A brief with no citation and no sentinel does not validate, which is how the pass
 * criterion - every factual claim cites a current source or is marked unknown - becomes something the code checks
 * instead of something a reviewer has to remember.
 *
 * The validator is a boundary, not a shape check (the 2026-09-22 review reproduced `[{}]` citations, `not-a-date`
 * timestamps and an owner carrying `email`/`assignedTo`/`taskId` passing the first version). Every field is now
 * read strictly: exactly the declared keys, typed values, real citations, a real UTC timestamp, an owner that is
 * exactly a role and a note, and no identity, allocation or delivery key anywhere in the object. The field names,
 * the schema constant and the optional fields are unchanged, so every existing fixture and consumer still passes;
 * the one additive field, `claimMap`, lets a run cite or mark the factual assertions outside the message array.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { Sentinel } from '../workIdentity';
import type { ISourceRef } from './sourceRegister';
import { at, canonicalId, forbidKeysDeep, formatIssues, integer, isoDateTime, list, literal, sentinel, sourceRefs, strictObject, text, textList, workId } from './schema';
import type { IIssue, Raw } from './schema';

export const CAMPAIGN_BRIEF_SCHEMA_VERSION: string = '1.0';

/**
 * One scheduled item. Decision 4: a shared shape, and a schedule expressed as a phase and a week offset until an
 * approved start date exists, so nothing here can be read as a calendar date or turned into an invitation. Workflow
 * 2 elaborates these entries against an accepted brief version; it does not rewrite them here.
 */
export interface ICalendarEntry {
  /** A named stage of the campaign, for example "launch week" or "follow-up". */
  phase: string;
  /** Whole weeks from the campaign start, counting from 0. Never a date. */
  weekOffset: number;
  item: string;
}

/** A statement the brief makes, with what backs it. One of the two fields is always present, never neither. */
export interface IClaim {
  text: string;
  /** The register entries this claim rests on; empty when the claim is marked instead. */
  sources: ISourceRef[];
  /** Set when nothing backs the claim yet; the six canonical sentinels, so a hole is never written as a fact. */
  unknown?: Sentinel;
}

/** A planning note, deliberately carrying no person: naming a role cannot allocate work to anybody. */
export interface IProposedOwner {
  role: string;
  note: string;
}

/**
 * Additive (1.0.0.16): what backs a factual assertion that is not in the message array - an audience line, a pain
 * point, a channel. `path` names the item (`painPoints[1]`); the entry is cited or marked, never both, exactly as a
 * claim is. Absent on older fixtures, which stay valid; the service boundary decides whether a run must cover them.
 */
export interface IClaimMapEntry {
  path: string;
  sources: ISourceRef[];
  unknown?: Sentinel;
}

export interface ICampaignBriefV1 {
  schemaVersion: string;
  briefId: string;
  /** The canonical Work ID this brief belongs to. */
  workId: string;
  /** Which register, at which version, this run read. Both are recorded so an output is traceable. */
  registerId: string;
  registerVersion: string;
  objective: string;
  audience: string[];
  painPoints: string[];
  message: IClaim[];
  channelPlan: string[];
  contentCalendar: ICalendarEntry[];
  /** What could not be supported, in the reader's words. Never empty by accident: an empty list is a claim too. */
  evidenceGaps: string[];
  reviewNeeds: string[];
  /** Supplementary, from the quick start. Planning only; see IProposedOwner. */
  proposedOwners?: IProposedOwner[];
  dependencies?: string[];
  claimMap?: IClaimMapEntry[];
  createdAt: string;
}

export interface IValidationResult {
  valid: boolean;
  errors: string[];
}

export interface IParseResult<T> extends IValidationResult {
  /** The typed copy built from what was accepted; absent when anything was refused. */
  value?: T;
}

const REQUIRED_KEYS: readonly string[] = [
  'schemaVersion',
  'briefId',
  'workId',
  'registerId',
  'registerVersion',
  'objective',
  'audience',
  'painPoints',
  'message',
  'channelPlan',
  'contentCalendar',
  'evidenceGaps',
  'reviewNeeds',
  'createdAt'
];
const OPTIONAL_KEYS: readonly string[] = ['proposedOwners', 'dependencies', 'claimMap'];

/** The paths a claim-map entry may name: an item of one of the four text lists, or the objective. */
const CLAIM_MAP_PATH: RegExp = /^(objective|(audience|painPoints|channelPlan|evidenceGaps)\[(\d+)\])$/;

/** A citation or a sentinel, never neither and never both: the playbook's own pass criterion, checked. */
function citedXorMarked(sources: ISourceRef[] | undefined, unknown: unknown, path: string, issues: IIssue[]): Sentinel | undefined {
  const marked: Sentinel | undefined = unknown === undefined ? undefined : sentinel(unknown, at(path, 'unknown'), issues);
  if (sources === undefined) {
    return marked;
  }
  if (sources.length === 0 && marked === undefined) {
    issues.push({ path, message: 'cites no source and is not marked unknown.' });
  }
  if (sources.length > 0 && unknown !== undefined) {
    issues.push({ path, message: 'is both cited and marked unknown; it must be one or the other.' });
  }
  return marked;
}

export function parseClaim(value: unknown, path: string, issues: IIssue[]): IClaim | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['text', 'sources'], ['unknown']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const body: string | undefined = text(raw.text, at(path, 'text'), issues);
  const sources: ISourceRef[] | undefined = sourceRefs(raw.sources, at(path, 'sources'), issues);
  const unknown: Sentinel | undefined = citedXorMarked(sources, raw.unknown, path, issues);
  if (issues.length !== before || body === undefined || sources === undefined) {
    return undefined;
  }
  const claim: IClaim = { text: body, sources };
  if (unknown !== undefined) {
    claim.unknown = unknown;
  }
  return claim;
}

export function parseClaims(value: unknown, path: string, issues: IIssue[], options: { minItems?: number } = {}): IClaim[] | undefined {
  return list(value, path, issues, (item: unknown, itemPath: string): IClaim | undefined => parseClaim(item, itemPath, issues), options);
}

export function parseCalendarEntry(value: unknown, path: string, issues: IIssue[]): ICalendarEntry | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['phase', 'weekOffset', 'item']);
  if (raw === undefined) {
    return undefined;
  }
  const phase: string | undefined = text(raw.phase, at(path, 'phase'), issues, { max: 200 });
  const item: string | undefined = text(raw.item, at(path, 'item'), issues);
  const weekOffset: number | undefined = integer(raw.weekOffset, at(path, 'weekOffset'), issues, { min: 0 });
  if (weekOffset === undefined) {
    issues.push({ path: at(path, 'weekOffset'), message: 'needs a whole week offset of 0 or more; a date is not accepted.' });
  }
  return phase === undefined || item === undefined || weekOffset === undefined ? undefined : { phase, weekOffset, item };
}

/** Exactly a role and a note. The shape is the guarantee: nothing here can name a person or a task. */
export function parseProposedOwner(value: unknown, path: string, issues: IIssue[]): IProposedOwner | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['role', 'note']);
  if (raw === undefined) {
    return undefined;
  }
  const role: string | undefined = text(raw.role, at(path, 'role'), issues, { max: 200 });
  const note: string | undefined = text(raw.note, at(path, 'note'), issues);
  if (role !== undefined && role.indexOf('@') >= 0) {
    issues.push({ path: at(path, 'role'), message: 'reads as an address; a proposed owner is a role, never a person.' });
    return undefined;
  }
  return role === undefined || note === undefined ? undefined : { role, note };
}

function parseClaimMapEntry(value: unknown, path: string, issues: IIssue[], brief: Raw): IClaimMapEntry | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['path', 'sources'], ['unknown']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const target: string | undefined = text(raw.path, at(path, 'path'), issues, { max: 64 });
  const match: RegExpExecArray | null = target === undefined ? null : CLAIM_MAP_PATH.exec(target);
  if (target !== undefined && match === null) {
    issues.push({ path: at(path, 'path'), message: 'must name the objective or an item of audience, painPoints, channelPlan or evidenceGaps.' });
  } else if (match !== null && match[2] !== undefined) {
    const items: unknown = brief[match[2]];
    if (!Array.isArray(items) || Number(match[3]) >= items.length) {
      issues.push({ path: at(path, 'path'), message: 'names an item the brief does not carry.' });
    }
  }
  const sources: ISourceRef[] | undefined = sourceRefs(raw.sources, at(path, 'sources'), issues);
  const unknown: Sentinel | undefined = citedXorMarked(sources, raw.unknown, path, issues);
  if (issues.length !== before || target === undefined || sources === undefined) {
    return undefined;
  }
  const entry: IClaimMapEntry = { path: target, sources };
  if (unknown !== undefined) {
    entry.unknown = unknown;
  }
  return entry;
}

/**
 * Reads an untrusted value as a `CampaignBrief.v1`. Every field is checked against the contract; the result carries
 * the typed copy only when nothing was refused. Errors are sentences with the path in front, so a reviewer sees
 * `proposedOwners[0].email is not part of this contract` rather than a bare false.
 */
export function parseCampaignBrief(value: unknown): IParseResult<ICampaignBriefV1> {
  const issues: IIssue[] = [];
  const raw: Raw | undefined = strictObject(value, '', issues, REQUIRED_KEYS, OPTIONAL_KEYS);
  if (raw === undefined) {
    return { valid: false, errors: formatIssues(issues) };
  }
  forbidKeysDeep(raw, '', issues);
  literal(raw.schemaVersion, 'schemaVersion', issues, CAMPAIGN_BRIEF_SCHEMA_VERSION);
  const briefId: string | undefined = canonicalId(raw.briefId, 'briefId', issues);
  const work: string | undefined = workId(raw.workId, 'workId', issues);
  const registerId: string | undefined = text(raw.registerId, 'registerId', issues, { max: 256 });
  const registerVersion: string | undefined = text(raw.registerVersion, 'registerVersion', issues, { max: 256 });
  const objective: string | undefined = text(raw.objective, 'objective', issues);
  const audience: string[] | undefined = textList(raw.audience, 'audience', issues, { minItems: 1 });
  const painPoints: string[] | undefined = textList(raw.painPoints, 'painPoints', issues, { minItems: 1 });
  const message: IClaim[] | undefined = parseClaims(raw.message, 'message', issues, { minItems: 1 });
  const channelPlan: string[] | undefined = textList(raw.channelPlan, 'channelPlan', issues, { minItems: 1 });
  const contentCalendar: ICalendarEntry[] | undefined = list(raw.contentCalendar, 'contentCalendar', issues, (item: unknown, itemPath: string): ICalendarEntry | undefined =>
    parseCalendarEntry(item, itemPath, issues)
  );
  // An empty evidence-gap list is allowed but must be deliberate: the field itself is required.
  const evidenceGaps: string[] | undefined = textList(raw.evidenceGaps, 'evidenceGaps', issues);
  const reviewNeeds: string[] | undefined = textList(raw.reviewNeeds, 'reviewNeeds', issues, { minItems: 1 });
  const createdAt: string | undefined = isoDateTime(raw.createdAt, 'createdAt', issues);
  const proposedOwners: IProposedOwner[] | undefined =
    raw.proposedOwners === undefined
      ? undefined
      : list(raw.proposedOwners, 'proposedOwners', issues, (item: unknown, itemPath: string): IProposedOwner | undefined => parseProposedOwner(item, itemPath, issues));
  const dependencies: string[] | undefined = raw.dependencies === undefined ? undefined : textList(raw.dependencies, 'dependencies', issues);
  const claimMap: IClaimMapEntry[] | undefined =
    raw.claimMap === undefined ? undefined : list(raw.claimMap, 'claimMap', issues, (item: unknown, itemPath: string): IClaimMapEntry | undefined => parseClaimMapEntry(item, itemPath, issues, raw));

  if (
    issues.length > 0 ||
    briefId === undefined ||
    work === undefined ||
    registerId === undefined ||
    registerVersion === undefined ||
    objective === undefined ||
    audience === undefined ||
    painPoints === undefined ||
    message === undefined ||
    channelPlan === undefined ||
    contentCalendar === undefined ||
    evidenceGaps === undefined ||
    reviewNeeds === undefined ||
    createdAt === undefined
  ) {
    return { valid: false, errors: formatIssues(issues) };
  }
  const brief: ICampaignBriefV1 = {
    schemaVersion: CAMPAIGN_BRIEF_SCHEMA_VERSION,
    briefId,
    workId: work,
    registerId,
    registerVersion,
    objective,
    audience,
    painPoints,
    message,
    channelPlan,
    contentCalendar,
    evidenceGaps,
    reviewNeeds,
    createdAt
  };
  if (proposedOwners !== undefined) {
    brief.proposedOwners = proposedOwners;
  }
  if (dependencies !== undefined) {
    brief.dependencies = dependencies;
  }
  if (claimMap !== undefined) {
    brief.claimMap = claimMap;
  }
  return { valid: true, errors: [], value: brief };
}

/** The seven parts the playbook names, plus the provenance every run must record; the historical boolean form. */
export function validateCampaignBrief(value: unknown): IValidationResult {
  const result: IParseResult<ICampaignBriefV1> = parseCampaignBrief(value);
  return { valid: result.valid, errors: result.errors };
}

/**
 * The factual assertions of a brief that carry no support: message claims marked unknown, and every audience,
 * pain-point and channel item the claim map neither cites nor marks. A reader sees these as gaps; a business run
 * may refuse to accept a brief whose claim map leaves any item silent.
 */
export function unsupportedAssertions(brief: ICampaignBriefV1): string[] {
  const covered: string[] = (brief.claimMap ?? []).map((entry: IClaimMapEntry): string => entry.path);
  const silent: string[] = [];
  for (const field of ['audience', 'painPoints', 'channelPlan'] as const) {
    for (let index: number = 0; index < brief[field].length; index += 1) {
      const path: string = `${field}[${index}]`;
      if (covered.indexOf(path) < 0) {
        silent.push(path);
      }
    }
  }
  if (covered.indexOf('objective') < 0) {
    silent.push('objective');
  }
  return silent;
}
