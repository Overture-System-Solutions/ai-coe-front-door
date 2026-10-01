/**
 * The shapes the three Marketing outputs share: a reference to an exact artifact revision, a review requirement, a
 * scoped owner proposal, a dependency, a source locator and a proposed timing.
 *
 * These are local engineering proposals (FIELD-CONTRACTS.md §2, adopted by the completion handoff), not approved
 * business schema. Each carries the same two properties as the campaign brief: a person is never named where a role
 * belongs, and a fact is cited or marked unknown, never asserted bare. Every parser here is strict for the same
 * reason the brief's is.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { Sentinel } from '../workIdentity';
import { parseClaim, parseProposedOwner } from './campaignBrief';
import type { IClaim, IProposedOwner } from './campaignBrief';
import { at, canonicalId, integer, isoDay, list, literal, oneOf, sentinel, sha256, sourceRef, strictObject, text, textList } from './schema';
import type { IIssue, Raw } from './schema';
import type { ISourceRef } from './sourceRegister';

export type ArtifactKind = 'campaignBrief' | 'contentPlan' | 'meetingFollowThrough';
export const ARTIFACT_KINDS: readonly ArtifactKind[] = ['campaignBrief', 'contentPlan', 'meetingFollowThrough'];

/** An exact artifact revision: id, revision counter and the hash of that revision's payload. A schema version is not a revision. */
export interface IArtifactRef {
  kind: ArtifactKind;
  artifactId: string;
  revision: number;
  payloadHash: string;
}

/** An accepted brief as a content plan binds it: the revision plus the acceptance receipt that was read back. */
export interface IAcceptedBriefRef extends IArtifactRef {
  kind: 'campaignBrief';
  acceptanceReceiptId: string;
}

export type ReviewKind = 'strategyVoice' | 'copyChannel' | 'meetingDecisionsActions' | 'communicationsSend' | 'release';
export const REVIEW_KINDS: readonly ReviewKind[] = ['strategyVoice', 'copyChannel', 'meetingDecisionsActions', 'communicationsSend', 'release'];

/** A requirement for a review, never a decision: which kind, over which parts, by which role, with which authority still to bind. */
export interface IReviewRequirement {
  requirementId: string;
  reviewKind: ReviewKind;
  scopeRefs: string[];
  /** A role label, not an authenticated principal. */
  requiredRole: string;
  /** Supplied by the review service once an authority is bound; null reads as awaiting an owner. */
  authorityBindingRef: string | null;
  blockingReason: string;
}

export interface IProposedOwnerForScope {
  scopeRefs: string[];
  owner: IProposedOwner;
}

export type DependencyStatus = 'open' | 'blocker' | 'unknown' | 'resolved';

export interface IDependency {
  dependencyId: string;
  scopeRefs: string[];
  description: IClaim;
  relatedArtifact: IArtifactRef | null;
  status: DependencyStatus;
}

/** A citation with a precise locator into the permitted snapshot: a page, a paragraph, a line range, a time range. */
export interface ISourceLocator {
  source: ISourceRef;
  locator: string;
}

export type ProposedTiming =
  | { kind: 'phaseWeek'; phase: string; weekOffset: number }
  | { kind: 'sourceDate'; date: string; source: ISourceLocator }
  | { kind: 'unknown'; reason: Sentinel };

export function parseArtifactRef(value: unknown, path: string, issues: IIssue[], kind?: ArtifactKind): IArtifactRef | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['kind', 'artifactId', 'revision', 'payloadHash']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const parsedKind: ArtifactKind | undefined = kind === undefined ? oneOf(raw.kind, at(path, 'kind'), issues, ARTIFACT_KINDS) : literal(raw.kind, at(path, 'kind'), issues, kind);
  const artifactId: string | undefined = canonicalId(raw.artifactId, at(path, 'artifactId'), issues);
  const revision: number | undefined = integer(raw.revision, at(path, 'revision'), issues, { min: 1 });
  const payloadHash: string | undefined = sha256(raw.payloadHash, at(path, 'payloadHash'), issues);
  if (issues.length !== before || parsedKind === undefined || artifactId === undefined || revision === undefined || payloadHash === undefined) {
    return undefined;
  }
  return { kind: parsedKind, artifactId, revision, payloadHash };
}

export function parseAcceptedBriefRef(value: unknown, path: string, issues: IIssue[]): IAcceptedBriefRef | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['kind', 'artifactId', 'revision', 'payloadHash', 'acceptanceReceiptId']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  literal(raw.kind, at(path, 'kind'), issues, 'campaignBrief');
  const artifactId: string | undefined = canonicalId(raw.artifactId, at(path, 'artifactId'), issues);
  const revision: number | undefined = integer(raw.revision, at(path, 'revision'), issues, { min: 1 });
  const payloadHash: string | undefined = sha256(raw.payloadHash, at(path, 'payloadHash'), issues);
  const acceptanceReceiptId: string | undefined = canonicalId(raw.acceptanceReceiptId, at(path, 'acceptanceReceiptId'), issues);
  if (issues.length !== before || artifactId === undefined || revision === undefined || payloadHash === undefined || acceptanceReceiptId === undefined) {
    return undefined;
  }
  return { kind: 'campaignBrief', artifactId, revision, payloadHash, acceptanceReceiptId };
}

export function parseReviewRequirement(value: unknown, path: string, issues: IIssue[]): IReviewRequirement | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['requirementId', 'reviewKind', 'scopeRefs', 'requiredRole', 'authorityBindingRef', 'blockingReason']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const requirementId: string | undefined = canonicalId(raw.requirementId, at(path, 'requirementId'), issues);
  const reviewKind: ReviewKind | undefined = oneOf(raw.reviewKind, at(path, 'reviewKind'), issues, REVIEW_KINDS);
  const scopeRefs: string[] | undefined = textList(raw.scopeRefs, at(path, 'scopeRefs'), issues, { minItems: 1 });
  const requiredRole: string | undefined = text(raw.requiredRole, at(path, 'requiredRole'), issues, { max: 200 });
  const authorityBindingRef: string | null | undefined = raw.authorityBindingRef === null ? null : text(raw.authorityBindingRef, at(path, 'authorityBindingRef'), issues, { max: 256 });
  const blockingReason: string | undefined = text(raw.blockingReason, at(path, 'blockingReason'), issues);
  if (requiredRole !== undefined && requiredRole.indexOf('@') >= 0) {
    issues.push({ path: at(path, 'requiredRole'), message: 'reads as an address; a requirement names a role, never a person.' });
  }
  if (issues.length !== before || requirementId === undefined || reviewKind === undefined || scopeRefs === undefined || requiredRole === undefined || authorityBindingRef === undefined || blockingReason === undefined) {
    return undefined;
  }
  return { requirementId, reviewKind, scopeRefs, requiredRole, authorityBindingRef, blockingReason };
}

export function parseProposedOwnerForScope(value: unknown, path: string, issues: IIssue[]): IProposedOwnerForScope | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['scopeRefs', 'owner']);
  if (raw === undefined) {
    return undefined;
  }
  const scopeRefs: string[] | undefined = textList(raw.scopeRefs, at(path, 'scopeRefs'), issues, { minItems: 1 });
  const owner: IProposedOwner | undefined = parseProposedOwner(raw.owner, at(path, 'owner'), issues);
  return scopeRefs === undefined || owner === undefined ? undefined : { scopeRefs, owner };
}

export function parseDependency(value: unknown, path: string, issues: IIssue[]): IDependency | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['dependencyId', 'scopeRefs', 'description', 'relatedArtifact', 'status']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const dependencyId: string | undefined = canonicalId(raw.dependencyId, at(path, 'dependencyId'), issues);
  const scopeRefs: string[] | undefined = textList(raw.scopeRefs, at(path, 'scopeRefs'), issues);
  const description: IClaim | undefined = parseClaim(raw.description, at(path, 'description'), issues);
  const relatedArtifact: IArtifactRef | null | undefined = raw.relatedArtifact === null ? null : parseArtifactRef(raw.relatedArtifact, at(path, 'relatedArtifact'), issues);
  const status: DependencyStatus | undefined = oneOf(raw.status, at(path, 'status'), issues, ['open', 'blocker', 'unknown', 'resolved']);
  if (issues.length !== before || dependencyId === undefined || scopeRefs === undefined || description === undefined || relatedArtifact === undefined || status === undefined) {
    return undefined;
  }
  return { dependencyId, scopeRefs, description, relatedArtifact, status };
}

export function parseSourceLocator(value: unknown, path: string, issues: IIssue[]): ISourceLocator | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['source', 'locator']);
  if (raw === undefined) {
    return undefined;
  }
  const source: ISourceRef | undefined = sourceRef(raw.source, at(path, 'source'), issues);
  const locator: string | undefined = text(raw.locator, at(path, 'locator'), issues, { max: 400 });
  return source === undefined || locator === undefined ? undefined : { source, locator };
}

export function parseSourceLocators(value: unknown, path: string, issues: IIssue[], options: { minItems?: number } = {}): ISourceLocator[] | undefined {
  return list(value, path, issues, (item: unknown, itemPath: string): ISourceLocator | undefined => parseSourceLocator(item, itemPath, issues), options);
}

export function parseProposedTiming(value: unknown, path: string, issues: IIssue[]): ProposedTiming | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push({ path, message: 'must be an object with a kind of phaseWeek, sourceDate or unknown.' });
    return undefined;
  }
  const kind: unknown = (value as Raw).kind;
  if (kind === 'phaseWeek') {
    const raw: Raw | undefined = strictObject(value, path, issues, ['kind', 'phase', 'weekOffset']);
    if (raw === undefined) {
      return undefined;
    }
    const phase: string | undefined = text(raw.phase, at(path, 'phase'), issues, { max: 200 });
    const weekOffset: number | undefined = integer(raw.weekOffset, at(path, 'weekOffset'), issues, { min: 0 });
    return phase === undefined || weekOffset === undefined ? undefined : { kind: 'phaseWeek', phase, weekOffset };
  }
  if (kind === 'sourceDate') {
    const raw: Raw | undefined = strictObject(value, path, issues, ['kind', 'date', 'source']);
    if (raw === undefined) {
      return undefined;
    }
    const date: string | undefined = isoDay(raw.date, at(path, 'date'), issues);
    const source: ISourceLocator | undefined = parseSourceLocator(raw.source, at(path, 'source'), issues);
    return date === undefined || source === undefined ? undefined : { kind: 'sourceDate', date, source };
  }
  if (kind === 'unknown') {
    const raw: Raw | undefined = strictObject(value, path, issues, ['kind', 'reason']);
    if (raw === undefined) {
      return undefined;
    }
    const reason: Sentinel | undefined = sentinel(raw.reason, at(path, 'reason'), issues);
    return reason === undefined ? undefined : { kind: 'unknown', reason };
  }
  issues.push({ path: at(path, 'kind'), message: 'must be phaseWeek, sourceDate or unknown; a calendar date needs a separately approved start.' });
  return undefined;
}

/** Every scope reference of a set of requirements must name something the artifact carries. */
export function checkScopeRefs(requirements: readonly { scopeRefs: string[] }[], known: readonly string[], path: string, issues: IIssue[]): void {
  for (let index: number = 0; index < requirements.length; index += 1) {
    for (let refIndex: number = 0; refIndex < requirements[index].scopeRefs.length; refIndex += 1) {
      const ref: string = requirements[index].scopeRefs[refIndex];
      if (known.indexOf(ref) < 0) {
        issues.push({ path: at(at(at(path, index), 'scopeRefs'), refIndex), message: `names ${ref}, which this artifact does not carry.` });
      }
    }
  }
}

/** Ids within one artifact are unique in their scope. */
export function checkUniqueIds(ids: readonly string[], path: string, issues: IIssue[]): void {
  const seen: string[] = [];
  for (let index: number = 0; index < ids.length; index += 1) {
    if (seen.indexOf(ids[index]) >= 0) {
      issues.push({ path: at(path, index), message: `repeats the id ${ids[index]}.` });
    }
    seen.push(ids[index]);
  }
}
