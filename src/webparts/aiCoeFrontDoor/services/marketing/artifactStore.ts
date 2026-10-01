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

/** The subset of the DOM `Storage` interface the synthetic store needs; `localStorage` satisfies it directly. */
export interface IStorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export type StoreMode = 'synthetic' | 'live';

export interface IStoredRecord {
  key: string;
  value: string;
  /** The store version stamped when this record was last written; a compare-and-set target. */
  version: string;
}

export interface IWriteOutcome {
  ok: boolean;
  /** The version the record now carries; absent when nothing was written. */
  version?: string;
  /** True when `ifAbsent` was set and the key already existed, or `expectedVersion` did not match. */
  conflict?: boolean;
  /** True when the write was attempted and its outcome could not be confirmed by readback. */
  uncertain?: boolean;
  reason?: string;
}

export interface IWriteOptions {
  /** Refuse when the key already exists (an idempotent create). */
  ifAbsent?: boolean;
  /** Refuse when the current version differs (compare-and-set). */
  expectedVersion?: string;
}

export interface IArtifactStore {
  readonly mode: StoreMode;
  /** What a page says about where a record went; never a claim of tenant persistence for the synthetic store. */
  readonly label: string;
  /** Why the store cannot be used, when it cannot; empty for a usable store. */
  readonly unavailableReasons: readonly string[];
  read(key: string): Promise<IStoredRecord | undefined>;
  write(key: string, value: string, options?: IWriteOptions): Promise<IWriteOutcome>;
  keys(prefix: string): Promise<string[]>;
}

export const SYNTHETIC_STORE_LABEL: string = 'Synthetic local store: records are kept in this browser\'s storage for local testing. This is not a tenant list and not a production store.';

const NAMESPACE: string = 'overture-ai-coe-front-door:marketing:';
const VERSION_KEY: string = `${NAMESPACE}__store-version`;
const RECORD_PREFIX: string = `${NAMESPACE}record:`;
const VERSION_PREFIX: string = `${NAMESPACE}version:`;

/** A memory backend with the `Storage` shape. Shared between two store instances, it stands for a restart. */
export class MemoryStorageBackend implements IStorageBackend {
  private readonly _items: { [key: string]: string } = {};
  /** When set, the next write commits and then throws: a crash after a possible write. */
  public failAfterNextWrite: boolean = false;
  /** When set, every read throws: the store cannot be reached. */
  public unreachable: boolean = false;

  public getItem(key: string): string | null {
    if (this.unreachable) {
      throw new Error('Storage unreachable (simulated).');
    }
    return Object.prototype.hasOwnProperty.call(this._items, key) ? this._items[key] : null;
  }

  public setItem(key: string, value: string): void {
    if (this.unreachable) {
      throw new Error('Storage unreachable (simulated).');
    }
    this._items[key] = value;
    if (this.failAfterNextWrite) {
      this.failAfterNextWrite = false;
      throw new Error('Crash after write (simulated).');
    }
  }

  public removeItem(key: string): void {
    delete this._items[key];
  }

  public key(index: number): string | null {
    const keys: string[] = Object.keys(this._items);
    return index >= 0 && index < keys.length ? keys[index] : null;
  }

  public get length(): number {
    return Object.keys(this._items).length;
  }

  /** Every stored key, for a test to assert what was written. */
  public snapshot(): { [key: string]: string } {
    return { ...this._items };
  }
}

export class PersistentSyntheticArtifactStore implements IArtifactStore {
  public readonly mode: StoreMode = 'synthetic';
  public readonly label: string = SYNTHETIC_STORE_LABEL;
  public readonly unavailableReasons: readonly string[] = [];
  private readonly _backend: IStorageBackend;

  public constructor(backend: IStorageBackend) {
    this._backend = backend;
  }

  public async read(key: string): Promise<IStoredRecord | undefined> {
    const value: string | null = this._backend.getItem(RECORD_PREFIX + key);
    if (value === null) {
      return undefined;
    }
    const version: string | null = this._backend.getItem(VERSION_PREFIX + key);
    return { key, value, version: version ?? '0' };
  }

  public async write(key: string, value: string, options: IWriteOptions = {}): Promise<IWriteOutcome> {
    let current: IStoredRecord | undefined;
    try {
      current = await this.read(key);
    } catch (error) {
      return { ok: false, uncertain: true, reason: `The store could not be read before writing: ${describe(error)}` };
    }
    if (options.ifAbsent === true && current !== undefined) {
      return { ok: false, conflict: true, version: current.version, reason: 'A record with this key already exists.' };
    }
    if (options.expectedVersion !== undefined && (current === undefined || current.version !== options.expectedVersion)) {
      return { ok: false, conflict: true, version: current?.version, reason: 'The record changed since it was read (version mismatch).' };
    }
    const next: string = String(this._nextVersion());
    try {
      this._backend.setItem(RECORD_PREFIX + key, value);
      this._backend.setItem(VERSION_PREFIX + key, next);
    } catch (error) {
      // The write may or may not have landed: read back before deciding.
      try {
        const after: IStoredRecord | undefined = await this.read(key);
        if (after !== undefined && after.value === value) {
          if (after.version !== next) {
            this._backend.setItem(VERSION_PREFIX + key, next);
          }
          return { ok: true, version: next, uncertain: false };
        }
      } catch {
        // fall through: uncertain
      }
      return { ok: false, uncertain: true, reason: `The write was attempted but could not be confirmed: ${describe(error)}` };
    }
    // Native readback before the write is called done.
    const readback: IStoredRecord | undefined = await this.read(key);
    if (readback === undefined || readback.value !== value) {
      return { ok: false, uncertain: true, reason: 'The record did not read back as written.' };
    }
    return { ok: true, version: next };
  }

  public async keys(prefix: string): Promise<string[]> {
    const found: string[] = [];
    for (let index: number = 0; index < this._backend.length; index += 1) {
      const key: string | null = this._backend.key(index);
      if (key !== null && key.indexOf(RECORD_PREFIX + prefix) === 0) {
        found.push(key.slice(RECORD_PREFIX.length));
      }
    }
    return found.sort();
  }

  private _nextVersion(): number {
    const raw: string | null = this._backend.getItem(VERSION_KEY);
    const current: number = raw === null ? 0 : Number(raw);
    const next: number = (Number.isFinite(current) ? current : 0) + 1;
    this._backend.setItem(VERSION_KEY, String(next));
    return next;
  }
}

/** Why the live Marketing store is closed today; each reason names what must exist before it may open. */
export const LIVE_STORE_REASONS: readonly string[] = [
  'The Marketing artifact/review extension has not been accepted by the CORE owner; the five delivered operations do not store Marketing artifacts or their reviews.',
  'No tenant list or library has been named for Marketing artifacts, reviews or receipts (see LIVE_BINDINGS_REQUIRED.md).',
  'No authenticated write and readback authority for that store has been bound to this instance.'
];

export class DisabledLiveArtifactStore implements IArtifactStore {
  public readonly mode: StoreMode = 'live';
  public readonly label: string = 'Live Marketing store: not bound. Every call is refused with the reasons below.';
  public readonly unavailableReasons: readonly string[] = LIVE_STORE_REASONS;

  public async read(): Promise<IStoredRecord | undefined> {
    return undefined;
  }

  public async write(): Promise<IWriteOutcome> {
    return { ok: false, reason: this.unavailableReasons.join(' ') };
  }

  public async keys(): Promise<string[]> {
    return [];
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
