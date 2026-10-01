"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnboundBusinessSourceRegistry = exports.BUSINESS_REGISTER_REASONS = exports.SyntheticSourceRegistry = void 0;
exports.validateEnvelopeSources = validateEnvelopeSources;
/**
 * The permission-aware source retrieval seam: where a run gets the register it may read, the approval recorded
 * for it, the revocations since, and the excerpt of each source at its pinned version.
 *
 * Two adapters ship. `SyntheticSourceRegistry` serves the fixture register with fixture excerpts and a fixture
 * approval whose `source` says so; the gate accepts it only in synthetic mode. `UnboundBusinessSourceRegistry`
 * answers every call with the reasons the business route is closed: no approved, versioned, retained register has
 * been supplied and no store holds its approval receipt (LIVE_BINDINGS_REQUIRED.md, item 3). Neither adapter lets
 * the payload name a register or a source that the adapter did not return.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
const sourceRegister_1 = require("../../content/marketing/sourceRegister");
const sourceGate_1 = require("../../content/marketing/sourceGate");
/** The excerpts behind the fixture rows. Every line says it is invented. */
const FIXTURE_EXCERPTS = {
    'FIXTURE-BRAND-001': 'Message house (fixture): the AI CoE reviews every request and says what is allowed before you start. Say what the thing does; avoid promises the tenant has not proved.',
    'FIXTURE-PRODUCT-002': 'Capability notes (fixture): anything sent through the front door is read by a person and its state is visible to the sender. Availability and security posture are not established here.',
    'FIXTURE-AUDIENCE-003': 'Segment notes (fixture): team leads who have not asked for anything yet; people who tried an AI tool once and stopped. No adoption figure is established.',
    'FIXTURE-MEETING-004': sourceRegister_1.FIXTURE_MEETING_NOTES
};
class SyntheticSourceRegistry {
    mode = 'synthetic';
    _register;
    _revoked = [];
    _excerpts;
    constructor(register = sourceRegister_1.FIXTURE_REGISTER, excerpts = FIXTURE_EXCERPTS) {
        this._register = register;
        this._excerpts = excerpts;
    }
    async readRegister() {
        const snapshotHash = await (0, sourceGate_1.registerSnapshotHash)(this._register);
        if (snapshotHash === undefined) {
            return { available: false, reasons: ['The platform offers no SHA-256 digest, so the fixture snapshot cannot be bound.'] };
        }
        const evidence = {
            receiptId: 'FIXTURE-APPROVAL-RECEIPT',
            registerId: this._register.registerId,
            registerVersion: this._register.version,
            snapshotHash,
            approvedByBindingRef: 'fixture:register-owner (synthetic)',
            approvedAt: `${this._register.asOf}T00:00:00Z`,
            expiresAt: '2099-01-01T00:00:00Z',
            source: 'syntheticFixture'
        };
        return { available: true, readback: { register: this._register, evidence, revoked: this._revoked.slice(), snapshotRef: `synthetic:register:${this._register.registerId}@${this._register.version}` } };
    }
    async readExcerpt(reference, entry) {
        if (entry.id !== reference.sourceId || entry.versionOrETag !== reference.versionOrETag) {
            return undefined;
        }
        const excerpt = this._excerpts[entry.id];
        if (excerpt === undefined) {
            return undefined;
        }
        return { sourceId: entry.id, versionOrETag: entry.versionOrETag, locator: `${entry.location}#excerpt`, excerpt, mayNotProve: entry.mayNotProve };
    }
    revoke(sourceId) {
        if (this._revoked.indexOf(sourceId) < 0) {
            this._revoked.push(sourceId);
        }
    }
}
exports.SyntheticSourceRegistry = SyntheticSourceRegistry;
/** Re-read source approval, revocations, versions and access; hashes alone do not prove current permission. */
async function validateEnvelopeSources(registry, envelope, now, audience = 'Local testing only') {
    const read = await registry.readRegister();
    if (!read.available)
        return false;
    const { register, evidence, revoked } = read.readback;
    const qualified = await (0, sourceGate_1.qualifyRegister)(register, { mode: registry.mode, now, evidence });
    if (!qualified.usable || qualified.snapshotHash !== envelope.registerSnapshot.snapshotHash)
        return false;
    const access = (0, sourceGate_1.checkSourceSet)(register, envelope.sourcesUsed, { callerId: envelope.createdBy, purpose: envelope.kind, audience, now, revoked });
    if (access.gaps.length > 0)
        return false;
    for (const reference of access.usable) {
        const entry = register.entries.filter(candidate => candidate.id === reference.sourceId)[0];
        if (entry === undefined || await registry.readExcerpt(reference, entry) === undefined)
            return false;
    }
    return true;
}
exports.BUSINESS_REGISTER_REASONS = [
    'No approved, versioned, retained permitted-source register has been supplied by the Marketing owner.',
    'No store holds an authenticated approval receipt for a register snapshot.',
    'The activation package\'s own source register is documentary provenance, not an operational allowlist.'
];
class UnboundBusinessSourceRegistry {
    mode = 'business';
    async readRegister() {
        return { available: false, reasons: exports.BUSINESS_REGISTER_REASONS.slice() };
    }
    async readExcerpt() {
        return undefined;
    }
}
exports.UnboundBusinessSourceRegistry = UnboundBusinessSourceRegistry;
