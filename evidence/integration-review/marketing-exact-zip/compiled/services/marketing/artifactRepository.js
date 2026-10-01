"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArtifactRepository = void 0;
exports.artifactRefOf = artifactRefOf;
/**
 * The repository over the artifact store: typed records, one key scheme, readback on every write, and the state
 * of an artifact derived from what the store holds.
 *
 * Keys. `envelope:<artifactId>:<revision>` holds one revision; `request:<id>` a review request; `decision:<id>` a
 * decision; `receipt:<id>` a receipt; `intent:<key>` the record of a mutation the caller began, so an attempt whose
 * outcome was lost can be reconciled from the key rather than repeated; `authority:<ref>` a reviewer's bound
 * authority; `snapshot:<registerId>:<version>` a retained register snapshot.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
const actionEnvelope_1 = require("../../content/actionEnvelope");
const artifactEnvelope_1 = require("../../content/marketing/artifactEnvelope");
class ArtifactRepository {
    validateSources;
    store;
    constructor(store, validateSources) {
        this.validateSources = validateSources;
        this.store = store;
    }
    async currentSources(envelope, now) {
        return this.validateSources === undefined ? this.store.mode === 'synthetic' : this.validateSources(envelope, now);
    }
    async writeEnvelope(envelope) {
        return this.store.write(`envelope:${envelope.artifactId}:${envelope.revision}`, JSON.stringify(envelope), { ifAbsent: true });
    }
    async readEnvelope(artifactId, revision) {
        const record = await this.store.read(`envelope:${artifactId}:${revision}`);
        if (record === undefined) {
            return undefined;
        }
        const parsed = (0, artifactEnvelope_1.parseEnvelope)(JSON.parse(record.value));
        // A stored record that no longer parses is quarantined by silence: it is not shown as an artifact.
        return parsed.value === undefined || await (0, actionEnvelope_1.payloadHash)(parsed.value.payload) !== parsed.value.payloadHash ? undefined : { envelope: parsed.value, storeVersion: record.version };
    }
    async revisionsOf(artifactId) {
        const keys = await this.store.keys(`envelope:${artifactId}:`);
        const envelopes = [];
        for (const key of keys) {
            const record = await this.store.read(key);
            if (record !== undefined) {
                const parsed = (0, artifactEnvelope_1.parseEnvelope)(JSON.parse(record.value));
                if (parsed.value !== undefined && await (0, actionEnvelope_1.payloadHash)(parsed.value.payload) === parsed.value.payloadHash) {
                    envelopes.push(parsed.value);
                }
            }
        }
        return envelopes.sort((left, right) => left.revision - right.revision);
    }
    async latestRevision(artifactId) {
        const revisions = await this.revisionsOf(artifactId);
        return revisions[revisions.length - 1];
    }
    /** Every artifact of a work, latest revision each, optionally of one kind. */
    async artifactsOf(workId, kind) {
        const keys = await this.store.keys('envelope:');
        const latest = {};
        for (const key of keys) {
            const record = await this.store.read(key);
            if (record === undefined) {
                continue;
            }
            const parsed = (0, artifactEnvelope_1.parseEnvelope)(JSON.parse(record.value));
            const envelope = parsed.value;
            if (envelope === undefined || await (0, actionEnvelope_1.payloadHash)(envelope.payload) !== envelope.payloadHash || envelope.workId !== workId || (kind !== undefined && envelope.kind !== kind)) {
                continue;
            }
            const held = latest[envelope.artifactId];
            if (held === undefined || held.revision < envelope.revision) {
                latest[envelope.artifactId] = envelope;
            }
        }
        return Object.keys(latest)
            .sort()
            .map((id) => latest[id]);
    }
    async writeRequest(request) {
        return this.store.write(`request:${request.requestId}`, JSON.stringify(request), { ifAbsent: true });
    }
    async requestsFor(artifactId) {
        const keys = await this.store.keys('request:');
        const requests = [];
        for (const key of keys) {
            const record = await this.store.read(key);
            if (record !== undefined) {
                const request = JSON.parse(record.value);
                if (request.target.artifactId === artifactId) {
                    requests.push(request);
                }
            }
        }
        return requests;
    }
    async writeDecision(decision, options) {
        return this.store.write(`decision:${decision.reviewId}`, JSON.stringify(decision), options);
    }
    async readDecision(reviewId) {
        const record = await this.store.read(`decision:${reviewId}`);
        if (record === undefined) {
            return undefined;
        }
        const parsed = (0, artifactEnvelope_1.parseReviewDecision)(JSON.parse(record.value));
        return parsed.value === undefined ? undefined : { decision: parsed.value, storeVersion: record.version };
    }
    async decisionsFor(artifactId) {
        const keys = await this.store.keys('decision:');
        const decisions = [];
        for (const key of keys) {
            const record = await this.store.read(key);
            if (record !== undefined) {
                const parsed = (0, artifactEnvelope_1.parseReviewDecision)(JSON.parse(record.value));
                if (parsed.value !== undefined && parsed.value.target.artifactId === artifactId) {
                    decisions.push(parsed.value);
                }
            }
        }
        return decisions;
    }
    async writeReceipt(receipt) {
        return this.store.write(`receipt:${receipt.receiptId}`, JSON.stringify(receipt), { ifAbsent: true });
    }
    async readReceipt(receiptId) {
        const record = await this.store.read(`receipt:${receiptId}`);
        return record === undefined ? undefined : JSON.parse(record.value);
    }
    async writeIntent(intent, options = {}) {
        return this.store.write(`intent:${intent.key}`, JSON.stringify(intent), options);
    }
    async readIntent(key) {
        const record = await this.store.read(`intent:${key}`);
        return record === undefined ? undefined : { intent: JSON.parse(record.value), storeVersion: record.version };
    }
    async writeAuthority(binding) {
        return this.store.write(`authority:${binding.bindingRef}`, JSON.stringify(binding));
    }
    async readAuthority(bindingRef) {
        const record = await this.store.read(`authority:${bindingRef}`);
        return record === undefined ? undefined : JSON.parse(record.value);
    }
    async authorities() {
        const keys = await this.store.keys('authority:');
        const bindings = [];
        for (const key of keys) {
            const record = await this.store.read(key);
            if (record !== undefined) {
                bindings.push(JSON.parse(record.value));
            }
        }
        return bindings;
    }
    async writeSnapshot(registerId, version, snapshotText) {
        return this.store.write(`snapshot:${registerId}:${version}`, snapshotText, { ifAbsent: true });
    }
    async currentAuthority(decision, envelope, now) {
        const binding = await this.readAuthority(decision.authorityBindingRef);
        return binding !== undefined && binding.actorId === decision.actorId && binding.revoked !== true && binding.scope.indexOf(decision.reviewKind) >= 0 && Number.isFinite(Date.parse(binding.expiresAt)) && Date.parse(binding.expiresAt) > now.getTime() && (this.store.mode === 'synthetic' || (!binding.synthetic && binding.tenantScope === envelope.tenantScope));
    }
    /** The state of one revision from everything the store holds about its artifact. */
    async stateOf(envelope, currentRegisterSnapshotHash, now) {
        const [revisions, requests, decisions] = await Promise.all([this.revisionsOf(envelope.artifactId), this.requestsFor(envelope.artifactId), this.decisionsFor(envelope.artifactId)]);
        const durable = [];
        for (const decision of decisions) {
            const receipt = await this.readReceipt(decision.receiptId);
            const intent = await this.readIntent(decision.idempotencyKey);
            if (receipt?.result === 'PASS' && receipt.operation === 'recordDecision' && receipt.targetRef === `decision:${decision.reviewId}` && receipt.actorId === decision.actorId && receipt.readbackHash === decision.contentHash && intent?.intent.status === 'completed' && intent.intent.resultKey === receipt.targetRef && intent.intent.payloadDigest === receipt.payloadHash)
                durable.push(decision);
        }
        const state = (0, artifactEnvelope_1.deriveState)({ envelope, revisions, requests, decisions: durable, currentRegisterSnapshotHash, now });
        if (state === 'superseded')
            return state;
        for (const decision of durable.filter(item => item.target.revision === envelope.revision && item.outcome === 'accept')) {
            if (!await this.currentAuthority(decision, envelope, now))
                return 'revalidationRequired';
        }
        if (!await this.currentSources(envelope, now))
            return 'revalidationRequired';
        for (const parent of envelope.parents) {
            const latest = await this.latestRevision(parent.artifactId);
            if (latest === undefined || latest.artifactId === envelope.artifactId || latest.tenantScope !== envelope.tenantScope || latest.workId !== envelope.workId || latest.kind !== parent.kind || latest.revision !== parent.revision || latest.payloadHash !== parent.payloadHash)
                return 'revalidationRequired';
            // Brief acceptance is a prerequisite; plans referenced by meeting notes may still be drafts.
            if (parent.kind === 'campaignBrief' && await this.stateOf(latest, currentRegisterSnapshotHash, now) !== 'accepted')
                return 'revalidationRequired';
        }
        return state;
    }
}
exports.ArtifactRepository = ArtifactRepository;
/** Exact revision identity the review records bind. A method of the class would be a Tailwind utility name. */
function artifactRefOf(envelope) {
    return { kind: envelope.kind, artifactId: envelope.artifactId, revision: envelope.revision, payloadHash: envelope.payloadHash };
}
