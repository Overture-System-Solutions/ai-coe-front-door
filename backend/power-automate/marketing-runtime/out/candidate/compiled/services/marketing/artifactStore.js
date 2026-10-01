"use strict";
/**
 * The durable store behind the Marketing artifacts and reviews: one writer, versioned keys, readback after every
 * write, and an explicitly synthetic local implementation.
 *
 * Why a store and not React state. The 2026-09-22 review showed an accepted demo brief vanishing on Home →
 * Marketing, because the component that held it unmounted. A record that must survive navigation, a reload and a
 * new session lives behind an interface with a write, a readback and a version, not in a reducer.
 *
 * What the synthetic store is. `PersistentSyntheticArtifactStore` keeps every record under a namespaced key in a
 * browser-storage-shaped backend (`localStorage` in the web part, a memory backend in tests) and stamps a
 * monotonic store version on each write. Every record it holds says `testRecord: true` and every result names the
 * store as synthetic, so nothing here can be mistaken for a tenant list. Two instances over one backend behave like
 * one service restarted: that is how the restart tests prove recovery.
 *
 * What the live store is. `DisabledLiveArtifactStore` answers every call with the reasons it cannot proceed: the
 * Marketing artifact/review extension has not been accepted by the CORE owner, no list or library has been named,
 * and no authenticated write/readback authority exists. It is wired so the route exists and fails closed, not so it
 * can be turned on by a flag.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisabledLiveArtifactStore = exports.LIVE_STORE_REASONS = exports.PersistentSyntheticArtifactStore = exports.MemoryStorageBackend = exports.SYNTHETIC_STORE_LABEL = void 0;
exports.SYNTHETIC_STORE_LABEL = 'Synthetic local store: records are kept in this browser\'s storage for local testing. This is not a tenant list and not a production store.';
const NAMESPACE = 'overture-ai-coe-front-door:marketing:';
const VERSION_KEY = `${NAMESPACE}__store-version`;
const RECORD_PREFIX = `${NAMESPACE}record:`;
const VERSION_PREFIX = `${NAMESPACE}version:`;
/** A memory backend with the `Storage` shape. Shared between two store instances, it stands for a restart. */
class MemoryStorageBackend {
    _items = {};
    /** When set, the next write commits and then throws: a crash after a possible write. */
    failAfterNextWrite = false;
    /** When set, every read throws: the store cannot be reached. */
    unreachable = false;
    getItem(key) {
        if (this.unreachable) {
            throw new Error('Storage unreachable (simulated).');
        }
        return Object.prototype.hasOwnProperty.call(this._items, key) ? this._items[key] : null;
    }
    setItem(key, value) {
        if (this.unreachable) {
            throw new Error('Storage unreachable (simulated).');
        }
        this._items[key] = value;
        if (this.failAfterNextWrite) {
            this.failAfterNextWrite = false;
            throw new Error('Crash after write (simulated).');
        }
    }
    removeItem(key) {
        delete this._items[key];
    }
    key(index) {
        const keys = Object.keys(this._items);
        return index >= 0 && index < keys.length ? keys[index] : null;
    }
    get length() {
        return Object.keys(this._items).length;
    }
    /** Every stored key, for a test to assert what was written. */
    snapshot() {
        return { ...this._items };
    }
}
exports.MemoryStorageBackend = MemoryStorageBackend;
class PersistentSyntheticArtifactStore {
    mode = 'synthetic';
    label = exports.SYNTHETIC_STORE_LABEL;
    unavailableReasons = [];
    _backend;
    constructor(backend) {
        this._backend = backend;
    }
    async read(key) {
        const value = this._backend.getItem(RECORD_PREFIX + key);
        if (value === null) {
            return undefined;
        }
        const version = this._backend.getItem(VERSION_PREFIX + key);
        return { key, value, version: version ?? '0' };
    }
    async write(key, value, options = {}) {
        let current;
        try {
            current = await this.read(key);
        }
        catch (error) {
            return { ok: false, uncertain: true, reason: `The store could not be read before writing: ${describe(error)}` };
        }
        if (options.ifAbsent === true && current !== undefined) {
            return { ok: false, conflict: true, version: current.version, reason: 'A record with this key already exists.' };
        }
        if (options.expectedVersion !== undefined && (current === undefined || current.version !== options.expectedVersion)) {
            return { ok: false, conflict: true, version: current?.version, reason: 'The record changed since it was read (version mismatch).' };
        }
        const next = String(this._nextVersion());
        try {
            this._backend.setItem(RECORD_PREFIX + key, value);
            this._backend.setItem(VERSION_PREFIX + key, next);
        }
        catch (error) {
            // The write may or may not have landed: read back before deciding.
            try {
                const after = await this.read(key);
                if (after !== undefined && after.value === value) {
                    if (after.version !== next) {
                        this._backend.setItem(VERSION_PREFIX + key, next);
                    }
                    return { ok: true, version: next, uncertain: false };
                }
            }
            catch {
                // fall through: uncertain
            }
            return { ok: false, uncertain: true, reason: `The write was attempted but could not be confirmed: ${describe(error)}` };
        }
        // Native readback before the write is called done.
        const readback = await this.read(key);
        if (readback === undefined || readback.value !== value) {
            return { ok: false, uncertain: true, reason: 'The record did not read back as written.' };
        }
        return { ok: true, version: next };
    }
    async keys(prefix) {
        const found = [];
        for (let index = 0; index < this._backend.length; index += 1) {
            const key = this._backend.key(index);
            if (key !== null && key.indexOf(RECORD_PREFIX + prefix) === 0) {
                found.push(key.slice(RECORD_PREFIX.length));
            }
        }
        return found.sort();
    }
    _nextVersion() {
        const raw = this._backend.getItem(VERSION_KEY);
        const current = raw === null ? 0 : Number(raw);
        const next = (Number.isFinite(current) ? current : 0) + 1;
        this._backend.setItem(VERSION_KEY, String(next));
        return next;
    }
}
exports.PersistentSyntheticArtifactStore = PersistentSyntheticArtifactStore;
/** Why the live Marketing store is closed today; each reason names what must exist before it may open. */
exports.LIVE_STORE_REASONS = [
    'The Marketing artifact/review extension has not been accepted by the CORE owner; the five delivered operations do not store Marketing artifacts or their reviews.',
    'No tenant list or library has been named for Marketing artifacts, reviews or receipts (see LIVE_BINDINGS_REQUIRED.md).',
    'No authenticated write and readback authority for that store has been bound to this instance.'
];
class DisabledLiveArtifactStore {
    mode = 'live';
    label = 'Live Marketing store: not bound. Every call is refused with the reasons below.';
    unavailableReasons = exports.LIVE_STORE_REASONS;
    async read() {
        return undefined;
    }
    async write() {
        return { ok: false, reason: this.unavailableReasons.join(' ') };
    }
    async keys() {
        return [];
    }
}
exports.DisabledLiveArtifactStore = DisabledLiveArtifactStore;
function describe(error) {
    return error instanceof Error ? error.message : String(error);
}
