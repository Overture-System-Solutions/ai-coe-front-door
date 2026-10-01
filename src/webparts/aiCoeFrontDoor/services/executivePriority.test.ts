import {
  addWorkingDays,
  applyReviewPriority,
  EXECUTIVE_REVIEW_PRIORITY,
  executiveReviewBy,
  holdsLeaderRole,
  readReviewPriority,
  REVIEW_PRIORITY_KEY
} from './executivePriority';

describe('executive review priority', () => {
  it('counts only a confirmed leader membership', () => {
    expect(holdsLeaderRole({ roles: ['employee', 'leader'], resolution: 'resolved' })).toBe(true);
    expect(holdsLeaderRole({ roles: ['employee', 'leader'], resolution: 'unresolved' })).toBe(false);
    expect(holdsLeaderRole({ roles: ['employee', 'operator'], resolution: 'resolved' })).toBe(false);
  });

  it('marks a leader payload and strips a mark from anyone else', () => {
    const payload: { [key: string]: unknown } = { originalAnswers: { workToImprove: 'x' } };
    expect(applyReviewPriority(payload, true)).toEqual({ ...payload, [REVIEW_PRIORITY_KEY]: EXECUTIVE_REVIEW_PRIORITY });
    expect(applyReviewPriority(payload, false)).toBe(payload);
    expect(applyReviewPriority({ ...payload, [REVIEW_PRIORITY_KEY]: EXECUTIVE_REVIEW_PRIORITY }, false)).toEqual(payload);
    expect(applyReviewPriority('text', true)).toBe('text');
    expect(applyReviewPriority(['a'], true)).toEqual(['a']);
  });

  it('marks the same payload the same way every time, so a retry matches its first attempt', () => {
    const payload: { [key: string]: unknown } = { originalAnswers: { workToImprove: 'x' } };
    expect(JSON.stringify(applyReviewPriority(payload, true))).toBe(JSON.stringify(applyReviewPriority(applyReviewPriority(payload, true), true)));
  });

  it('reads the mark from the payload object or its stored JSON text', () => {
    const marked: unknown = applyReviewPriority({ a: 1 }, true);
    expect(readReviewPriority(marked)).toEqual(EXECUTIVE_REVIEW_PRIORITY);
    expect(readReviewPriority(JSON.stringify(marked))).toEqual(EXECUTIVE_REVIEW_PRIORITY);
    expect(readReviewPriority({ a: 1 })).toBeUndefined();
    expect(readReviewPriority({ [REVIEW_PRIORITY_KEY]: { level: 'urgent' } })).toBeUndefined();
    expect(readReviewPriority('{not json')).toBeUndefined();
    expect(readReviewPriority(undefined)).toBeUndefined();
  });

  it('counts working days and skips the weekend', () => {
    // Thursday 2026-09-24 + 2 working days is Monday 2026-09-28.
    expect(addWorkingDays(new Date('2026-09-24T15:00:00Z'), 2).toISOString()).toBe('2026-09-28T15:00:00.000Z');
    // Monday + 2 is Wednesday; Saturday + 2 is Tuesday.
    expect(addWorkingDays(new Date('2026-09-21T09:00:00Z'), 2).toISOString()).toBe('2026-09-23T09:00:00.000Z');
    expect(addWorkingDays(new Date('2026-09-26T09:00:00Z'), 2).toISOString()).toBe('2026-09-29T09:00:00.000Z');
    expect(executiveReviewBy('2026-09-25T10:00:00.000Z')).toBe('2026-09-29T10:00:00.000Z');
  });
});
