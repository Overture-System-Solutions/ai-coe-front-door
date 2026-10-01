import { payloadHash } from '../content/actionEnvelope';
import type { IDraftStore } from './draftStorage';
import type { IListItem, IListResponse, IServiceContext } from './types';

/** Browser persistence holds only identifiers/digests; draft text remains in a caller-secured SharePoint list. */
export interface IDraftReferences {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface IServerDraftOptions {
  listId: string;
  references?: IDraftReferences;
  policy?: IServerDraftPolicy;
}

/** The referenced tenant policies must be commissioned independently; this preflight cannot grant access. */
export interface IServerDraftPolicy {
  qualified: boolean;
  qualificationReceiptRef: string;
  retentionPolicyRef: string;
  accessPolicyRef: string;
  retentionDays: number;
  qualifiedUntil: string;
}

interface IDraftReference {
  key: string;
  itemId?: number;
  etag?: string;
  digest?: string;
  expiresAt?: number;
  pending: boolean;
}

interface IServerDraftRow {
  id: number;
  etag: string;
  json: string;
  cleared: boolean;
  expiresAt: number;
}

const READ_HEADERS: { [name: string]: string } = { Accept: 'application/json;odata=nometadata' };
const GUID: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DRAFT_BYTES: number = 48000;
// Share a queue across instances; browser Web Locks extend coordination across same-origin tabs.
const DRAFT_OPERATIONS: Map<string, Promise<void>> = new Map<string, Promise<void>>();

/**
 * Stores unsubmitted business drafts on the server. The list must enforce read-own/write-own and must not grant
 * Override List Behaviors to ordinary members. It uses indexed, non-unique Title: duplicate rows are refused,
 * not concealed or treated as an exactly-once write. Uncertain creates are reconciled and never blindly repeated.
 */
export class ServerDraftStore implements IDraftStore {
  private readonly _base: string;

  private readonly _references: { [workflowId: string]: IDraftReference } = {};

  public constructor(private readonly _context: IServiceContext, private readonly _options: IServerDraftOptions) {
    this._base = GUID.test(_options.listId) ? `${_context.siteUrl.replace(/\/$/, '')}/_api/web/lists(guid'${_options.listId}')/items` : '';
  }

  public async save(workflowId: string, draft: unknown): Promise<{ ok: boolean }> {
    try { return await this._coordinate(workflowId, (): Promise<{ ok: boolean }> => this._save(workflowId, draft, false)); }
    catch { return { ok: false }; }
  }

  public async load<T>(workflowId: string): Promise<T | undefined> {
    return this._coordinate(workflowId, (): Promise<T | undefined> => this._load<T>(workflowId));
  }

  private async _load<T>(workflowId: string): Promise<T | undefined> {
    const key: string = await this._key(workflowId);
    const row: IServerDraftRow | undefined = await this._lookup(workflowId, key);
    const digest: string | undefined = row === undefined ? undefined : await payloadHash({ draft: JSON.parse(row.json), cleared: row.cleared });
    const reference: IDraftReference | undefined = this._reference(workflowId, key);
    if (reference?.pending && (row === undefined || reference.digest !== digest || reference.expiresAt !== row.expiresAt)) {
      throw new Error('The previous server draft write is unconfirmed; its original recovery reference remains unresolved.');
    }
    if (row === undefined) {
      return undefined;
    }
    this._remember(workflowId, { key, itemId: row.id, etag: row.etag, digest, expiresAt: row.expiresAt, pending: false });
    return row.cleared || row.expiresAt <= Date.now() ? undefined : JSON.parse(row.json) as T;
  }

  public async clear(workflowId: string): Promise<void> {
    const running: Promise<{ ok: boolean }> = this._coordinate(workflowId, (): Promise<{ ok: boolean }> => this._save(workflowId, {}, true));
    if (!(await running).ok) {
      throw new Error('The server draft could not be cleared; no browser copy was created.');
    }
  }

  private _coordinate<T>(workflowId: string, task: () => Promise<T>): Promise<T> {
    const scope: string = JSON.stringify([this._base, this._context.user.email.toLowerCase(), workflowId]);
    const previous: Promise<void> = DRAFT_OPERATIONS.get(scope) ?? Promise.resolve();
    const running: Promise<T> = previous.then(async (): Promise<T> => {
      if (typeof window === 'undefined') { return task(); }
      const locks: LockManager | undefined = window.navigator?.locks;
      if (locks === undefined) { throw new Error('Cross-tab draft coordination is unavailable; no server write was attempted.'); }
      const opaque: string | undefined = await payloadHash({ scope });
      if (!opaque) { throw new Error('Draft coordination scope could not be verified.'); }
      return locks.request(`ai-coe:draft-lock:${opaque}`, task);
    });
    const settled: Promise<void> = running.then((): void => undefined, (): void => undefined);
    DRAFT_OPERATIONS.set(scope, settled);
    void settled.then((): void => { if (DRAFT_OPERATIONS.get(scope) === settled) { DRAFT_OPERATIONS.delete(scope); } });
    return running;
  }

  private async _key(workflowId: string): Promise<string> {
    const policy: IServerDraftPolicy | undefined = this._options.policy;
    const qualified: boolean = policy !== undefined && policy.qualified === true
      && [policy.qualificationReceiptRef, policy.retentionPolicyRef, policy.accessPolicyRef].every((ref: string): boolean => typeof ref === 'string' && ref.trim().length > 0 && ref.length <= 200)
      && Number.isInteger(policy.retentionDays) && policy.retentionDays > 0 && policy.retentionDays <= 3650
      && typeof policy.qualifiedUntil === 'string' && Date.parse(policy.qualifiedUntil) > Date.now();
    if (!qualified || this._base === '' || this._context.user.email.trim() === '' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(workflowId)) {
      throw new Error('Server-side draft storage is not bound to this user, site and workflow.');
    }
    const digest: string | undefined = await payloadHash({ site: this._context.siteUrl, list: this._options.listId, actor: this._context.user.email.toLowerCase(), workflow: workflowId });
    if (digest === undefined) {
      throw new Error('A scoped server draft reference could not be created.');
    }
    return `draft2:${digest}`;
  }

  private _remember(workflowId: string, reference: IDraftReference): void {
    // Explicit serialization prevents an untrusted object from adding payload/answer fields to browser storage.
    const safe: IDraftReference = { key: reference.key, itemId: reference.itemId, etag: reference.etag, digest: reference.digest, expiresAt: reference.expiresAt, pending: reference.pending };
    this._options.references?.setItem(`overture-ai-coe-front-door:draft-ref:${reference.key}`, JSON.stringify(safe));
    this._references[workflowId] = safe;
  }

  private _reference(workflowId: string, key: string): IDraftReference | undefined {
    const observed: IDraftReference | undefined = this._references[workflowId];
    const text: string | null | undefined = this._options.references?.getItem(`overture-ai-coe-front-door:draft-ref:${key}`);
    if (!text) {
      return observed;
    }
    const raw: unknown = JSON.parse(text);
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('The draft recovery reference is invalid.');
    }
    const value: { [key: string]: unknown } = raw as { [key: string]: unknown };
    if (value.key !== key || typeof value.pending !== 'boolean') {
      throw new Error('The draft recovery reference belongs to another context.');
    }
    const shared: IDraftReference = { key, itemId: typeof value.itemId === 'number' ? value.itemId : undefined, etag: typeof value.etag === 'string' ? value.etag : undefined, digest: typeof value.digest === 'string' ? value.digest : undefined, expiresAt: typeof value.expiresAt === 'number' ? value.expiresAt : undefined, pending: value.pending };
    // Shared unresolved intent wins; each loaded instance still keeps its own optimistic ETag.
    return shared.pending ? shared : observed ?? shared;
  }

  private async _lookup(workflowId: string, key: string): Promise<IServerDraftRow | undefined> {
    const url: string = `${this._base}?$filter=${encodeURIComponent(`Title eq '${key}'`)}&$select=Id,Title,WorkflowId,DraftJson,IsCleared,RetentionPolicyRef,AccessPolicyRef,ExpiresAt,Author/EMail&$expand=Author&$top=2`;
    const response: IListResponse = await this._context.client.get(url, this._context.configuration, { headers: READ_HEADERS });
    if (!response.ok) {
      throw new Error('Server draft storage is unavailable or access was refused.');
    }
    const data = await response.json() as { value?: unknown };
    if (!Array.isArray(data.value) || data.value.length > 1) {
      throw new Error('The draft key is ambiguous; reconcile the server records before saving.');
    }
    if (data.value.length === 0) {
      return undefined;
    }
    const row: IListItem = data.value[0] as IListItem;
    const author = row.Author as { EMail?: unknown; Email?: unknown } | undefined;
    const email: unknown = author?.EMail ?? author?.Email;
    const etag: unknown = row['@odata.etag'] ?? row['odata.etag'];
    if (typeof email !== 'string' || email.toLowerCase() !== this._context.user.email.toLowerCase() || row.Title !== key || row.WorkflowId !== workflowId || typeof row.Id !== 'number' || typeof row.DraftJson !== 'string' || typeof etag !== 'string'
      || typeof row.IsCleared !== 'boolean' || row.RetentionPolicyRef !== this._options.policy?.retentionPolicyRef || row.AccessPolicyRef !== this._options.policy?.accessPolicyRef
      || typeof row.ExpiresAt !== 'string' || !Number.isFinite(Date.parse(row.ExpiresAt))) {
      throw new Error('The server draft identity or version could not be verified.');
    }
    return { id: row.Id, etag, json: row.DraftJson, cleared: row.IsCleared === true, expiresAt: Date.parse(row.ExpiresAt) };
  }

  private async _save(workflowId: string, draft: unknown, cleared: boolean): Promise<{ ok: boolean }> {
    try {
      if (this._options.references === undefined) { return { ok: false }; }
      const key: string = await this._key(workflowId);
      const json: string = JSON.stringify(draft);
      if (typeof json !== 'string' || new TextEncoder().encode(json).length > MAX_DRAFT_BYTES) {
        return { ok: false };
      }
      const digest: string | undefined = await payloadHash({ draft, cleared });
      if (digest === undefined) {
        return { ok: false };
      }
      const reference: IDraftReference | undefined = this._reference(workflowId, key);
      const current: IServerDraftRow | undefined = await this._lookup(workflowId, key);
      if (reference?.pending) {
        if (current === undefined || current.expiresAt !== reference.expiresAt || await payloadHash({ draft: JSON.parse(current.json), cleared: current.cleared }) !== reference.digest) {
          return { ok: false };
        }
        this._remember(workflowId, { key, itemId: current.id, etag: current.etag, digest: reference.digest, expiresAt: current.expiresAt, pending: false });
        if (reference.digest === digest && current.cleared === cleared) {
          return { ok: true };
        }
      } else if (current !== undefined && reference?.etag !== undefined && reference.etag !== current.etag) {
        return { ok: false };
      }
      // Persist only the opaque intent before any write, so a lost response is recoverable after reload.
      const policy: IServerDraftPolicy = this._options.policy!;
      const expiresAt: string = new Date(Date.now() + policy.retentionDays * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      this._remember(workflowId, { key, itemId: current?.id, etag: current?.etag, digest, expiresAt: Date.parse(expiresAt), pending: true });
      const body: string = JSON.stringify({ Title: key, WorkflowId: workflowId, DraftJson: json, IsCleared: cleared, RetentionPolicyRef: policy.retentionPolicyRef, AccessPolicyRef: policy.accessPolicyRef, ExpiresAt: expiresAt });
      const headers: { [name: string]: string } = { ...READ_HEADERS, 'Content-Type': 'application/json;odata=nometadata' };
      if (current !== undefined) {
        headers['IF-MATCH'] = current.etag;
        headers['X-HTTP-Method'] = 'MERGE';
      }
      const response: IListResponse = await this._context.client.post(current === undefined ? this._base : `${this._base}(${current.id})`, this._context.configuration, { headers, body });
      if (!response.ok) {
        return { ok: false };
      }
      const confirmed: IServerDraftRow | undefined = await this._lookup(workflowId, key);
      if (confirmed === undefined || confirmed.json !== json || confirmed.cleared !== cleared || confirmed.expiresAt !== Date.parse(expiresAt)) {
        return { ok: false };
      }
      this._remember(workflowId, { key, itemId: confirmed.id, etag: confirmed.etag, digest, expiresAt: confirmed.expiresAt, pending: false });
      return { ok: true };
    } catch {
      // No response body, draft content or provider diagnostics enter the error channel.
      return { ok: false };
    }
  }
}
