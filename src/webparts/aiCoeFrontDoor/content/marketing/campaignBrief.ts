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
 * This is a local schema baseline. No approved machine-readable schema for a campaign brief exists in either
 * reference package; that absence is recorded in the handoff and is not repaired by this file.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { includes } from '../../utils/collections';
import { SENTINELS } from '../workIdentity';
import type { Sentinel } from '../workIdentity';
import type { ISourceRef } from './sourceRegister';

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
  createdAt: string;
}

export interface IValidationResult {
  valid: boolean;
  errors: string[];
}

function isNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function isTextList(value: unknown): boolean {
  return Array.isArray(value) && value.filter((entry: unknown): boolean => !isNonEmptyText(entry)).length === 0;
}

function claimErrors(claims: unknown, errors: string[]): void {
  if (!Array.isArray(claims) || claims.length === 0) {
    errors.push('message must carry at least one claim.');
    return;
  }
  for (let index: number = 0; index < claims.length; index += 1) {
    const claim: IClaim = claims[index] as IClaim;
    if (!isNonEmptyText(claim?.text)) {
      errors.push(`message[${index}] needs text.`);
      continue;
    }
    const cited: boolean = Array.isArray(claim.sources) && claim.sources.length > 0;
    const marked: boolean = claim.unknown !== undefined && includes(SENTINELS, claim.unknown);
    if (!cited && !marked) {
      // The playbook's own pass criterion, checked rather than remembered.
      errors.push(`message[${index}] cites no source and is not marked unknown.`);
    }
    if (cited && marked) {
      errors.push(`message[${index}] is both cited and marked unknown; it must be one or the other.`);
    }
  }
}

function calendarErrors(entries: unknown, errors: string[]): void {
  if (!Array.isArray(entries)) {
    errors.push('contentCalendar must be a list.');
    return;
  }
  for (let index: number = 0; index < entries.length; index += 1) {
    const entry: ICalendarEntry = entries[index] as ICalendarEntry;
    if (!isNonEmptyText(entry?.phase) || !isNonEmptyText(entry?.item)) {
      errors.push(`contentCalendar[${index}] needs a phase and an item.`);
    }
    if (typeof entry?.weekOffset !== 'number' || !isFinite(entry.weekOffset) || entry.weekOffset < 0 || Math.floor(entry.weekOffset) !== entry.weekOffset) {
      errors.push(`contentCalendar[${index}] needs a whole week offset of 0 or more; a date is not accepted.`);
    }
  }
}

/** The seven parts the playbook names, plus the provenance every run must record. */
export function validateCampaignBrief(value: unknown): IValidationResult {
  const errors: string[] = [];
  const brief: ICampaignBriefV1 = (value ?? {}) as ICampaignBriefV1;

  if (brief.schemaVersion !== CAMPAIGN_BRIEF_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${CAMPAIGN_BRIEF_SCHEMA_VERSION}.`);
  }
  for (const field of ['briefId', 'workId', 'registerId', 'registerVersion', 'objective', 'createdAt']) {
    if (!isNonEmptyText((brief as unknown as { [key: string]: unknown })[field])) {
      errors.push(`${field} is required.`);
    }
  }
  for (const field of ['audience', 'painPoints', 'channelPlan', 'reviewNeeds']) {
    const list: unknown = (brief as unknown as { [key: string]: unknown })[field];
    if (!isTextList(list) || (list as unknown[]).length === 0) {
      errors.push(`${field} must be a list with at least one entry.`);
    }
  }
  // An empty evidence-gap list is allowed but must be deliberate: the field itself is required.
  if (!isTextList(brief.evidenceGaps)) {
    errors.push('evidenceGaps must be a list, empty only when there are genuinely none.');
  }
  claimErrors(brief.message, errors);
  calendarErrors(brief.contentCalendar, errors);

  if (brief.proposedOwners !== undefined) {
    if (!Array.isArray(brief.proposedOwners)) {
      errors.push('proposedOwners must be a list when present.');
    } else {
      for (let index: number = 0; index < brief.proposedOwners.length; index += 1) {
        const owner: IProposedOwner = brief.proposedOwners[index];
        if (!isNonEmptyText(owner?.role) || !isNonEmptyText(owner?.note)) {
          errors.push(`proposedOwners[${index}] needs a role and a note.`);
        }
      }
    }
  }
  if (brief.dependencies !== undefined && !isTextList(brief.dependencies)) {
    errors.push('dependencies must be a list of text when present.');
  }
  return { valid: errors.length === 0, errors };
}
