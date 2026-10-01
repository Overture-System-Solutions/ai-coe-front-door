/**
 * The CORE Binding A case service the web part hands to the consolidated view.
 *
 * Two modes. The synthetic bundle runs the real command-key adapter, the real operation validators, the real
 * Binding A client (write then poll the same Title) and a local engine that follows the generated 3.0.0.0 flow
 * semantics. Every record is a test record. The live bundle is the same typed surface over an unbound SharePoint
 * transport: every call fails closed with the reasons in LIVE_CORE_REASONS. Production instances receive the live
 * bundle. Preview and tests receive the synthetic one. Neither is a flag that turns a fixture into a tenant write.
 *
 * Dual-write is refused: a Home sentence still becomes an idea draft on the existing intake path. CORE create is a
 * separate labelled workspace. Existing IntakeId/CoEID values are never overwritten; an association to the Work ID
 * CORE returned is stored beside them.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { businessPayloadOf, deriveCommandKey } from './commandKey';
import type { CommandIntent, ICommandKey } from './commandKey';
import type { IStorageBackend } from '../marketing/artifactStore';
import { MemoryCommandTransport } from './commandTransport';
import type { ICommandRow, ICommandTransport } from './commandTransport';
import { CoreClient } from './coreClient';
import type { ICommandObservation, IPollClock } from './coreClient';
import { INSTANT_CLOCK } from './coreClient';
import { CLIENT_VERSION, LIVE_CORE_REASONS, UNBOUND_CORE_BINDING } from './coreConfig';
import type { ICoreBindingConfig } from './coreConfig';
import type {
  CoreOperation,
  CoreRequest,
    ICreateOrResumeRequest,
    IEmployeeWork,
  IGetWorkStatusRequest,
  IListMyWorkRequest,
  IRequestReadinessRequest,
  IS1,
  ISubmitEvidenceRequest,
  IWorkProjection,
  KnownAssumedUnknown
} from './coreContract';
import { isCoreError, toEmployeeWork } from './coreContract';
import { LocalCoreEngine } from './localCoreEngine';
import { PACKET_PROJECTION_EXTENSION, PACKET_PROJECTION_UNBOUND } from './packetProjection';
import type { IPacketListResult, IWorkPacketProjection } from './packetProjection';

export type CoreMode = 'synthetic' | 'live';

export interface IWorkAssociation {
  workId: string;
  localRecordId: string | null;
  callerId: string;
  createdAt: string;
}

export interface ICoreSession {
  actorId: string;
  tenantScope: string;
}

export type CoreCallResult =
  | { kind: 'ok'; observation: ICommandObservation; work?: IEmployeeWork; created?: boolean; packets?: IWorkPacketProjection[] }
  | { kind: 'disabled'; reasons: readonly string[] }
  | { kind: 'failed'; observation: ICommandObservation };

export interface ICoreWorkService {
  readonly mode: CoreMode;
  readonly label: string;
  readonly enabled: boolean;
  readonly liveReasons: readonly string[];
  createOrResume(session: ICoreSession, input: { s1: IS1; workId?: string | null; localRecordId?: string | null; changedFields?: (keyof IS1)[] }): Promise<CoreCallResult>;
  getStatus(session: ICoreSession, workId: string): Promise<CoreCallResult>;
  listMine(session: ICoreSession): Promise<CoreCallResult>;
  submitEvidence(session: ICoreSession, input: { workId: string; evidencePacketId: string; response: string; knownAssumedUnknown: KnownAssumedUnknown }): Promise<CoreCallResult>;
  requestReadiness(session: ICoreSession, workId: string): Promise<CoreCallResult>;
  listPackets(session: ICoreSession, workId: string): Promise<IPacketListResult>;
  recoverPending?(session: ICoreSession): Promise<CoreCallResult | undefined>;
  validateEvidence?(session: ICoreSession, input: { workId: string; evidencePacketId: string; disposition: 'VALIDATED' | 'REJECTED' | 'NOT_APPLICABLE'; assertion: string; sourceRefs: string[] }): Promise<CoreCallResult>;
  associationOf(workId: string): IWorkAssociation | undefined;
  persistenceSnapshot(): { associations: { [workId: string]: IWorkAssociation }; evals: { [workId: string]: number } };
}

export interface ICoreWorkOptions {
  clock?: IPollClock;
  now?: () => Date;
  binding?: ICoreBindingConfig;
  newCorrelation?: () => string;
  /** Optional durable backend so a synthetic restart recovers the same commands and work. */
  backend?: IStorageBackend;
}

let correlationSerial: number = 1;

function nextCorrelation(): string {
  const n: string = String(correlationSerial).padStart(3, '0');
  correlationSerial += 1;
  return `CORR-LOCAL-${n}`;
}

function contextOf(session: ICoreSession, key: string, binding: ICoreBindingConfig, testRecord: boolean, newCorrelation: () => string): ICreateOrResumeRequest['Context'] {
  return {
    CorrelationID: newCorrelation(),
    IdempotencyKey: key,
    ClientVersion: binding.clientVersion,
    TenantLabel: binding.tenantLabel,
    TestRecord: testRecord
  };
}

/** A new page lifetime must not reuse a completed read from an earlier session. */
function nextReadGeneration(previous: number | undefined): number {
  if (previous !== undefined && previous < Number.MAX_SAFE_INTEGER) {
    return previous + 1;
  }
  if (globalThis.crypto === undefined || typeof globalThis.crypto.getRandomValues !== 'function') {
    throw new Error('Secure randomness is unavailable; a fresh read intent cannot be created.');
  }
  const words: Uint32Array = globalThis.crypto.getRandomValues(new Uint32Array(2));
  return (words[0] & 0x1fffff) * 0x100000000 + words[1];
}

class CoreWorkService implements ICoreWorkService {
  public readonly enabled: boolean;
  private readonly _reads: { [slot: string]: number } = {};
  private readonly _evals: { [workId: string]: number } = {};
  private readonly _associations: { [workId: string]: IWorkAssociation } = {};
  private readonly _client: CoreClient;
  private readonly _clock: IPollClock;
  private readonly _now: () => Date;
  private readonly _binding: ICoreBindingConfig;
  private readonly _newCorrelation: () => string;
  private readonly _engine: LocalCoreEngine | undefined;
  private readonly _persist: (() => void) | undefined;

  public constructor(
    public readonly mode: CoreMode,
    public readonly label: string,
    public readonly liveReasons: readonly string[],
    transport: ICommandTransport,
    options: ICoreWorkOptions & { engine?: LocalCoreEngine; persist?: () => void; associations?: { [workId: string]: IWorkAssociation }; evals?: { [workId: string]: number } } = {}
  ) {
    this.enabled = this.liveReasons.length === 0;
    this._clock = options.clock ?? INSTANT_CLOCK;
    this._now = options.now ?? ((): Date => new Date());
    this._binding = options.binding ?? { ...UNBOUND_CORE_BINDING, clientVersion: CLIENT_VERSION };
    this._newCorrelation = options.newCorrelation ?? nextCorrelation;
    this._client = new CoreClient(transport, this._clock);
    this._engine = options.engine;
    this._persist = options.persist;
    if (options.associations !== undefined) {
      for (const id of Object.keys(options.associations)) {
        this._associations[id] = options.associations[id];
      }
    }
    if (options.evals !== undefined) {
      for (const id of Object.keys(options.evals)) {
        this._evals[id] = options.evals[id];
      }
    }
  }

  public associationOf(workId: string): IWorkAssociation | undefined {
    return this._associations[workId];
  }

  public persistenceSnapshot(): { associations: { [workId: string]: IWorkAssociation }; evals: { [workId: string]: number } } {
    return { associations: { ...this._associations }, evals: { ...this._evals } };
  }

  public async createOrResume(session: ICoreSession, input: { s1: IS1; workId?: string | null; localRecordId?: string | null; changedFields?: (keyof IS1)[] }): Promise<CoreCallResult> {
    if (!this.enabled) {
      return { kind: 'disabled', reasons: this.liveReasons };
    }
    const resume: boolean = typeof input.workId === 'string' && input.workId !== '';
    const request: ICreateOrResumeRequest = {
      Context: contextOf(session, 'pending', this._binding, true, this._newCorrelation),
      S1: input.s1
    };
    if (resume) {
      request.WorkID = input.workId;
    } else {
      request.WorkID = null;
    }
    const observation: ICommandObservation = await this._run(session, 'CreateOrResumeWork', request, { kind: 'mutation' }, resume ? (input.workId as string) : null);
    return this._finish(observation, input.localRecordId ?? null, session.actorId);
  }

  public async getStatus(session: ICoreSession, workId: string): Promise<CoreCallResult> {
    if (!this.enabled) {
      return { kind: 'disabled', reasons: this.liveReasons };
    }
    const slot: string = `status:${session.actorId}:${workId}`;
    const generation: number = nextReadGeneration(this._reads[slot]);
    this._reads[slot] = generation;
    const request: IGetWorkStatusRequest = {
      Context: contextOf(session, 'pending', this._binding, true, this._newCorrelation),
      WorkID: workId
    };
    return this._finish(await this._run(session, 'GetWorkStatus', request, { kind: 'read', generation }, workId));
  }

  public async listMine(session: ICoreSession): Promise<CoreCallResult> {
    if (!this.enabled) {
      return { kind: 'disabled', reasons: this.liveReasons };
    }
    const slot: string = `list:${session.actorId}`;
    const generation: number = nextReadGeneration(this._reads[slot]);
    this._reads[slot] = generation;
    const request: IListMyWorkRequest = {
      Context: contextOf(session, 'pending', this._binding, true, this._newCorrelation),
      Requester: session.actorId
    };
    return this._finish(await this._run(session, 'ListMyWork', request, { kind: 'read', generation }, null));
  }

  public async submitEvidence(session: ICoreSession, input: { workId: string; evidencePacketId: string; response: string; knownAssumedUnknown: KnownAssumedUnknown }): Promise<CoreCallResult> {
    if (!this.enabled) {
      return { kind: 'disabled', reasons: this.liveReasons };
    }
    const request: ISubmitEvidenceRequest = {
      Context: contextOf(session, 'pending', this._binding, true, this._newCorrelation),
      WorkID: input.workId,
      EvidencePacketID: input.evidencePacketId,
      Response: input.response,
      KnownAssumedUnknown: input.knownAssumedUnknown
    };
    const observation: ICommandObservation = await this._run(session, 'SubmitEvidenceResponse', request, { kind: 'mutation' }, input.workId);
    if (observation.phase === 'completed' && observation.response !== undefined && !isCoreError(observation.response)) {
      this._evals[input.workId] = (this._evals[input.workId] ?? 0) + 1;
    }
    const finished: CoreCallResult = this._finish(observation);
    return finished;
  }

  public async requestReadiness(session: ICoreSession, workId: string): Promise<CoreCallResult> {
    if (!this.enabled) {
      return { kind: 'disabled', reasons: this.liveReasons };
    }
    const inputVersion: number = this._evals[workId] ?? 0;
    const request: IRequestReadinessRequest = {
      Context: contextOf(session, 'pending', this._binding, true, this._newCorrelation),
      WorkID: workId
    };
    return this._finish(await this._run(session, 'RequestDecisionReadiness', request, { kind: 'evaluation', inputVersion }, workId));
  }

  public async listPackets(session: ICoreSession, workId: string): Promise<IPacketListResult> {
    if (this._engine === undefined) {
      return { extension: PACKET_PROJECTION_EXTENSION, workId, packets: [], unboundReasons: PACKET_PROJECTION_UNBOUND };
    }
    const held = this._engine.workOf(workId);
    if (held === undefined || held.requester !== session.actorId) {
      return { extension: PACKET_PROJECTION_EXTENSION, workId, packets: [], unboundReasons: held === undefined ? ['No synthetic work with that identifier exists.'] : ['This work is not yours to read.'] };
    }
    return { extension: PACKET_PROJECTION_EXTENSION, workId, packets: held.packets.slice(), unboundReasons: [] };
  }

  private async _run(session: ICoreSession, operation: CoreOperation, request: CoreRequest, intent: CommandIntent, workId: string | null): Promise<ICommandObservation> {
    const context = request.Context;
    const business: unknown = businessPayloadOf(request as unknown as { [key: string]: unknown });
    const key: ICommandKey | undefined = await deriveCommandKey({
      tenantScope: session.tenantScope,
      callerId: session.actorId,
      operation,
      intent,
      workId,
      businessPayload: business
    });
    if (key === undefined) {
      throw new Error('No digest is available; a command cannot proceed without one.');
    }
    context.IdempotencyKey = key.key;
    return this._client.submit({ key, operation, request });
  }

  private _finish(observation: ICommandObservation, localRecordId: string | null = null, callerId: string = ''): CoreCallResult {
    if (observation.response === undefined || isCoreError(observation.response)) {
      return { kind: 'failed', observation };
    }
    const payload: { Work?: IWorkProjection; Created?: boolean } = observation.response as { Work?: IWorkProjection; Created?: boolean };
    const work = payload.Work !== undefined ? toEmployeeWork(payload.Work) : undefined;
    const created: boolean | undefined = payload.Created;
    if (work !== undefined) {
      this._evals[work.workId] = Math.max(this._evals[work.workId] ?? 0, work.version);
    }
    if (work !== undefined && created === true) {
      this._associations[work.workId] = {
        workId: work.workId,
        localRecordId,
        callerId,
        createdAt: this._now().toISOString()
      };
    }
    if (this._persist !== undefined) {
      this._persist();
    }
    return { kind: 'ok', observation, work, created };
  }
}

export const SYNTHETIC_CORE_LABEL: string =
  'Synthetic Binding A: real command keys, validators and polling over an in-memory command list. Not a tenant write.';

/** Where the practice case service keeps its state in the browser; the offline preview seeds its worked example here. */
export const SYNTHETIC_CORE_STORE_KEY: string = 'overture-ai-coe-front-door:core:synthetic-state';

interface ISyntheticCoreState {
  rows: ICommandRow[];
  engine: { serial: number; works: { [workId: string]: import('./localCoreEngine').IStoredWork } };
  associations: { [workId: string]: IWorkAssociation };
  evals: { [workId: string]: number };
}

function readState(backend: IStorageBackend | undefined): ISyntheticCoreState | undefined {
  if (backend === undefined) {
    return undefined;
  }
  const raw: string | null = backend.getItem(SYNTHETIC_CORE_STORE_KEY);
  if (raw === null || raw === '') {
    return undefined;
  }
  try {
    return JSON.parse(raw) as ISyntheticCoreState;
  } catch {
    return undefined;
  }
}

export function createSyntheticCoreWorkService(callerId: string, options: ICoreWorkOptions = {}): ICoreWorkService {
  const engine: LocalCoreEngine = new LocalCoreEngine(options.now);
  const transport: MemoryCommandTransport = new MemoryCommandTransport(callerId);
  const saved: ISyntheticCoreState | undefined = readState(options.backend);
  if (saved !== undefined) {
    transport.restore(saved.rows);
    engine.load(saved.engine);
  }
  const holder: { service?: ICoreWorkService } = {};
  const persistCore: () => void = (): void => {
    if (options.backend === undefined || holder.service === undefined) {
      return;
    }
    const snap = holder.service.persistenceSnapshot();
    const state: ISyntheticCoreState = { rows: transport.snapshot(), engine: engine.dump(), associations: snap.associations, evals: snap.evals };
    options.backend.setItem(SYNTHETIC_CORE_STORE_KEY, JSON.stringify(state));
  };
  transport.process = async (row: ICommandRow): Promise<ICommandRow> => {
    const completed: ICommandRow = await engine.process(row);
    persistCore();
    return completed;
  };
  holder.service = new CoreWorkService('synthetic', SYNTHETIC_CORE_LABEL, [], transport, {
    ...options,
    engine,
    associations: saved?.associations,
    evals: saved?.evals,
    persist: persistCore,
    binding: { ...UNBOUND_CORE_BINDING, tenantLabel: 'SYNTHETIC-LOCAL', clientVersion: CLIENT_VERSION, testRecord: true }
  });
  return holder.service;
}

export function createDisabledLiveCoreWorkService(options: ICoreWorkOptions = {}): ICoreWorkService {
  const transport: MemoryCommandTransport = new MemoryCommandTransport('unbound');
  return new CoreWorkService(
    'live',
    'Live Binding A: not bound. Command writes stay gated until the five LIVE_BINDINGS_REQUIRED items and the native CORE defects are independently verified.',
    LIVE_CORE_REASONS,
    transport,
    options
  );
}

/** Builds a deferred synthetic transport so tests can observe queued versus processing versus completed. */
export function createDeferredSyntheticCore(callerId: string, options: ICoreWorkOptions = {}): { service: ICoreWorkService; transport: MemoryCommandTransport; engine: LocalCoreEngine } {
  const engine: LocalCoreEngine = new LocalCoreEngine(options.now);
  const transport: MemoryCommandTransport = new MemoryCommandTransport(callerId);
  transport.deferProcessing = true;
  transport.process = (row): Promise<typeof row> => engine.process(row);
  const service: ICoreWorkService = new CoreWorkService('synthetic', SYNTHETIC_CORE_LABEL, [], transport, { ...options, engine, binding: { ...UNBOUND_CORE_BINDING, tenantLabel: 'SYNTHETIC-LOCAL', clientVersion: CLIENT_VERSION, testRecord: true } });
  return { service, transport, engine };
}

/** Employee-facing alias so the rendering layer never names a readiness rating. */
export function evaluateDecisionPacket(service: ICoreWorkService, session: ICoreSession, workId: string): Promise<CoreCallResult> {
  return service.requestReadiness(session, workId);
}
