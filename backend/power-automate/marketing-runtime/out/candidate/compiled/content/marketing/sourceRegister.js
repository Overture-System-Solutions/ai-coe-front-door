"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIXTURE_MEETING_NOTES = exports.FIXTURE_REGISTER = exports.FIXTURE_REFUSAL = exports.FIXTURE_LOCATION = exports.FIXTURE_MARKER = void 0;
exports.carriesFixtureMarker = carriesFixtureMarker;
exports.isUsableForBusinessContent = isUsableForBusinessContent;
exports.citeAgainst = citeAgainst;
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
const collections_1 = require("../../utils/collections");
/** The marker every synthetic row carries; a register or an entry that carries it is a fixture whatever its label says. */
exports.FIXTURE_MARKER = /(^|[^A-Z0-9])FIXTURE([^A-Z0-9]|$)/;
exports.FIXTURE_LOCATION = /^fixture:\/\//i;
/** True when the register, its version or any of its rows carries a fixture marker: a label cannot undo that. */
function carriesFixtureMarker(register) {
    if (exports.FIXTURE_MARKER.test(register.registerId) || /fixture/i.test(register.version)) {
        return true;
    }
    for (const entry of register.entries) {
        if (exports.FIXTURE_MARKER.test(entry.id) || exports.FIXTURE_LOCATION.test(entry.location) || /fixture/i.test(entry.versionOrETag)) {
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
function isUsableForBusinessContent(register) {
    return register.approval === 'approved' && !carriesFixtureMarker(register);
}
exports.FIXTURE_REFUSAL = 'This register is a synthetic fixture, so it cannot back business content. A live draft stays closed until an approved register is supplied.';
function entryOf(register, sourceId) {
    return register.entries.filter((entry) => entry.id === sourceId)[0];
}
/**
 * Keeps only what the register actually carries. A reference to an unknown id becomes a gap; so does a reference
 * whose version no longer matches, because a source that changed since approval is not the source that was
 * approved. A reference repeated several times is cited once.
 */
function citeAgainst(register, claimed) {
    const cited = [];
    const gaps = [];
    const seen = [];
    for (const reference of claimed) {
        if ((0, collections_1.includes)(seen, reference.sourceId)) {
            continue;
        }
        seen.push(reference.sourceId);
        const entry = entryOf(register, reference.sourceId);
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
exports.FIXTURE_REGISTER = {
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
exports.FIXTURE_MEETING_NOTES = 'Fictional meeting, week 1. Attendees agreed the launch should wait for the availability source. Someone raised that two teams are duplicating work. The newsletter slot was said to be tight and should be checked before promising a date. Who owns the availability claim is not settled?';
