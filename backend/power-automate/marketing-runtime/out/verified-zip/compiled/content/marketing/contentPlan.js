"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSET_FORMATS = exports.CONTENT_PLAN_SCHEMA_VERSION = void 0;
exports.parseContentPlan = parseContentPlan;
exports.validateContentPlan = validateContentPlan;
const artifactTypes_1 = require("./artifactTypes");
const campaignBrief_1 = require("./campaignBrief");
const schema_1 = require("./schema");
exports.CONTENT_PLAN_SCHEMA_VERSION = '1.0';
exports.ASSET_FORMATS = ['briefingNote', 'newsletter', 'intranetPage', 'teamsDraft', 'emailDraft', 'other'];
const REQUIRED_KEYS = [
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
function parseDestination(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['destinationId', 'label', 'href', 'sourceRefs'], ['unknown']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    (0, schema_1.literal)(raw.destinationId, (0, schema_1.at)(path, 'destinationId'), issues, 'primary');
    const label = (0, schema_1.text)(raw.label, (0, schema_1.at)(path, 'label'), issues, { max: 200 });
    const href = (0, schema_1.safeHrefOrNull)(raw.href, (0, schema_1.at)(path, 'href'), issues);
    const refs = (0, schema_1.sourceRefs)(raw.sourceRefs, (0, schema_1.at)(path, 'sourceRefs'), issues);
    const unknown = raw.unknown === undefined ? undefined : (0, schema_1.sentinel)(raw.unknown, (0, schema_1.at)(path, 'unknown'), issues);
    if (href === null && unknown === undefined) {
        issues.push({ path: (0, schema_1.at)(path, 'href'), message: 'is null, so the destination must be marked unknown rather than left silent.' });
    }
    if (issues.length !== before || label === undefined || href === undefined || refs === undefined) {
        return undefined;
    }
    const destination = { destinationId: 'primary', label, href, sourceRefs: refs };
    if (unknown !== undefined) {
        destination.unknown = unknown;
    }
    return destination;
}
function parseCta(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['ctaId', 'label', 'destinationId']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    (0, schema_1.literal)(raw.ctaId, (0, schema_1.at)(path, 'ctaId'), issues, 'primary');
    (0, schema_1.literal)(raw.destinationId, (0, schema_1.at)(path, 'destinationId'), issues, 'primary');
    const label = (0, schema_1.text)(raw.label, (0, schema_1.at)(path, 'label'), issues, { max: 200 });
    return issues.length !== before || label === undefined ? undefined : { ctaId: 'primary', label, destinationId: 'primary' };
}
function parseAsset(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, [
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
    const before = issues.length;
    const assetId = (0, schema_1.canonicalId)(raw.assetId, (0, schema_1.at)(path, 'assetId'), issues);
    const name = (0, schema_1.text)(raw.name, (0, schema_1.at)(path, 'name'), issues, { max: 200 });
    const format = (0, schema_1.oneOf)(raw.format, (0, schema_1.at)(path, 'format'), issues, exports.ASSET_FORMATS);
    const purpose = (0, schema_1.text)(raw.purpose, (0, schema_1.at)(path, 'purpose'), issues);
    const audience = (0, schema_1.textList)(raw.audience, (0, schema_1.at)(path, 'audience'), issues, { minItems: 1 });
    const channel = (0, schema_1.text)(raw.channel, (0, schema_1.at)(path, 'channel'), issues, { max: 200 });
    const channelOwnerBindingRef = raw.channelOwnerBindingRef === null ? null : (0, schema_1.text)(raw.channelOwnerBindingRef, (0, schema_1.at)(path, 'channelOwnerBindingRef'), issues, { max: 256 });
    (0, schema_1.literal)(raw.destinationId, (0, schema_1.at)(path, 'destinationId'), issues, 'primary');
    (0, schema_1.literal)(raw.ctaId, (0, schema_1.at)(path, 'ctaId'), issues, 'primary');
    const refs = (0, schema_1.sourceRefs)(raw.sourceRefs, (0, schema_1.at)(path, 'sourceRefs'), issues);
    const accessibilityRequirements = (0, schema_1.textList)(raw.accessibilityRequirements, (0, schema_1.at)(path, 'accessibilityRequirements'), issues, { minItems: 1 });
    const reviewRequirementIds = (0, schema_1.textList)(raw.reviewRequirementIds, (0, schema_1.at)(path, 'reviewRequirementIds'), issues, { minItems: 1 });
    if (issues.length !== before || assetId === undefined || name === undefined || format === undefined || purpose === undefined || audience === undefined || channel === undefined || channelOwnerBindingRef === undefined || refs === undefined || accessibilityRequirements === undefined || reviewRequirementIds === undefined) {
        return undefined;
    }
    return { assetId, name, format, purpose, audience, channel, channelOwnerBindingRef, destinationId: 'primary', ctaId: 'primary', sourceRefs: refs, accessibilityRequirements, reviewRequirementIds };
}
function parseAccessibility(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['altText', 'linkLabel', 'reviewState']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const altText = raw.altText === null ? null : (0, schema_1.text)(raw.altText, (0, schema_1.at)(path, 'altText'), issues, { max: 400 });
    const linkLabel = (0, schema_1.text)(raw.linkLabel, (0, schema_1.at)(path, 'linkLabel'), issues, { max: 200 });
    const reviewState = (0, schema_1.oneOf)(raw.reviewState, (0, schema_1.at)(path, 'reviewState'), issues, ['pending', 'reviewRequested']);
    return issues.length !== before || altText === undefined || linkLabel === undefined || reviewState === undefined ? undefined : { altText, linkLabel, reviewState };
}
function parseVariant(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['variantId', 'assetId', 'channel', 'audience', 'headline', 'body', 'ctaId', 'accessibility']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const variantId = (0, schema_1.canonicalId)(raw.variantId, (0, schema_1.at)(path, 'variantId'), issues);
    const assetId = (0, schema_1.canonicalId)(raw.assetId, (0, schema_1.at)(path, 'assetId'), issues);
    const channel = (0, schema_1.text)(raw.channel, (0, schema_1.at)(path, 'channel'), issues, { max: 200 });
    const audience = (0, schema_1.textList)(raw.audience, (0, schema_1.at)(path, 'audience'), issues, { minItems: 1 });
    const headline = (0, campaignBrief_1.parseClaim)(raw.headline, (0, schema_1.at)(path, 'headline'), issues);
    const body = (0, campaignBrief_1.parseClaims)(raw.body, (0, schema_1.at)(path, 'body'), issues, { minItems: 1 });
    (0, schema_1.literal)(raw.ctaId, (0, schema_1.at)(path, 'ctaId'), issues, 'primary');
    const accessibility = parseAccessibility(raw.accessibility, (0, schema_1.at)(path, 'accessibility'), issues);
    if (issues.length !== before || variantId === undefined || assetId === undefined || channel === undefined || audience === undefined || headline === undefined || body === undefined || accessibility === undefined) {
        return undefined;
    }
    return { variantId, assetId, channel, audience, headline, body, ctaId: 'primary', accessibility };
}
function parsePlanCalendarEntry(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['entryId', 'phase', 'weekOffset', 'item', 'assetIds', 'dependencyIds']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const entryId = (0, schema_1.canonicalId)(raw.entryId, (0, schema_1.at)(path, 'entryId'), issues);
    const phase = (0, schema_1.text)(raw.phase, (0, schema_1.at)(path, 'phase'), issues, { max: 200 });
    const weekOffset = (0, schema_1.integer)(raw.weekOffset, (0, schema_1.at)(path, 'weekOffset'), issues, { min: 0 });
    const item = (0, schema_1.text)(raw.item, (0, schema_1.at)(path, 'item'), issues);
    const assetIds = (0, schema_1.textList)(raw.assetIds, (0, schema_1.at)(path, 'assetIds'), issues, { minItems: 1 });
    const dependencyIds = (0, schema_1.textList)(raw.dependencyIds, (0, schema_1.at)(path, 'dependencyIds'), issues);
    if (issues.length !== before || entryId === undefined || phase === undefined || weekOffset === undefined || item === undefined || assetIds === undefined || dependencyIds === undefined) {
        return undefined;
    }
    return { entryId, phase, weekOffset, item, assetIds, dependencyIds };
}
/** Reads an untrusted value as a `ContentPlan.v1`, including every cross-reference invariant. */
function parseContentPlan(value) {
    const issues = [];
    const raw = (0, schema_1.strictObject)(value, '', issues, REQUIRED_KEYS);
    if (raw === undefined) {
        return { valid: false, errors: (0, schema_1.formatIssues)(issues) };
    }
    (0, schema_1.forbidKeysDeep)(raw, '', issues);
    (0, schema_1.literal)(raw.schemaVersion, 'schemaVersion', issues, exports.CONTENT_PLAN_SCHEMA_VERSION);
    const planId = (0, schema_1.canonicalId)(raw.planId, 'planId', issues);
    const work = (0, schema_1.workId)(raw.workId, 'workId', issues);
    const registerId = (0, schema_1.text)(raw.registerId, 'registerId', issues, { max: 256 });
    const registerVersion = (0, schema_1.text)(raw.registerVersion, 'registerVersion', issues, { max: 256 });
    const acceptedBrief = (0, artifactTypes_1.parseAcceptedBriefRef)(raw.acceptedBrief, 'acceptedBrief', issues);
    const primaryDestination = parseDestination(raw.primaryDestination, 'primaryDestination', issues);
    const primaryCta = parseCta(raw.primaryCta, 'primaryCta', issues);
    const assetRegister = (0, schema_1.list)(raw.assetRegister, 'assetRegister', issues, (item, itemPath) => parseAsset(item, itemPath, issues), { minItems: 1 });
    const copyVariants = (0, schema_1.list)(raw.copyVariants, 'copyVariants', issues, (item, itemPath) => parseVariant(item, itemPath, issues), { minItems: 1 });
    const contentCalendar = (0, schema_1.list)(raw.contentCalendar, 'contentCalendar', issues, (item, itemPath) => parsePlanCalendarEntry(item, itemPath, issues));
    const proposedOwners = (0, schema_1.list)(raw.proposedOwners, 'proposedOwners', issues, (item, itemPath) => (0, artifactTypes_1.parseProposedOwnerForScope)(item, itemPath, issues));
    const dependencies = (0, schema_1.list)(raw.dependencies, 'dependencies', issues, (item, itemPath) => (0, artifactTypes_1.parseDependency)(item, itemPath, issues));
    const approvalRequirements = (0, schema_1.list)(raw.approvalRequirements, 'approvalRequirements', issues, (item, itemPath) => (0, artifactTypes_1.parseReviewRequirement)(item, itemPath, issues));
    const evidenceGaps = (0, schema_1.textList)(raw.evidenceGaps, 'evidenceGaps', issues);
    const reviewNeeds = (0, schema_1.textList)(raw.reviewNeeds, 'reviewNeeds', issues, { minItems: 1 });
    const createdAt = (0, schema_1.isoDateTime)(raw.createdAt, 'createdAt', issues);
    if (issues.length > 0 ||
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
        createdAt === undefined) {
        return { valid: false, errors: (0, schema_1.formatIssues)(issues) };
    }
    // Cross-reference invariants: every id resolves, every asset has its copy/channel review, one route everywhere.
    const assetIds = assetRegister.map((asset) => asset.assetId);
    const variantIds = copyVariants.map((variant) => variant.variantId);
    const dependencyIds = dependencies.map((dependency) => dependency.dependencyId);
    const requirementIds = approvalRequirements.map((requirement) => requirement.requirementId);
    (0, artifactTypes_1.checkUniqueIds)(assetIds, 'assetRegister', issues);
    (0, artifactTypes_1.checkUniqueIds)(variantIds, 'copyVariants', issues);
    (0, artifactTypes_1.checkUniqueIds)(dependencyIds, 'dependencies', issues);
    (0, artifactTypes_1.checkUniqueIds)(requirementIds, 'approvalRequirements', issues);
    (0, artifactTypes_1.checkUniqueIds)(contentCalendar.map((entry) => entry.entryId), 'contentCalendar', issues);
    const scopeIds = [planId, 'primary'].concat(assetIds, variantIds);
    for (let index = 0; index < copyVariants.length; index += 1) {
        if (assetIds.indexOf(copyVariants[index].assetId) < 0) {
            issues.push({ path: `copyVariants[${index}].assetId`, message: `names ${copyVariants[index].assetId}, which the asset register does not carry.` });
        }
    }
    for (let index = 0; index < assetRegister.length; index += 1) {
        const asset = assetRegister[index];
        const covered = approvalRequirements.filter((requirement) => asset.reviewRequirementIds.indexOf(requirement.requirementId) >= 0 && requirement.reviewKind === 'copyChannel' && requirement.scopeRefs.indexOf(asset.assetId) >= 0);
        for (const id of asset.reviewRequirementIds) {
            if (requirementIds.indexOf(id) < 0) {
                issues.push({ path: `assetRegister[${index}].reviewRequirementIds`, message: `names ${id}, which approvalRequirements does not carry.` });
            }
        }
        if (covered.length === 0) {
            issues.push({ path: `assetRegister[${index}]`, message: 'has no copy/channel review requirement in scope; every asset needs one before it can be released.' });
        }
        if (copyVariants.filter((variant) => variant.assetId === asset.assetId).length === 0) {
            issues.push({ path: `assetRegister[${index}]`, message: 'has no copy variant.' });
        }
    }
    for (let index = 0; index < contentCalendar.length; index += 1) {
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
    (0, artifactTypes_1.checkScopeRefs)(approvalRequirements, scopeIds, 'approvalRequirements', issues);
    (0, artifactTypes_1.checkScopeRefs)(proposedOwners, scopeIds, 'proposedOwners', issues);
    (0, artifactTypes_1.checkScopeRefs)(dependencies, scopeIds.concat(dependencyIds), 'dependencies', issues);
    for (let index = 0; index < dependencies.length; index += 1) {
        const related = dependencies[index].relatedArtifact;
        if (related !== null && related.kind === 'campaignBrief' && related.artifactId !== acceptedBrief.artifactId) {
            issues.push({ path: `dependencies[${index}].relatedArtifact`, message: 'names a campaign brief other than the accepted one this plan elaborates.' });
        }
    }
    if (issues.length > 0) {
        return { valid: false, errors: (0, schema_1.formatIssues)(issues) };
    }
    return {
        valid: true,
        errors: [],
        value: {
            schemaVersion: exports.CONTENT_PLAN_SCHEMA_VERSION,
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
function validateContentPlan(value) {
    const result = parseContentPlan(value);
    return { valid: result.valid, errors: result.errors };
}
