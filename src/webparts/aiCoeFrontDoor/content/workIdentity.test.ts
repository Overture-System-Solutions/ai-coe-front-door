/**
 * Work identity. The properties that matter are that an existing tenant id survives the round trip untouched, and
 * that nothing which is not a front-door record key is ever given a canonical id.
 */
import {
  CANONICAL_ID,
  DEFAULT_WORK_ID_PREFIX,
  TENANT_RECORD_ID,
  canonicalWorkIdPattern,
  configureWorkIdPrefix,
  isCanonicalWorkId,
  mintWorkId,
  parseWorkIdPrefix,
  workIdPrefix,
  workIdPrefixProblem,
  WORK_STAGES,
  WORK_TYPES,
  isFrontDoorWorkId,
  isSentinel,
  toCanonicalWorkId,
  toTenantRecordId
} from './workIdentity';
import { createIntakeId } from '../services/intakeId';

// The prefix is page state; every test starts from the default (a blank setting).
afterEach(() => {
  configureWorkIdPrefix('');
});

describe('work identity', () => {
  it('maps a front-door record key to a canonical Work ID and back without losing a character', () => {
    const tenantId: string = 'OVT-AICOE-20260920-AB12CD34';
    const workId: string | undefined = toCanonicalWorkId(tenantId);
    expect(workId).toBe('AICOE-OVT_AICOE_20260920_AB12CD34');
    expect(isCanonicalWorkId(workId as string)).toBe(true);
    expect(toTenantRecordId(workId as string)).toBe(tenantId);
  });

  it('round-trips ids the generator actually produces, not only a hand-written example', () => {
    for (let attempt: number = 0; attempt < 50; attempt += 1) {
      const tenantId: string = createIntakeId();
      expect({ id: tenantId, matches: TENANT_RECORD_ID.test(tenantId) }).toEqual({ id: tenantId, matches: true });
      const workId: string | undefined = toCanonicalWorkId(tenantId);
      expect(typeof workId).toBe('string');
      expect(isCanonicalWorkId(workId as string)).toBe(true);
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
      'AICOE-TEST_001',
      'some free text',
      'OVT-OTHER-20260920-AB12CD34'
    ];
    for (const value of notRecords) {
      expect({ value, id: toCanonicalWorkId(value) }).toEqual({ value, id: undefined });
    }
  });

  it('reads back undefined for a canonical id minted somewhere else, including a skill id', () => {
    // The package assigns prefixed names to skills and workflows, so these satisfy the Work ID regex. They are not
    // records this tenant holds, and the mapping must say so rather than inventing a record key.
    for (const value of ['AICOE-TEST_001', 'AICOE-INTAKE', 'AICOE-UNIFIED-WORK', 'AICOE-BUSINESS-CASE']) {
      expect({ value, matchesPattern: isCanonicalWorkId(value), record: toTenantRecordId(value) }).toEqual({
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

  it('uses AICOE when the Work ID prefix setting is blank or absent', () => {
    expect(DEFAULT_WORK_ID_PREFIX).toBe('AICOE');
    for (const blank of [undefined, null, '', '   ']) {
      expect({ blank, prefix: configureWorkIdPrefix(blank) }).toEqual({ blank, prefix: 'AICOE' });
    }
    expect(workIdPrefix()).toBe('AICOE');
    expect(canonicalWorkIdPattern().source).toBe('^AICOE-[A-Z0-9_-]{2,124}$');
    expect(mintWorkId('LOCAL_0001')).toBe('AICOE-LOCAL_0001');
  });

  it('carries a configured neutral prefix through every check, mint and mapping', () => {
    expect(configureWorkIdPrefix(' NW ')).toBe('NW');
    expect(canonicalWorkIdPattern().source).toBe('^NW-[A-Z0-9_-]{2,124}$');
    expect(mintWorkId('LOCAL_0007')).toBe('NW-LOCAL_0007');
    const workId: string | undefined = toCanonicalWorkId('OVT-AICOE-20260920-AB12CD34');
    expect(workId).toBe('NW-OVT_AICOE_20260920_AB12CD34');
    expect(toTenantRecordId(workId as string)).toBe('OVT-AICOE-20260920-AB12CD34');
    expect(isFrontDoorWorkId(workId as string)).toBe(true);
    expect(isCanonicalWorkId('NW-SYNTHETIC_TEST')).toBe(true);
  });

  it('refuses a Work ID under another prefix, in either direction', () => {
    configureWorkIdPrefix('NW');
    for (const value of ['AICOE-OVT_AICOE_20260920_AB12CD34', 'AICOE-LOCAL_0001', 'NWX-LOCAL_0001', 'N-LOCAL_0001', 'nw-LOCAL_0001', 'NW-', 'NW-A', 'NW-lower']) {
      expect({ value, canonical: isCanonicalWorkId(value), pattern: canonicalWorkIdPattern().test(value), record: toTenantRecordId(value) }).toEqual({
        value,
        canonical: false,
        pattern: false,
        record: undefined
      });
    }
    configureWorkIdPrefix('');
    expect(isCanonicalWorkId('NW-OVT_AICOE_20260920_AB12CD34')).toBe(false);
    expect(toTenantRecordId('NW-OVT_AICOE_20260920_AB12CD34')).toBeUndefined();
    expect(isCanonicalWorkId('AICOE-OVT_AICOE_20260920_AB12CD34')).toBe(true);
  });

  it('refuses a malformed prefix by the CORE generator\'s rule, and then accepts and mints no Work ID at all', () => {
    for (const malformed of ['nw', 'N', '1NW', 'N-W', 'NW-', 'N W', 'ABCDEFGHIJKLMNOPQ', 'AÉ', 7, {}]) {
      expect({ malformed, parsed: parseWorkIdPrefix(malformed) }).toEqual({ malformed, parsed: undefined });
      expect(workIdPrefixProblem(malformed)).toContain('2 to 16 upper-case letters or digits');
    }
    for (const accepted of ['', 'AICOE', 'NW', 'N1', 'ABCDEFGHIJKLMNOP']) {
      expect({ accepted, problem: workIdPrefixProblem(accepted) }).toEqual({ accepted, problem: '' });
    }
    expect(configureWorkIdPrefix('nw')).toBeUndefined();
    expect(workIdPrefix()).toBeUndefined();
    for (const value of ['AICOE-LOCAL_0001', 'NW-LOCAL_0001', 'nw-LOCAL_0001']) {
      expect({ value, canonical: isCanonicalWorkId(value), pattern: canonicalWorkIdPattern().test(value) }).toEqual({ value, canonical: false, pattern: false });
    }
    expect(toCanonicalWorkId('OVT-AICOE-20260920-AB12CD34')).toBeUndefined();
    expect((): string => mintWorkId('LOCAL_0001')).toThrow(/prefix/);
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
