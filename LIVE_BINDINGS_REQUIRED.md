# Live bindings still required

Local package **1.0.0.16** (this worktree, uncommitted) implements Binding A and Marketing against synthetic stores.
None of the five items below is confirmed. `SendEnabled` stays false. Real CORE writes stay disabled
(`LIVE_CORE_REASONS` in `src/webparts/aiCoeFrontDoor/services/core/coreConfig.ts`).

Local evidence 2026-09-22 (not live acceptance): `npm test` **1039 passed / 113 suites / 0 failed / 0 skipped**; production heft test **1039 passed / 0 failed**; sppkg SHA-256 `ede9c1f46aed6f55575abab5d3731edfc6605eccf39ca27067c741fcba75546b` (155509 bytes); verifier `evidence/port-verification.json`; offline preview `http://127.0.0.1:4173` serving `dist/ai-coe-front-door-web-part_bdf4f9638d8cc3d90ffa.js`. One-page script dry-run only. Screenshots: `evidence/preview-2026-09-22/`.

The private-pilot SharePoint URL named in the 3.0.0.0 package is a **candidate default**, not proof of approval,
existence, or a chosen environment. The older dashboard demo is a different destination.

## 1. Authorized target tenant/site and Power Platform environment

**Who confirms:** tenant owner / import identity.

**Needed:** site URL, environment, owner/import identity, test scope, connection identities/references, command-list
and related list/library GUIDs.

**Current evidence:** unbound. No tenant change or discovery was made from this work.

## 2. Accepted contract version, backend correction receipt, writer authority, Marketing extension

**Who confirms:** CORE owner / controller / single tenant writer.

**Needed:** accepted contract version (v0.1.1 plus or minus the v0.1.2 proposal in
`backend/core-compatibility/CONTRACT_AMENDMENT_v0.1.2-proposal.md`), native correction receipt for F01–F12,
live single-writer authority, and a Marketing persistence/review extension. The five operations do not store
Marketing artifacts.

**Current evidence:** local amendment and correction package only. `backend/core-compatibility/`. Native import,
Save, and two-account tests are not done.

## 3. Approved, versioned, retained permitted-source register

**Who confirms:** Marketing / claims owner.

**Needed:** a real approved register and current product/claims material, retained with id/version/snapshot.

**Current evidence:** labelled synthetic fixture only. Relabelling it `approved` does not open the business route.

## 4. Marketing strategy/voice owner, copy/channel approver, meeting/sender roles

**Who confirms:** business owner of those roles.

**Needed:** named people and bounded authority. They may be the same person only if confirmed. Do not default to
any named engineer.

**Current evidence:** unbound. Local tests use fictional labelled reviewers. Site groups
`marketingParticipant` / `marketingReviewer` exist as role keys; they are not identities.

## 5. Governance/evidence validators, policy/binding versions, access groups, support/stop, retention

**Who confirms:** governance / security / records owners.

**Needed:** accepted policy/binding versions, access groups, support/stop owner, retention and data-use
qualification.

**Current evidence:** in-app support route is read from the page document footer or shown as unbound. Policy YAML
is locally readable and hash-pinned; it still requires business acceptance. `AutoValidateReturnedPackets` stays off
for business data. `Authority_*` is not bound to fake readiness.

## What this file is not

Not live acceptance. Not permission to import, publish, enable, send, or call a paid model.
