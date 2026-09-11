import { DRAFT_KEY_PREFIX } from '../content/constants';

/** Persists unfinished workflows so a visitor can resume them later. */
export interface IDraftStore {
  save(workflowId: string, draft: unknown): Promise<{ ok: boolean }>;
  load<T>(workflowId: string): Promise<T | undefined>;
  clear(workflowId: string): Promise<void>;
}

export function draftKey(workflowId: string): string {
  return `${DRAFT_KEY_PREFIX}${workflowId}`;
}

/** `window.localStorage` when it is accessible; undefined in sandboxed or storage-less contexts. */
export function browserLocalStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

/** localStorage-backed store; every failure is swallowed exactly as the shipped build did. */
export class LocalStorageDraftStore implements IDraftStore {
  private readonly _storage: Storage | undefined;

  public constructor(storage: Storage | undefined) {
    this._storage = storage;
  }

  public async save(workflowId: string, draft: unknown): Promise<{ ok: boolean }> {
    try {
      if (this._storage === undefined) {
        return { ok: false };
      }
      this._storage.setItem(draftKey(workflowId), JSON.stringify(draft));
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  public async load<T>(workflowId: string): Promise<T | undefined> {
    try {
      const raw: string | null | undefined = this._storage?.getItem(draftKey(workflowId));
      if (!raw) {
        return undefined;
      }
      const parsed: unknown = JSON.parse(raw);
      return parsed === null ? undefined : (parsed as T);
    } catch {
      return undefined;
    }
  }

  public async clear(workflowId: string): Promise<void> {
    try {
      this._storage?.removeItem(draftKey(workflowId));
    } catch {
      // Ignored: a draft that cannot be cleared is harmless.
    }
  }
}
