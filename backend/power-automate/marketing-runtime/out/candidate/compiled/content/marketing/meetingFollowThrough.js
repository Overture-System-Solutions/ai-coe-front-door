"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BRIEF_CHANGE_FIELDS = exports.MEETING_FOLLOW_THROUGH_SCHEMA_VERSION = void 0;
exports.parseMeetingFollowThrough = parseMeetingFollowThrough;
exports.validateMeetingFollowThrough = validateMeetingFollowThrough;
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
const artifactTypes_1 = require("./artifactTypes");
const campaignBrief_1 = require("./campaignBrief");
const schema_1 = require("./schema");
exports.MEETING_FOLLOW_THROUGH_SCHEMA_VERSION = '1.0';
exports.BRIEF_CHANGE_FIELDS = ['objective', 'audience', 'painPoints', 'message', 'channelPlan', 'contentCalendar', 'evidenceGaps', 'reviewNeeds', 'proposedOwners', 'dependencies'];
const REQUIRED_KEYS = [
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
function parsePacket(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['brief', 'contentPlan']);
    if (raw === undefined) {
        return undefined;
    }
    const brief = (0, artifactTypes_1.parseArtifactRef)(raw.brief, (0, schema_1.at)(path, 'brief'), issues, 'campaignBrief');
    const contentPlan = raw.contentPlan === null ? null : (0, artifactTypes_1.parseArtifactRef)(raw.contentPlan, (0, schema_1.at)(path, 'contentPlan'), issues, 'contentPlan');
    return brief === undefined || contentPlan === undefined ? undefined : { brief, contentPlan };
}
function parseDecision(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['decisionProposalId', 'classification', 'statement', 'rationale', 'conditions', 'evidence', 'status', 'acceptance', 'reviewRequirementId']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const decisionProposalId = (0, schema_1.canonicalId)(raw.decisionProposalId, (0, schema_1.at)(path, 'decisionProposalId'), issues);
    const classification = (0, schema_1.oneOf)(raw.classification, (0, schema_1.at)(path, 'classification'), issues, ['reportedDecision', 'proposedDecision']);
    const statement = (0, campaignBrief_1.parseClaim)(raw.statement, (0, schema_1.at)(path, 'statement'), issues);
    const rationale = (0, campaignBrief_1.parseClaim)(raw.rationale, (0, schema_1.at)(path, 'rationale'), issues);
    const conditions = (0, campaignBrief_1.parseClaims)(raw.conditions, (0, schema_1.at)(path, 'conditions'), issues);
    const evidence = (0, artifactTypes_1.parseSourceLocators)(raw.evidence, (0, schema_1.at)(path, 'evidence'), issues, { minItems: 1 });
    const status = (0, schema_1.oneOf)(raw.status, (0, schema_1.at)(path, 'status'), issues, ['proposed', 'accepted']);
    let acceptance;
    if (raw.acceptance === null) {
        acceptance = null;
    }
    else {
        const acceptanceRaw = (0, schema_1.strictObject)(raw.acceptance, (0, schema_1.at)(path, 'acceptance'), issues, ['decisionRecordRef']);
        const ref = acceptanceRaw === undefined ? undefined : (0, schema_1.canonicalId)(acceptanceRaw.decisionRecordRef, (0, schema_1.at)((0, schema_1.at)(path, 'acceptance'), 'decisionRecordRef'), issues);
        acceptance = ref === undefined ? undefined : { decisionRecordRef: ref };
    }
    if (status === 'accepted' && acceptance === null) {
        issues.push({ path: (0, schema_1.at)(path, 'status'), message: 'is accepted without a separate meeting-owner decision record; a draft cannot accept itself.' });
    }
    if (status === 'proposed' && acceptance !== null && acceptance !== undefined) {
        issues.push({ path: (0, schema_1.at)(path, 'acceptance'), message: 'names a decision record while the status is still proposed.' });
    }
    const reviewRequirementId = (0, schema_1.canonicalId)(raw.reviewRequirementId, (0, schema_1.at)(path, 'reviewRequirementId'), issues);
    if (issues.length !== before || decisionProposalId === undefined || classification === undefined || statement === undefined || rationale === undefined || conditions === undefined || evidence === undefined || status === undefined || acceptance === undefined || reviewRequirementId === undefined) {
        return undefined;
    }
    return { decisionProposalId, classification, statement, rationale, conditions, evidence, status, acceptance, reviewRequirementId };
}
function parseAction(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['actionProposalId', 'description', 'suggestedOwner', 'proposedTiming', 'dependencyIds', 'evidence', 'requiredConfirmation', 'reviewRequirementId']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const actionProposalId = (0, schema_1.canonicalId)(raw.actionProposalId, (0, schema_1.at)(path, 'actionProposalId'), issues);
    const description = (0, campaignBrief_1.parseClaim)(raw.description, (0, schema_1.at)(path, 'description'), issues);
    const suggestedOwner = raw.suggestedOwner === null ? null : (0, campaignBrief_1.parseProposedOwner)(raw.suggestedOwner, (0, schema_1.at)(path, 'suggestedOwner'), issues);
    const proposedTiming = (0, artifactTypes_1.parseProposedTiming)(raw.proposedTiming, (0, schema_1.at)(path, 'proposedTiming'), issues);
    const dependencyIds = (0, schema_1.textList)(raw.dependencyIds, (0, schema_1.at)(path, 'dependencyIds'), issues);
    const evidence = (0, artifactTypes_1.parseSourceLocators)(raw.evidence, (0, schema_1.at)(path, 'evidence'), issues, { minItems: 1 });
    const requiredConfirmation = (0, schema_1.text)(raw.requiredConfirmation, (0, schema_1.at)(path, 'requiredConfirmation'), issues);
    const reviewRequirementId = (0, schema_1.canonicalId)(raw.reviewRequirementId, (0, schema_1.at)(path, 'reviewRequirementId'), issues);
    if (issues.length !== before || actionProposalId === undefined || description === undefined || suggestedOwner === undefined || proposedTiming === undefined || dependencyIds === undefined || evidence === undefined || requiredConfirmation === undefined || reviewRequirementId === undefined) {
        return undefined;
    }
    return { actionProposalId, description, suggestedOwner, proposedTiming, dependencyIds, evidence, requiredConfirmation, reviewRequirementId };
}
/** The proposed value must have the type the target field has in `CampaignBrief.v1`; arbitrary JSON is refused. */
function parseBriefChangeValue(field, value, path, issues) {
    switch (field) {
        case 'objective':
            return (0, schema_1.text)(value, path, issues);
        case 'audience':
        case 'painPoints':
        case 'channelPlan':
        case 'reviewNeeds':
            return (0, schema_1.textList)(value, path, issues, { minItems: 1 });
        case 'evidenceGaps':
        case 'dependencies':
            return (0, schema_1.textList)(value, path, issues);
        case 'message':
            return (0, campaignBrief_1.parseClaims)(value, path, issues, { minItems: 1 });
        case 'contentCalendar':
            return (0, schema_1.list)(value, path, issues, (item, itemPath) => (0, campaignBrief_1.parseCalendarEntry)(item, itemPath, issues));
        case 'proposedOwners':
            return (0, schema_1.list)(value, path, issues, (item, itemPath) => (0, campaignBrief_1.parseProposedOwner)(item, itemPath, issues));
        default: {
            const exhaustive = field;
            issues.push({ path, message: `targets an unknown field ${String(exhaustive)}.` });
            return undefined;
        }
    }
}
function parseBriefChange(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['changeProposalId', 'targetBrief', 'field', 'proposedValue', 'rationale', 'evidence', 'reviewRequirementId']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const changeProposalId = (0, schema_1.canonicalId)(raw.changeProposalId, (0, schema_1.at)(path, 'changeProposalId'), issues);
    const targetBrief = (0, artifactTypes_1.parseArtifactRef)(raw.targetBrief, (0, schema_1.at)(path, 'targetBrief'), issues, 'campaignBrief');
    const field = (0, schema_1.oneOf)(raw.field, (0, schema_1.at)(path, 'field'), issues, exports.BRIEF_CHANGE_FIELDS);
    const proposedValue = field === undefined ? undefined : parseBriefChangeValue(field, raw.proposedValue, (0, schema_1.at)(path, 'proposedValue'), issues);
    const rationale = (0, campaignBrief_1.parseClaim)(raw.rationale, (0, schema_1.at)(path, 'rationale'), issues);
    const evidence = (0, artifactTypes_1.parseSourceLocators)(raw.evidence, (0, schema_1.at)(path, 'evidence'), issues, { minItems: 1 });
    const reviewRequirementId = (0, schema_1.canonicalId)(raw.reviewRequirementId, (0, schema_1.at)(path, 'reviewRequirementId'), issues);
    if (issues.length !== before || changeProposalId === undefined || targetBrief === undefined || field === undefined || proposedValue === undefined || rationale === undefined || evidence === undefined || reviewRequirementId === undefined) {
        return undefined;
    }
    return { changeProposalId, targetBrief, field, proposedValue, rationale, evidence, reviewRequirementId };
}
function parseCommunication(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['communicationDraftId', 'channel', 'proposedAudience', 'subject', 'body', 'proposedCta', 'proposedDestination', 'sourceRefs', 'requiredSenderApproval', 'reviewRequirementIds', 'sent']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const communicationDraftId = (0, schema_1.canonicalId)(raw.communicationDraftId, (0, schema_1.at)(path, 'communicationDraftId'), issues);
    const channel = (0, schema_1.oneOf)(raw.channel, (0, schema_1.at)(path, 'channel'), issues, ['emailDraft', 'teamsDraft', 'other']);
    const proposedAudience = (0, schema_1.textList)(raw.proposedAudience, (0, schema_1.at)(path, 'proposedAudience'), issues, { minItems: 1 });
    if (proposedAudience !== undefined && proposedAudience.filter((item) => item.indexOf('@') >= 0).length > 0) {
        issues.push({ path: (0, schema_1.at)(path, 'proposedAudience'), message: 'reads as addresses; an audience is a description, never live recipients.' });
    }
    const subject = (0, campaignBrief_1.parseClaim)(raw.subject, (0, schema_1.at)(path, 'subject'), issues);
    const body = (0, campaignBrief_1.parseClaims)(raw.body, (0, schema_1.at)(path, 'body'), issues, { minItems: 1 });
    const proposedCta = (0, campaignBrief_1.parseClaim)(raw.proposedCta, (0, schema_1.at)(path, 'proposedCta'), issues);
    const proposedDestination = (0, campaignBrief_1.parseClaim)(raw.proposedDestination, (0, schema_1.at)(path, 'proposedDestination'), issues);
    const refs = (0, schema_1.sourceRefs)(raw.sourceRefs, (0, schema_1.at)(path, 'sourceRefs'), issues);
    const requiredSenderApproval = (0, schema_1.text)(raw.requiredSenderApproval, (0, schema_1.at)(path, 'requiredSenderApproval'), issues);
    const reviewRequirementIds = (0, schema_1.textList)(raw.reviewRequirementIds, (0, schema_1.at)(path, 'reviewRequirementIds'), issues, { minItems: 1 });
    (0, schema_1.literal)(raw.sent, (0, schema_1.at)(path, 'sent'), issues, false);
    if (issues.length !== before || communicationDraftId === undefined || channel === undefined || proposedAudience === undefined || subject === undefined || body === undefined || proposedCta === undefined || proposedDestination === undefined || refs === undefined || requiredSenderApproval === undefined || reviewRequirementIds === undefined) {
        return undefined;
    }
    return { communicationDraftId, channel, proposedAudience, subject, body, proposedCta, proposedDestination, sourceRefs: refs, requiredSenderApproval, reviewRequirementIds, sent: false };
}
function parseQuestion(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['questionId', 'question', 'suggestedRole']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const questionId = (0, schema_1.canonicalId)(raw.questionId, (0, schema_1.at)(path, 'questionId'), issues);
    const question = (0, campaignBrief_1.parseClaim)(raw.question, (0, schema_1.at)(path, 'question'), issues);
    const suggestedRole = raw.suggestedRole === null ? null : (0, campaignBrief_1.parseProposedOwner)(raw.suggestedRole, (0, schema_1.at)(path, 'suggestedRole'), issues);
    return issues.length !== before || questionId === undefined || question === undefined || suggestedRole === undefined ? undefined : { questionId, question, suggestedRole };
}
function parseNextGate(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['description', 'requiredReviewIds']);
    if (raw === undefined) {
        return undefined;
    }
    const description = (0, campaignBrief_1.parseClaim)(raw.description, (0, schema_1.at)(path, 'description'), issues);
    const requiredReviewIds = (0, schema_1.textList)(raw.requiredReviewIds, (0, schema_1.at)(path, 'requiredReviewIds'), issues);
    return description === undefined || requiredReviewIds === undefined ? undefined : { description, requiredReviewIds };
}
/** Every evidence locator of a proposal must name a source the artifact's meeting sources carry at the same version. */
function checkEvidenceSources(evidence, meetingSources, path, issues) {
    for (let index = 0; index < evidence.length; index += 1) {
        const found = meetingSources.filter((source) => source.source.sourceId === evidence[index].source.sourceId && source.source.versionOrETag === evidence[index].source.versionOrETag).length > 0;
        if (!found) {
            issues.push({ path: (0, schema_1.at)(path, index), message: `cites ${evidence[index].source.sourceId}, which is not among the permitted meeting sources of this run.` });
        }
    }
}
/** Reads an untrusted value as a `MeetingFollowThrough.v1`, including every traceability invariant. */
function parseMeetingFollowThrough(value) {
    const issues = [];
    const raw = (0, schema_1.strictObject)(value, '', issues, REQUIRED_KEYS);
    if (raw === undefined) {
        return { valid: false, errors: (0, schema_1.formatIssues)(issues) };
    }
    (0, schema_1.forbidKeysDeep)(raw, '', issues);
    (0, schema_1.literal)(raw.schemaVersion, 'schemaVersion', issues, exports.MEETING_FOLLOW_THROUGH_SCHEMA_VERSION);
    const followThroughId = (0, schema_1.canonicalId)(raw.followThroughId, 'followThroughId', issues);
    const work = (0, schema_1.workId)(raw.workId, 'workId', issues);
    const registerId = (0, schema_1.text)(raw.registerId, 'registerId', issues, { max: 256 });
    const registerVersion = (0, schema_1.text)(raw.registerVersion, 'registerVersion', issues, { max: 256 });
    const campaignPacket = parsePacket(raw.campaignPacket, 'campaignPacket', issues);
    const meetingSources = (0, artifactTypes_1.parseSourceLocators)(raw.meetingSources, 'meetingSources', issues, { minItems: 1 });
    const decisions = (0, schema_1.list)(raw.decisions, 'decisions', issues, (item, itemPath) => parseDecision(item, itemPath, issues));
    const actionProposals = (0, schema_1.list)(raw.actionProposals, 'actionProposals', issues, (item, itemPath) => parseAction(item, itemPath, issues));
    const briefChanges = (0, schema_1.list)(raw.briefChanges, 'briefChanges', issues, (item, itemPath) => parseBriefChange(item, itemPath, issues));
    const communicationsDrafts = (0, schema_1.list)(raw.communicationsDrafts, 'communicationsDrafts', issues, (item, itemPath) => parseCommunication(item, itemPath, issues));
    const unresolvedQuestions = (0, schema_1.list)(raw.unresolvedQuestions, 'unresolvedQuestions', issues, (item, itemPath) => parseQuestion(item, itemPath, issues));
    const risks = (0, campaignBrief_1.parseClaims)(raw.risks, 'risks', issues);
    const nextGate = parseNextGate(raw.nextGate, 'nextGate', issues);
    const approvalRequirements = (0, schema_1.list)(raw.approvalRequirements, 'approvalRequirements', issues, (item, itemPath) => (0, artifactTypes_1.parseReviewRequirement)(item, itemPath, issues));
    const evidenceGaps = (0, schema_1.textList)(raw.evidenceGaps, 'evidenceGaps', issues);
    const reviewNeeds = (0, schema_1.textList)(raw.reviewNeeds, 'reviewNeeds', issues, { minItems: 1 });
    const createdAt = (0, schema_1.isoDateTime)(raw.createdAt, 'createdAt', issues);
    if (issues.length > 0 ||
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
        createdAt === undefined) {
        return { valid: false, errors: (0, schema_1.formatIssues)(issues) };
    }
    const requirementIds = approvalRequirements.map((requirement) => requirement.requirementId);
    const decisionIds = decisions.map((decision) => decision.decisionProposalId);
    const actionIds = actionProposals.map((action) => action.actionProposalId);
    const changeIds = briefChanges.map((change) => change.changeProposalId);
    const draftIds = communicationsDrafts.map((draft) => draft.communicationDraftId);
    (0, artifactTypes_1.checkUniqueIds)(requirementIds, 'approvalRequirements', issues);
    (0, artifactTypes_1.checkUniqueIds)(decisionIds, 'decisions', issues);
    (0, artifactTypes_1.checkUniqueIds)(actionIds, 'actionProposals', issues);
    (0, artifactTypes_1.checkUniqueIds)(changeIds, 'briefChanges', issues);
    (0, artifactTypes_1.checkUniqueIds)(draftIds, 'communicationsDrafts', issues);
    (0, artifactTypes_1.checkUniqueIds)(unresolvedQuestions.map((question) => question.questionId), 'unresolvedQuestions', issues);
    const scopeIds = [followThroughId].concat(decisionIds, actionIds, changeIds, draftIds);
    (0, artifactTypes_1.checkScopeRefs)(approvalRequirements, scopeIds, 'approvalRequirements', issues);
    const requireKind = (id, kind, path) => {
        const kinds = Array.isArray(kind) ? kind : [kind];
        const found = approvalRequirements.filter((requirement) => requirement.requirementId === id)[0];
        if (found === undefined) {
            issues.push({ path, message: `names ${id}, which approvalRequirements does not carry.` });
        }
        else if (kinds.indexOf(found.reviewKind) < 0) {
            issues.push({ path, message: `names ${id}, which is a ${found.reviewKind} review; ${kinds.join(' or ')} is required here.` });
        }
    };
    for (let index = 0; index < decisions.length; index += 1) {
        checkEvidenceSources(decisions[index].evidence, meetingSources, `decisions[${index}].evidence`, issues);
        requireKind(decisions[index].reviewRequirementId, 'meetingDecisionsActions', `decisions[${index}].reviewRequirementId`);
    }
    for (let index = 0; index < actionProposals.length; index += 1) {
        checkEvidenceSources(actionProposals[index].evidence, meetingSources, `actionProposals[${index}].evidence`, issues);
        requireKind(actionProposals[index].reviewRequirementId, 'meetingDecisionsActions', `actionProposals[${index}].reviewRequirementId`);
        for (const id of actionProposals[index].dependencyIds) {
            if (actionIds.indexOf(id) < 0 && decisionIds.indexOf(id) < 0) {
                issues.push({ path: `actionProposals[${index}].dependencyIds`, message: `names ${id}, which is neither an action nor a decision of this artifact.` });
            }
        }
    }
    for (let index = 0; index < briefChanges.length; index += 1) {
        checkEvidenceSources(briefChanges[index].evidence, meetingSources, `briefChanges[${index}].evidence`, issues);
        requireKind(briefChanges[index].reviewRequirementId, ['meetingDecisionsActions', 'strategyVoice'], `briefChanges[${index}].reviewRequirementId`);
        if (briefChanges[index].targetBrief.artifactId !== campaignPacket.brief.artifactId) {
            issues.push({ path: `briefChanges[${index}].targetBrief`, message: 'names a brief other than the one in this campaign packet.' });
        }
        if (briefChanges[index].targetBrief.revision !== campaignPacket.brief.revision) {
            issues.push({ path: `briefChanges[${index}].targetBrief.revision`, message: 'names a revision other than the current packet revision; a proposal targets what is current.' });
        }
    }
    for (let index = 0; index < communicationsDrafts.length; index += 1) {
        let senderReview = false;
        for (const id of communicationsDrafts[index].reviewRequirementIds) {
            const found = approvalRequirements.filter((requirement) => requirement.requirementId === id)[0];
            if (found === undefined) {
                issues.push({ path: `communicationsDrafts[${index}].reviewRequirementIds`, message: `names ${id}, which approvalRequirements does not carry.` });
            }
            else if (found.reviewKind === 'communicationsSend') {
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
        return { valid: false, errors: (0, schema_1.formatIssues)(issues) };
    }
    return {
        valid: true,
        errors: [],
        value: {
            schemaVersion: exports.MEETING_FOLLOW_THROUGH_SCHEMA_VERSION,
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
function validateMeetingFollowThrough(value) {
    const result = parseMeetingFollowThrough(value);
    return { valid: result.valid, errors: result.errors };
}
