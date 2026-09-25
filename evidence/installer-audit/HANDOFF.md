# Installer lane handoff — local only

Ownership returned to parent: `sharepoint/pages/one-page/**`, `tests/audit-provisioning.ps1`, `tests/audit-draft-provisioning.ps1`, `src/provisioning/onePageDefinition.test.ts`, `evidence/installer-audit/**` in `development/overture-ai-coe-front-door-audit-fixes`. No other project files edited. No commits, tenant connections, real PnP calls, ACL changes, imports or cleanup.

## Delivered

- `sharepoint/pages/one-page/New-FrontDoorAppPage.ps1`: default offline dry-run, explicit site/authorization, additive component update/append, blank bindings preserve configured properties, encrypted prepared/applied/readback receipts, guarded instance-only rollback with property/position drift refusal. Restores original properties or removes the added component; never deletes the page. Does not publish another author's draft edits.
- `sharepoint/pages/one-page/ProvisioningReceipt.ps1`: Windows-only DPAPI payload protection; explicit absolute operator receipt prefix; immutable CreateNew/WriteThrough/Flush(true) files; SHA-256 config/content hashes. Receipt metadata never contains the prior property bag. No automatic replay of partial operations.
- `sharepoint/pages/one-page/New-FrontDoorDraftList.ps1`: create-only list, seven actual serverDraftStore fields, indexed NON-unique Title, plain/non-append Note, no unique fields, own-read/write, exact Read+Add/Edit writer role, distinct private controller group. Existing lists explicitly rejected without changes. Existing role drift, 403s, overlapping/broad identities and unmatched connection refused. New-list-only ACL writes, never global membership edits.
- Definition/sample: optional `draftListId`, `draftPolicyJson`, `coreBindingJson`, `marketingBindingJson` tokens, blank/disabled. No automatically qualified policy or enabled runtime.
- `sharepoint/pages/one-page/README.md`: complete operator/recovery contract and native gates.

## Verification

Run from worktree on Windows-owned runtimes:

```text
pwsh.exe -NoProfile -File evidence/installer-audit/Run-Offline.ps1
node.exe evidence/installer-audit/run-definition.cjs
```

`evidence/installer-audit/offline-results.json` records the latest executed result, script hashes, PowerShell 7.6.6, five parsed PS files, **13 page checks passed / 9 draft checks passed**, and exact synthetic DPAPI receipt directories. Final independent Python verification matched all eight source hashes and all four Jest tests; inspected fixture receipts contained no plaintext synthetic secret marker. Both test suites also run directly with `pwsh.exe -NoProfile -File tests/audit-{provisioning,draft-provisioning}.ps1` (run as separate commands, not literal braces).

`evidence/installer-audit/definition-results.json`: **4 Jest tests passed**; targeted real no-emit TypeScript check **0 diagnostics**. This source-only harness does not modify parent build/lib artifacts. Native package/build verification remains parent-owned.

Observed RED before implementation: page fixture failed because `ReceiptPath` did not exist; draft fixture failed with `Missing create-only server draft provisioning implementation`. Later placement-drift regression failed `Expected refusal` before component snapshots were added. All are covered by the latest GREEN run; see `red-observations.md`. Local harness debugging corrected a PowerShell reserved HOME variable, empty-array strict-mode handling and the standalone `-File` fixture's case-insensitive receipt-variable collision. Native signatures were checked against official PnP docs linked in README, not executed.

## Deliberate limits / remaining live gates

- **qualified=false always**. Schema creation is not native two-account access, effective permission, retention/deletion, historical-copy, concurrent-write, provider/workflow, or security acceptance.
- Existing draft lists are rejected rather than silently repaired. Existing group membership must already be controller-managed. Controller must be the explicit current delegated identity's group; no nested principals supported.
- Page-owner publication is a separate review step. Use an exclusive editing window: native PnP mutations do not expose an atomic CAS. Observed drift is rejected, but receipts are not distributed locks.
- Failed/incomplete operations retain prepared evidence; manual scoped reconciliation is required. No destructive list rollback and no page recycling/navigation resets.
- Real receipt/parameter files must be operator-private and kept out of Git/shared storage. Checked-in fixture receipts contain synthetic data only and are DPAPI machine/account-bound.
- CORE and Marketing binding commissioning, host service/build integration, and approved list IDs/policy references remain parent/native-operator ownership. No functionality outside this exclusive lane was changed.
