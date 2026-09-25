"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REVIEW_KINDS = exports.ARTIFACT_KINDS = void 0;
exports.parseArtifactRef = parseArtifactRef;
exports.parseAcceptedBriefRef = parseAcceptedBriefRef;
exports.parseReviewRequirement = parseReviewRequirement;
exports.parseProposedOwnerForScope = parseProposedOwnerForScope;
exports.parseDependency = parseDependency;
exports.parseSourceLocator = parseSourceLocator;
exports.parseSourceLocators = parseSourceLocators;
exports.parseProposedTiming = parseProposedTiming;
exports.checkScopeRefs = checkScopeRefs;
exports.checkUniqueIds = checkUniqueIds;
const campaignBrief_1 = require("./campaignBrief");
const schema_1 = require("./schema");
exports.ARTIFACT_KINDS = ['campaignBrief', 'contentPlan', 'meetingFollowThrough'];
exports.REVIEW_KINDS = ['strategyVoice', 'copyChannel', 'meetingDecisionsActions', 'communicationsSend', 'release'];
function parseArtifactRef(value, path, issues, kind) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['kind', 'artifactId', 'revision', 'payloadHash']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const parsedKind = kind === undefined ? (0, schema_1.oneOf)(raw.kind, (0, schema_1.at)(path, 'kind'), issues, exports.ARTIFACT_KINDS) : (0, schema_1.literal)(raw.kind, (0, schema_1.at)(path, 'kind'), issues, kind);
    const artifactId = (0, schema_1.canonicalId)(raw.artifactId, (0, schema_1.at)(path, 'artifactId'), issues);
    const revision = (0, schema_1.integer)(raw.revision, (0, schema_1.at)(path, 'revision'), issues, { min: 1 });
    const payloadHash = (0, schema_1.sha256)(raw.payloadHash, (0, schema_1.at)(path, 'payloadHash'), issues);
    if (issues.length !== before || parsedKind === undefined || artifactId === undefined || revision === undefined || payloadHash === undefined) {
        return undefined;
    }
    return { kind: parsedKind, artifactId, revision, payloadHash };
}
function parseAcceptedBriefRef(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['kind', 'artifactId', 'revision', 'payloadHash', 'acceptanceReceiptId']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    (0, schema_1.literal)(raw.kind, (0, schema_1.at)(path, 'kind'), issues, 'campaignBrief');
    const artifactId = (0, schema_1.canonicalId)(raw.artifactId, (0, schema_1.at)(path, 'artifactId'), issues);
    const revision = (0, schema_1.integer)(raw.revision, (0, schema_1.at)(path, 'revision'), issues, { min: 1 });
    const payloadHash = (0, schema_1.sha256)(raw.payloadHash, (0, schema_1.at)(path, 'payloadHash'), issues);
    const acceptanceReceiptId = (0, schema_1.canonicalId)(raw.acceptanceReceiptId, (0, schema_1.at)(path, 'acceptanceReceiptId'), issues);
    if (issues.length !== before || artifactId === undefined || revision === undefined || payloadHash === undefined || acceptanceReceiptId === undefined) {
        return undefined;
    }
    return { kind: 'campaignBrief', artifactId, revision, payloadHash, acceptanceReceiptId };
}
function parseReviewRequirement(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['requirementId', 'reviewKind', 'scopeRefs', 'requiredRole', 'authorityBindingRef', 'blockingReason']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const requirementId = (0, schema_1.canonicalId)(raw.requirementId, (0, schema_1.at)(path, 'requirementId'), issues);
    const reviewKind = (0, schema_1.oneOf)(raw.reviewKind, (0, schema_1.at)(path, 'reviewKind'), issues, exports.REVIEW_KINDS);
    const scopeRefs = (0, schema_1.textList)(raw.scopeRefs, (0, schema_1.at)(path, 'scopeRefs'), issues, { minItems: 1 });
    const requiredRole = (0, schema_1.text)(raw.requiredRole, (0, schema_1.at)(path, 'requiredRole'), issues, { max: 200 });
    const authorityBindingRef = raw.authorityBindingRef === null ? null : (0, schema_1.text)(raw.authorityBindingRef, (0, schema_1.at)(path, 'authorityBindingRef'), issues, { max: 256 });
    const blockingReason = (0, schema_1.text)(raw.blockingReason, (0, schema_1.at)(path, 'blockingReason'), issues);
    if (requiredRole !== undefined && requiredRole.indexOf('@') >= 0) {
        issues.push({ path: (0, schema_1.at)(path, 'requiredRole'), message: 'reads as an address; a requirement names a role, never a person.' });
    }
    if (issues.length !== before || requirementId === undefined || reviewKind === undefined || scopeRefs === undefined || requiredRole === undefined || authorityBindingRef === undefined || blockingReason === undefined) {
        return undefined;
    }
    return { requirementId, reviewKind, scopeRefs, requiredRole, authorityBindingRef, blockingReason };
}
function parseProposedOwnerForScope(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['scopeRefs', 'owner']);
    if (raw === undefined) {
        return undefined;
    }
    const scopeRefs = (0, schema_1.textList)(raw.scopeRefs, (0, schema_1.at)(path, 'scopeRefs'), issues, { minItems: 1 });
    const owner = (0, campaignBrief_1.parseProposedOwner)(raw.owner, (0, schema_1.at)(path, 'owner'), issues);
    return scopeRefs === undefined || owner === undefined ? undefined : { scopeRefs, owner };
}
function parseDependency(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['dependencyId', 'scopeRefs', 'description', 'relatedArtifact', 'status']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const dependencyId = (0, schema_1.canonicalId)(raw.dependencyId, (0, schema_1.at)(path, 'dependencyId'), issues);
    const scopeRefs = (0, schema_1.textList)(raw.scopeRefs, (0, schema_1.at)(path, 'scopeRefs'), issues);
    const description = (0, campaignBrief_1.parseClaim)(raw.description, (0, schema_1.at)(path, 'description'), issues);
    const relatedArtifact = raw.relatedArtifact === null ? null : parseArtifactRef(raw.relatedArtifact, (0, schema_1.at)(path, 'relatedArtifact'), issues);
    const status = (0, schema_1.oneOf)(raw.status, (0, schema_1.at)(path, 'status'), issues, ['open', 'blocker', 'unknown', 'resolved']);
    if (issues.length !== before || dependencyId === undefined || scopeRefs === undefined || description === undefined || relatedArtifact === undefined || status === undefined) {
        return undefined;
    }
    return { dependencyId, scopeRefs, description, relatedArtifact, status };
}
function parseSourceLocator(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['source', 'locator']);
    if (raw === undefined) {
        return undefined;
    }
    const source = (0, schema_1.sourceRef)(raw.source, (0, schema_1.at)(path, 'source'), issues);
    const locator = (0, schema_1.text)(raw.locator, (0, schema_1.at)(path, 'locator'), issues, { max: 400 });
    return source === undefined || locator === undefined ? undefined : { source, locator };
}
function parseSourceLocators(value, path, issues, options = {}) {
    return (0, schema_1.list)(value, path, issues, (item, itemPath) => parseSourceLocator(item, itemPath, issues), options);
}
function parseProposedTiming(value, path, issues) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        issues.push({ path, message: 'must be an object with a kind of phaseWeek, sourceDate or unknown.' });
        return undefined;
    }
    const kind = value.kind;
    if (kind === 'phaseWeek') {
        const raw = (0, schema_1.strictObject)(value, path, issues, ['kind', 'phase', 'weekOffset']);
        if (raw === undefined) {
            return undefined;
        }
        const phase = (0, schema_1.text)(raw.phase, (0, schema_1.at)(path, 'phase'), issues, { max: 200 });
        const weekOffset = (0, schema_1.integer)(raw.weekOffset, (0, schema_1.at)(path, 'weekOffset'), issues, { min: 0 });
        return phase === undefined || weekOffset === undefined ? undefined : { kind: 'phaseWeek', phase, weekOffset };
    }
    if (kind === 'sourceDate') {
        const raw = (0, schema_1.strictObject)(value, path, issues, ['kind', 'date', 'source']);
        if (raw === undefined) {
            return undefined;
        }
        const date = (0, schema_1.isoDay)(raw.date, (0, schema_1.at)(path, 'date'), issues);
        const source = parseSourceLocator(raw.source, (0, schema_1.at)(path, 'source'), issues);
        return date === undefined || source === undefined ? undefined : { kind: 'sourceDate', date, source };
    }
    if (kind === 'unknown') {
        const raw = (0, schema_1.strictObject)(value, path, issues, ['kind', 'reason']);
        if (raw === undefined) {
            return undefined;
        }
        const reason = (0, schema_1.sentinel)(raw.reason, (0, schema_1.at)(path, 'reason'), issues);
        return reason === undefined ? undefined : { kind: 'unknown', reason };
    }
    issues.push({ path: (0, schema_1.at)(path, 'kind'), message: 'must be phaseWeek, sourceDate or unknown; a calendar date needs a separately approved start.' });
    return undefined;
}
/** Every scope reference of a set of requirements must name something the artifact carries. */
function checkScopeRefs(requirements, known, path, issues) {
    for (let index = 0; index < requirements.length; index += 1) {
        for (let refIndex = 0; refIndex < requirements[index].scopeRefs.length; refIndex += 1) {
            const ref = requirements[index].scopeRefs[refIndex];
            if (known.indexOf(ref) < 0) {
                issues.push({ path: (0, schema_1.at)((0, schema_1.at)((0, schema_1.at)(path, index), 'scopeRefs'), refIndex), message: `names ${ref}, which this artifact does not carry.` });
            }
        }
    }
}
/** Ids within one artifact are unique in their scope. */
function checkUniqueIds(ids, path, issues) {
    const seen = [];
    for (let index = 0; index < ids.length; index += 1) {
        if (seen.indexOf(ids[index]) >= 0) {
            issues.push({ path: (0, schema_1.at)(path, index), message: `repeats the id ${ids[index]}.` });
        }
        seen.push(ids[index]);
    }
}
