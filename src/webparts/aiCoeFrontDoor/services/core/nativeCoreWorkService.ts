import { payloadHash } from '../../content/actionEnvelope';
import { CANONICAL_ID, CANONICAL_WORK_ID } from '../../content/workIdentity';
import type { IDraftReferences } from '../serverDraftStore';
import type { IServiceContext } from '../types';
import type { ICommandObservation } from './coreClient';
import { CORE_OPERATIONS, PACKET_STATUSES, isCoreError, parseRequest, parseResponse, parseS1, toEmployeeWork } from './coreContract';
import type { CoreOperation, CoreRequest, IContractIssue, IWorkProjection, IS1, KnownAssumedUnknown } from './coreContract';
import type { CoreCallResult, ICoreSession, ICoreWorkService, IWorkAssociation } from './coreWorkService';
import { PACKET_PROJECTION_EXTENSION } from './packetProjection';
import type { IPacketListResult, IWorkPacketProjection } from './packetProjection';

export interface INativeCoreBinding {
  contractVersion: 'v0.2.0';
  requestListId: string;
  resultListId: string;
  tenantLabel: string;
  /** Operator qualification reference is a preflight, never a substitute for server authorization. */
  qualified: boolean;
  qualificationReceiptRef: string;
  testRecord: boolean;
}
export interface INativeCoreOptions {
  binding: INativeCoreBinding;
  references?: IDraftReferences;
}
interface IPendingReference {
  key: string;
  operation: CoreOperation;
  workId: string;
  digest: string;
  correlationId: string;
  requestItemId?: number;
}
interface IExchange {
  reference: IPendingReference;
  response?: unknown;
  request?: CoreRequest;
  reason?: string;
}
const GUID: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADERS: { [name: string]: string } = { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata' };

/** v0.2.0 native split transport. The browser writes requests only; all canonical changes are service-owned. */
export class NativeCoreWorkService implements ICoreWorkService {
  public readonly mode: 'live' = 'live';
  public readonly label: string = 'Native CORE — server-authorized case workspace';
  public readonly enabled: boolean;
  public readonly liveReasons: readonly string[];
  private readonly _versions: { [workId: string]: number } = {};
  private readonly _packets: { [packetId: string]: IWorkPacketProjection } = {};
  private _queue: Promise<unknown> = Promise.resolve();

  public constructor(private readonly _context: IServiceContext, private readonly _options: INativeCoreOptions) {
    const binding: INativeCoreBinding = _options.binding;
    this.enabled = binding.contractVersion === 'v0.2.0' && GUID.test(binding.requestListId) && GUID.test(binding.resultListId)
      && binding.requestListId.toLowerCase() !== binding.resultListId.toLowerCase() && binding.qualified === true
      && CANONICAL_ID.test(binding.qualificationReceiptRef) && binding.tenantLabel.trim() !== '' && binding.tenantLabel !== 'UNBOUND'
      && typeof binding.testRecord === 'boolean' && _options.references !== undefined && /^https:\/\//i.test(_context.siteUrl);
    this.liveReasons = this.enabled ? [] : ['Native CORE requires distinct bound request/result lists, v0.2.0 qualification, tenant scope and durable opaque recovery references.'];
  }

  public async createOrResume(session: ICoreSession, input: { s1: IS1; workId?: string | null; localRecordId?: string | null; changedFields?: (keyof IS1)[] }): Promise<CoreCallResult> {
    const body: { [name: string]: unknown } = { S1: input.s1 };
    if (input.workId) {
      if (this._versions[input.workId] === undefined) {
        return { kind: 'disabled', reasons: ['Read the current work status before saving a clarification.'] };
      }
      body.WorkID = input.workId;
      body.ExpectedVersion = this._versions[input.workId];
      if (input.changedFields !== undefined) {
        const patch: { [key: string]: unknown } = {};
        input.changedFields.forEach((key: keyof IS1): void => { if (input.s1[key] !== undefined) { patch[key] = input.s1[key]; } });
        body.S1 = patch;
      }
    }
    if (input.localRecordId) {
      return { kind: 'disabled', reasons: ['Legacy association requires the qualified server mapping contract; existing IntakeId and CoEID are not rewritten.'] };
    }
    return this._call(session, 'CreateOrResumeWork', body);
  }
  public async getStatus(session: ICoreSession, workId: string): Promise<CoreCallResult> {
    return this._call(session, 'GetWorkStatus', { WorkID: workId });
  }
  public async listMine(session: ICoreSession): Promise<CoreCallResult> {
    return this._call(session, 'ListMyWork', { Requester: session.actorId });
  }
  public async requestReadiness(session: ICoreSession, workId: string): Promise<CoreCallResult> {
    if (this._versions[workId] === undefined) {
      return { kind: 'disabled', reasons: ['Read the current work status before requesting readiness.'] };
    }
    return this._call(session, 'RequestDecisionReadiness', { WorkID: workId, ExpectedVersion: this._versions[workId] });
  }
  public async submitEvidence(session: ICoreSession, input: { workId: string; evidencePacketId: string; response: string; knownAssumedUnknown: KnownAssumedUnknown }): Promise<CoreCallResult> {
    const packet: IWorkPacketProjection | undefined = this._packets[input.evidencePacketId];
    if (packet === undefined || packet.workId !== input.workId) {
      return { kind: 'disabled', reasons: ['Read a current authorized evidence packet before submitting its response.'] };
    }
    return this._call(session, 'SubmitEvidenceResponse', { WorkID: input.workId, EvidencePacketID: input.evidencePacketId, ExpectedVersion: packet.currentVersion, Response: input.response, KnownAssumedUnknown: input.knownAssumedUnknown });
  }
  public async listPackets(session: ICoreSession, workId: string): Promise<IPacketListResult> {
    const result: CoreCallResult = await this._call(session, 'ListEvidencePackets', { WorkID: workId });
    return { extension: PACKET_PROJECTION_EXTENSION, workId, packets: result.kind === 'ok' ? result.packets ?? [] : [], unboundReasons: result.kind === 'ok' ? [] : result.kind === 'disabled' ? result.reasons : [result.observation.reason ?? 'The authorized packet result is not confirmed.'] };
  }
  public associationOf(_workId: string): IWorkAssociation | undefined { return undefined; }
  public async validateEvidence(session: ICoreSession, input: { workId: string; evidencePacketId: string; disposition: 'VALIDATED' | 'REJECTED' | 'NOT_APPLICABLE'; assertion: string; sourceRefs: string[] }): Promise<CoreCallResult> {
    const packet: IWorkPacketProjection | undefined = this._packets[input.evidencePacketId];
    if (!packet || packet.workId !== input.workId || !['VALIDATED', 'REJECTED', 'NOT_APPLICABLE'].includes(input.disposition)
      || typeof input.assertion !== 'string' || input.assertion.trim().length < 10 || input.assertion.length > 8000
      || !Array.isArray(input.sourceRefs) || input.sourceRefs.length === 0 || !input.sourceRefs.every((ref: string): boolean => typeof ref === 'string' && ref.trim().length > 0)) {
      return { kind: 'disabled', reasons: ['Human validation requires a current packet, explicit disposition, meaningful assertion and supporting references.'] };
    }
    return this._call(session, 'ValidateEvidencePacket', { WorkID: input.workId, EvidencePacketID: input.evidencePacketId, ExpectedVersion: packet.currentVersion, Disposition: input.disposition, Assertion: input.assertion, SourceRefs: input.sourceRefs });
  }
  public recoverPending(session: ICoreSession): Promise<CoreCallResult | undefined> {
    const running: Promise<CoreCallResult | undefined> = this._queue.catch((): void => undefined).then(async (): Promise<CoreCallResult | undefined> => {
      if (!this._allowed(session)) { return { kind: 'disabled', reasons: ['Recovery is unavailable for this caller/site binding.'] }; }
      try {
        const reference: IPendingReference | undefined = this._readReference(await this._referenceKey());
        return reference === undefined ? undefined : await this._result({ reference, response: await this._poll(reference) });
      } catch { return { kind: 'disabled', reasons: ['The original CORE intent remains unresolved. No new mutation was submitted.'] }; }
    });
    this._queue = running;
    return running;
  }
  public persistenceSnapshot(): { associations: { [workId: string]: IWorkAssociation }; evals: { [workId: string]: number } } {
    return { associations: {}, evals: {} };
  }

  private _allowed(session: ICoreSession): boolean {
    return this.enabled && session.actorId.toLowerCase() === this._context.user.email.toLowerCase()
      && session.tenantScope.replace(/\/$/, '') === this._context.siteUrl.replace(/\/$/, '');
  }
  private async _referenceKey(): Promise<string> {
    const digest: string | undefined = await payloadHash({ site: this._context.siteUrl, actor: this._context.user.email.toLowerCase(), requests: this._options.binding.requestListId, results: this._options.binding.resultListId });
    if (!digest) { throw new Error('Scoped recovery identity is unavailable.'); }
    return `overture-ai-coe-front-door:core-reference:${digest}`;
  }
  private _readReference(storageKey: string): IPendingReference | undefined {
    const text: string | null | undefined = this._options.references?.getItem(storageKey);
    if (!text) { return undefined; }
    const raw = JSON.parse(text) as IPendingReference;
    if (raw === null || !/^cmd2-[0-9a-f-]{36}$/i.test(raw.key) || ![...CORE_OPERATIONS, 'ListEvidencePackets', 'ValidateEvidencePacket'].includes(raw.operation)
      || !/^[0-9a-f]{64}$/.test(raw.digest) || !CANONICAL_ID.test(raw.correlationId) || (raw.workId !== '' && !CANONICAL_WORK_ID.test(raw.workId))) {
      throw new Error('Recovery reference is invalid; reconcile it before writing.');
    }
    if (raw.requestItemId !== undefined && (!Number.isInteger(raw.requestItemId) || raw.requestItemId < 1)) { throw new Error('Invalid request item reference.'); }
    return { key: raw.key, operation: raw.operation, workId: raw.workId, digest: raw.digest, correlationId: raw.correlationId, requestItemId: raw.requestItemId };
  }
  private _call(session: ICoreSession, operation: CoreOperation, business: { [name: string]: unknown }): Promise<CoreCallResult> {
    const running: Promise<CoreCallResult> = this._queue.catch((): void => undefined).then(async (): Promise<CoreCallResult> => {
      if (!this._allowed(session)) { return { kind: 'disabled', reasons: this.enabled ? ['The current caller and site do not match this service instance.'] : this.liveReasons }; }
      try { return await this._result(await this._exchange(operation, business)); }
      catch { return { kind: 'disabled', reasons: ['CORE could not confirm this request. Preserve the pending intent and reconcile it; no automatic second write is allowed.'] }; }
    });
    this._queue = running;
    return running;
  }
  private async _exchange(operation: CoreOperation, business: { [name: string]: unknown }): Promise<IExchange> {
    const storageKey: string = await this._referenceKey();
    const digest: string | undefined = await payloadHash(business);
    if (!digest) { throw new Error('Request digest is unavailable.'); }
    let reference: IPendingReference | undefined = this._readReference(storageKey);
    let request: CoreRequest | undefined;
    if (reference !== undefined && (reference.operation !== operation || reference.digest !== digest)) {
      return { reference, reason: 'An earlier CORE command is unresolved. Recover that result before issuing another command.' };
    }
    if (reference === undefined) {
      await this._currentPrincipalId();
      if (typeof globalThis.crypto?.randomUUID !== 'function') { throw new Error('Secure request identity is unavailable.'); }
      const key: string = `cmd2-${globalThis.crypto.randomUUID()}`;
      reference = { key, operation, workId: typeof business.WorkID === 'string' ? business.WorkID : '', digest, correlationId: `CORR-${globalThis.crypto.randomUUID().toUpperCase()}` };
      const body = { ...business, Context: { CorrelationID: reference.correlationId, IdempotencyKey: key, ClientVersion: 'spfx-core-v0.2.0', TenantLabel: this._options.binding.tenantLabel, TestRecord: this._options.binding.testRecord } };
      const legacyBody: { [name: string]: unknown } = { ...body };
      delete legacyBody.ExpectedVersion;
      const partial: boolean = operation === 'CreateOrResumeWork' && typeof business.WorkID === 'string';
      if (partial) {
        const issues: IContractIssue[] = [];
        if (parseS1(business.S1, 'request.S1', issues, true) === undefined || issues.length > 0) { throw new Error('Invalid partial S1 clarification.'); }
      }
      const check = operation === 'ValidateEvidencePacket' || partial
        ? parseRequest('GetWorkStatus', { Context: body.Context, WorkID: business.WorkID })
        : parseRequest(operation === 'ListEvidencePackets' ? 'GetWorkStatus' : operation, legacyBody);
      if (!check.valid) { throw new Error('Request validation failed before writing.'); }
      request = body as CoreRequest;
      this._options.references!.setItem(storageKey, JSON.stringify(reference));
      const payload = { Title: key, ContractVersion: 'v0.2.0', Operation: operation, WorkID: reference.workId, RequestJson: JSON.stringify(body), TestRecord: this._options.binding.testRecord };
      try {
        // Even an error response cannot prove absence; keep the key and only read its service-owned result.
        const posted = await this._context.client.post(this._url(this._options.binding.requestListId), this._context.configuration, { headers: HEADERS, body: JSON.stringify(payload) });
        if (posted.ok) {
          const row = await posted.json() as { Id?: unknown };
          if (typeof row.Id === 'number' && Number.isInteger(row.Id) && row.Id > 0) {
            reference.requestItemId = row.Id;
            this._options.references!.setItem(storageKey, JSON.stringify(reference));
          }
        }
      } catch { /* The next read reconciles a lost response without resubmitting. */ }
    }
    return { reference, request, response: await this._poll(reference) };
  }
  private _url(listId: string): string { return `${this._context.siteUrl.replace(/\/$/, '')}/_api/web/lists(guid'${listId}')/items`; }
  private async _currentPrincipalId(): Promise<number> {
    const response = await this._context.client.get(`${this._context.siteUrl.replace(/\/$/, '')}/_api/web/currentuser?$select=Id,Email`, this._context.configuration, { headers: HEADERS });
    if (!response.ok) { throw new Error('Current native identity is unavailable.'); }
    const user = await response.json() as { Id?: unknown; Email?: unknown };
    if (typeof user.Id !== 'number' || !Number.isInteger(user.Id) || user.Id < 1 || typeof user.Email !== 'string' || user.Email.toLowerCase() !== this._context.user.email.toLowerCase()) {
      throw new Error('The native caller differs from the current page identity.');
    }
    return user.Id;
  }
  private async _poll(reference: IPendingReference): Promise<unknown | undefined> {
    const authorId: number = await this._currentPrincipalId();
    const query: string = encodeURIComponent(`Title eq '${reference.key}' and Published eq true`);
    const response = await this._context.client.get(`${this._url(this._options.binding.resultListId)}?$filter=${query}&$top=2`, this._context.configuration, { headers: HEADERS });
    if (!response.ok) { throw new Error('The service-owned result could not be read.'); }
    const data = await response.json() as { value?: unknown };
    if (!Array.isArray(data.value) || data.value.length > 1) { throw new Error('Result identity is ambiguous.'); }
    if (data.value.length === 0) { return undefined; }
    const row = data.value[0] as { [name: string]: unknown };
    if (row.Title !== reference.key || row.Operation !== reference.operation || row.ContractVersion !== 'v0.2.0' || row.Published !== true
      || row.RequestAuthorID !== authorId || typeof row.RequestItemID !== 'number' || !Number.isInteger(row.RequestItemID) || row.RequestItemID < 1
      || (reference.requestItemId !== undefined && row.RequestItemID !== reference.requestItemId)
      || typeof row.ResponseJson !== 'string' || typeof row.ReceiptID !== 'string' || !CANONICAL_ID.test(row.ReceiptID) || row.ReceiptID === 'RCPT-NONE') {
      throw new Error('Result identity or receipt did not validate.');
    }
    const body = JSON.parse(row.ResponseJson) as { ReceiptID?: unknown; Result?: unknown };
    if (body.ReceiptID !== row.ReceiptID || body.Result !== row.Result) { throw new Error('Result envelope disagrees with its stored body.'); }
    return body;
  }
  private async _result(exchange: IExchange): Promise<CoreCallResult> {
    const reference: IPendingReference = exchange.reference;
    const observation: ICommandObservation = {
      phase: 'queued', observation: 'queued', polls: 1, observedAt: new Date().toISOString(), reason: exchange.reason ?? 'The original command is pending. Refresh/recover it; do not create another mutation.',
      handle: { operation: reference.operation, request: exchange.request, key: { key: reference.key, operation: reference.operation, scope8: '', caller8: '', workRef: reference.workId || 'new', digest: reference.digest, digest16: reference.digest.slice(0, 16), intent: { kind: 'mutation' } } }
    };
    if (exchange.response === undefined) { return { kind: 'failed', observation }; }
    let packets: IWorkPacketProjection[] | undefined;
    let response: unknown = exchange.response;
    if (reference.operation === 'ListEvidencePackets') {
      const raw = response as { Result?: unknown; ReceiptID?: unknown; Work?: unknown; Packets?: unknown };
      if (raw.Result === 'PASS') {
        packets = this._parsePackets(raw.Packets, reference.workId);
        response = { Result: raw.Result, ReceiptID: raw.ReceiptID, Work: raw.Work };
      }
    }
    const responseOperation: CoreOperation = reference.operation === 'ListEvidencePackets' ? 'GetWorkStatus' : reference.operation === 'ValidateEvidencePacket' ? 'SubmitEvidenceResponse' : reference.operation;
    const check = parseResponse(responseOperation, response, 'v0.2.0');
    if (!check.valid || check.value === undefined) {
      return { kind: 'failed', observation: { ...observation, phase: 'inconclusive', observation: 'inconclusive', reason: 'The returned operation body is malformed. The original intent remains pending for reconciliation.' } };
    }
    const body = check.value;
    if (!isCoreError(body) && 'Work' in body && body.Work && reference.workId !== '' && body.Work.WorkID !== reference.workId) {
      return { kind: 'failed', observation: { ...observation, phase: 'inconclusive', observation: 'inconclusive', reason: 'The result references a different work record.' } };
    }
    if (isCoreError(body) && (body.Result === 'INCONCLUSIVE' || body.Result === 'RECONCILIATION_REQUIRED' || body.ErrorClass === 'FLOW_FAILURE')) {
      return { kind: 'failed', observation: { ...observation, response: body, phase: 'inconclusive', observation: 'inconclusive', reason: 'The write remains uncertain; the original intent is retained for reconciliation.' } };
    }
    this._options.references!.removeItem(await this._referenceKey());
    observation.response = body;
    observation.phase = 'completed'; observation.observation = 'completed'; observation.reason = undefined;
    if (isCoreError(body)) { return { kind: 'failed', observation }; }
    const work: IWorkProjection | undefined = 'Work' in body ? body.Work : undefined;
    if (work) { this._cacheWork(work, reference.operation === 'SubmitEvidenceResponse' || reference.operation === 'ValidateEvidencePacket'); }
    if ('Items' in body) { body.Items.forEach((item: IWorkProjection): void => { this._cacheWork(item); }); }
    if (packets) { packets.forEach((packet: IWorkPacketProjection): void => { this._packets[packet.packetId] = packet; }); }
    return { kind: 'ok', observation, work: work ? toEmployeeWork(work) : undefined, created: 'Created' in body ? body.Created : undefined, packets };
  }
  private _cacheWork(work: IWorkProjection, invalidatePackets: boolean = false): void {
    if (invalidatePackets || this._versions[work.WorkID] !== work.Version) {
      Object.keys(this._packets).forEach((id: string): void => { if (this._packets[id].workId === work.WorkID) { delete this._packets[id]; } });
    }
    this._versions[work.WorkID] = work.Version;
  }
  private _parsePackets(value: unknown, workId: string): IWorkPacketProjection[] {
    if (!Array.isArray(value)) { throw new Error('Packet projection is not an array.'); }
    const seen: Set<string> = new Set<string>();
    return value.map((raw: { [name: string]: unknown }): IWorkPacketProjection => {
      if (!raw || typeof raw.EvidencePacketID !== 'string' || !CANONICAL_ID.test(raw.EvidencePacketID) || seen.has(raw.EvidencePacketID) || raw.WorkID !== workId
        || typeof raw.EvidenceType !== 'string' || !Array.isArray(raw.Questions) || !raw.Questions.every((question: unknown): boolean => typeof question === 'string')
        || (raw.AssignedRole !== null && typeof raw.AssignedRole !== 'string') || (raw.AssignedPerson !== null && typeof raw.AssignedPerson !== 'string')
        || typeof raw.Version !== 'number' || !Number.isInteger(raw.Version) || raw.Version < 1 || typeof raw.CaseContentVersion !== 'number' || !Number.isInteger(raw.CaseContentVersion) || raw.CaseContentVersion < 1
        || !PACKET_STATUSES.some((status): boolean => status === raw.Status) || !['REQUIRED', 'OPTIONAL', 'NOT_APPLICABLE'].includes(String(raw.Applicability))
        || (raw.Response !== null && typeof raw.Response !== 'string') || !['KNOWN', 'ASSUMED', 'UNKNOWN', 'MIXED'].includes(String(raw.KnownAssumedUnknown))) {
        throw new Error('Packet identity, scope or version did not validate.');
      }
      seen.add(raw.EvidencePacketID);
      return { packetId: raw.EvidencePacketID, workId, packetType: raw.EvidenceType, questions: raw.Questions as string[], assignedRole: raw.AssignedRole as string | null, assignedPerson: raw.AssignedPerson as string | null,
        dueDate: null, currentVersion: raw.Version, status: raw.Status as IWorkPacketProjection['status'], required: raw.Applicability === 'REQUIRED', extension: true,
        response: typeof raw.Response === 'string' ? raw.Response : undefined, knownAssumedUnknown: raw.KnownAssumedUnknown as string };
    });
  }
}
