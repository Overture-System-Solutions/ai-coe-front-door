import { createIntakeId, INTAKE_ID_PREFIX, randomIntakeSuffix } from './intakeId';

describe('createIntakeId', () => {
  it('uses the shipped OVT-AICOE-YYYYMMDD-XXXXXXXX format with the UTC date', () => {
    const id: string = createIntakeId(new Date(Date.UTC(2026, 8, 11, 23, 59, 59)), (): string => 'ABCDEFGH');
    expect(id).toBe('OVT-AICOE-20260911-ABCDEFGH');
    expect(INTAKE_ID_PREFIX).toBe('OVT-AICOE-');
  });

  it('pads single-digit months and days', () => {
    expect(createIntakeId(new Date(Date.UTC(2026, 0, 5)), (): string => '12345678')).toBe('OVT-AICOE-20260105-12345678');
  });

  it('generates eight upper-case base-36 characters by default', () => {
    const first: string = createIntakeId();
    const second: string = createIntakeId();
    expect(first).toMatch(/^OVT-AICOE-\d{8}-[0-9A-Z]{8}$/);
    expect(second).toMatch(/^OVT-AICOE-\d{8}-[0-9A-Z]{8}$/);
    expect(first).not.toBe(second);
  });
});

describe('randomIntakeSuffix', () => {
  it('maps random bytes onto the base-36 alphabet', () => {
    const bytes: number[] = [0, 9, 10, 35, 36, 255, 71, 100];
    const suffix: string = randomIntakeSuffix((buffer: Uint8Array): Uint8Array => {
      for (let index: number = 0; index < buffer.length; index++) {
        buffer[index] = bytes[index];
      }
      return buffer;
    });
    expect(suffix).toBe('09AZ03ZS');
  });
});
