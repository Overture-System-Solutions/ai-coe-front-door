import { createRecordId } from './recordId';

describe('createRecordId', () => {
  it('prefers crypto.randomUUID when available', () => {
    const id: string = createRecordId('policy-gap', { randomUUID: (): string => '11111111-2222-4333-8444-555555555555' });
    expect(id).toBe('policy-gap-11111111-2222-4333-8444-555555555555');
  });

  it('falls back to a timestamp and random suffix without randomUUID', () => {
    const id: string = createRecordId('feedback', {}, (): number => 1757548800000, (): number => 0.123456789);
    expect(id).toMatch(/^feedback-1757548800000-[0-9a-z]{1,8}$/);
  });

  it('produces unique ids with the real environment', () => {
    expect(createRecordId('feedback')).not.toBe(createRecordId('feedback'));
    expect(createRecordId('feedback')).toMatch(/^feedback-/);
  });
});
