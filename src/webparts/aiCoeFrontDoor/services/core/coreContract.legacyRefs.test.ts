import { parseWorkProjection, toEmployeeWork } from './coreContract';
import type { IContractIssue, IWorkProjection } from './coreContract';

// A business case keeps the request and AI CoE case it started from (1.0.0.19). The native service stores these as
// LegacyRefs on create; the projection carries them only when the service returns them.
const base: IWorkProjection = {
  WorkID: 'CW-PRACTICE-0001',
  Title: 'A case that started as a request',
  Stage: 'EVIDENCE',
  State: 'EVIDENCE_BUILDING',
  EmployeeStatus: 'Working',
  Lane: 'EVIDENCE',
  NextAction: null,
  NextOwner: null,
  NextDate: null,
  Version: 3,
  LastValidatedAt: '2026-10-01T09:00:00Z'
};

function parse(value: unknown): { work: IWorkProjection | undefined; issues: IContractIssue[] } {
  const issues: IContractIssue[] = [];
  return { work: parseWorkProjection(value, 'Work', issues), issues };
}

describe('the request and case a business case started from', () => {
  it('reads both references and hands them to the employee view', () => {
    const { work, issues } = parse({ ...base, LegacyRefs: { IntakeId: 'OVT-AICOE-20260919-JOURNEY4', CoEID: 'OVT-AICOE-20260919-JOURNEY4' } });
    expect(issues).toEqual([]);
    expect(work?.LegacyRefs).toEqual({ IntakeId: 'OVT-AICOE-20260919-JOURNEY4', CoEID: 'OVT-AICOE-20260919-JOURNEY4' });
    expect(toEmployeeWork(work as IWorkProjection).legacyRefs).toEqual({ intakeId: 'OVT-AICOE-20260919-JOURNEY4', coeId: 'OVT-AICOE-20260919-JOURNEY4' });
  });

  it('accepts either reference alone and leaves the employee view without one when none came back', () => {
    expect(toEmployeeWork(parse({ ...base, LegacyRefs: { CoEID: 'AICOE-2026-000123' } }).work as IWorkProjection).legacyRefs).toEqual({ coeId: 'AICOE-2026-000123' });
    expect(toEmployeeWork(parse(base).work as IWorkProjection).legacyRefs).toBeUndefined();
  });

  it.each([
    [{ IntakeId: 'OVT AICOE with spaces' }, 'Work.LegacyRefs.IntakeId'],
    [{ CoEID: '' }, 'Work.LegacyRefs.CoEID'],
    [{ CoEID: 'x'.repeat(201) }, 'Work.LegacyRefs.CoEID'],
    [{ IntakeId: 'OVT-1', Owner: 'someone' }, 'Work.LegacyRefs.Owner'],
    ['OVT-1', 'Work.LegacyRefs']
  ])('refuses a malformed reference %j, as the service validates them', (refs: unknown, path: string) => {
    const { work, issues } = parse({ ...base, LegacyRefs: refs });
    expect(work).toBeUndefined();
    expect(issues.map((issue: IContractIssue): string => issue.path)).toContain(path);
  });
});
