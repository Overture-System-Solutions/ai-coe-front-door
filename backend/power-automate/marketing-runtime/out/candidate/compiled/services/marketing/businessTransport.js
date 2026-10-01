"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharePointMarketingTransport = exports.MarketingBoundaryError = exports.MARKETING_OPERATIONS = void 0;
exports.isMarketingDraftOperation = isMarketingDraftOperation;
exports.object = object;
/** Immutable create-only SharePoint ingress; result ACLs and verified Author are server responsibilities.
 * This adapter never sends identity/role/authority claims and never caches business text in browser storage.
 */
const actionEnvelope_1 = require("../../content/actionEnvelope");
exports.MARKETING_OPERATIONS = ['ListMarketingWorkV1', 'SaveManualMarketingDraftV1', 'DraftCampaignBriefV1', 'DraftContentPlanV1', 'DraftMeetingFollowThroughV1', 'RequestReviewV1', 'RecordReviewDecisionV1', 'RecoverMarketingIntentV1', 'GetArtifactV1', 'ListArtifactsV1', 'GetReviewV1', 'ListReviewDecisionsV1', 'ListReviewRequestsV1', 'ListAuthoritiesV1', 'ReadSourceRegisterV1', 'ReadSourceExcerptV1'];
function isMarketingDraftOperation(operation) { return operation.startsWith('Draft') || operation === 'SaveManualMarketingDraftV1'; }
const MUTATIONS = ['SaveManualMarketingDraftV1', 'DraftCampaignBriefV1', 'DraftContentPlanV1', 'DraftMeetingFollowThroughV1', 'RequestReviewV1', 'RecordReviewDecisionV1'];
class MarketingBoundaryError extends Error {
    intentKey;
    constructor(intentKey, message) {
        super(message);
        this.intentKey = intentKey;
        this.name = 'MarketingBoundaryError';
    }
}
exports.MarketingBoundaryError = MarketingBoundaryError;
function object(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid Marketing response object.');
    return value;
}
function guid(value) { return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value); }
class SharePointMarketingTransport {
    options;
    responses = new WeakMap();
    label = 'Server-side Marketing drafts and reviews. Business content is not stored in this browser.';
    reasons;
    constructor(options) {
        this.options = options;
        const b = options.binding;
        const site = /^https:\/\/[^\s/?#@]+\.sharepoint\.com(?:\/sites\/[A-Za-z0-9_-]+|\/teams\/[A-Za-z0-9_-]+)?$/i.test(b.siteUrl);
        this.reasons = b.enabled === true && site && guid(b.requestListId) && guid(b.resultListId) && b.requestListId !== b.resultListId && /^QUAL-[A-Za-z0-9_-]+$/.test(b.qualificationReceiptRef) && options.session.tenantScope === b.siteUrl && options.session.actorId.trim() !== '' ? [] : ['Marketing business bindings or qualification selection are incomplete.'];
    }
    async invoke(operation, payload, requestId) {
        const id = requestId ?? (this.options.newId?.() ?? globalThis.crypto.randomUUID());
        if (this.reasons.length > 0)
            throw new MarketingBoundaryError(id, this.reasons[0]);
        if (!guid(id))
            throw new MarketingBoundaryError(id, 'A Marketing request id must be an opaque UUID.');
        const b = this.options.binding;
        if (MUTATIONS.includes(operation)) {
            const storageKey = await this.referenceKey(), digest = await (0, actionEnvelope_1.payloadHash)(payload);
            if (!digest || !this.options.references)
                throw new MarketingBoundaryError(id, 'Durable opaque recovery storage is required before a Marketing mutation.');
            const held = await this.pendingReference();
            if (held) {
                if (held.operation !== operation || held.digest !== digest)
                    throw new MarketingBoundaryError(held.id, 'Resolve the original Marketing intent before another mutation.');
                return this.readResult(held.id, held.operation);
            }
            this.options.references.setItem(storageKey, JSON.stringify({ id, operation, digest }));
        }
        if (operation === 'RecoverMarketingIntentV1') {
            const held = await this.pendingReference(), body = object(payload);
            if (!held || body.intentKey !== held.id || body.kind !== (isMarketingDraftOperation(held.operation) ? 'draft' : 'review'))
                throw new MarketingBoundaryError(held?.id ?? id, 'Recovery must name the retained original intent.');
            if (held.recoveryId)
                return this.readResult(held.recoveryId, operation);
            this.options.references.setItem(await this.referenceKey(), JSON.stringify({ ...held, recoveryId: id }));
        }
        try {
            // Never PATCH caller request rows and never use a client-owned result field.
            const posted = await this.options.http.request('POST', `${b.siteUrl}/_api/web/lists(guid'${b.requestListId}')/items`, { Title: id, Operation: operation, ProtocolVersion: 'marketing.v1', PayloadJson: JSON.stringify(payload) });
            if (posted.status !== 201 && posted.status !== 200 && posted.status !== 409)
                throw new Error('Ingress not confirmed.');
        }
        catch {
            // A lost POST response can still have committed. Only its service-owned projection can confirm it.
        }
        return this.readResult(id, operation);
    }
    async readResult(id, operation) {
        if (!guid(id) || this.reasons.length > 0)
            throw new MarketingBoundaryError(id, 'Invalid recovery reference or binding.');
        const b = this.options.binding;
        for (let attempt = 0; attempt < Math.min(20, Math.max(1, this.options.pollAttempts ?? 4)); attempt += 1) {
            try {
                const response = await this.options.http.request('GET', `${b.siteUrl}/_api/web/lists(guid'${b.resultListId}')/items?$select=RequestId,ResultJson&$filter=RequestId%20eq%20'${id}'&$top=2`);
                if (response.status !== 200)
                    throw new Error('Projection unavailable.');
                const body = object(response.body);
                const rows = (body.value ?? (body.d !== undefined ? object(body.d).results : undefined));
                if (!Array.isArray(rows))
                    throw new Error('Invalid projection collection.');
                const own = rows.filter(row => object(row).RequestId === id);
                if (own.length > 1)
                    throw new Error('Duplicate result projection.');
                if (own.length === 1) {
                    const result = object(JSON.parse(String(object(own[0]).ResultJson)));
                    if (result.protocol !== 'marketing.v1' || result.requestId !== id || result.operation !== operation || result.tenantScope !== this.options.session.tenantScope || result.actorId !== this.options.session.actorId || typeof result.valueHash !== 'string' || await (0, actionEnvelope_1.payloadHash)(result.value) !== result.valueHash)
                        throw new Error('Projection scope or readback integrity failed.');
                    if (result.value !== null && typeof result.value === 'object')
                        this.responses.set(result.value, id);
                    return result.value;
                }
            }
            catch {
                throw new MarketingBoundaryError(id, 'Marketing result could not be verified. Retain the recovery reference; no local fallback was used.');
            }
            if (this.options.wait !== undefined)
                await this.options.wait();
        }
        throw new MarketingBoundaryError(id, 'Marketing request remains inconclusive. Retain the recovery reference.');
    }
    async referenceKey() {
        const hash = await (0, actionEnvelope_1.payloadHash)({ actor: this.options.session.actorId, site: this.options.binding.siteUrl, requestListId: this.options.binding.requestListId, resultListId: this.options.binding.resultListId });
        if (!hash)
            throw new Error('Recovery scope unavailable.');
        return `ai-coe:marketing-reference:v1:${hash}`;
    }
    async pendingReference() {
        const raw = this.options.references?.getItem(await this.referenceKey());
        if (!raw)
            return undefined;
        const value = object(JSON.parse(raw));
        if (typeof value.id !== 'string' || !guid(value.id) || !MUTATIONS.includes(value.operation) || !/^[a-f0-9]{64}$/.test(String(value.digest))
            || (value.recoveryId !== undefined && (typeof value.recoveryId !== 'string' || !guid(value.recoveryId))))
            throw new Error('Invalid Marketing recovery reference.');
        return { id: value.id, operation: value.operation, digest: value.digest, recoveryId: value.recoveryId };
    }
    /** Only acknowledge the exact response object returned by this transport after facade validation. */
    async acknowledge(value) {
        if (value === null || typeof value !== 'object')
            throw new Error('No verified response identity.');
        const id = this.responses.get(value), held = await this.pendingReference();
        if (held && (id === held.id || id === held.recoveryId))
            this.options.references.removeItem(await this.referenceKey());
    }
    /** A confirmed reconciliation result may be evaluated again; the unknown original mutation is never replaced. */
    async releaseRecoveryEvaluation(value) {
        if (value === null || typeof value !== 'object')
            return;
        const held = await this.pendingReference();
        if (held?.recoveryId && this.responses.get(value) === held.recoveryId) {
            delete held.recoveryId;
            this.options.references.setItem(await this.referenceKey(), JSON.stringify(held));
        }
    }
}
exports.SharePointMarketingTransport = SharePointMarketingTransport;
