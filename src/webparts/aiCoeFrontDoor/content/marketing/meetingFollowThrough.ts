/**
 * `MeetingFollowThrough.v1`: the third Marketing output, turning permitted meeting notes and the current campaign
 * packet into proposed decisions, action proposals, brief-change proposals, communications drafts and unresolved
 * questions - none of which is assigned, sent, scheduled or applied by this artifact.
 *
 * A local schema baseline (completion handoff §6, FIELD-CONTRACTS §4). The rules the parser holds:
 *
 * Every proposal is traceable. A decision, an action or a brief change carries at least one locator into a permitted
 * meeting source, so a reviewer can find the sentence it came from; a proposal the notes do not support is refused.
 *
 * A generated draft proposes; a person accepts. Decisions are `proposed` until a separate meeting-owner decision is
 * recorded (`acceptance` names that record and is null in a draft). An action proposal names a role and a
 * confirmation still required, never an assignee. A brief change names the exact brief revision it would alter and
 * a whitelisted field; nothing here mutates the accepted brief. A communications draft carries `sent: false` and the
 * sender approval it still needs.
 *
 * The notes are evidence, not instructions. Text in a meeting source cannot change the actor, the reviewer, the
 * register or the operation: the parser reads only the fields the contract names, and the service checks the
 * sources for instruction shapes before drafting.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { checkScopeRefs, checkUniqueIds, parseArtifactRef, parseProposedTiming, parseReviewRequirement, parseSourceLocators } from './artifactTypes';
import type { IArtifactRef, IReviewRequirement, ISourceLocator, ProposedTiming } from './artifactTypes';
import { parseCalendarEntry, parseClaim, parseClaims, parseProposedOwner } from './campaignBrief';
import type { ICalendarEntry, IClaim, IParseResult, IProposedOwner, IValidationResult } from './campaignBrief';
import { at, canonicalId, forbidKeysDeep, formatIssues, isoDateTime, list, literal, oneOf, sourceRefs, strictObject, text, textList, workId } from './schema';
import type { IIssue, Raw } from './schema';
import type { ISourceRef } from './sourceRegister';

export const MEETING_FOLLOW_THROUGH_SCHEMA_VERSION: string = '1.0';

export type DecisionClassification = 'reportedDecision' | 'proposedDecision';

export interface IDecisionProposal {
  decisionProposalId: string;
  classification: DecisionClassification;
  statement: IClaim;
  rationale: IClaim;
  conditions: IClaim[];
  evidence: ISourceLocator[];
  status: 'proposed' | 'accepted';
  /** The separate meeting-owner decision record that accepted this; null in every generated draft. */
  acceptance: { decisionRecordRef: string } | null;
  reviewRequirementId: string;
}

export interface IActionProposal {
  actionProposalId: string;
  description: IClaim;
  suggestedOwner: IProposedOwner | null;
  proposedTiming: ProposedTiming;
  dependencyIds: string[];
  evidence: ISourceLocator[];
  /** What must be confirmed by whom before this becomes work; the artifact itself allocates nothing. */
  requiredConfirmation: string;
  reviewRequirementId: string;
}

export type BriefChangeField = 'objective' | 'audience' | 'painPoints' | 'message' | 'channelPlan' | 'contentCalendar' | 'evidenceGaps' | 'reviewNeeds' | 'proposedOwners' | 'dependencies';
export const BRIEF_CHANGE_FIELDS: readonly BriefChangeField[] = ['objective', 'audience', 'painPoints', 'message', 'channelPlan', 'contentCalendar', 'evidenceGaps', 'reviewNeeds', 'proposedOwners', 'dependencies'];

export type BriefChangeValue = string | string[] | IClaim[] | ICalendarEntry[] | IProposedOwner[];

export interface IBriefChangeProposal {
  changeProposalId: string;
  targetBrief: IArtifactRef;
  field: BriefChangeField;
  proposedValue: BriefChangeValue;
  rationale: IClaim;
  evidence: ISourceLocator[];
  reviewRequirementId: string;
}

export type CommunicationChannel = 'emailDraft' | 'teamsDraft' | 'other';

export interface ICommunicationDraft {
  communicationDraftId: string;
  channel: CommunicationChannel;
  /** An audience description, never live recipients. */
  proposedAudience: string[];
  subject: IClaim;
  body: IClaim[];
  proposedCta: IClaim;
  proposedDestination: IClaim;
  sourceRefs: ISourceRef[];
  requiredSenderApproval: string;
  reviewRequirementIds: string[];
  sent: false;
}

export interface IUnresolvedQuestion {
  questionId: string;
  question: IClaim;
  suggestedRole: IProposedOwner | null;
}

export interface IMeetingFollowThroughV1 {
  schemaVersion: string;
  followThroughId: string;
  workId: string;
  registerId: string;
  registerVersion: string;
  campaignPacket: { brief: IArtifactRef; contentPlan: IArtifactRef | null };
  meetingSources: ISourceLocator[];
  decisions: IDecisionProposal[];
  actionProposals: IActionProposal[];
  briefChanges: IBriefChangeProposal[];
  communicationsDrafts: ICommunicationDraft[];
  unresolvedQuestions: IUnresolvedQuestion[];
  risks: IClaim[];
  nextGate: { description: IClaim; requiredReviewIds: string[] };
  approvalRequirements: IReviewRequirement[];
  evidenceGaps: string[];
  reviewNeeds: string[];
  createdAt: string;
}

const REQUIRED_KEYS: readonly string[] = [
  'schemaVersion',
  'followThroughId',
  'workId',
  'registerId',
  'registerVersion',
  'campaignPacket',
  'meetingSources',
  'decisions',
  'actionProposals',
  'briefChanges',
  'communicationsDrafts',
  'unresolvedQuestions',
  'risks',
  'nextGate',
  'approvalRequirements',
  'evidenceGaps',
  'reviewNeeds',
  'createdAt'
];

function parsePacket(value: unknown, path: string, issues: IIssue[]): { brief: IArtifactRef; contentPlan: IArtifactRef | null } | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['brief', 'contentPlan']);
  if (raw === undefined) {
    return undefined;
  }
  const brief: IArtifactRef | undefined = parseArtifactRef(raw.brief, at(path, 'brief'), issues, 'campaignBrief');
  const contentPlan: IArtifactRef | null | undefined = raw.contentPlan === null ? null : parseArtifactRef(raw.contentPlan, at(path, 'contentPlan'), issues, 'contentPlan');
  return brief === undefined || contentPlan === undefined ? undefined : { brief, contentPlan };
}

function parseDecision(value: unknown, path: string, issues: IIssue[]): IDecisionProposal | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['decisionProposalId', 'classification', 'statement', 'rationale', 'conditions', 'evidence', 'status', 'acceptance', 'reviewRequirementId']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const decisionProposalId: string | undefined = canonicalId(raw.decisionProposalId, at(path, 'decisionProposalId'), issues);
  const classification: DecisionClassification | undefined = oneOf(raw.classification, at(path, 'classification'), issues, ['reportedDecision', 'proposedDecision']);
  const statement: IClaim | undefined = parseClaim(raw.statement, at(path, 'statement'), issues);
  const rationale: IClaim | undefined = parseClaim(raw.rationale, at(path, 'rationale'), issues);
  const conditions: IClaim[] | undefined = parseClaims(raw.conditions, at(path, 'conditions'), issues);
  const evidence: ISourceLocator[] | undefined = parseSourceLocators(raw.evidence, at(path, 'evidence'), issues, { minItems: 1 });
  const status: 'proposed' | 'accepted' | undefined = oneOf(raw.status, at(path, 'status'), issues, ['proposed', 'accepted']);
  let acceptance: { decisionRecordRef: string } | null | undefined;
  if (raw.acceptance === null) {
    acceptance = null;
  } else {
    const acceptanceRaw: Raw | undefined = strictObject(raw.acceptance, at(path, 'acceptance'), issues, ['decisionRecordRef']);
    const ref: string | undefined = acceptanceRaw === undefined ? undefined : canonicalId(acceptanceRaw.decisionRecordRef, at(at(path, 'acceptance'), 'decisionRecordRef'), issues);
    acceptance = ref === undefined ? undefined : { decisionRecordRef: ref };
  }
  if (status === 'accepted' && acceptance === null) {
    issues.push({ path: at(path, 'status'), message: 'is accepted without a separate meeting-owner decision record; a draft cannot accept itself.' });
  }
  if (status === 'proposed' && acceptance !== null && acceptance !== undefined) {
    issues.push({ path: at(path, 'acceptance'), message: 'names a decision record while the status is still proposed.' });
  }
  const reviewRequirementId: string | undefined = canonicalId(raw.reviewRequirementId, at(path, 'reviewRequirementId'), issues);
  if (issues.length !== before || decisionProposalId === undefined || classification === undefined || statement === undefined || rationale === undefined || conditions === undefined || evidence === undefined || status === undefined || acceptance === undefined || reviewRequirementId === undefined) {
    return undefined;
  }
  return { decisionProposalId, classification, statement, rationale, conditions, evidence, status, acceptance, reviewRequirementId };
}

function parseAction(value: unknown, path: string, issues: IIssue[]): IActionProposal | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['actionProposalId', 'description', 'suggestedOwner', 'proposedTiming', 'dependencyIds', 'evidence', 'requiredConfirmation', 'reviewRequirementId']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const actionProposalId: string | undefined = canonicalId(raw.actionProposalId, at(path, 'actionProposalId'), issues);
  const description: IClaim | undefined = parseClaim(raw.description, at(path, 'description'), issues);
  const suggestedOwner: IProposedOwner | null | undefined = raw.suggestedOwner === null ? null : parseProposedOwner(raw.suggestedOwner, at(path, 'suggestedOwner'), issues);
  const proposedTiming: ProposedTiming | undefined = parseProposedTiming(raw.proposedTiming, at(path, 'proposedTiming'), issues);
  const dependencyIds: string[] | undefined = textList(raw.dependencyIds, at(path, 'dependencyIds'), issues);
  const evidence: ISourceLocator[] | undefined = parseSourceLocators(raw.evidence, at(path, 'evidence'), issues, { minItems: 1 });
  const requiredConfirmation: string | undefined = text(raw.requiredConfirmation, at(path, 'requiredConfirmation'), issues);
  const reviewRequirementId: string | undefined = canonicalId(raw.reviewRequirementId, at(path, 'reviewRequirementId'), issues);
  if (issues.length !== before || actionProposalId === undefined || description === undefined || suggestedOwner === undefined || proposedTiming === undefined || dependencyIds === undefined || evidence === undefined || requiredConfirmation === undefined || reviewRequirementId === undefined) {
    return undefined;
  }
  return { actionProposalId, description, suggestedOwner, proposedTiming, dependencyIds, evidence, requiredConfirmation, reviewRequirementId };
}

/** The proposed value must have the type the target field has in `CampaignBrief.v1`; arbitrary JSON is refused. */
function parseBriefChangeValue(field: BriefChangeField, value: unknown, path: string, issues: IIssue[]): BriefChangeValue | undefined {
  switch (field) {
    case 'objective':
      return text(value, path, issues);
    case 'audience':
    case 'painPoints':
    case 'channelPlan':
    case 'reviewNeeds':
      return textList(value, path, issues, { minItems: 1 });
    case 'evidenceGaps':
    case 'dependencies':
      return textList(value, path, issues);
    case 'message':
      return parseClaims(value, path, issues, { minItems: 1 });
    case 'contentCalendar':
      return list(value, path, issues, (item: unknown, itemPath: string): ICalendarEntry | undefined => parseCalendarEntry(item, itemPath, issues));
    case 'proposedOwners':
      return list(value, path, issues, (item: unknown, itemPath: string): IProposedOwner | undefined => parseProposedOwner(item, itemPath, issues));
    default: {
      const exhaustive: never = field;
      issues.push({ path, message: `targets an unknown field ${String(exhaustive)}.` });
      return undefined;
    }
  }
}

function parseBriefChange(value: unknown, path: string, issues: IIssue[]): IBriefChangeProposal | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['changeProposalId', 'targetBrief', 'field', 'proposedValue', 'rationale', 'evidence', 'reviewRequirementId']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const changeProposalId: string | undefined = canonicalId(raw.changeProposalId, at(path, 'changeProposalId'), issues);
  const targetBrief: IArtifactRef | undefined = parseArtifactRef(raw.targetBrief, at(path, 'targetBrief'), issues, 'campaignBrief');
  const field: BriefChangeField | undefined = oneOf(raw.field, at(path, 'field'), issues, BRIEF_CHANGE_FIELDS);
  const proposedValue: BriefChangeValue | undefined = field === undefined ? undefined : parseBriefChangeValue(field, raw.proposedValue, at(path, 'proposedValue'), issues);
  const rationale: IClaim | undefined = parseClaim(raw.rationale, at(path, 'rationale'), issues);
  const evidence: ISourceLocator[] | undefined = parseSourceLocators(raw.evidence, at(path, 'evidence'), issues, { minItems: 1 });
  const reviewRequirementId: string | undefined = canonicalId(raw.reviewRequirementId, at(path, 'reviewRequirementId'), issues);
  if (issues.length !== before || changeProposalId === undefined || targetBrief === undefined || field === undefined || proposedValue === undefined || rationale === undefined || evidence === undefined || reviewRequirementId === undefined) {
    return undefined;
  }
  return { changeProposalId, targetBrief, field, proposedValue, rationale, evidence, reviewRequirementId };
}

function parseCommunication(value: unknown, path: string, issues: IIssue[]): ICommunicationDraft | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['communicationDraftId', 'channel', 'proposedAudience', 'subject', 'body', 'proposedCta', 'proposedDestination', 'sourceRefs', 'requiredSenderApproval', 'reviewRequirementIds', 'sent']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const communicationDraftId: string | undefined = canonicalId(raw.communicationDraftId, at(path, 'communicationDraftId'), issues);
  const channel: CommunicationChannel | undefined = oneOf(raw.channel, at(path, 'channel'), issues, ['emailDraft', 'teamsDraft', 'other']);
  const proposedAudience: string[] | undefined = textList(raw.proposedAudience, at(path, 'proposedAudience'), issues, { minItems: 1 });
  if (proposedAudience !== undefined && proposedAudience.filter((item: string): boolean => item.indexOf('@') >= 0).length > 0) {
    issues.push({ path: at(path, 'proposedAudience'), message: 'reads as addresses; an audience is a description, never live recipients.' });
  }
  const subject: IClaim | undefined = parseClaim(raw.subject, at(path, 'subject'), issues);
  const body: IClaim[] | undefined = parseClaims(raw.body, at(path, 'body'), issues, { minItems: 1 });
  const proposedCta: IClaim | undefined = parseClaim(raw.proposedCta, at(path, 'proposedCta'), issues);
  const proposedDestination: IClaim | undefined = parseClaim(raw.proposedDestination, at(path, 'proposedDestination'), issues);
  const refs: ISourceRef[] | undefined = sourceRefs(raw.sourceRefs, at(path, 'sourceRefs'), issues);
  const requiredSenderApproval: string | undefined = text(raw.requiredSenderApproval, at(path, 'requiredSenderApproval'), issues);
  const reviewRequirementIds: string[] | undefined = textList(raw.reviewRequirementIds, at(path, 'reviewRequirementIds'), issues, { minItems: 1 });
  literal(raw.sent, at(path, 'sent'), issues, false);
  if (issues.length !== before || communicationDraftId === undefined || channel === undefined || proposedAudience === undefined || subject === undefined || body === undefined || proposedCta === undefined || proposedDestination === undefined || refs === undefined || requiredSenderApproval === undefined || reviewRequirementIds === undefined) {
    return undefined;
  }
  return { communicationDraftId, channel, proposedAudience, subject, body, proposedCta, proposedDestination, sourceRefs: refs, requiredSenderApproval, reviewRequirementIds, sent: false };
}

function parseQuestion(value: unknown, path: string, issues: IIssue[]): IUnresolvedQuestion | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['questionId', 'question', 'suggestedRole']);
  if (raw === undefined) {
    return undefined;
  }
  const before: number = issues.length;
  const questionId: string | undefined = canonicalId(raw.questionId, at(path, 'questionId'), issues);
  const question: IClaim | undefined = parseClaim(raw.question, at(path, 'question'), issues);
  const suggestedRole: IProposedOwner | null | undefined = raw.suggestedRole === null ? null : parseProposedOwner(raw.suggestedRole, at(path, 'suggestedRole'), issues);
  return issues.length !== before || questionId === undefined || question === undefined || suggestedRole === undefined ? undefined : { questionId, question, suggestedRole };
}

function parseNextGate(value: unknown, path: string, issues: IIssue[]): { description: IClaim; requiredReviewIds: string[] } | undefined {
  const raw: Raw | undefined = strictObject(value, path, issues, ['description', 'requiredReviewIds']);
  if (raw === undefined) {
    return undefined;
  }
  const description: IClaim | undefined = parseClaim(raw.description, at(path, 'description'), issues);
  const requiredReviewIds: string[] | undefined = textList(raw.requiredReviewIds, at(path, 'requiredReviewIds'), issues);
  return description === undefined || requiredReviewIds === undefined ? undefined : { description, requiredReviewIds };
}

/** Every evidence locator of a proposal must name a source the artifact's meeting sources carry at the same version. */
function checkEvidenceSources(evidence: readonly ISourceLocator[], meetingSources: readonly ISourceLocator[], path: string, issues: IIssue[]): void {
  for (let index: number = 0; index < evidence.length; index += 1) {
    const found: boolean =
      meetingSources.filter((source: ISourceLocator): boolean => source.source.sourceId === evidence[index].source.sourceId && source.source.versionOrETag === evidence[index].source.versionOrETag).length > 0;
    if (!found) {
      issues.push({ path: at(path, index), message: `cites ${evidence[index].source.sourceId}, which is not among the permitted meeting sources of this run.` });
    }
  }
}

/** Reads an untrusted value as a `MeetingFollowThrough.v1`, including every traceability invariant. */
export function parseMeetingFollowThrough(value: unknown): IParseResult<IMeetingFollowThroughV1> {
  const issues: IIssue[] = [];
  const raw: Raw | undefined = strictObject(value, '', issues, REQUIRED_KEYS);
  if (raw === undefined) {
    return { valid: false, errors: formatIssues(issues) };
  }
  forbidKeysDeep(raw, '', issues);
  literal(raw.schemaVersion, 'schemaVersion', issues, MEETING_FOLLOW_THROUGH_SCHEMA_VERSION);
  const followThroughId: string | undefined = canonicalId(raw.followThroughId, 'followThroughId', issues);
  const work: string | undefined = workId(raw.workId, 'workId', issues);
  const registerId: string | undefined = text(raw.registerId, 'registerId', issues, { max: 256 });
  const registerVersion: string | undefined = text(raw.registerVersion, 'registerVersion', issues, { max: 256 });
  const campaignPacket: IMeetingFollowThroughV1['campaignPacket'] | undefined = parsePacket(raw.campaignPacket, 'campaignPacket', issues);
  const meetingSources: ISourceLocator[] | undefined = parseSourceLocators(raw.meetingSources, 'meetingSources', issues, { minItems: 1 });
  const decisions: IDecisionProposal[] | undefined = list(raw.decisions, 'decisions', issues, (item: unknown, itemPath: string): IDecisionProposal | undefined => parseDecision(item, itemPath, issues));
  const actionProposals: IActionProposal[] | undefined = list(raw.actionProposals, 'actionProposals', issues, (item: unknown, itemPath: string): IActionProposal | undefined => parseAction(item, itemPath, issues));
  const briefChanges: IBriefChangeProposal[] | undefined = list(raw.briefChanges, 'briefChanges', issues, (item: unknown, itemPath: string): IBriefChangeProposal | undefined => parseBriefChange(item, itemPath, issues));
  const communicationsDrafts: ICommunicationDraft[] | undefined = list(raw.communicationsDrafts, 'communicationsDrafts', issues, (item: unknown, itemPath: string): ICommunicationDraft | undefined =>
    parseCommunication(item, itemPath, issues)
  );
  const unresolvedQuestions: IUnresolvedQuestion[] | undefined = list(raw.unresolvedQuestions, 'unresolvedQuestions', issues, (item: unknown, itemPath: string): IUnresolvedQuestion | undefined =>
    parseQuestion(item, itemPath, issues)
  );
  const risks: IClaim[] | undefined = parseClaims(raw.risks, 'risks', issues);
  const nextGate: IMeetingFollowThroughV1['nextGate'] | undefined = parseNextGate(raw.nextGate, 'nextGate', issues);
  const approvalRequirements: IReviewRequirement[] | undefined = list(raw.approvalRequirements, 'approvalRequirements', issues, (item: unknown, itemPath: string): IReviewRequirement | undefined =>
    parseReviewRequirement(item, itemPath, issues)
  );
  const evidenceGaps: string[] | undefined = textList(raw.evidenceGaps, 'evidenceGaps', issues);
  const reviewNeeds: string[] | undefined = textList(raw.reviewNeeds, 'reviewNeeds', issues, { minItems: 1 });
  const createdAt: string | undefined = isoDateTime(raw.createdAt, 'createdAt', issues);

  if (
    issues.length > 0 ||
    followThroughId === undefined ||
    work === undefined ||
    registerId === undefined ||
    registerVersion === undefined ||
    campaignPacket === undefined ||
    meetingSources === undefined ||
    decisions === undefined ||
    actionProposals === undefined ||
    briefChanges === undefined ||
    communicationsDrafts === undefined ||
    unresolvedQuestions === undefined ||
    risks === undefined ||
    nextGate === undefined ||
    approvalRequirements === undefined ||
    evidenceGaps === undefined ||
    reviewNeeds === undefined ||
    createdAt === undefined
  ) {
    return { valid: false, errors: formatIssues(issues) };
  }

  const requirementIds: string[] = approvalRequirements.map((requirement: IReviewRequirement): string => requirement.requirementId);
  const decisionIds: string[] = decisions.map((decision: IDecisionProposal): string => decision.decisionProposalId);
  const actionIds: string[] = actionProposals.map((action: IActionProposal): string => action.actionProposalId);
  const changeIds: string[] = briefChanges.map((change: IBriefChangeProposal): string => change.changeProposalId);
  const draftIds: string[] = communicationsDrafts.map((draft: ICommunicationDraft): string => draft.communicationDraftId);
  checkUniqueIds(requirementIds, 'approvalRequirements', issues);
  checkUniqueIds(decisionIds, 'decisions', issues);
  checkUniqueIds(actionIds, 'actionProposals', issues);
  checkUniqueIds(changeIds, 'briefChanges', issues);
  checkUniqueIds(draftIds, 'communicationsDrafts', issues);
  checkUniqueIds(unresolvedQuestions.map((question: IUnresolvedQuestion): string => question.questionId), 'unresolvedQuestions', issues);
  const scopeIds: string[] = [followThroughId].concat(decisionIds, actionIds, changeIds, draftIds);
  checkScopeRefs(approvalRequirements, scopeIds, 'approvalRequirements', issues);
  const requireKind = (id: string, kind: IReviewRequirement['reviewKind'] | IReviewRequirement['reviewKind'][], path: string): void => {
    const kinds: IReviewRequirement['reviewKind'][] = Array.isArray(kind) ? kind : [kind];
    const found: IReviewRequirement | undefined = approvalRequirements.filter((requirement: IReviewRequirement): boolean => requirement.requirementId === id)[0];
    if (found === undefined) {
      issues.push({ path, message: `names ${id}, which approvalRequirements does not carry.` });
    } else if (kinds.indexOf(found.reviewKind) < 0) {
      issues.push({ path, message: `names ${id}, which is a ${found.reviewKind} review; ${kinds.join(' or ')} is required here.` });
    }
  };
  for (let index: number = 0; index < decisions.length; index += 1) {
    checkEvidenceSources(decisions[index].evidence, meetingSources, `decisions[${index}].evidence`, issues);
    requireKind(decisions[index].reviewRequirementId, 'meetingDecisionsActions', `decisions[${index}].reviewRequirementId`);
  }
  for (let index: number = 0; index < actionProposals.length; index += 1) {
    checkEvidenceSources(actionProposals[index].evidence, meetingSources, `actionProposals[${index}].evidence`, issues);
    requireKind(actionProposals[index].reviewRequirementId, 'meetingDecisionsActions', `actionProposals[${index}].reviewRequirementId`);
    for (const id of actionProposals[index].dependencyIds) {
      if (actionIds.indexOf(id) < 0 && decisionIds.indexOf(id) < 0) {
        issues.push({ path: `actionProposals[${index}].dependencyIds`, message: `names ${id}, which is neither an action nor a decision of this artifact.` });
      }
    }
  }
  for (let index: number = 0; index < briefChanges.length; index += 1) {
    checkEvidenceSources(briefChanges[index].evidence, meetingSources, `briefChanges[${index}].evidence`, issues);
    requireKind(briefChanges[index].reviewRequirementId, ['meetingDecisionsActions', 'strategyVoice'], `briefChanges[${index}].reviewRequirementId`);
    if (briefChanges[index].targetBrief.artifactId !== campaignPacket.brief.artifactId) {
      issues.push({ path: `briefChanges[${index}].targetBrief`, message: 'names a brief other than the one in this campaign packet.' });
    }
    if (briefChanges[index].targetBrief.revision !== campaignPacket.brief.revision) {
      issues.push({ path: `briefChanges[${index}].targetBrief.revision`, message: 'names a revision other than the current packet revision; a proposal targets what is current.' });
    }
  }
  for (let index: number = 0; index < communicationsDrafts.length; index += 1) {
    let senderReview: boolean = false;
    for (const id of communicationsDrafts[index].reviewRequirementIds) {
      const found: IReviewRequirement | undefined = approvalRequirements.filter((requirement: IReviewRequirement): boolean => requirement.requirementId === id)[0];
      if (found === undefined) {
        issues.push({ path: `communicationsDrafts[${index}].reviewRequirementIds`, message: `names ${id}, which approvalRequirements does not carry.` });
      } else if (found.reviewKind === 'communicationsSend') {
        senderReview = true;
      }
    }
    if (!senderReview) {
      issues.push({ path: `communicationsDrafts[${index}]`, message: 'has no communicationsSend review requirement; a draft stays unsent until a sender approves it.' });
    }
  }
  for (const id of nextGate.requiredReviewIds) {
    if (requirementIds.indexOf(id) < 0) {
      issues.push({ path: 'nextGate.requiredReviewIds', message: `names ${id}, which approvalRequirements does not carry.` });
    }
  }
  if (issues.length > 0) {
    return { valid: false, errors: formatIssues(issues) };
  }
  return {
    valid: true,
    errors: [],
    value: {
      schemaVersion: MEETING_FOLLOW_THROUGH_SCHEMA_VERSION,
      followThroughId,
      workId: work,
      registerId,
      registerVersion,
      campaignPacket,
      meetingSources,
      decisions,
      actionProposals,
      briefChanges,
      communicationsDrafts,
      unresolvedQuestions,
      risks,
      nextGate,
      approvalRequirements,
      evidenceGaps,
      reviewNeeds,
      createdAt
    }
  };
}

export function validateMeetingFollowThrough(value: unknown): IValidationResult {
  const result: IParseResult<IMeetingFollowThroughV1> = parseMeetingFollowThrough(value);
  return { valid: result.valid, errors: result.errors };
}
