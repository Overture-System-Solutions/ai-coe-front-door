# Marketing native flow lane — exact handoff

**Flow lane locally green; whole-system/native acceptance remains blocked.** Continued the existing generator, preserving its 431-action architecture and seven helper modes. No helper implementation, tenant/auth/check/import, model invocation, Node host, frontend build, commit or activation occurred in this lane.

## Results verified from real local execution

- **17 tests passed; 0 failures; 0 skips.** Structural WDL, offline expression, source-observation, private-ACL, replay-wire and actual generated package tests. `resume-final-tests.log` is the latest suite receipt; earlier RED logs are retained.
- **431 nested actions; 69 below the 500 ceiling.** All actions retain secure inputs/outputs; external connector actions have retry none; trigger concurrency and foreach repetitions are 1.
- Local official PAC **help → unpack → pack → unpack → create-settings**, all exit 0. Final ZIP workflow/connection/state/root semantics equal the generated candidate; final definition passes the validator. Last PAC run: `pac/verified-6v7yv9gp/`.
- Flow OFF/Stopped, `enabled`, `controllerQualified`, `securityQualified` false. All connection instance IDs unbound; helper runtime API remains `UNBOUND_MARKETING_INTEGRITY`.
- Original prior source/tests/out artifacts and binding template: **20 files preserved and archive hashes verified** at `preserved-before-finish/`. No restart/replacement of the generator architecture.

Receipts: [finish-verification.json](finish-verification.json), [pac-verification.json](pac-verification.json), [helper interop review](HELPER_INTEROP.md), [preserved manifest](preserved-before-finish/manifest.json).

## Exact artifact hashes

All paths below are relative to `backend/marketing-native/`.

| Artifact | SHA-256 |
|---|---|
| `out/AICoEMarketingAutomation_1_0_0_0_UNBOUND_REVIEW_ONLY.zip` | `fb8fce459711abcb07059f9fdea2e15825824e3e3ed05be9a1f613a8c1ca0381` |
| `out/pac-roundtrip/AICoEMarketingAutomation_1_0_0_0.zip` | `dab5648a6773d14c0a733c69d3917ec18db6d0d2ac4ea1cd4e5eb908fb0da224` |
| `out/flow-definitions/AICoEMarketing01Command.json` | `d0ea864115ab867e20129279239d1acb5c70a6e85d1bbcc829353a9fbec7d588` |
| `evidence/flow/preserved-before-finish/source-and-package.zip` | `09068b396a0251f62891f1677d69d75b9c266de3174046e2e70ed1f3c793f48c` |

Previous candidate preserved inside archive: `8b7e72df3c72a2fa06016bd92595075ad75f0107766141f38c3b6dc34e16d39a`; previous PAC ZIP: `b202d93bd74679ccb63e3f468e5f89dbd6f101e912b58d4d3c72e4a05aa4c6eb`.

## Repairs / changed files

- `generator/marketing_validate.py`: actual success-ancestry durable-boundary checks; the outstanding regression failed because this validation was missing, not because its assertion was wrong. Offline support for the exact millisecond utcNow format.
- `generator/marketing_pipeline.py`: writer-only pre-disclosure ACL; milliseconds for CommandStart. Existing Author grants now hold for operator reconciliation, not automatic replay/grant.
- `generator/marketing_actions.py`: normalize bare/verbose immutable request rereads; common Now uses milliseconds.
- `tests/flow/test_wdl_safety.py`: repaired original RED; stronger private-ACL and reread regressions.
- New `tests/flow/test_interoperability.py`: generated expression/type tests against actual parent input vectors and explicitly labeled wire fixtures. **Not** a compiled-helper or full-flow executor.
- Rebuilt `out/**`; new/updated `evidence/flow/**` receipts/docs. `connector-binding.template.json` unchanged. Pinned CORE donor files unchanged. Existing Claude connector/idea-flow sources not edited.

## Immediate parent/helper issue

**Inspect/fix the helper's continuation parser before combined acceptance.** The concurrently authored `connector/parts/10_Modes.cs` inspected here expects `lists(guid='<id>')` with `=`, while the generated native SharePoint URL uses `lists(guid'<id>')` without `=`. This is source-level evidence, not an executed helper failure; the parent/helper lane owns the correction and final proof.

Later source inspection confirms the helper's Fields object / numeric VerifiedAuthorId / string RecordJson and ResultJson match this flow. Final Script.cs was still under construction; required registration files were absent at final build: `apiDefinition.swagger.json`, `apiProperties.json`, `deployment.json`, `README.md`. No helper registration ZIP is claimed. Helper-source hashes observed at this checkpoint are in finish-verification.json, not a final-helper acceptance baseline.

Use [HELPER_INTEROP.md](HELPER_INTEROP.md) for the exact seven-mode table, native-plan replay requirements, null ProviderResponse, before/after source observations and post-read canonical snapshots. In particular:

1. Final helper must freshly authorize retained native-plan Result without regenerating revisions; exact packaged flow/helper + crash paths remain parent's tests.
2. Pre-call ProviderResponse is null. The newly persisted provider-pending row may authorize the **same current dispatch** after fresh checks; an existing pending row is never automatically called again.
3. Source bytes must be a plain text body with actual ETag; helper must reject wrappers/missing ETags and changed after-observations. Request service timestamp precision is still a helper/native qualification check.
4. Author-read ACL recovery after a crash intentionally holds. Breaking inheritance is not automatic revocation or a fresh authorization receipt.

## Commands to reproduce locally

```bash
cd /mnt/c/Users/scfre/JuliannaAI/OSS-AI-CoE/development/overture-ai-coe-front-door-audit-fixes/backend/marketing-native
export PYTHONDONTWRITEBYTECODE=1
python3 -m unittest discover -s tests/flow -v
python3 generator/build.py --status
# Rebuild only after preserving any later artifacts the parent wants to retain:
python3 generator/build.py --review-unbound
python3 generator/roundtrip.py \
  --pac /home/far_cdx/.cache/oss-demo-pac/pac \
  --dotnet-root /home/far_cdx/.cache/oss-demo-dotnet
```

`roundtrip.py` performs **local** PAC operations only, never `solution check` or authentication. Rebuilding after helper completion may add its separate registration-material ZIP; that is not deployment or hosted-script proof. Parent harness should import `marketing_validate.OfflineExpression` (supports the generated explicit UTC format), not only the older pinned donor evaluator.

## Actual connector/schema/flow assumptions and gates

- Solution `AICoEMarketingAutomation` 1.0.0.0, publisher `aicoe`; workflow `1d53f3a8-7e14-5a4a-b224-a7b0bf9eaa99`. Planned helper component `99a944b8-fb6d-5cce-90a2-00dcb701a414` is **not** a registered runtime ID.
- Helper logical/reference `aicoe_marketingintegrity`; operation Evaluate with `body/Mode` and JSON-string `body/Payload`.
- Reused Claude API exactly `shared_cwdd-5foss-20claude-20intake-20draft-5f55b0e9f278ac89c6`, logical `cwdd_ossclaudeintakedraft`, operation GenerateIntakeDraft; projected paths, max_tokens 1600, stream false, thinking disabled, API version 2023-06-01. Existing connector/idea contract unchanged; native Marketing authority still unqualified.
- Three distinct Marketing lists use the existing `marketing-runtime/provisioning.json` schema. Canonical fields remain Title/RecordKey/TenantScope/RecordJson/RecordHash; result fields Title/RequestId/VerifiedAuthorId/ResultJson. Private canonical writer claim/command/provider/native-plan are records, not added columns. No CORE/legacy mutations.
- Recurrence every 5 minutes; bounded queue selection 20 commands, sequential complete collection reads, at most 20 pages; exhausted/cyclic continuations fail, never silently truncate. Held writer claim has no timed takeover.
- Parent must execute final compiled helper with exact packaged WDL and labeled transports, including all 16 operations, AI, original-intent recovery, source revocation, write/readback/ACL failures and crash boundaries. These 17 tests do not establish that acceptance.
- Native helper registration/hosted API limits/designer Save, qualified writer/controller/config hash, actual REST/ETag/plain-text shapes, two-account source/list/item permissions, provider response/truncation/timeout/cost, and retention/revocation remain unperformed gates. **Do not enable or import these review artifacts as a working system.**
