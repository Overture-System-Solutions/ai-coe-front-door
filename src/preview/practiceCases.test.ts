import { createSyntheticCoreWorkService, SYNTHETIC_CORE_STORE_KEY } from '../webparts/aiCoeFrontDoor/services/core/coreWorkService';
import type { CoreCallResult, ICoreSession, ICoreWorkService } from '../webparts/aiCoeFrontDoor/services/core/coreWorkService';
import { toEmployeeWork } from '../webparts/aiCoeFrontDoor/services/core/coreContract';
import type { IEmployeeWork, IWorkProjection } from '../webparts/aiCoeFrontDoor/services/core/coreContract';
import type { IWorkPacketProjection } from '../webparts/aiCoeFrontDoor/services/core/packetProjection';
import { MemoryStorageBackend } from '../webparts/aiCoeFrontDoor/services/marketing/artifactStore';
import { PRACTICE_CORE_STORE_KEY, PRACTICE_PERSON, practiceJourney, withPracticeCases } from './practiceCases';
import type { IPracticeJourney, IPracticeUseCase } from './practiceCases';

// The offline preview's worked example of how a request becomes an AI CoE case and, for a high-risk case, a business
// case in the practice case service (1.0.0.19). Fictional throughout; the preview alone loads it.
const journey: IPracticeJourney = practiceJourney();
const session: ICoreSession = { actorId: PRACTICE_PERSON, tenantScope: 'http://127.0.0.1:4173/simulated-site' };

function practiceService(saved: string | null = null): { service: ICoreWorkService; backend: MemoryStorageBackend } {
  const backend: MemoryStorageBackend = new MemoryStorageBackend();
  backend.setItem(PRACTICE_CORE_STORE_KEY, withPracticeCases(saved, journey.works));
  return { service: createSyntheticCoreWorkService(PRACTICE_PERSON, { backend }), backend };
}

async function listed(service: ICoreWorkService): Promise<IEmployeeWork[]> {
  const result: CoreCallResult = await service.listMine(session);
  if (result.kind !== 'ok' || result.observation.response === undefined || !('Items' in result.observation.response)) {
    throw new Error('The practice cases could not be listed.');
  }
  return result.observation.response.Items.map((item: IWorkProjection): IEmployeeWork => toEmployeeWork(item));
}

/** The rule Triage and Routing applies, so the example rates each case the way the flow would. */
function triageTier(useCase: IPracticeUseCase): string {
  if (useCase.DataSensitivity === 'Restricted' || useCase.ExternalUsers || useCase.AutonomousActions || useCase.EstimatedMonthlyCost >= 1000) {
    return 'High';
  }
  return useCase.DataSensitivity === 'Confidential' || useCase.EstimatedMonthlyCost >= 250 ? 'Medium' : 'Low';
}

describe('the practice journey from a request to a business case', () => {
  it('stores its business cases where the practice case service reads them', () => {
    expect(PRACTICE_CORE_STORE_KEY).toBe(SYNTHETIC_CORE_STORE_KEY);
  });

  it('gives each request its own AI CoE case under the same reference, at the four places a case can be', () => {
    expect(journey.intakes.map((intake): string => intake.IntakeId).sort()).toEqual(journey.useCases.map((useCase): string => useCase.CoEID).sort());
    expect(journey.intakes.every((intake): boolean => intake.RequestorEmail === PRACTICE_PERSON)).toBe(true);
    expect(journey.useCases.every((useCase): boolean => useCase.SubmitterEmail === PRACTICE_PERSON)).toBe(true);
    expect(journey.useCases.map((useCase): string => `${useCase.Status}/${useCase.RiskTier}`)).toEqual([
      'Approved/Low',
      'Needs Information/',
      'Ready for Review/High',
      'Under Review/High'
    ]);
    expect(journey.intakes.map((intake): string => intake.WorkflowType)).toEqual(['idea', 'idea', 'idea', 'teamUsage']);
  });

  it('rates every triaged case the way Triage and Routing would, and leaves a case that needs information unrated', () => {
    for (const useCase of journey.useCases) {
      expect(useCase.RiskTier).toBe(useCase.Status === 'Needs Information' ? '' : triageTier(useCase));
    }
  });

  it('keeps a business case only for the High cases, each pointing back at its request and its case', () => {
    const high: string[] = journey.useCases.filter((useCase): boolean => useCase.RiskTier === 'High').map((useCase): string => useCase.CoEID);
    const works = Object.keys(journey.works).map((id: string) => journey.works[id]);
    expect(works).toHaveLength(2);
    for (const stored of works) {
      expect(stored.requester).toBe(PRACTICE_PERSON);
      expect(high).toContain(stored.work.LegacyRefs?.CoEID);
      expect(stored.work.LegacyRefs?.IntakeId).toBe(stored.work.LegacyRefs?.CoEID);
      expect(stored.work.Title).toBe(journey.useCases.filter((useCase): boolean => useCase.CoEID === stored.work.LegacyRefs?.CoEID)[0].Title);
    }
  });

  it('loads into the practice case service: one business case in progress and one ready for the review board', async () => {
    const { service } = practiceService();
    const cases: IEmployeeWork[] = await listed(service);
    expect(cases.map((work): string => work.employeeStatus).sort()).toEqual(['With the right reviewer', 'Working']);
    for (const work of cases) {
      expect(work.legacyRefs?.coeId).toMatch(/^OVT-AICOE-\d{8}-JOURNEY\d$/);
    }
    const statuses = async (workId: string): Promise<string[]> =>
      (await service.listPackets(session, workId)).packets.map((packet: IWorkPacketProjection): string => packet.status).sort();
    const inProgress: IEmployeeWork = cases.filter((work): boolean => work.employeeStatus === 'Working')[0];
    const ready: IEmployeeWork = cases.filter((work): boolean => work.employeeStatus === 'With the right reviewer')[0];
    expect(await statuses(inProgress.workId)).toEqual(['OPEN', 'RETURNED', 'RETURNED', 'VALIDATED']);
    expect(await statuses(ready.workId)).toEqual(['VALIDATED', 'VALIDATED', 'VALIDATED', 'VALIDATED']);
  });

  it('answers the readiness check and takes a new answer like any practice case', async () => {
    const { service } = practiceService();
    const cases: IEmployeeWork[] = await listed(service);
    const inProgress: IEmployeeWork = cases.filter((work): boolean => work.employeeStatus === 'Working')[0];
    const ready: IEmployeeWork = cases.filter((work): boolean => work.employeeStatus === 'With the right reviewer')[0];
    const stillReady: CoreCallResult = await service.requestReadiness(session, ready.workId);
    expect(stillReady.kind === 'ok' ? stillReady.work?.employeeStatus : stillReady.kind).toBe('With the right reviewer');
    const notYet: CoreCallResult = await service.requestReadiness(session, inProgress.workId);
    expect(notYet.kind === 'ok' ? notYet.work?.openEvidenceGaps : notYet.kind).toEqual(['S5_RISK']);
    const open: IWorkPacketProjection = (await service.listPackets(session, inProgress.workId)).packets.filter((packet): boolean => packet.status === 'OPEN')[0];
    const answered: CoreCallResult = await service.submitEvidence(session, { workId: inProgress.workId, evidencePacketId: open.packetId, response: 'A practice answer.', knownAssumedUnknown: 'ASSUMED' });
    expect(answered.kind).toBe('ok');
    expect(answered.kind === 'ok' ? answered.work?.legacyRefs : undefined).toEqual(inProgress.legacyRefs);
  });

  it('adds the practice cases beside saved practice work, once, without replacing either', async () => {
    const { service, backend } = practiceService();
    const created: CoreCallResult = await service.createOrResume(session, { s1: { Title: 'My own practice case', SourceChannel: 'FRONT_DOOR' } });
    expect(created.kind).toBe('ok');
    const saved: string | null = backend.getItem(PRACTICE_CORE_STORE_KEY);
    const changed: { engine: { works: { [id: string]: { work: { Title: string } } } } } = JSON.parse(saved as string);
    changed.engine.works['CW-PRACTICE-0002'].work.Title = 'Renamed while practising';
    const again: string = withPracticeCases(withPracticeCases(JSON.stringify(changed), journey.works), journey.works);
    const reloadedBackend: MemoryStorageBackend = new MemoryStorageBackend();
    reloadedBackend.setItem(PRACTICE_CORE_STORE_KEY, again);
    const reloaded: ICoreWorkService = createSyntheticCoreWorkService(PRACTICE_PERSON, { backend: reloadedBackend });
    const titles: string[] = (await listed(reloaded)).map((work): string => work.title).sort();
    expect(titles).toHaveLength(3);
    expect(titles).toContain('My own practice case');
    expect(titles).toContain('Renamed while practising');
  });

  it('starts from the practice cases alone when the saved state cannot be read', async () => {
    const { service } = practiceService('{not json');
    expect(await listed(service)).toHaveLength(2);
  });
});
