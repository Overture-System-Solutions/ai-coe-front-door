/**
 * A business case an executive submits is reviewed sooner.
 *
 * How it is carried. The shipped list schemas cannot gain a column or a choice (they are pinned byte for byte and an
 * in-place upgrade depends on it), so the mark rides on what is already there: the submission's own payload carries
 * a `reviewPriority` object, the request row takes the existing `High` priority, and the governance record's
 * `NextReviewDate` is set a fixed number of working days after submission. The weekly portfolio digest already calls
 * out review dates that have been reached, and the administrator queue lists these first.
 *
 * Why the date is not in the payload. A submission that has to be retried is matched to its first attempt by the
 * digest of its payload; a date computed on the day of the retry would make the same submission look different. So
 * the payload carries only the mark, which is the same on every attempt, and the date is computed when the row is
 * written, from the submission time.
 *
 * What this is not. The mark is set in the browser from the membership the site groups returned, the same way every
 * other role decision here is made. It orders a queue; it grants nothing. The review flows may re-check the
 * submitter's group before relying on it.
 */
import type { IRoleResolution } from './roleResolver';

/** Working days from submission to the review date an executive case is given. */
export const EXECUTIVE_REVIEW_WORKING_DAYS: number = 2;

/** The payload key the mark is kept under. */
export const REVIEW_PRIORITY_KEY: string = 'reviewPriority';

export interface IReviewPriority {
  level: 'executive';
  reason: string;
}

export const EXECUTIVE_REVIEW_PRIORITY: IReviewPriority = {
  level: 'executive',
  reason: 'Submitted by a member of the leaders group; reviewed sooner.'
};

type PayloadObject = { [key: string]: unknown };

function isPlainObject(value: unknown): value is PayloadObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** True when the membership was confirmed and includes the leader role; an unconfirmed membership never marks. */
export function holdsLeaderRole(resolution: IRoleResolution): boolean {
  return resolution.resolution === 'resolved' && resolution.roles.indexOf('leader') >= 0;
}

/**
 * The payload as it should be sent: marked for a leader, and never carrying a mark it did not earn. A payload that is
 * not an object is passed through untouched.
 */
export function applyReviewPriority(payload: unknown, executive: boolean): unknown {
  if (!isPlainObject(payload)) {
    return payload;
  }
  if (executive) {
    return { ...payload, [REVIEW_PRIORITY_KEY]: EXECUTIVE_REVIEW_PRIORITY };
  }
  if (!(REVIEW_PRIORITY_KEY in payload)) {
    return payload;
  }
  const rest: PayloadObject = {};
  for (const key of Object.keys(payload)) {
    if (key !== REVIEW_PRIORITY_KEY) {
      rest[key] = payload[key];
    }
  }
  return rest;
}

/** The mark a stored or submitted payload carries, if any. Accepts the object or its JSON text. */
export function readReviewPriority(payload: unknown): IReviewPriority | undefined {
  let source: unknown = payload;
  if (typeof payload === 'string') {
    try {
      source = JSON.parse(payload);
    } catch {
      return undefined;
    }
  }
  if (!isPlainObject(source)) {
    return undefined;
  }
  const mark: unknown = source[REVIEW_PRIORITY_KEY];
  return isPlainObject(mark) && mark.level === 'executive' ? EXECUTIVE_REVIEW_PRIORITY : undefined;
}

/** The instant `days` working days (Monday to Friday, in UTC) after `from`, at the same time of day. */
export function addWorkingDays(from: Date, days: number): Date {
  const result: Date = new Date(from.getTime());
  let remaining: number = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday: number = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      remaining -= 1;
    }
  }
  return result;
}

/** The review date an executive submission made at `submittedAt` is given, as ISO text. */
export function executiveReviewBy(submittedAt: string): string {
  return addWorkingDays(new Date(submittedAt), EXECUTIVE_REVIEW_WORKING_DAYS).toISOString();
}
