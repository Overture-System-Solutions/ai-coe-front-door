/**
 * Work identity. The properties that matter are that an existing tenant id survives the round trip untouched, and
 * that nothing which is not a front-door record key is ever given a canonical id.
 */
import {
  CANONICAL_ID,
  CANONICAL_WORK_ID,
  TENANT_RECORD_ID,
  WORK_STAGES,
  WORK_TYPES,
  isFrontDoorWorkId,
  isSentinel,
  toCanonicalWorkId,
  toTenantRecordId
} from './workIdentity';
import { createIntakeId } from '../services/intakeId';

describe('work identity', () => {
  it('maps a front-door record key to a canonical Work ID and back without losing a character', () => {
    const tenantId: string = 'OVT-AICOE-20260920-AB12CD34';
    const workId: string | undefined = toCanonicalWorkId(tenantId);
    expect(workId).toBe('CW-OVT_AICOE_20260920_AB12CD34');
    expect(CANONICAL_WORK_ID.test(workId as string)).toBe(true);
    expect(toTenantRecordId(workId as string)).toBe(tenantId);
  });

  it('round-trips ids the generator actually produces, not only a hand-written example', () => {
    for (let attempt: number = 0; attempt < 50; attempt += 1) {
      const tenantId: string = createIntakeId();
      expect({ id: tenantId, matches: TENANT_RECORD_ID.test(tenantId) }).toEqual({ id: tenantId, matches: true });
      const workId: string | undefined = toCanonicalWorkId(tenantId);
      expect(typeof workId).toBe('string');
      expect(CANONICAL_WORK_ID.test(workId as string)).toBe(true);
      expect(toTenantRecordId(workId as string)).toBe(tenantId);
      expect(isFrontDoorWorkId(workId as string)).toBe(true);
    }
  });

  it('refuses to mint a canonical id for anything that is not a front-door record key', () => {
    const notRecords: string[] = [
      '',
      'OVT-AICOE-20260920-ab12cd34',
      'OVT-AICOE-2026092-AB12CD34',
      'OVT-AICOE-20260920-AB12CD3',
      'CW-TEST_001',
      'some free text',
      'OVT-OTHER-20260920-AB12CD34'
    ];
    for (const value of notRecords) {
      expect({ value, id: toCanonicalWorkId(value) }).toEqual({ value, id: undefined });
    }
  });

  it('reads back undefined for a canonical id minted somewhere else, including a skill id', () => {
    // The package assigns CW- names to skills and workflows, so these satisfy the Work ID regex. They are not
    // records this tenant holds, and the mapping must say so rather than inventing a record key.
    for (const value of ['CW-TEST_001', 'CW-INTAKE', 'CW-UNIFIED-WORK', 'CW-BUSINESS-CASE']) {
      expect({ value, matchesPattern: CANONICAL_WORK_ID.test(value), record: toTenantRecordId(value) }).toEqual({
        value,
        matchesPattern: true,
        record: undefined
      });
      expect(isFrontDoorWorkId(value)).toBe(false);
    }
  });

  it('produces a canonical Work ID that also satisfies the package-wide identifier pattern', () => {
    const workId: string = toCanonicalWorkId('OVT-AICOE-20260920-AB12CD34') as string;
    expect(CANONICAL_ID.test(workId)).toBe(true);
  });

  it('declares the enumerations the canonical record carries', () => {
    expect(WORK_TYPES.slice()).toEqual(['IDEA', 'CASE', 'DECISION', 'PROJECT', 'IMPROVEMENT', 'ADMIN_WORK', 'STRATEGIC_CASE']);
    expect(WORK_STAGES.slice()).toEqual(['INTAKE', 'EVIDENCE', 'DECISION', 'DELIVERY', 'VALUE', 'IMPROVEMENT', 'CLOSED']);
  });

  it('knows the sentinel vocabulary, so a missing value is never written as zero', () => {
    expect(isSentinel('AWAITING_SOURCE')).toBe(true);
    expect(isSentinel('NOT_AUTHORIZED')).toBe(true);
    expect(isSentinel(0)).toBe(false);
    expect(isSentinel('')).toBe(false);
    expect(isSentinel('SOMETHING_ELSE')).toBe(false);
  });
});
