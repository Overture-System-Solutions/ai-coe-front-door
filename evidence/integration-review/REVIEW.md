# Independent candidate/package and client-boundary review

## Outcome

**Three new concrete defects reproduced; existing suite/package checks passed with the no-rebuild qualification below.** No implementation, candidate ZIP, release receipt, tenant, provider, ACL, PAC, Git or shared-build changes were made. All review writes are under `evidence/integration-review/`.

The parent’s two previously known native-client defects are **not open findings here**. After the parent update, the eight native-adapter tests and six server-draft tests pass. Strict standalone no-emit checking of the current native client and server draft store reports zero diagnostics. Their source hashes are retained in `focused-typecheck.json`.

## New findings

### IR-01 — High: Marketing recovery republishes source text after current source access is revoked

- **Locations:** `backend/power-automate/marketing-runtime/server/runtime.cjs:63–76,89–91,180–186`. Current work/actor checks do not authorize `payload.reference`; completed-command replay and recovery return the cached result without re-entering `ServerSourceRegistry`.
- **Measured reproduction:** issue `ReadSourceExcerptV1`; mark the exact private source record revoked; a newly issued source read correctly returns `null`. Both re-executing the old request ID and a **new** `RecoverMarketingIntentV1` command return the original excerpt. The new recovery produces another private projection containing that excerpt. Provider calls remain zero.
- Reproduced against **source and exact ZIP runtime/compiled services**. This is not merely the openly disclosed retention of an already-granted historical projection: it is a new recovery/dispatch returning data the fresh source endpoint refuses.
- **Correction direction:** authorize the original operation’s current source/purpose/audience/permission dependencies before replay/recovery returns source-bearing content. Keep immutable historical receipts distinct from permission to disclose their cached business payloads.

### IR-02 — High: late source revocation still allows an excerpt into the provider request

- **Locations:** `backend/power-automate/marketing-runtime/server/source-registry.cjs:24–44`; `server/runtime.cjs:124–134`; `src/webparts/aiCoeFrontDoor/services/marketing/marketingDraftService.ts:351–362,384–400,503–506`.
- **Measured reproduction:** revoke the source from the fake SharePoint `/$value` boundary, before returning its bytes. The source is already revoked when the actual runtime’s provider wrapper is invoked, yet the outgoing request contains **one permitted source excerpt** and the fake provider is called **once**.
- The later artifact state correctly becomes `revalidationRequired`, but the operation still returns `kind: saved`; that later state cannot undo the earlier provider disclosure. **No live model was called.**
- Reproduced against source and exact ZIP services. The source register/current-source checks run before awaited retrieval and are not refreshed at the provider-dispatch boundary.
- **Correction direction:** refresh source/register/current permission and caller audience checks immediately before offering retrieved text to the provider; stop rather than send text from revoked sources. Add this late-revocation regression, not only post-save acceptance checks.

### IR-03 — Medium: stale draft reads/cached references erase an unresolved write

- **Locations:** `src/webparts/aiCoeFrontDoor/services/serverDraftStore.ts:69–81,109–118,172–186`.
- **Measured reproduction A:** save old draft; start a load and hold its old server reply; make a newer save uncertain, confirming browser reference `pending: true`; release the older load. It returns the old draft and unconditionally records `pending: false`, replacing the unresolved digest. Restart then loads the old draft without an unresolved-write error.
- **Measured reproduction B:** a second store instance caches the successful old reference; the first instance subsequently records an uncertain newer write in shared browser storage. The second instance ignores that shared pending reference, saves replacement text successfully and clears pending state. This is one concurrency/recovery defect with two reproductions, not two independent findings.
- **Correction direction:** serialize loads with writes and prevent stale operations from replacing a newer recovery reference. Reconcile current shared references rather than trusting an instance-local cache; cross-instance coordination must preserve the unresolved intent.
- Browser-storage spies in both reproductions contained no `BUSINESS-` text: the failure concerns **loss of recovery state**, not a business-text persistence leak.

## Verified execution and limits

| Check | Actual fresh result |
|---|---|
| Native CORE pytest | **29 original tests + 1 existing-byte packaging replacement passed; 0 failures/errors/skips**. The original rebuilding test was deliberately deselected. |
| Native verifier | All verification assertions rerun; **12 structural definitions, 7 source pins, 6 preserved workflow identities**; all six primary packaged graphs executed against the shipped local WDL/SharePoint fixture. |
| Native packaged smoke | **15 modeled lists/library**, **20 create durable boundaries**; publication true in fixture. Existing compiled helper SHA matches the final receipt. |
| Marketing source suite | **30 passed, 0 failed/skipped/cancelled**. `MARKETING_PACKAGE_ROOT` pointed to this review’s exact-ZIP extraction, preventing the package test’s normal rebuild. |
| Marketing exact-ZIP smoke rerun | **1 passed**, same package smoke repeated, not an additional unique suite case. Compiled services + public invocation + CAS adapter; fake external boundaries only. |
| Current native client/server-draft tests | **14 passed**: eight native adapter + six draft store. Includes parent fixes and current-user/result-author checks. |
| Focused strict no-emit TypeScript | **2 root files plus dependency graph; 0 diagnostics**, TypeScript 5.8.3. No Heft/full-host acceptance claim. |
| Independent probes | **6 successful defect observations, 3 grouped defects**; passing reproduction assertions are not safety passes. |
| Preservation | **13 protected artifacts unchanged** after execution. All **34 Marketing package input hashes** match current source at final aggregation. |

### Required no-rebuild adaptations

1. `tests/test_packaging.py:33–49` calls `generator/build.py`. To honor the explicit no-rebuild instruction, that one test was deselected, and `test_native_existing_packages.py` reruns its remaining archive assertions against the **existing delivery ZIPs**, adding CRC checking. This is **not** a claim that all 30 original tests ran unmodified or that the builder was re-executed.
2. Native `evidence/verify_delivery.py:132` overwrites its authoritative release receipt. `run_checks.py delivery` executes the inspected AST with only that output path redirected under this review and the test-receipt input redirected to this run’s JUnit XML. All verification logic is unchanged; `verifier-adaptation.json` records the original hash and transformations. Existing PAC artifacts/settings/logs were verified, **not rerun**.
3. Marketing `package.py` was not executed because it rebuilds and overwrites candidate/receipts. The exact existing ZIP was CRC/member/input-hash checked, safely extracted under this review, and passed to the existing package smoke through its supported environment variable.
4. Initial pytest FD capture failed on the evidence directory’s DrvFS temporary file with `FileNotFoundError` before any tests ran. Preserved failed logs; rerun used `--capture=sys`, disabled cache/bytecode and isolated DOTNET/CLI/temp paths. Fresh JUnit counts were parsed and reconciled against the original test names programmatically.

## Exact delivery bytes checked

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| CORE primary `AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY.zip` | 44303 | `b2f7e7717de5436a9ba132d9d3c96dd2afa0a3fc2300dbeb679657fec4eabfb4` |
| CORE literal fallback | 41340 | `067df0118be2e2c4e6d78f7742708f4c699bfcec425a70a75a13d3fa237fe3c6` |
| CORE helper registration candidate | 28395 | `2cc4336a59d220e5b50e8c3a7a58e86fa5bbada7989e5e438a2ccf534a3d4b85` |
| Marketing `marketing-runtime-offline-0.1.0.zip` | 88406 | `fd7a8ade1ff49d0dc5a36bb3318d2e0e5e25d74cf015db91b04fd9fd80b5da48` |

Both existing CORE PAC roundtrip ZIPs also match the receipt and retain parsed semantics. Marketing contains **36 ZIP members / 35 manifest files / 34 source inputs**, all checked. Exact paths/additional hashes: `package-integrity.json`.

## Parent reproduction

From the worktree root, run any bounded case:

```text
node.exe evidence/integration-review/independent-probes.cjs replay
node.exe evidence/integration-review/independent-probes.cjs late
node.exe evidence/integration-review/independent-probes.cjs draft
```

Each command uses synthetic fixtures only and writes a separate case receipt under this directory. Source and ZIP variants run together for the Marketing cases. Without an argument, all six observations run and write `independent-probes.json`. That file records exact reviewed source hashes; `summary.json` confirms no reviewed source moved between probes and aggregation.

Main evidence: `summary.json`, `independent-probes.json`, `native-tests.xml`, `native-tests.log`, `native-delivery.log`, `marketing-source.log`, `marketing-zip-smoke.log`, `client-drafts.log`, `focused-typecheck.json`, `package-integrity.json`, `preservation.json`.

No additional native CORE backend failure was found in the bounded executed checks. Marketing host binding, real source/authority evidence, commissioning, tenant ACLs and full host acceptance remain openly incomplete and are **not newly reported defects**. All fixture/model/source content here is synthetic, not live evidence.
