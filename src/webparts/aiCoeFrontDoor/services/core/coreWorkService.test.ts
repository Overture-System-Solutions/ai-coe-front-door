/**
 * Binding A client and local engine: create Version 1, READY_FOR_ARB, §7a replay, fresh reads, poll the same
 * command, identity isolation, live-disabled reasons, and the packet projection as an extension.
 */
import { MemoryStorageBackend } from '../marketing/artifactStore';
import { parseRequest } from './coreContract';
import type { IS1 } from './coreContract';
import { LIVE_CORE_REASONS } from './coreConfig';
import { PACKET_PROJECTION_EXTENSION } from './packetProjection';
import {
  createDeferredSyntheticCore,
  createDisabledLiveCoreWorkService,
  createSyntheticCoreWorkService
} from './coreWorkService';
import type { ICoreSession, ICoreWorkService } from './coreWorkService';

const PAT: ICoreSession = { actorId: 'pat@contoso.com', tenantScope: 'https://contoso.sharepoint.com/sites/ai' };
const SAM: ICoreSession = { actorId: 'sam@contoso.com', tenantScope: 'https://contoso.sharepoint.com/sites/ai' };

function completeS1(): IS1 {
  return {
    Title: 'Automate a weekly operations pack',
    SourceChannel: 'FRONT_DOOR',
    ProblemStatement: 'Hours spent copying numbers between tools.',
    DesiredOutcome: 'A reviewed weekly pack with less copying.',
    Requester: PAT.actorId,
    Sponsor: 'Named sponsor role (synthetic)',
    DataClassification: 'INTERNAL'
  };
}

function incompleteS1(): IS1 {
  return {
    Title: 'Automate a weekly operations pack',
    SourceChannel: 'FRONT_DOOR',
    DesiredOutcome: 'A reviewed weekly pack with less copying.',
    Requester: PAT.actorId,
    DataClassification: 'INTERNAL'
  };
}

describe('synthetic Binding A work service', () => {
  it('creates with Version 1 and keeps S1 gaps rather than inventing a ready state', async () => {
    const service: ICoreWorkService = createSyntheticCoreWorkService(PAT.actorId);
    const created = await service.createOrResume(PAT, { s1: incompleteS1() });
    expect(created.kind).toBe('ok');
    if (created.kind !== 'ok' || created.work === undefined) {
      return;
    }
    expect(created.created).toBe(true);
    expect(created.work.version).toBe(1);
    expect(created.work.state).toBe('CLARIFYING');
    expect(created.work.openEvidenceGaps).toEqual(['S1_PROBLEM_STATEMENT', 'S1_SPONSOR']);
    expect(created.work.workId.indexOf('CW-LOCAL_')).toBe(0);
    expect(service.associationOf(created.work.workId)?.workId).toBe(created.work.workId);
  });

  it('replays the stored create response including Created:true (§7a), and does not insert a second command', async () => {
    const service: ICoreWorkService = createSyntheticCoreWorkService(PAT.actorId);
    const first = await service.createOrResume(PAT, { s1: completeS1() });
    const second = await service.createOrResume(PAT, { s1: completeS1() });
    expect(first.kind).toBe('ok');
    expect(second.kind).toBe('ok');
    if (first.kind !== 'ok' || second.kind !== 'ok') {
      return;
    }
    expect(second.observation.handle.key.key).toBe(first.observation.handle.key.key);
    expect(second.created).toBe(true);
    expect(second.work?.workId).toBe(first.work?.workId);
  });

  it('mints a fresh GetWorkStatus key on refresh and still returns the current projection', async () => {
    const service: ICoreWorkService = createSyntheticCoreWorkService(PAT.actorId);
    const created = await service.createOrResume(PAT, { s1: completeS1() });
    expect(created.kind).toBe('ok');
    if (created.kind !== 'ok' || created.work === undefined) {
      return;
    }
    const status1 = await service.getStatus(PAT, created.work.workId);
    const status2 = await service.getStatus(PAT, created.work.workId);
    expect(status1.kind).toBe('ok');
    expect(status2.kind).toBe('ok');
    if (status1.kind !== 'ok' || status2.kind !== 'ok') {
      return;
    }
    expect(status1.observation.handle.key.key).not.toBe(status2.observation.handle.key.key);
    expect(status2.work?.workId).toBe(created.work.workId);
  });

  it('polls the same deferred command through queued then completed without inserting a second create', async () => {
    const { service, transport } = createDeferredSyntheticCore(PAT.actorId);
    const submitted = await service.createOrResume(PAT, { s1: completeS1() });
    expect(submitted.kind).toBe('failed');
    if (submitted.kind !== 'failed') {
      return;
    }
    expect(submitted.observation.phase).toBe('queued');
    const title: string = submitted.observation.handle.key.key;
    const completed = await transport.complete(title);
    expect(completed?.result).toBe('PASS');
    expect(completed?.title).toBe(title);
    transport.deferProcessing = false;
    const listed = await service.listMine(PAT);
    expect(listed.kind).toBe('ok');
    if (listed.kind === 'ok' && listed.observation.response !== undefined && listed.observation.response.Result === 'PASS' && 'Items' in listed.observation.response) {
      expect(listed.observation.response.Items.length).toBe(1);
    }
  });

  it('keeps two callers from reading each other\'s work through the command list', async () => {
    const pat: ICoreWorkService = createSyntheticCoreWorkService(PAT.actorId);
    const sam: ICoreWorkService = createSyntheticCoreWorkService(SAM.actorId);
    const created = await pat.createOrResume(PAT, { s1: completeS1() });
    expect(created.kind).toBe('ok');
    if (created.kind !== 'ok' || created.work === undefined) {
      return;
    }
    const stolen = await sam.getStatus(SAM, created.work.workId);
    expect(stolen.kind).toBe('failed');
    const own = await sam.listMine(SAM);
    expect(own.kind).toBe('ok');
    if (own.kind === 'ok') {
      expect(own.observation.response !== undefined && own.observation.response.Result === 'PASS' && 'Items' in own.observation.response ? own.observation.response.Items.length : -1).toBe(0);
    }
  });

  it('returns READY_FOR_ARB rather than the fixture DECISION_READY/PREPARATION pair, and only after S1 and packets exist', async () => {
    const service: ICoreWorkService = createSyntheticCoreWorkService(PAT.actorId);
    const created = await service.createOrResume(PAT, { s1: completeS1() });
    expect(created.kind).toBe('ok');
    if (created.kind !== 'ok' || created.work === undefined) {
      return;
    }
    const early = await service.requestReadiness(PAT, created.work.workId);
    expect(early.kind).toBe('ok');
    if (early.kind === 'ok' && early.work !== undefined) {
      expect(early.work.state).toBe('NOT_DECISION_READY');
    }
    const packets = await service.listPackets(PAT, created.work.workId);
    expect(packets.extension).toBe(PACKET_PROJECTION_EXTENSION);
    expect(packets.packets.length).toBe(4);
    for (const packet of packets.packets) {
      const returned = await service.submitEvidence(PAT, {
        workId: created.work.workId,
        evidencePacketId: packet.packetId,
        response: `Synthetic ${packet.packetType} facts.`,
        knownAssumedUnknown: 'KNOWN'
      });
      expect(returned.kind).toBe('ok');
    }
    const ready = await service.requestReadiness(PAT, created.work.workId);
    expect(ready.kind).toBe('ok');
    if (ready.kind === 'ok' && ready.work !== undefined) {
      expect(ready.work.state).toBe('READY_FOR_ARB');
      expect(ready.work.stage).toBe('DECISION');
    }
  });

  it('uses a new evaluation key after evidence so an earlier NOT_READY result is not replayed', async () => {
    const service: ICoreWorkService = createSyntheticCoreWorkService(PAT.actorId);
    const created = await service.createOrResume(PAT, { s1: completeS1() });
    if (created.kind !== 'ok' || created.work === undefined) {
      expect(created.kind).toBe('ok');
      return;
    }
    const first = await service.requestReadiness(PAT, created.work.workId);
    const packet = (await service.listPackets(PAT, created.work.workId)).packets[0];
    await service.submitEvidence(PAT, { workId: created.work.workId, evidencePacketId: packet.packetId, response: 'More facts.', knownAssumedUnknown: 'KNOWN' });
    const second = await service.requestReadiness(PAT, created.work.workId);
    expect(first.kind).toBe('ok');
    expect(second.kind).toBe('ok');
    if (first.kind === 'ok' && second.kind === 'ok') {
      expect(second.observation.handle.key.key).not.toBe(first.observation.handle.key.key);
    }
  });

  it('recovers the same Work ID after a synthetic restart of the persistent store', async () => {
    const backend: MemoryStorageBackend = new MemoryStorageBackend();
    const first: ICoreWorkService = createSyntheticCoreWorkService(PAT.actorId, { backend });
    const created = await first.createOrResume(PAT, { s1: completeS1(), localRecordId: 'OVT-AICOE-20260922-ABCDEFGH' });
    expect(created.kind).toBe('ok');
    if (created.kind !== 'ok' || created.work === undefined) {
      return;
    }
    const workId: string = created.work.workId;
    const restarted: ICoreWorkService = createSyntheticCoreWorkService(PAT.actorId, { backend });
    const status = await restarted.getStatus(PAT, workId);
    expect(status.kind).toBe('ok');
    if (status.kind === 'ok') {
      expect(status.work?.workId).toBe(workId);
    }
    expect(restarted.associationOf(workId)?.localRecordId).toBe('OVT-AICOE-20260922-ABCDEFGH');
  });

  it('refuses a resume-shaped request that omits Title and SourceChannel (create-shaped v0.1.1 schema)', () => {
    const parsed = parseRequest('CreateOrResumeWork', {
      Context: {
        CorrelationID: 'CORR-LOCAL-001',
        IdempotencyKey: 'cmdk1:aabbccdd:eeff0011:CreateOrResumeWork:m:CW-LOCAL_0001:0123456789abcdef',
        ClientVersion: 'spfx-1.0.0.16',
        TenantLabel: 'SYNTHETIC-LOCAL',
        TestRecord: true
      },
      WorkID: 'CW-LOCAL_0001'
    });
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.join(' ')).toContain('S1');
  });

  it('never exposes RelatedWorkIDs on the employee projection', async () => {
    const service: ICoreWorkService = createSyntheticCoreWorkService(PAT.actorId);
    const created = await service.createOrResume(PAT, { s1: completeS1() });
    expect(created.kind).toBe('ok');
    if (created.kind === 'ok' && created.work !== undefined) {
      expect(Object.keys(created.work).indexOf('relatedWorkIDs')).toBe(-1);
      expect((created.work as unknown as { RelatedWorkIDs?: unknown }).RelatedWorkIDs).toBeUndefined();
    }
  });
});

describe('live Binding A remains disabled', () => {
  it('refuses every operation with the recorded reasons and never writes a command', async () => {
    const live: ICoreWorkService = createDisabledLiveCoreWorkService();
    expect(live.enabled).toBe(false);
    expect(live.liveReasons).toEqual(LIVE_CORE_REASONS);
    const created = await live.createOrResume(PAT, { s1: completeS1() });
    expect(created).toEqual({ kind: 'disabled', reasons: LIVE_CORE_REASONS });
    const status = await live.getStatus(PAT, 'CW-LOCAL_0001');
    expect(status.kind).toBe('disabled');
    const packets = await live.listPackets(PAT, 'CW-LOCAL_0001');
    expect(packets.unboundReasons.length).toBeGreaterThan(0);
    expect(packets.extension).toBe(PACKET_PROJECTION_EXTENSION);
  });
});
