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
import { deriveState, parseEnvelope, parseReviewDecision } from '../../content/marketing/artifactEnvelope';
import type { ArtifactState, IMarketingArtifactEnvelopeV1, IMarketingReviewDecisionV1, IReviewRequestRecord } from '../../content/marketing/artifactEnvelope';
import type { ArtifactKind, IArtifactRef, ReviewKind } from '../../content/marketing/artifactTypes';
import type { IParseResult } from '../../content/marketing/campaignBrief';
import type { IArtifactStore, IStoredRecord, IWriteOutcome } from './artifactStore';

/** A reviewer's bound authority: who may decide which review kinds until when. Recorded by configuration, never by a draft. */
export interface IAuthorityBinding {
  bindingRef: string;
  actorId: string;
  label: string;
  scope: ReviewKind[];
  expiresAt: string;
  /** True for every binding the synthetic store seeds; a live store binds real principals through configuration. */
  synthetic: boolean;
}

export interface IReceipt {
  receiptId: string;
  operation: string;
  targetRef: string;
  payloadHash: string;
  readbackHash: string | null;
  result: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'DENIED';
  observedAt: string;
  actorId: string;
}

/** A mutation the caller began: what it meant to do and what came of it, keyed by its idempotency key. */
export interface IIntentRecord {
  key: string;
  operation: 'saveRevision' | 'requestReview' | 'recordDecision';
  payloadDigest: string;
  status: 'pending' | 'completed';
  /** The key of the record the completed intent produced. */
  resultKey?: string;
  startedAt: string;
}

export interface IArtifactWithState {
  envelope: IMarketingArtifactEnvelopeV1;
  state: ArtifactState;
  storeVersion: string;
}

export class ArtifactRepository {
  public readonly store: IArtifactStore;

  public constructor(store: IArtifactStore) {
    this.store = store;
  }

  public async writeEnvelope(envelope: IMarketingArtifactEnvelopeV1): Promise<IWriteOutcome> {
    return this.store.write(`envelope:${envelope.artifactId}:${envelope.revision}`, JSON.stringify(envelope), { ifAbsent: true });
  }

  public async readEnvelope(artifactId: string, revision: number): Promise<{ envelope: IMarketingArtifactEnvelopeV1; storeVersion: string } | undefined> {
    const record: IStoredRecord | undefined = await this.store.read(`envelope:${artifactId}:${revision}`);
    if (record === undefined) {
      return undefined;
    }
    const parsed: IParseResult<IMarketingArtifactEnvelopeV1> = parseEnvelope(JSON.parse(record.value));
    // A stored record that no longer parses is quarantined by silence: it is not shown as an artifact.
    return parsed.value === undefined ? undefined : { envelope: parsed.value, storeVersion: record.version };
  }

  public async revisionsOf(artifactId: string): Promise<IMarketingArtifactEnvelopeV1[]> {
    const keys: string[] = await this.store.keys(`envelope:${artifactId}:`);
    const envelopes: IMarketingArtifactEnvelopeV1[] = [];
    for (const key of keys) {
      const record: IStoredRecord | undefined = await this.store.read(key);
      if (record !== undefined) {
        const parsed: IParseResult<IMarketingArtifactEnvelopeV1> = parseEnvelope(JSON.parse(record.value));
        if (parsed.value !== undefined) {
          envelopes.push(parsed.value);
        }
      }
    }
    return envelopes.sort((left: IMarketingArtifactEnvelopeV1, right: IMarketingArtifactEnvelopeV1): number => left.revision - right.revision);
  }

  public async latestRevision(artifactId: string): Promise<IMarketingArtifactEnvelopeV1 | undefined> {
    const revisions: IMarketingArtifactEnvelopeV1[] = await this.revisionsOf(artifactId);
    return revisions[revisions.length - 1];
  }

  /** Every artifact of a work, latest revision each, optionally of one kind. */
  public async artifactsOf(workId: string, kind?: ArtifactKind): Promise<IMarketingArtifactEnvelopeV1[]> {
    const keys: string[] = await this.store.keys('envelope:');
    const latest: { [artifactId: string]: IMarketingArtifactEnvelopeV1 } = {};
    for (const key of keys) {
      const record: IStoredRecord | undefined = await this.store.read(key);
      if (record === undefined) {
        continue;
      }
      const parsed: IParseResult<IMarketingArtifactEnvelopeV1> = parseEnvelope(JSON.parse(record.value));
      const envelope: IMarketingArtifactEnvelopeV1 | undefined = parsed.value;
      if (envelope === undefined || envelope.workId !== workId || (kind !== undefined && envelope.kind !== kind)) {
        continue;
      }
      const held: IMarketingArtifactEnvelopeV1 | undefined = latest[envelope.artifactId];
      if (held === undefined || held.revision < envelope.revision) {
        latest[envelope.artifactId] = envelope;
      }
    }
    return Object.keys(latest)
      .sort()
      .map((id: string): IMarketingArtifactEnvelopeV1 => latest[id]);
  }

  public async writeRequest(request: IReviewRequestRecord): Promise<IWriteOutcome> {
    return this.store.write(`request:${request.requestId}`, JSON.stringify(request), { ifAbsent: true });
  }

  public async requestsFor(artifactId: string): Promise<IReviewRequestRecord[]> {
    const keys: string[] = await this.store.keys('request:');
    const requests: IReviewRequestRecord[] = [];
    for (const key of keys) {
      const record: IStoredRecord | undefined = await this.store.read(key);
      if (record !== undefined) {
        const request: IReviewRequestRecord = JSON.parse(record.value) as IReviewRequestRecord;
        if (request.target.artifactId === artifactId) {
          requests.push(request);
        }
      }
    }
    return requests;
  }

  public async writeDecision(decision: IMarketingReviewDecisionV1, options: { expectedVersion?: string; ifAbsent?: boolean }): Promise<IWriteOutcome> {
    return this.store.write(`decision:${decision.reviewId}`, JSON.stringify(decision), options);
  }

  public async readDecision(reviewId: string): Promise<{ decision: IMarketingReviewDecisionV1; storeVersion: string } | undefined> {
    const record: IStoredRecord | undefined = await this.store.read(`decision:${reviewId}`);
    if (record === undefined) {
      return undefined;
    }
    const parsed: IParseResult<IMarketingReviewDecisionV1> = parseReviewDecision(JSON.parse(record.value));
    return parsed.value === undefined ? undefined : { decision: parsed.value, storeVersion: record.version };
  }

  public async decisionsFor(artifactId: string): Promise<IMarketingReviewDecisionV1[]> {
    const keys: string[] = await this.store.keys('decision:');
    const decisions: IMarketingReviewDecisionV1[] = [];
    for (const key of keys) {
      const record: IStoredRecord | undefined = await this.store.read(key);
      if (record !== undefined) {
        const parsed: IParseResult<IMarketingReviewDecisionV1> = parseReviewDecision(JSON.parse(record.value));
        if (parsed.value !== undefined && parsed.value.target.artifactId === artifactId) {
          decisions.push(parsed.value);
        }
      }
    }
    return decisions;
  }

  public async writeReceipt(receipt: IReceipt): Promise<IWriteOutcome> {
    return this.store.write(`receipt:${receipt.receiptId}`, JSON.stringify(receipt), { ifAbsent: true });
  }

  public async readReceipt(receiptId: string): Promise<IReceipt | undefined> {
    const record: IStoredRecord | undefined = await this.store.read(`receipt:${receiptId}`);
    return record === undefined ? undefined : (JSON.parse(record.value) as IReceipt);
  }

  public async writeIntent(intent: IIntentRecord, options: { ifAbsent?: boolean; expectedVersion?: string } = {}): Promise<IWriteOutcome> {
    return this.store.write(`intent:${intent.key}`, JSON.stringify(intent), options);
  }

  public async readIntent(key: string): Promise<{ intent: IIntentRecord; storeVersion: string } | undefined> {
    const record: IStoredRecord | undefined = await this.store.read(`intent:${key}`);
    return record === undefined ? undefined : { intent: JSON.parse(record.value) as IIntentRecord, storeVersion: record.version };
  }

  public async writeAuthority(binding: IAuthorityBinding): Promise<IWriteOutcome> {
    return this.store.write(`authority:${binding.bindingRef}`, JSON.stringify(binding));
  }

  public async readAuthority(bindingRef: string): Promise<IAuthorityBinding | undefined> {
    const record: IStoredRecord | undefined = await this.store.read(`authority:${bindingRef}`);
    return record === undefined ? undefined : (JSON.parse(record.value) as IAuthorityBinding);
  }

  public async authorities(): Promise<IAuthorityBinding[]> {
    const keys: string[] = await this.store.keys('authority:');
    const bindings: IAuthorityBinding[] = [];
    for (const key of keys) {
      const record: IStoredRecord | undefined = await this.store.read(key);
      if (record !== undefined) {
        bindings.push(JSON.parse(record.value) as IAuthorityBinding);
      }
    }
    return bindings;
  }

  public async writeSnapshot(registerId: string, version: string, snapshotText: string): Promise<IWriteOutcome> {
    return this.store.write(`snapshot:${registerId}:${version}`, snapshotText, { ifAbsent: true });
  }

  /** The state of one revision from everything the store holds about its artifact. */
  public async stateOf(envelope: IMarketingArtifactEnvelopeV1, currentRegisterSnapshotHash: string, now: Date): Promise<ArtifactState> {
    const [revisions, requests, decisions] = await Promise.all([this.revisionsOf(envelope.artifactId), this.requestsFor(envelope.artifactId), this.decisionsFor(envelope.artifactId)]);
    return deriveState({ envelope, revisions, requests, decisions, currentRegisterSnapshotHash, now });
  }
}

/** Exact revision identity the review records bind. A method of the class would be a Tailwind utility name. */
export function artifactRefOf(envelope: IMarketingArtifactEnvelopeV1): IArtifactRef {
  return { kind: envelope.kind, artifactId: envelope.artifactId, revision: envelope.revision, payloadHash: envelope.payloadHash };
}
