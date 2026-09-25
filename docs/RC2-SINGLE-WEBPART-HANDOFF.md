# Front-door local correction handoff — 1.0.0.17

**Status: locally verified correction candidate, not a native-deployable complete CoE release.**

Working copy: `development/overture-ai-coe-front-door-audit-fixes`, branch `fix/coe-audit-server-drafts`, uncommitted at baseline HEAD `b748e45c7eded09d518813fb5f2cb4cd749cbac7`. The previous dirty worktree and all 458 captured original files are unchanged. [Earlier handoff, preserved as history](history/RC2-SINGLE-WEBPART-HANDOFF-before-audit-fixes.md).

## What is corrected

- CORE client freshness across restart, partial clarification updates, native v0.2.0 transport, current-identity checks, evidence forms/validation, version invalidation and retained-intent recovery. Canonical status does not become a human approval.
- Source-pinned native CORE 3.0.0.1 flow/helper candidates, actual generated-graph execution in an offline harness, qualified single-writer boundary, receipts/CAS/private results and OFF defaults.
- Business drafts stay server-side; browser storage contains scoped opaque references only. Access/retention gates, exact metadata/ETag readback, shared pending references and same-scope Web Locks prevent silent replacement of an unknown save. Submission retries retain their original identity.
- Marketing source revocation, stale-parent/review-type checks, durable receipt handling and exact immutable-revision tokens. Late source revocation and replay/recovery disclosure are covered against final extension ZIP bytes.
- Separate business Marketing UI: authorized case/source selection, three draft types, current-identity review, human manual correction, saved working drafts and pending-operation recovery. The actual facade accepts the UI's content-only manual payload; server metadata is not submitted as authority.
- Synthetic input survives section navigation in page memory. Business text blocks section/case/mode changes until saved, reviewed or explicitly discarded; saved server records are not deleted by discarding form edits. Review comments cannot silently move to another artifact.
- Additive one-page and create-only private draft-list provisioning, protected receipts, readback and guarded instance rollback. No automatic publication or whole-site replacement.
- Content-free, evidence-gated outcome aggregation and reachable teaching/commissioning guidance. Aggregation is manually invoked; it is not scheduled enterprise analytics or an autonomous improvement loop.

## Actual verification

| Layer | Result | Evidence |
|---|---|---|
| Clean production Heft | 1,154 passed, 120 suites, zero failures | [full log](../evidence/release-1.0.0.17/final-production.log) |
| Additional Node/runtime/CLI checks | 96 passed, zero failures/skips | [TAP](../evidence/release-1.0.0.17/final-node.tap) |
| Native CORE production helper/generated WDL | 30 passed, zero failures/errors/skips, local fake SharePoint boundary | [JUnit](../evidence/parent-native-complete.xml) |
| Exact Marketing ZIP execution | 9 passed, including IR-01/IR-02 | [TAP](../evidence/parent-marketing-exact-zip.tap) |
| Installer | 13 page checks and 9 draft-list checks; Windows PowerShell 7, fake PnP only | [page](../evidence/parent-provisioning-final-pwsh7.log), [draft](../evidence/parent-draft-provisioning-final-pwsh7.log) |
| Built-bundle browser | Seven simulated roles, desktop/mobile tabs/focus, CORE clarification and persisted synthetic brief; zero page errors/external requests | [receipt](../evidence/release-1.0.0.17/browser-results.json) |
| Package/preservation | Current bundle matches the .sppkg; original files/Git status unchanged; backend hashes and source inputs verified | [aggregate receipt](../evidence/release-1.0.0.17/VERIFICATION.json) |

Groups overlap; do not add them into a unique-test total. Non-blocking lint warnings remain. CORE primary PAC emits three environment-variable warnings also reproduced on the unchanged supplied baseline; the literal fallback does not. The exact .sppkg SHA-256 is in [port-verification.json](../evidence/port-verification.json).

## Remaining work and authority

Sam selected OSS **CloudWaveDashboardDemo**, with **samuel.conrad@osscontact.com** as authorized writer, for later testing. Marketing remains constrained to an approved Microsoft environment. This work did not authenticate as that account or perform tenant operations.

**The next engineering gate is the compatible Microsoft Marketing execution/trigger/connector integration.** The Node ZIP is a tested implementation candidate, not an importable Power Automate solution and not approval of a new host. Marketing list/ACL commissioning and the legacy-intake/CORE association still need implementation/acceptance. Monday.com integration is not implemented. See [exact remaining gates](../LIVE_BINDINGS_REQUIRED.md).

Reuse the working OSS Claude intake/triage/human-decision chain; do not erase its live-tested credit or widen its data contract implicitly. Human reviews and new business-data access/retention/provider approvals remain mandatory. No automatic Marketing send, publishing, assignment or scheduling is added.

## Reproduction

Use Windows-owned Node/dependencies for this Windows-owned worktree. Do not repair its Git pointers from WSL.

```text
node.exe node_modules/@rushstack/heft/lib/start.js test --clean --production
node.exe node_modules/@rushstack/heft/lib/start.js package-solution --production
node.exe scripts/verify-package.mjs --tests "<actual test result>"
python3 evidence/release-1.0.0.17/verify_release.py
```

A production clean is important: stale hash-named bundles make the package verifier fail. The local preview server captures a bundle path at startup; restart it after rebuild and compare the served bundle hash. `evidence/release-1.0.0.17/browser_check.py` exercises the actual built bundle with all non-loopback requests blocked. The preview control panel is non-sticky, with a persistent non-intercepting simulation badge, so it does not cover mobile controls.

No commit, merge, push, tenant write or model call was performed. Do not treat this handoff as permission to upload or activate all enclosed artifacts.
