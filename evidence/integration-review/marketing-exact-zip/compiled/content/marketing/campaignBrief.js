"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAMPAIGN_BRIEF_SCHEMA_VERSION = void 0;
exports.parseClaim = parseClaim;
exports.parseClaims = parseClaims;
exports.parseCalendarEntry = parseCalendarEntry;
exports.parseProposedOwner = parseProposedOwner;
exports.parseCampaignBrief = parseCampaignBrief;
exports.validateCampaignBrief = validateCampaignBrief;
exports.unsupportedAssertions = unsupportedAssertions;
const schema_1 = require("./schema");
exports.CAMPAIGN_BRIEF_SCHEMA_VERSION = '1.0';
const REQUIRED_KEYS = [
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
const OPTIONAL_KEYS = ['proposedOwners', 'dependencies', 'claimMap'];
/** The paths a claim-map entry may name: an item of one of the four text lists, or the objective. */
const CLAIM_MAP_PATH = /^(objective|(audience|painPoints|channelPlan|evidenceGaps)\[(\d+)\])$/;
/** A citation or a sentinel, never neither and never both: the playbook's own pass criterion, checked. */
function citedXorMarked(sources, unknown, path, issues) {
    const marked = unknown === undefined ? undefined : (0, schema_1.sentinel)(unknown, (0, schema_1.at)(path, 'unknown'), issues);
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
function parseClaim(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['text', 'sources'], ['unknown']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const body = (0, schema_1.text)(raw.text, (0, schema_1.at)(path, 'text'), issues);
    const sources = (0, schema_1.sourceRefs)(raw.sources, (0, schema_1.at)(path, 'sources'), issues);
    const unknown = citedXorMarked(sources, raw.unknown, path, issues);
    if (issues.length !== before || body === undefined || sources === undefined) {
        return undefined;
    }
    const claim = { text: body, sources };
    if (unknown !== undefined) {
        claim.unknown = unknown;
    }
    return claim;
}
function parseClaims(value, path, issues, options = {}) {
    return (0, schema_1.list)(value, path, issues, (item, itemPath) => parseClaim(item, itemPath, issues), options);
}
function parseCalendarEntry(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['phase', 'weekOffset', 'item']);
    if (raw === undefined) {
        return undefined;
    }
    const phase = (0, schema_1.text)(raw.phase, (0, schema_1.at)(path, 'phase'), issues, { max: 200 });
    const item = (0, schema_1.text)(raw.item, (0, schema_1.at)(path, 'item'), issues);
    const weekOffset = (0, schema_1.integer)(raw.weekOffset, (0, schema_1.at)(path, 'weekOffset'), issues, { min: 0 });
    if (weekOffset === undefined) {
        issues.push({ path: (0, schema_1.at)(path, 'weekOffset'), message: 'needs a whole week offset of 0 or more; a date is not accepted.' });
    }
    return phase === undefined || item === undefined || weekOffset === undefined ? undefined : { phase, weekOffset, item };
}
/** Exactly a role and a note. The shape is the guarantee: nothing here can name a person or a task. */
function parseProposedOwner(value, path, issues) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['role', 'note']);
    if (raw === undefined) {
        return undefined;
    }
    const role = (0, schema_1.text)(raw.role, (0, schema_1.at)(path, 'role'), issues, { max: 200 });
    const note = (0, schema_1.text)(raw.note, (0, schema_1.at)(path, 'note'), issues);
    if (role !== undefined && role.indexOf('@') >= 0) {
        issues.push({ path: (0, schema_1.at)(path, 'role'), message: 'reads as an address; a proposed owner is a role, never a person.' });
        return undefined;
    }
    return role === undefined || note === undefined ? undefined : { role, note };
}
function parseClaimMapEntry(value, path, issues, brief) {
    const raw = (0, schema_1.strictObject)(value, path, issues, ['path', 'sources'], ['unknown']);
    if (raw === undefined) {
        return undefined;
    }
    const before = issues.length;
    const target = (0, schema_1.text)(raw.path, (0, schema_1.at)(path, 'path'), issues, { max: 64 });
    const match = target === undefined ? null : CLAIM_MAP_PATH.exec(target);
    if (target !== undefined && match === null) {
        issues.push({ path: (0, schema_1.at)(path, 'path'), message: 'must name the objective or an item of audience, painPoints, channelPlan or evidenceGaps.' });
    }
    else if (match !== null && match[2] !== undefined) {
        const items = brief[match[2]];
        if (!Array.isArray(items) || Number(match[3]) >= items.length) {
            issues.push({ path: (0, schema_1.at)(path, 'path'), message: 'names an item the brief does not carry.' });
        }
    }
    const sources = (0, schema_1.sourceRefs)(raw.sources, (0, schema_1.at)(path, 'sources'), issues);
    const unknown = citedXorMarked(sources, raw.unknown, path, issues);
    if (issues.length !== before || target === undefined || sources === undefined) {
        return undefined;
    }
    const entry = { path: target, sources };
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
function parseCampaignBrief(value) {
    const issues = [];
    const raw = (0, schema_1.strictObject)(value, '', issues, REQUIRED_KEYS, OPTIONAL_KEYS);
    if (raw === undefined) {
        return { valid: false, errors: (0, schema_1.formatIssues)(issues) };
    }
    (0, schema_1.forbidKeysDeep)(raw, '', issues);
    (0, schema_1.literal)(raw.schemaVersion, 'schemaVersion', issues, exports.CAMPAIGN_BRIEF_SCHEMA_VERSION);
    const briefId = (0, schema_1.canonicalId)(raw.briefId, 'briefId', issues);
    const work = (0, schema_1.workId)(raw.workId, 'workId', issues);
    const registerId = (0, schema_1.text)(raw.registerId, 'registerId', issues, { max: 256 });
    const registerVersion = (0, schema_1.text)(raw.registerVersion, 'registerVersion', issues, { max: 256 });
    const objective = (0, schema_1.text)(raw.objective, 'objective', issues);
    const audience = (0, schema_1.textList)(raw.audience, 'audience', issues, { minItems: 1 });
    const painPoints = (0, schema_1.textList)(raw.painPoints, 'painPoints', issues, { minItems: 1 });
    const message = parseClaims(raw.message, 'message', issues, { minItems: 1 });
    const channelPlan = (0, schema_1.textList)(raw.channelPlan, 'channelPlan', issues, { minItems: 1 });
    const contentCalendar = (0, schema_1.list)(raw.contentCalendar, 'contentCalendar', issues, (item, itemPath) => parseCalendarEntry(item, itemPath, issues));
    // An empty evidence-gap list is allowed but must be deliberate: the field itself is required.
    const evidenceGaps = (0, schema_1.textList)(raw.evidenceGaps, 'evidenceGaps', issues);
    const reviewNeeds = (0, schema_1.textList)(raw.reviewNeeds, 'reviewNeeds', issues, { minItems: 1 });
    const createdAt = (0, schema_1.isoDateTime)(raw.createdAt, 'createdAt', issues);
    const proposedOwners = raw.proposedOwners === undefined
        ? undefined
        : (0, schema_1.list)(raw.proposedOwners, 'proposedOwners', issues, (item, itemPath) => parseProposedOwner(item, itemPath, issues));
    const dependencies = raw.dependencies === undefined ? undefined : (0, schema_1.textList)(raw.dependencies, 'dependencies', issues);
    const claimMap = raw.claimMap === undefined ? undefined : (0, schema_1.list)(raw.claimMap, 'claimMap', issues, (item, itemPath) => parseClaimMapEntry(item, itemPath, issues, raw));
    if (issues.length > 0 ||
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
        createdAt === undefined) {
        return { valid: false, errors: (0, schema_1.formatIssues)(issues) };
    }
    const brief = {
        schemaVersion: exports.CAMPAIGN_BRIEF_SCHEMA_VERSION,
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
function validateCampaignBrief(value) {
    const result = parseCampaignBrief(value);
    return { valid: result.valid, errors: result.errors };
}
/**
 * The factual assertions of a brief that carry no support: message claims marked unknown, and every audience,
 * pain-point and channel item the claim map neither cites nor marks. A reader sees these as gaps; a business run
 * may refuse to accept a brief whose claim map leaves any item silent.
 */
function unsupportedAssertions(brief) {
    const covered = (brief.claimMap ?? []).map((entry) => entry.path);
    const silent = [];
    for (const field of ['audience', 'painPoints', 'channelPlan']) {
        for (let index = 0; index < brief[field].length; index += 1) {
            const path = `${field}[${index}]`;
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
