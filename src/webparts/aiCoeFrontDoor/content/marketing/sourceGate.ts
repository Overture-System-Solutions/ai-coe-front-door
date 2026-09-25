/**
 * The source gate: whether a register, and each source in it, may back a Marketing run for this caller, now.
 *
 * `isUsableForBusinessContent` is a boolean about a label. This is the composed check the boolean was mistaken for.
 * A register may back business content only when: it is labelled approved and carries no fixture marker anywhere;
 * an approval receipt exists that was read back from an authenticated store (never authored by the browser), names
 * this register at this version, binds the exact snapshot hash of its rows, and has not expired; and every row a run
 * cites is present at the cited version, resolvable, current, permitted for the run's audience and purpose, and not
 * revoked. In synthetic mode the fixture register is allowed and everything about it says so; a fixture relabelled
 * as approved is refused in both modes, because its rows still carry the marker.
 *
 * What a pass means. A citation that passes here proves provenance: the source exists, is approved, is the version
 * cited and may be shown to this audience. It does not prove the source supports the claim. That stays with the
 * reviewer, and every result says so.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { canonicalJson, payloadHash } from '../actionEnvelope';
import { carriesFixtureMarker } from './sourceRegister';
import type { ISourceEntry, ISourceRef, ISourceRegister } from './sourceRegister';
import { canonicalId, isoDateTime, isoDay, sha256, strictObject, text } from './schema';
import type { IIssue, Raw } from './schema';

/** Which register a run may read: the synthetic fixture, or an approved business register. Never both at once. */
export type RegisterMode = 'synthetic' | 'business';

/**
 * The approval of a register as an authenticated store hands it back. A browser never constructs one of these for a
 * real run: the service reads it from the store that recorded the approval, and the `source` field says so.
 */
export interface IRegisterApprovalEvidence {
  receiptId: string;
  registerId: string;
  registerVersion: string;
  /** SHA-256 of the canonical rows, so a row changed after approval is detectable. */
  snapshotHash: string;
  /** The authority that approved, as a role label or binding reference; never a default person. */
  approvedByBindingRef: string;
  approvedAt: string;
  expiresAt: string;
  source: 'authenticatedReadback' | 'syntheticFixture';
}

export interface IRegisterQualification {
  usable: boolean;
  mode: RegisterMode;
  /** The exact snapshot hash of the rows, or undefined when the platform offers no digest. */
  snapshotHash?: string;
  reasons: string[];
  /** Always present: a pass proves provenance, not that any source supports any claim. */
  limitation: string;
}

export const PROVENANCE_LIMITATION: string =
  'A source that passes this gate exists, is approved at the cited version and may be shown to this audience. That is provenance, not proof that it supports the claim made from it.';

/** Default freshness for a source row: older than this since `asOf` and the row must be reconfirmed before use. */
export const DEFAULT_SOURCE_FRESHNESS_DAYS: number = 180;

const DAY_MS: number = 86400000;

/** Sorted rows, canonical JSON, SHA-256: what an approval receipt binds. */
export async function registerSnapshotHash(register: ISourceRegister): Promise<string | undefined> {
  const rows: ISourceEntry[] = register.entries.slice().sort((left: ISourceEntry, right: ISourceEntry): number => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return payloadHash({ registerId: register.registerId, version: register.version, rows });
}

/** The bytes the snapshot hash covers, for a test or a receipt to show. */
export function registerSnapshotText(register: ISourceRegister): string {
  const rows: ISourceEntry[] = register.entries.slice().sort((left: ISourceEntry, right: ISourceEntry): number => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return canonicalJson({ registerId: register.registerId, version: register.version, rows });
}

export function parseApprovalEvidence(value: unknown): { evidence?: IRegisterApprovalEvidence; errors: string[] } {
  const issues: IIssue[] = [];
  const raw: Raw | undefined = strictObject(value, '', issues, ['receiptId', 'registerId', 'registerVersion', 'snapshotHash', 'approvedByBindingRef', 'approvedAt', 'expiresAt', 'source']);
  if (raw === undefined) {
    return { errors: issues.map((issue: IIssue): string => `${issue.path} ${issue.message}`) };
  }
  const receiptId: string | undefined = canonicalId(raw.receiptId, 'receiptId', issues);
  const registerId: string | undefined = text(raw.registerId, 'registerId', issues, { max: 256 });
  const registerVersion: string | undefined = text(raw.registerVersion, 'registerVersion', issues, { max: 256 });
  const snapshotHash: string | undefined = sha256(raw.snapshotHash, 'snapshotHash', issues);
  const approvedByBindingRef: string | undefined = text(raw.approvedByBindingRef, 'approvedByBindingRef', issues, { max: 256 });
  const approvedAt: string | undefined = isoDateTime(raw.approvedAt, 'approvedAt', issues);
  const expiresAt: string | undefined = isoDateTime(raw.expiresAt, 'expiresAt', issues);
  const source: 'authenticatedReadback' | 'syntheticFixture' | undefined =
    raw.source === 'authenticatedReadback' || raw.source === 'syntheticFixture' ? raw.source : undefined;
  if (source === undefined) {
    issues.push({ path: 'source', message: 'must be authenticatedReadback or syntheticFixture.' });
  }
  if (issues.length > 0 || receiptId === undefined || registerId === undefined || registerVersion === undefined || snapshotHash === undefined || approvedByBindingRef === undefined || approvedAt === undefined || expiresAt === undefined || source === undefined) {
    return { errors: issues.map((issue: IIssue): string => `${issue.path} ${issue.message}`) };
  }
  return { evidence: { receiptId, registerId, registerVersion, snapshotHash, approvedByBindingRef, approvedAt, expiresAt, source }, errors: [] };
}

export interface IQualifyOptions {
  mode: RegisterMode;
  now: Date;
  /** The approval as read back from the store; undefined when none was found. */
  evidence?: IRegisterApprovalEvidence;
  freshnessDays?: number;
}

/**
 * Whether the register as a whole may back a run in this mode. Fails closed on every missing fact: no digest, no
 * receipt, a receipt for another version, a stale receipt, a changed row, a fixture marker in business mode, or a
 * business label on a fixture in synthetic mode.
 */
export async function qualifyRegister(register: ISourceRegister, options: IQualifyOptions): Promise<IRegisterQualification> {
  const reasons: string[] = [];
  const snapshotHash: string | undefined = await registerSnapshotHash(register);
  if (snapshotHash === undefined) {
    reasons.push('The platform offers no SHA-256 digest, so the register snapshot cannot be bound; the run stays closed.');
  }
  const fixture: boolean = carriesFixtureMarker(register);
  if (options.mode === 'synthetic') {
    if (!fixture) {
      reasons.push('Synthetic mode reads only a register marked as a fixture; a business register may not be exercised as if it were one.');
    }
    if (register.approval !== 'syntheticFixture') {
      reasons.push(`The register is marked as a fixture in its rows but labelled ${register.approval}; a fixture relabelled as approved is refused.`);
    }
  } else {
    if (fixture) {
      reasons.push('The register carries a fixture marker in its id, version or rows; a fixture cannot back business content whatever its label says.');
    }
    if (register.approval !== 'approved') {
      reasons.push(`The register is labelled ${register.approval}, not approved.`);
    }
    const evidence: IRegisterApprovalEvidence | undefined = options.evidence;
    if (evidence === undefined) {
      reasons.push('No approval receipt was read back for this register; a label in the register is not approval.');
    } else {
      if (evidence.source !== 'authenticatedReadback') {
        reasons.push('The approval receipt did not come from an authenticated readback.');
      }
      if (evidence.registerId !== register.registerId || evidence.registerVersion !== register.version) {
        reasons.push('The approval receipt names another register or another version.');
      }
      if (snapshotHash !== undefined && evidence.snapshotHash !== snapshotHash) {
        reasons.push('The rows changed since the approval receipt was recorded (snapshot hash differs).');
      }
      if (Date.parse(evidence.expiresAt) <= options.now.getTime()) {
        reasons.push('The approval receipt has expired.');
      }
      if (Date.parse(evidence.approvedAt) > options.now.getTime()) {
        reasons.push('The approval receipt is dated in the future.');
      }
    }
    for (const entry of register.entries) {
      if (!/^https:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/i.test(entry.location)) {
        reasons.push(`${entry.id} has no resolvable https location.`);
      }
    }
  }
  const freshness: number = options.freshnessDays ?? DEFAULT_SOURCE_FRESHNESS_DAYS;
  const dayIssues: IIssue[] = [];
  const asOf: string | undefined = isoDay(register.asOf, 'asOf', dayIssues);
  if (asOf === undefined) {
    reasons.push('The register carries no valid as-of day.');
  } else if (options.now.getTime() - Date.parse(`${asOf}T00:00:00Z`) > freshness * DAY_MS) {
    reasons.push(`The register was last confirmed on ${asOf}, more than ${freshness} days ago.`);
  }
  return { usable: reasons.length === 0, mode: options.mode, snapshotHash, reasons, limitation: PROVENANCE_LIMITATION };
}

export interface ISourceAccessContext {
  /** The signed-in caller, as the session resolves it; never supplied by the payload. */
  callerId: string;
  /** What the run is for; a row whose classification forbids it is refused. */
  purpose: 'campaignBrief' | 'contentPlan' | 'meetingFollowThrough';
  /** The audience the output is for; a row whose audience excludes it is refused. */
  audience: string;
  now: Date;
  /** Source ids the register owner has revoked since the snapshot; read from the store, never from the payload. */
  revoked: readonly string[];
  freshnessDays?: number;
}

export interface ISourceAccessOutcome {
  ok: boolean;
  sourceId: string;
  reason?: string;
  entry?: ISourceEntry;
}

/**
 * One citation against the register for this caller and purpose. Every refusal names the source, never the row's
 * content, so a denial does not leak what the caller may not read.
 */
export function checkSourceAccess(register: ISourceRegister, reference: ISourceRef, context: ISourceAccessContext): ISourceAccessOutcome {
  const entry: ISourceEntry | undefined = register.entries.filter((candidate: ISourceEntry): boolean => candidate.id === reference.sourceId)[0];
  if (entry === undefined) {
    return { ok: false, sourceId: reference.sourceId, reason: 'is not in the register, so nothing may be cited from it.' };
  }
  if (entry.versionOrETag !== reference.versionOrETag) {
    return { ok: false, sourceId: reference.sourceId, reason: 'has changed since it was approved, so the earlier version cannot be cited.' };
  }
  if (context.revoked.indexOf(entry.id) >= 0) {
    return { ok: false, sourceId: reference.sourceId, reason: 'was revoked by its owner after the snapshot was taken.' };
  }
  if (context.callerId.trim() === '') {
    return { ok: false, sourceId: reference.sourceId, reason: 'cannot be read: the caller is not authenticated.' };
  }
  const dayIssues: IIssue[] = [];
  const asOf: string | undefined = isoDay(entry.asOf, 'asOf', dayIssues);
  const freshness: number = context.freshnessDays ?? DEFAULT_SOURCE_FRESHNESS_DAYS;
  if (asOf === undefined || context.now.getTime() - Date.parse(`${asOf}T00:00:00Z`) > freshness * DAY_MS) {
    return { ok: false, sourceId: reference.sourceId, reason: 'is stale: its as-of day is missing or older than the freshness window.' };
  }
  if (!audiencePermits(entry.audience, context.audience)) {
    return { ok: false, sourceId: reference.sourceId, reason: 'may not be shown to this audience.' };
  }
  if (/restricted|confidential/i.test(entry.classification) && context.purpose !== 'meetingFollowThrough') {
    return { ok: false, sourceId: reference.sourceId, reason: 'is classified above what a campaign artifact may carry.' };
  }
  return { ok: true, sourceId: reference.sourceId, entry };
}

/** A row's audience permits the run's audience when it names everyone, names it, or is the fixture's local-testing audience for a local run. */
function audiencePermits(rowAudience: string, runAudience: string): boolean {
  const row: string = rowAudience.trim().toLowerCase();
  const run: string = runAudience.trim().toLowerCase();
  if (row === '' || row === 'all staff' || row === 'everyone' || row === 'internal') {
    return true;
  }
  return row === run || row.split(/[;,]/).map((part: string): string => part.trim()).indexOf(run) >= 0;
}

export interface ISourceSetOutcome {
  /** Every citation that passed, deduplicated. */
  usable: ISourceRef[];
  /** One sentence per refused citation, naming the source and not its content. */
  gaps: string[];
}

/** Every citation of a run at once; a repeated reference is checked once. */
export function checkSourceSet(register: ISourceRegister, references: readonly ISourceRef[], context: ISourceAccessContext): ISourceSetOutcome {
  const usable: ISourceRef[] = [];
  const gaps: string[] = [];
  const seen: string[] = [];
  for (const reference of references) {
    if (seen.indexOf(reference.sourceId) >= 0) {
      continue;
    }
    seen.push(reference.sourceId);
    const outcome: ISourceAccessOutcome = checkSourceAccess(register, reference, context);
    if (outcome.ok && outcome.entry !== undefined) {
      usable.push({ sourceId: outcome.entry.id, versionOrETag: outcome.entry.versionOrETag });
    } else {
      gaps.push(`${outcome.sourceId} ${outcome.reason ?? 'was refused.'}`);
    }
  }
  return { usable, gaps };
}
