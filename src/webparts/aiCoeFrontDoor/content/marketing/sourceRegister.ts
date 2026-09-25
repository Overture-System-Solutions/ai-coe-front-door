/**
 * The approved-source register: the controlled input every Marketing workflow cites, and the one thing a generated
 * draft may never add to.
 *
 * Decision 1 of the local baseline (see `docs/RC2-SINGLE-WEBPART-HANDOFF.md`). The register is an INPUT. Approving
 * it is pilot preparation; keeping the approved snapshot is pilot evidence. A run records which register and which
 * version it read, cites only entries that register carries, and reports everything else as an evidence gap.
 *
 * The rule this module exists to enforce is the last one: **generated output cannot approve a new source**. A model
 * will happily name a plausible document that nobody approved. `citeAgainst` therefore keeps only the references
 * the register actually carries and hands back the rest as gaps, so an unapproved source can reach a reader as a
 * stated gap but never as a citation.
 *
 * The activation package's own `09_SOURCE_REGISTER.md` is NOT this. That file records where the package's authors
 * read things while writing it; its rows carry no approval state and, for the Marketing rows, no resolvable
 * location at all. It is provenance, not a runtime allowlist, and nothing here reads it.
 *
 * Until a real register is approved, this branch uses a synthetic fixture, and `isUsableForBusinessContent` refuses
 * it. That refusal is the fail-closed behaviour the baseline asks for: a live route that needs approved sources
 * stays shut while only a fixture exists.
 *
 * Wording note: this file is scanned for Tailwind utility names; keep prose free of utility words.
 */
import { includes } from '../../utils/collections';

/** Where a register came from and what it may be used for. A fixture can never stand in for the approved article. */
export type RegisterApprovalState = 'approved' | 'syntheticFixture';

/**
 * One row. Every field is here because a workflow cannot cite honestly without it: an id to reference, a location
 * to resolve, a version so a later run can tell the source changed, an owner to ask, an as-of date to judge
 * freshness, a classification and audience to decide who may be shown it, and the disclaimer the reference
 * packages carry - what a source may NOT be used to prove.
 */
export interface ISourceEntry {
  id: string;
  /** A resolvable location. A bare filename is not one; the Marketing register's rows fail this today. */
  location: string;
  /** The version or ETag at the moment of approval, so a changed source is detectable. */
  versionOrETag: string;
  owner: string;
  /** YYYY-MM-DD: when this row was last confirmed. */
  asOf: string;
  classification: string;
  /** Who may be shown material drawn from this source. */
  audience: string;
  /** What this source may not be used to prove; empty when the register states none. */
  mayNotProve: string;
}

export interface ISourceRegister {
  registerId: string;
  /** Cited by every run, so an output can be traced to the exact register state that produced it. */
  version: string;
  approval: RegisterApprovalState;
  asOf: string;
  entries: ISourceEntry[];
}

/** A citation a draft carries: which entry, at which version, as the simulation contract shapes a source binding. */
export interface ISourceRef {
  sourceId: string;
  versionOrETag: string;
}

/** The marker every synthetic row carries; a register or an entry that carries it is a fixture whatever its label says. */
export const FIXTURE_MARKER: RegExp = /(^|[^A-Z0-9])FIXTURE([^A-Z0-9]|$)/;
export const FIXTURE_LOCATION: RegExp = /^fixture:\/\//i;

/** True when the register, its version or any of its rows carries a fixture marker: a label cannot undo that. */
export function carriesFixtureMarker(register: ISourceRegister): boolean {
  if (FIXTURE_MARKER.test(register.registerId) || /fixture/i.test(register.version)) {
    return true;
  }
  for (const entry of register.entries) {
    if (FIXTURE_MARKER.test(entry.id) || FIXTURE_LOCATION.test(entry.location) || /fixture/i.test(entry.versionOrETag)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether this register may back business content: only an approved one that carries no fixture marker anywhere.
 * The 2026-09-22 review showed the first version accepting `{...FIXTURE_REGISTER, approval: 'approved'}`; a label
 * is not approval, so a fixture is now refused by its rows and not only by its label. This is still a boolean
 * convenience, not qualification: the composed gate (`sourceGate.ts`) additionally requires an authenticated
 * approval receipt bound to the register's snapshot hash, freshness, audience and revocation checks.
 */
export function isUsableForBusinessContent(register: ISourceRegister): boolean {
  return register.approval === 'approved' && !carriesFixtureMarker(register);
}

export const FIXTURE_REFUSAL: string =
  'This register is a synthetic fixture, so it cannot back business content. A live draft stays closed until an approved register is supplied.';

function entryOf(register: ISourceRegister, sourceId: string): ISourceEntry | undefined {
  return register.entries.filter((entry: ISourceEntry): boolean => entry.id === sourceId)[0];
}

export interface ICitationOutcome {
  /** The references the register carries, at the version it carries. */
  cited: ISourceRef[];
  /**
   * Everything the draft named that the register does not carry, or carries at a different version, said plainly so
   * a reader sees the hole rather than a citation that was never approved.
   */
  gaps: string[];
}

/**
 * Keeps only what the register actually carries. A reference to an unknown id becomes a gap; so does a reference
 * whose version no longer matches, because a source that changed since approval is not the source that was
 * approved. A reference repeated several times is cited once.
 */
export function citeAgainst(register: ISourceRegister, claimed: readonly ISourceRef[]): ICitationOutcome {
  const cited: ISourceRef[] = [];
  const gaps: string[] = [];
  const seen: string[] = [];
  for (const reference of claimed) {
    if (includes(seen, reference.sourceId)) {
      continue;
    }
    seen.push(reference.sourceId);
    const entry: ISourceEntry | undefined = entryOf(register, reference.sourceId);
    if (entry === undefined) {
      gaps.push(`${reference.sourceId} is not in the approved register, so nothing may be cited from it.`);
      continue;
    }
    if (entry.versionOrETag !== reference.versionOrETag) {
      gaps.push(`${reference.sourceId} has changed since it was approved, so the earlier version cannot be cited.`);
      continue;
    }
    cited.push({ sourceId: entry.id, versionOrETag: entry.versionOrETag });
  }
  return { cited, gaps };
}

/**
 * The synthetic fixture. Every value is obviously invented and every id carries the FIXTURE marker, so a row from
 * here cannot be mistaken for an approved source, quoted as one, or copied into a real register unnoticed. The
 * owner is a fictional role rather than any real person, per decision 2.
 */
export const FIXTURE_REGISTER: ISourceRegister = {
  registerId: 'FIXTURE-SOURCE-REGISTER',
  version: '0.0.1-fixture',
  approval: 'syntheticFixture',
  asOf: '2026-09-21',
  entries: [
    {
      id: 'FIXTURE-BRAND-001',
      location: 'fixture://brand/message-house',
      versionOrETag: 'fixture-v1',
      owner: 'Fictional Brand Owner (fixture)',
      asOf: '2026-09-21',
      classification: 'Fixture, not real material',
      audience: 'Local testing only',
      mayNotProve: 'Anything about a real product, customer or capability.'
    },
    {
      id: 'FIXTURE-PRODUCT-002',
      location: 'fixture://product/capability-notes',
      versionOrETag: 'fixture-v1',
      owner: 'Fictional Product Owner (fixture)',
      asOf: '2026-09-21',
      classification: 'Fixture, not real material',
      audience: 'Local testing only',
      mayNotProve: 'Availability, security posture or a measured result.'
    },
    {
      id: 'FIXTURE-AUDIENCE-003',
      location: 'fixture://audience/segment-notes',
      versionOrETag: 'fixture-v1',
      owner: 'Fictional Audience Owner (fixture)',
      asOf: '2026-09-21',
      classification: 'Fixture, not real material',
      audience: 'Local testing only',
      mayNotProve: 'Any real adoption or engagement figure.'
    },
    {
      // The permitted meeting notes workflow 3 reads: a source like the others, so notes are cited, never trusted.
      id: 'FIXTURE-MEETING-004',
      location: 'fixture://meeting/notes-week-1',
      versionOrETag: 'fixture-v1',
      owner: 'Fictional Meeting Owner (fixture)',
      asOf: '2026-09-21',
      classification: 'Fixture, not real material',
      audience: 'Local testing only',
      mayNotProve: 'That any real person decided or committed to anything.'
    }
  ]
};

/** The invented notes behind the fixture meeting source, for the synthetic workspace and its tests. */
export const FIXTURE_MEETING_NOTES: string =
  'Fictional meeting, week 1. Attendees agreed the launch should wait for the availability source. Someone raised that two teams are duplicating work. The newsletter slot was said to be tight and should be checked before promising a date. Who owns the availability claim is not settled?';
