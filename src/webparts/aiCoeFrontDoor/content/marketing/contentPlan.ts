/**
 * `ContentPlan.v1`: the second Marketing output, elaborating an accepted campaign brief into assets, copy variants,
 * a detailed calendar, proposed owners, dependencies and approval requirements.
 *
 * A local schema baseline (completion handoff §6, FIELD-CONTRACTS §3), not approved business schema. Three rules
 * are enforced rather than described.
 *
 * It starts from one exact accepted brief. `acceptedBrief` binds the brief's id, revision, payload hash and the
 * acceptance receipt that was read back; the service refuses to draft from anything else, and a later brief edit
 * makes this plan's approvals stale without rewriting either artifact (decision 4).
 *
 * One destination, one action. The initial plan names one primary destination and one primary call to action;
 * every asset and every variant references both by id and nothing else. Broader routing is a future scope decision.
 *
 * Requirements are not approvals. `approvalRequirements` says which review each asset and channel still needs; a
 * generated plan cannot carry a decision, and its accessibility state can only be pending or requested.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import type { Sentinel } from '../workIdentity';
import { checkScopeRefs, checkUniqueIds, parseAcceptedBriefRef, parseDependency, parseProposedOwnerForScope, parseReviewRequirement } from './artifactTypes';
import type { IAcceptedBriefRef, IDependency, IProposedOwnerForScope, IReviewRequirement } from './artifactTypes';
import { parseClaim, parseClaims } from './campaignBrief';
import type { IClaim, IParseResult, IValidationResult } from './campaignBrief';
import { at, canonicalId, forbidKeysDeep, formatIssues, integer, isoDateTime, list, literal, oneOf, safeHrefOrNull, sentinel, sourceRefs, strictObject, text, textList, workId } from './schema';
import type { IIssue, Raw } from './schema';
import type { ISourceRef } from './sourceRegister';

export const CONTENT_PLAN_SCHEMA_VERSION: string = '1.0';

export type AssetFormat = 'briefingNote' | 'newsletter' | 'intranetPage' | 'teamsDraft' | 'emailDraft' | 'other';
export const ASSET_FORMATS: readonly AssetFormat[] = ['briefingNote', 'newsletter', 'intranetPage', 'teamsDraft', 'emailDraft', 'other'];

/** The one destination everything points at. A missing link is explicit and blocks release, not drafting. */
export interface IPrimaryDestination {
  destinationId: 'primary';
  label: string;
  href: string | null;
  sourceRefs: ISourceRef[];
  unknown?: Sentinel;
}

export interface IPrimaryCta {
  ctaId: 'primary';
  label: string;
  destinationId: 'primary';
}

export interface IAsset {
  assetId: string;
  name: string;
  format: AssetFormat;
  purpose: string;
  audience: string[];
  /** A proposed channel, not a publication route. */
  channel: string;
  /** Supplied by the service once a channel owner is verified; null is a gap, never a guess. */
  channelOwnerBindingRef: string | null;
  destinationId: 'primary';
  ctaId: 'primary';
  sourceRefs: ISourceRef[];
  accessibilityRequirements: string[];
  reviewRequirementIds: string[];
}

export interface IAccessibility {
  altText: string | null;
  linkLabel: string;
  /** Generated content cannot claim an accepted review. */
  reviewState: 'pending' | 'reviewRequested';
}

export interface ICopyVariant {
  variantId: string;
  assetId: string;
  channel: string;
  audience: string[];
  headline: IClaim;
  body: IClaim[];
  ctaId: 'primary';
  accessibility: IAccessibility;
}

export interface IPlanCalendarEntry {
  entryId: string;
  phase: string;
  weekOffset: number;
  item: string;
  assetIds: string[];
  dependencyIds: string[];
}

export interface IContentPlanV1 {
  schemaVersion: string;
  planId: string;
  workId: string;
  registerId: string;
  registerVersion: string;
  acceptedBrief: IAcceptedBriefRef;
  primaryDestination: IPrimaryDestination;
  primaryCta: IPrimaryCta;
  assetRegister: IAsset[];
  copyVariants: ICopyVariant[];
  contentCalendar: IPlanCalendarEntry[];
  proposedOwners: IProposedOwnerForScope[];
  dependencies: IDependency[];
  approvalRequirements: IReviewRequirement[];
  evidenceGaps: string[];
  reviewNeeds: string[];
  createdAt: string;
}

const REQUIRED_KEYS: readonly string[] = [
  'schemaVersion',
  'planId',
  'workId',
  'registerId',
  'registerVersion',
  'acceptedBrief',
  'primaryDestination',
  'primaryCta',
  'assetRegister',
  'copyVariants',
  'contentCalendar',
  'proposedOwners',
  'dependencies',
  'approvalRequirements',
  'evidenceGaps',
  'reviewNeeds',
  'createdAt'
];

function parseDestination(value: unknown, path: string, issues: IIssue[]): IPrimaryDestination | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['destinationId', 'label', 'href', 'sourceRefs'], ['unknown']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  literal(raw.destinationId, at(path, 'destinationId'), issues, 'primary');
  const label: string | undefined = text(raw.label, at(path, 'label'), issues, { max: 200 });
  const href: string | null | undefined = safeHrefOrNull(raw.href, at(path, 'href'), issues);
  const refs: ISourceRef[] | undefined = sourceRefs(raw.sourceRefs, at(path, 'sourceRefs'), issues);
  const unknown: Sentinel | undefined = raw.unknown === undefined ? undefined : sentinel(raw.unknown, at(path, 'unknown'), issues);
  if (href === null && unknown === undefined) {
    issues.push({ path: at(path, 'href'), message: 'is null, so the destination must be marked unknown rather than left silent.' });
  }
  if (issues.length !== before || label === undefined || href === undefined || refs === undefined) {
    return undefined;
  }
  const destination: IPrimaryDestination = { destinationId: 'primary', label, href, sourceRefs: refs };
  if (unknown !== undefined) {
    destination.unknown = unknown;
  }
  return destination;
}

function parseCta(value: unknown, path: string, issues: IIssue[]): IPrimaryCta | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['ctaId', 'label', 'destinationId']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  literal(raw.ctaId, at(path, 'ctaId'), issues, 'primary');
  literal(raw.destinationId, at(path, 'destinationId'), issues, 'primary');
  const label: string | undefined = text(raw.label, at(path, 'label'), issues, { max: 200 });
  return issues.length !== before || label === undefined ? undefined : { ctaId: 'primary', label, destinationId: 'primary' };
}

function parseAsset(value: unknown, path: string, issues: IIssue[]): IAsset | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, [
    'assetId',
    'name',
    'format',
    'purpose',
    'audience',
    'channel',
    'channelOwnerBindingRef',
    'destinationId',
    'ctaId',
    'sourceRefs',
    'accessibilityRequirements',
    'reviewRequirementIds'
  ]);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const assetId: string | undefined = canonicalId(raw.assetId, at(path, 'assetId'), issues);
  const name: string | undefined = text(raw.name, at(path, 'name'), issues, { max: 200 });
  const format: AssetFormat | undefined = oneOf(raw.format, at(path, 'format'), issues, ASSET_FORMATS);
  const purpose: string | undefined = text(raw.purpose, at(path, 'purpose'), issues);
  const audience: string[] | undefined = textList(raw.audience, at(path, 'audience'), issues, { minItems: 1 });
  const channel: string | undefined = text(raw.channel, at(path, 'channel'), issues, { max: 200 });
  const channelOwnerBindingRef: string | null | undefined = raw.channelOwnerBindingRef === null ? null : text(raw.channelOwnerBindingRef, at(path, 'channelOwnerBindingRef'), issues, { max: 256 });
  literal(raw.destinationId, at(path, 'destinationId'), issues, 'primary');
  literal(raw.ctaId, at(path, 'ctaId'), issues, 'primary');
  const refs: ISourceRef[] | undefined = sourceRefs(raw.sourceRefs, at(path, 'sourceRefs'), issues);
  const accessibilityRequirements: string[] | undefined = textList(raw.accessibilityRequirements, at(path, 'accessibilityRequirements'), issues, { minItems: 1 });
  const reviewRequirementIds: string[] | undefined = textList(raw.reviewRequirementIds, at(path, 'reviewRequirementIds'), issues, { minItems: 1 });
  if (issues.length !== before || assetId === undefined || name === undefined || format === undefined || purpose === undefined || audience === undefined || channel === undefined || channelOwnerBindingRef === undefined || refs === undefined || accessibilityRequirements === undefined || reviewRequirementIds === undefined) {
    return undefined;
  }
  return { assetId, name, format, purpose, audience, channel, channelOwnerBindingRef, destinationId: 'primary', ctaId: 'primary', sourceRefs: refs, accessibilityRequirements, reviewRequirementIds };
}

function parseAccessibility(value: unknown, path: string, issues: IIssue[]): IAccessibility | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['altText', 'linkLabel', 'reviewState']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const altText: string | null | undefined = raw.altText === null ? null : text(raw.altText, at(path, 'altText'), issues, { max: 400 });
  const linkLabel: string | undefined = text(raw.linkLabel, at(path, 'linkLabel'), issues, { max: 200 });
  const reviewState: 'pending' | 'reviewRequested' | undefined = oneOf(raw.reviewState, at(path, 'reviewState'), issues, ['pending', 'reviewRequested']);
  return issues.length !== before || altText === undefined || linkLabel === undefined || reviewState === undefined ? undefined : { altText, linkLabel, reviewState };
}

function parseVariant(value: unknown, path: string, issues: IIssue[]): ICopyVariant | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['variantId', 'assetId', 'channel', 'audience', 'headline', 'body', 'ctaId', 'accessibility']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const variantId: string | undefined = canonicalId(raw.variantId, at(path, 'variantId'), issues);
  const assetId: string | undefined = canonicalId(raw.assetId, at(path, 'assetId'), issues);
  const channel: string | undefined = text(raw.channel, at(path, 'channel'), issues, { max: 200 });
  const audience: string[] | undefined = textList(raw.audience, at(path, 'audience'), issues, { minItems: 1 });
  const headline: IClaim | undefined = parseClaim(raw.headline, at(path, 'headline'), issues);
  const body: IClaim[] | undefined = parseClaims(raw.body, at(path, 'body'), issues, { minItems: 1 });
  literal(raw.ctaId, at(path, 'ctaId'), issues, 'primary');
  const accessibility: IAccessibility | undefined = parseAccessibility(raw.accessibility, at(path, 'accessibility'), issues);
  if (issues.length !== before || variantId === undefined || assetId === undefined || channel === undefined || audience === undefined || headline === undefined || body === undefined || accessibility === undefined) {
    return undefined;
  }
  return { variantId, assetId, channel, audience, headline, body, ctaId: 'primary', accessibility };
}

function parsePlanCalendarEntry(value: unknown, path: string, issues: IIssue[]): IPlanCalendarEntry | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['entryId', 'phase', 'weekOffset', 'item', 'assetIds', 'dependencyIds']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const entryId: string | undefined = canonicalId(raw.entryId, at(path, 'entryId'), issues);
  const phase: string | undefined = text(raw.phase, at(path, 'phase'), issues, { max: 200 });
  const weekOffset: number | undefined = integer(raw.weekOffset, at(path, 'weekOffset'), issues, { min: 0 });
  const item: string | undefined = text(raw.item, at(path, 'item'), issues);
  const assetIds: string[] | undefined = textList(raw.assetIds, at(path, 'assetIds'), issues, { minItems: 1 });
  const dependencyIds: string[] | undefined = textList(raw.dependencyIds, at(path, 'dependencyIds'), issues);
  if (issues.length !== before || entryId === undefined || phase === undefined || weekOffset === undefined || item === undefined || assetIds === undefined || dependencyIds === undefined) {
    return undefined;
  }
  return { entryId, phase, weekOffset, item, assetIds, dependencyIds };
}

/** Reads an untrusted value as a `ContentPlan.v1`, including every cross-reference invariant. */
export function parseContentPlan(value: unknown): IParseResult<IContentPlanV1> {
  const issues: IIssue[] = [];
  const raw: Raw | undefined = strictObject(value, '', issues, REQUIRED_KEYS);
  if (raw === undefined) {
    return { valid: false, errors: formatIssues(issues) };
  }
  forbidKeysDeep(raw, '', issues);
  literal(raw.schemaVersion, 'schemaVersion', issues, CONTENT_PLAN_SCHEMA_VERSION);
  const planId: string | undefined = canonicalId(raw.planId, 'planId', issues);
  const work: string | undefined = workId(raw.workId, 'workId', issues);
  const registerId: string | undefined = text(raw.registerId, 'registerId', issues, { max: 256 });
  const registerVersion: string | undefined = text(raw.registerVersion, 'registerVersion', issues, { max: 256 });
  const acceptedBrief: IAcceptedBriefRef | undefined = parseAcceptedBriefRef(raw.acceptedBrief, 'acceptedBrief', issues);
  const primaryDestination: IPrimaryDestination | undefined = parseDestination(raw.primaryDestination, 'primaryDestination', issues);
  const primaryCta: IPrimaryCta | undefined = parseCta(raw.primaryCta, 'primaryCta', issues);
  const assetRegister: IAsset[] | undefined = list(raw.assetRegister, 'assetRegister', issues, (item: unknown, itemPath: string): IAsset | undefined => parseAsset(item, itemPath, issues), { minItems: 1 });
  const copyVariants: ICopyVariant[] | undefined = list(raw.copyVariants, 'copyVariants', issues, (item: unknown, itemPath: string): ICopyVariant | undefined => parseVariant(item, itemPath, issues), { minItems: 1 });
  const contentCalendar: IPlanCalendarEntry[] | undefined = list(raw.contentCalendar, 'contentCalendar', issues, (item: unknown, itemPath: string): IPlanCalendarEntry | undefined =>
    parsePlanCalendarEntry(item, itemPath, issues)
  );
  const proposedOwners: IProposedOwnerForScope[] | undefined = list(raw.proposedOwners, 'proposedOwners', issues, (item: unknown, itemPath: string): IProposedOwnerForScope | undefined =>
    parseProposedOwnerForScope(item, itemPath, issues)
  );
  const dependencies: IDependency[] | undefined = list(raw.dependencies, 'dependencies', issues, (item: unknown, itemPath: string): IDependency | undefined => parseDependency(item, itemPath, issues));
  const approvalRequirements: IReviewRequirement[] | undefined = list(raw.approvalRequirements, 'approvalRequirements', issues, (item: unknown, itemPath: string): IReviewRequirement | undefined =>
    parseReviewRequirement(item, itemPath, issues)
  );
  const evidenceGaps: string[] | undefined = textList(raw.evidenceGaps, 'evidenceGaps', issues);
  const reviewNeeds: string[] | undefined = textList(raw.reviewNeeds, 'reviewNeeds', issues, { minItems: 1 });
  const createdAt: string | undefined = isoDateTime(raw.createdAt, 'createdAt', issues);

  if (
    issues.length > 0 ||
    planId === undefined ||
    work === undefined ||
    registerId === undefined ||
    registerVersion === undefined ||
    acceptedBrief === undefined ||
    primaryDestination === undefined ||
    primaryCta === undefined ||
    assetRegister === undefined ||
    copyVariants === undefined ||
    contentCalendar === undefined ||
    proposedOwners === undefined ||
    dependencies === undefined ||
    approvalRequirements === undefined ||
    evidenceGaps === undefined ||
    reviewNeeds === undefined ||
    createdAt === undefined
  ) {
    return { valid: false, errors: formatIssues(issues) };
  }

  // Cross-reference invariants: every id resolves, every asset has its copy/channel review, one route everywhere.
  const assetIds: string[] = assetRegister.map((asset: IAsset): string => asset.assetId);
  const variantIds: string[] = copyVariants.map((variant: ICopyVariant): string => variant.variantId);
  const dependencyIds: string[] = dependencies.map((dependency: IDependency): string => dependency.dependencyId);
  const requirementIds: string[] = approvalRequirements.map((requirement: IReviewRequirement): string => requirement.requirementId);
  checkUniqueIds(assetIds, 'assetRegister', issues);
  checkUniqueIds(variantIds, 'copyVariants', issues);
  checkUniqueIds(dependencyIds, 'dependencies', issues);
  checkUniqueIds(requirementIds, 'approvalRequirements', issues);
  checkUniqueIds(contentCalendar.map((entry: IPlanCalendarEntry): string => entry.entryId), 'contentCalendar', issues);
  const scopeIds: string[] = [planId, 'primary'].concat(assetIds, variantIds);
  for (let index: number = 0; index < copyVariants.length; index += 1) {
    if (assetIds.indexOf(copyVariants[index].assetId) < 0) {
      issues.push({ path: `copyVariants[${index}].assetId`, message: `names ${copyVariants[index].assetId}, which the asset register does not carry.` });
    }
  }
  for (let index: number = 0; index < assetRegister.length; index += 1) {
    const asset: IAsset = assetRegister[index];
    const covered: IReviewRequirement[] = approvalRequirements.filter(
      (requirement: IReviewRequirement): boolean => asset.reviewRequirementIds.indexOf(requirement.requirementId) >= 0 && requirement.reviewKind === 'copyChannel' && requirement.scopeRefs.indexOf(asset.assetId) >= 0
    );
    for (const id of asset.reviewRequirementIds) {
      if (requirementIds.indexOf(id) < 0) {
        issues.push({ path: `assetRegister[${index}].reviewRequirementIds`, message: `names ${id}, which approvalRequirements does not carry.` });
      }
    }
    if (covered.length === 0) {
      issues.push({ path: `assetRegister[${index}]`, message: 'has no copy/channel review requirement in scope; every asset needs one before it can be released.' });
    }
    if (copyVariants.filter((variant: ICopyVariant): boolean => variant.assetId === asset.assetId).length === 0) {
      issues.push({ path: `assetRegister[${index}]`, message: 'has no copy variant.' });
    }
  }
  for (let index: number = 0; index < contentCalendar.length; index += 1) {
    for (const id of contentCalendar[index].assetIds) {
      if (assetIds.indexOf(id) < 0) {
        issues.push({ path: `contentCalendar[${index}].assetIds`, message: `names ${id}, which the asset register does not carry.` });
      }
    }
    for (const id of contentCalendar[index].dependencyIds) {
      if (dependencyIds.indexOf(id) < 0) {
        issues.push({ path: `contentCalendar[${index}].dependencyIds`, message: `names ${id}, which dependencies does not carry.` });
      }
    }
  }
  checkScopeRefs(approvalRequirements, scopeIds, 'approvalRequirements', issues);
  checkScopeRefs(proposedOwners, scopeIds, 'proposedOwners', issues);
  checkScopeRefs(dependencies, scopeIds.concat(dependencyIds), 'dependencies', issues);
  for (let index: number = 0; index < dependencies.length; index += 1) {
    const related: IDependency['relatedArtifact'] = dependencies[index].relatedArtifact;
    if (related !== null && related.kind === 'campaignBrief' && related.artifactId !== acceptedBrief.artifactId) {
      issues.push({ path: `dependencies[${index}].relatedArtifact`, message: 'names a campaign brief other than the accepted one this plan elaborates.' });
    }
  }
  if (issues.length > 0) {
    return { valid: false, errors: formatIssues(issues) };
  }
  return {
    valid: true,
    errors: [],
    value: {
      schemaVersion: CONTENT_PLAN_SCHEMA_VERSION,
      planId,
      workId: work,
      registerId,
      registerVersion,
      acceptedBrief,
      primaryDestination,
      primaryCta,
      assetRegister,
      copyVariants,
      contentCalendar,
      proposedOwners,
      dependencies,
      approvalRequirements,
      evidenceGaps,
      reviewNeeds,
      createdAt
    }
  };
}

export function validateContentPlan(value: unknown): IValidationResult {
  const result: IParseResult<IContentPlanV1> = parseContentPlan(value);
  return { valid: result.valid, errors: result.errors };
}
