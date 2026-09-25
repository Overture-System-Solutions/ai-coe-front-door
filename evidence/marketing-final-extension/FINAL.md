# Final Marketing extension receipt — offline candidate 0.1.1

## Verified outcome

- `ListMarketingWorkV1` and optional `IMarketingServices.listWork()` expose only sorted unique validated IDs from the current verified Author's enabled private membership (max 500).
- `SaveManualMarketingDraftV1` and optional `saveManualDraft(session, request)` reuse the real source/schema/draft/repository/review pipeline. Brief, content-plan and follow-through saves and revisions execute with human/manual/none provenance, no provider call/qualification or implicit approval.
- Exact revision-bound public concurrency tokens fix the reproduced equal-ETag-across-immutable-rows stale-edit defect. Normal reviews, parent/source invalidation, author/work/kind/schema/version guards and durable receipt/readback/recovery remain enforced.
- Parent opaque recovery safety retained; manual saves are explicitly draft-class mutations/recovery. No browser business-content cache added.
- IR-01 fixed: source/register/current permission/audience/version are rechecked before replay/disclosure; recovery is restricted to supported original mutations, not source reads. Revoked source-derived artifacts are not republished just because their state says revalidationRequired.
- IR-02 fixed: source access is refreshed after awaited byte retrieval and after provider intent persistence immediately before the connector boundary. Both exact independent late-revocation scenarios assert zero provider calls. Parent source payloads are also reauthorized before offering their text.

## Exact verification

`FINAL-RECEIPT.json` is the machine-readable source/hash/count receipt.

- Windows Node v22.16.0: **58 runtime/source tests passed**, zero failures/skips/cancellations.
- **4 parent recovery tests passed**, unchanged.
- Strict no-emit TypeScript: **21 Marketing service/content roots plus dependency graph, zero diagnostics**. No shared Heft/full-host build.
- **9 tests against bytes extracted from the final ZIP passed**: packaged public invocation/CAS/manual all-kind journey plus eight IR-01/IR-02 source-disclosure regressions. These are repeated safety checks against compiled bytes, not nine additional unique source tests.
- Final ZIP `backend/power-automate/marketing-runtime/out/marketing-runtime-offline-0.1.1.zip`
  - SHA-256 `b9fb673be4cdca98193883855716329255d45a30db92ed4bf2c16534374075da`
  - 42 ZIP members; 41 verified manifest files; 40 source inputs match current files.
- Historical `0.1.0` is unchanged and copied under `out/historical/` before receipt replacement.
  - SHA-256 `fd7a8ade1ff49d0dc5a36bb3318d2e0e5e25d74cf015db91b04fd9fd80b5da48`
  - Reviewer findings against that old hash remain valid historical observations, not tests of 0.1.1.

All SharePoint/provider identities, content and responses used here are explicitly offline test fakes. Existing exported Claude integrations were not modified; no actual model/tenant/send/ACL operation, new host, commit or full build occurred.

## Parent/UI integration action — mandatory

The sibling `AppBusinessMarketingWorkspace.tsx` currently parses and submits the **full** artifact payload at its manual-save call (observed line 230), and its mock test expects the full payload. This is incompatible with the stricter server content-only contract. Keep UI parsing/work-ID checks, then strip the root keys exported in `content/marketing/manualDraft.ts` as `MANUAL_SERVER_FIELDS` before invoking `saveManualDraft`. Preserve nested exact acceptedBrief/campaignPacket/source references and existing artifactId/expectedStoreVersion. Update the UI regression to assert stripped content and exercise the real facade. Do not weaken the server metadata rejection. UI files are sibling-owned and were not edited by this lane. API.md contains the shared method signatures and content contract.

## Remaining native gates

This is an offline Node extension candidate, **not a native Power Automate import solution**. The approved existing Node-capable canonical-writer host, authenticated request trigger/connector bridge, private lists/ACL lifecycle, real register/reviewer qualifications and native commissioning remain unbound/unperformed. Current-source rechecks are not a distributed transaction with the tenant or provider; native concurrency/crash acceptance remains required.

Reproduce current owned checks: `python3 evidence/marketing-final-extension/verify.py`. This rebuilds a new candidate snapshot and preserves any overwritten archive/receipt under `out/historical/`.
