# Native CORE 3.0.0.1 — final offline handoff

## Verdict and current evidence

**Bounded local finalization completed; native commissioning remains blocked.** The existing candidate was continued, not replaced. The production C# helper was rebuilt, the actual generated workflow graph exercised, the two inherited datetime/recovery corrections reverified, and fresh OFF review packages generated. There is no registered helper identity or qualification receipt in this delivery.

- **30 tests passed; 0 failures, 0 errors, 0 skips.** `evidence/final-tests.xml` enumerates every test; `evidence/final-tests.log` is the real pytest output.
- Exact `connector/Script.cs` compiled with isolated **.NET 10.0.401 / C# 7.3**, zero warnings/errors (`evidence/final-compile.log`). `connector/local/Harness.cs` supplies only a local ScriptBase boundary, not replacement business logic.
- **12 structural definition checks passed**, six primary and six literal (`evidence/final-structural.log`). All six exact primary ZIP definitions were additionally executed by `evidence/verify_delivery.py` against explicitly simulated SharePoint and a local WDL interpreter. This is not hosted Power Automate execution.
- Fresh provisioning creates all **15 modeled lists/library**, survives repeat execution without resetting operator config or an active writer, and does not turn a simulated 403 into absence. Type drift is reported, not silently repaired.
- Create-path fault injection covers **20 durable fixture boundaries**, with stable same-intent recovery. Concurrent stale-snapshot claim rejection and post-publication/pre-completion missing-receipt recovery also pass.
- Both current flow ZIPs completed **PAC 2.12.1 unpack → pack → unpack → create-settings locally**. Parsed workflow JSON and XML identities/states/connection references/environment definitions match before/after. Every flow packages OFF; Send is absent and qualification flags default false.
- **Seven source pins** match both `upstream/` and the original source paths; **six original workflow identities** and the solution unique name are retained. No commits/pushes or frontend edits.

Authoritative current receipt: [evidence/final-verification.json](evidence/final-verification.json). Full original ZIP/member hashes: [out/build-evidence.json](out/build-evidence.json). Earlier checkpoint logs and `generator/out/` are historical; do not claim their hashes verify this delivery.

## Exact F01–F12 disposition

“Local verified” means the stated source/compiled-helper/generated-graph test below, **not tenant closure**. Finding IDs follow `../core-compatibility/correction-package/CORRECTION_PACKAGE.md` without renumbering.

| ID | Current correction and local evidence | Remaining native / acceptance gate |
|---|---|---|
| F01 | **Local verified.** `generator/flows.py:flow_00` bootstraps every list before column/binding/config dependencies; creates only on successful empty discovery. `tests/test_provisioning.py`: fresh/repeat, denied discovery, retained type drift; writer singleton seeded only when absent. | Approved fresh-site first/repeat runs, real SharePoint field types/reserved columns/unique indexes and permission-denied/transient errors. Existing drift needs explicit migration, not automatic conversion. |
| F02 | **Implementation plus local source/fixture checks; ACL execution pending.** Distinct immutable Requests, service-owned Results, private Journal; unique Title retained without ReadSecurity=2. `Set-CoreIsolation.ps1` has an explicit authorized apply path. Generated flow verifies Author-ID-only read grant before Published=true; `test_generated_create_persists_verified_response_and_read_grant`. | Script not executed. Real create-only permissions, lookup/poll usability, result access, direct-API edit/delete prohibition and two-account isolation are mandatory. Site admins remain privileged. |
| F03 | **Local verified before business writes.** `Script.cs:Validate` performs operation-specific strict keys/types/enums/context/identity/size checks and rejects malformed JSON/unsafe IDs; WDL uses escaped query literals and production helper before planning. `test_strict_validation_author_identity_and_context`, `test_generated_clarification_packets_conflict_and_rejection`. Private writer claim precedes validation, not an employee/canonical write. | Hosted custom-code qualification and malformed real trigger-path/REST tests. Local compilation does not prove the connector sandbox or designer accepts the code/bindings. |
| F04 | **Local verified for the fixed required-set implementation.** Exactly one current S2–S5 packet per type; missing, duplicate, wrong-work/version, invalid N/A, stale/revoked validation fail closed. `test_business_readiness_requires_human_complete_current_evidence_and_affirmative_policy`. | Approved policy/source hash, scoped authority/validation records and native required-set tests. Four packet types and gate set are this candidate's implementation, not proof of business policy acceptance. |
| F05 | **Local verified.** Incomplete S1 stays CLARIFYING; same-WorkID ExpectedVersion patch invalidates dependent evidence/readiness/decisions and issues current-version packets only after completeness. `test_create_and_readiness_require_complete_s1_and_full_required_set`, `test_clarification_and_evidence_journey_invalidate_versions`, generated clarification test. | Native P03/P04, real current-version/readiness/invalidation readback and human journey acceptance. No external approval revocation service is claimed; prior decision records in this candidate are invalidated. |
| F06 | **Local verified helper path.** Server RuntimeMode, TestRecord, exact UAT site/principals constrain tests; business readiness requires current HUMAN validation and accepted authority/policy; ValidateEvidencePacket is a separate authorized operation. Compiled connector validation/journey/readiness tests cover positive and negative fixtures. | Isolated native UAT, real human validator access and source authenticity, current authority expiry/revocation, and business acceptance. Local seeded authority/policy fixtures are not actual approvals. |
| F07 | **Local verified recovery, not an ACID transaction.** Durable singleton lease + sealed per-intent plan; replay compares existing writes and preserves response bytes/Created. Crash after each of 20 create boundaries; post-publish/pre-completion receipt repair passes. Validation/conflict rejection gets a real persisted receipt. Infrastructure interruption retains the journal and emits content-free failure logging rather than fabricating a terminal receipt/result. | Native failure injection/timeouts, process/network loss and operator reconciliation. Revoked authority/config or corrupted/removed history can halt the writer; no arbitrary post-completion deletion repair or automatic rollback is claimed. Never retry an unknown mutation with a new key. |
| F08 | **Local verified.** Only flow 01 mutates canonical records; 02/04 enqueue private maintenance; 03 projects files and queues receipt intents. Real generated CAS actions use exact ETags; stale concurrent claim and live claim tamper reject. `test_interleaved_writers_reject_stale_claim_etag`, revocation/tampering tests. | Native overlapping runs, lease expiry/steal, 412 handling and service account boundaries. The local single-writer discipline does not replace the existing authorized tenant controller. |
| F09 | **Local verified.** Canonical JSON is planned once; indexed columns derive from it, version changes use ETag CAS, and every write has content/hash readback. DateTime columns compare equivalent timestamps semantically while preserving canonical JSON integrity. Compiled digest/parity tests, generated clarification tests and `test_sharepoint_datetime_normalization_is_compared_semantically`. | Actual SharePoint DateTime/Number/Choice/Note serialization, field limits and column-versus-JSON parity on real reads. |
| F10 | **Local verified fixture path.** SharePoint Author.Id/EMail, never S1.Requester, defines identity. Existing inaccessible and missing work return the same nondisclosing error; no foreign duplicate WorkIDs. `test_other_author_cannot_read_existing_or_missing_work` and strict spoof validation. | Native two-caller identity and unique-key collision/access tests. Random opaque intent keys remain required; uniqueness errors are not existence-proof authorizations. |
| F11 | **Local verified.** Real SHA-256 plan/request/payload/readback/response hashes; compared record readbacks precede immutable receipt/event persistence, result grants and publication. Missing/mismatched proof rejects; private projection receipt follows file hash readback. Compiled digest test, generated create/projection and post-publication recovery tests. | Native readback tampering/failure tests, hosted cryptography support, actual receipt/event/result persistence. Read/reject receipts honestly have no business-write readback hash; no all-zero hash or fabricated success is accepted. |
| F12 | **Local verified bounded background path.** Official nextLink drained or bounded Until fails; small-page fixtures exercise all runtime snapshots. Durable issuance/reminder/escalation intents, expiry invalidation, suppression, safe hash-named Markdown and enabled-flow-aware health run through generated graphs. `test_background_graphs_page_schedule_single_writer_and_health`, missing-packet/suppression/health test, projection test. | Native paging/size/rate limits, timing/expiry and background recovery. Snapshot capacity/performance must be qualified. Send remains deliberately unimplemented/unqualified: flow 04 stays OFF and SUPPRESSED is never reported as delivered. |

## Current packages (SHA-256)

Paths are relative to `backend/core-native/`. These are the exact rebuilt/tested bytes, not the old checkpoint packages. The first three rows are the review delivery; PAC copies are packaging evidence.

| Path | Bytes | SHA-256 |
|---|---:|---|
| `out/AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY.zip` | 44303 | `b2f7e7717de5436a9ba132d9d3c96dd2afa0a3fc2300dbeb679657fec4eabfb4` |
| `out/AICoECoreAutomation_3_0_0_1_UNBOUND_REVIEW_ONLY_literal-fallback.zip` | 41340 | `067df0118be2e2c4e6d78f7742708f4c699bfcec425a70a75a13d3fa237fe3c6` |
| `out/AICoECoreIntegrity_3_0_0_1_REGISTRATION_CANDIDATE.zip` | 28395 | `2cc4336a59d220e5b50e8c3a7a58e86fa5bbada7989e5e438a2ccf534a3d4b85` |
| `out/pac-roundtrip/primary.zip` | 42525 | `4762072aad9ab8bc72e0548255c784fc5fa952c33c52482f6e9f0c42f2829b37` |
| `out/pac-roundtrip/literal.zip` | 39520 | `9a569c1147d80b741addd34a8b328fc7dfaac3085960b5bf6c2d5815dda38590` |

The helper ZIP contains Script.cs, byte-identical Script.csx, OpenAPI, API properties, deployment descriptor and operator README. It is **a custom-connector registration bundle, not a Dataverse solution import ZIP**. The flow candidates explicitly use `UNBOUND_CORE_INTEGRITY`; `connectorId` and `qualificationReceipt` remain null and `deployable` remains false.

### PAC warning disposition

The primary pack emits three `EnvironmentVariableDefinition` root-component warnings (SiteUrl, NotificationEmail, EnvironmentLabel). The unchanged supplied 3.0.0.0 ZIP reproduced the same warnings in a local control roundtrip; its before/after source hash is unchanged. All three component XML definitions and PAC-generated settings survived, as did all workflow JSON/identities. The literal fallback emits none. **This is not a warning-free primary or a native-export control, and it does not establish tenant import compatibility.** Logs and settings are under `evidence/pac-final/`.

The default private-pilot URL is inherited configuration, not a commissioned tenant binding. Literal fallback is still unbound/review-only; it does not bypass connector registration, approved site selection, security qualification or designer Save.

## Preserved original identities

Solution unique name: `AICoECoreAutomation`; source `3.0.0.0` → correction `3.0.0.1`.

| Workflow | Preserved GUID |
|---|---|
| AI CoE 00 Provisioning | `99538ee6-adde-5cac-a8dc-78e2d9f2b417` |
| AI CoE 01 Case Command | `bbb2f816-2abe-5216-8fc8-23452056573b` |
| AI CoE 02 Evidence and Readiness | `9c7a7513-4787-5fdc-9c2f-ed9e00ce7b10` |
| AI CoE 03 Markdown Projector | `5cff5cdb-41b4-581e-ad63-f7495680e02d` |
| AI CoE 04 Notification Outbox | `41303d3c-0cab-5668-8b02-b638fb361ab0` |
| AI CoE 05 Health Monitor | `aba74eca-505e-5f1d-a3df-f157499e7dbf` |

## Frontend agreement — no redesign

[README.md](README.md) remains the `v0.2.0` contract: separate request/result lists; immutable same-intent mutation retries; new intent for a fresh read/evaluation; S1 partial patch on the same WorkID; ExpectedVersion required for clarification, packet submission/validation and readiness. The packet projection returns actual canonical server packet IDs, versions and questions. No frontend files were edited.

Results are pending until Published is boolean true, and the consumer must match intent/contract/operation/request identity before accepting ResponseJson. Packet and work versions are server values; LastValidatedAt can remain null. Foreign/missing work does not disclose existence. Preserve legacy IntakeId/CoEID in LegacyRefs; no writes to the working legacy intake workflows/lists occur here.

## Gates before any native claim

1. Obtain explicit environment/site/operation authorization through the existing single-writer controller. No approval is inferred from this handoff.
2. Register/qualify the separate pure helper, including custom-code sandbox support, DLP, namespaces, crypto, payload/runtime limits, secure IO and no-forwarding behavior. Read back the **actual** runtime API name, connector GUID, schema name and scoped qualification receipt; never manufacture an ID. See `connector/README.md` and `connector/deployment.json`.
3. Bind that exact identity/script SHA via `generator/build.py --binding <authorized-binding.json> --out out/bound`, rebuild/reverify new hashes, still OFF. This local binding action does not itself authorize import or make `deployable` true.
4. Separately authorize import; resolve/qualify the environment-root warning, bind service-owned connections, open/save all flows and verify actual OFF state. Updating an existing flow can preserve prior active state despite OFF XML.
5. Authorize provisioning/ACL application separately. Run real fresh/repeat setup, direct-API two-account create/read/edit/delete isolation, canonical-list denial, result grants and privileged-admin boundaries. Neither qualification flag may be set solely because local tests pass.
6. Commission native version/concurrency/retry/crash/receipt/paging/expiry/health paths, then approve actual source/policy/authority/human validation and workflow acceptance. A complete-looking local fixture is not business evidence. Send remains outside this release.

## Local reproduction

Run from this CORE root using existing offline SDK/PAC dependencies; no package downloads are needed here:

```bash
export DOTNET_ROOT=/home/far_cdx/.cache/oss-demo-dotnet
export PATH="$DOTNET_ROOT:$PATH"
export DOTNET_CLI_HOME="$PWD/evidence/dotnet-home"
export NUGET_PACKAGES="$PWD/evidence/nuget-packages"
export NUGET_HTTP_CACHE_PATH="$PWD/evidence/nuget-http-cache"
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE=true
PY=/home/far_cdx/.hermes/hermes-agent/venv/bin/python
PAC=/home/far_cdx/.cache/oss-demo-pac/pac

dotnet build connector/local/CoreHarness.csproj --no-restore -c Release
"$PY" -m pytest tests -q --junitxml=evidence/final-tests.xml
"$PY" generator/build.py --review-unbound
"$PY" generator/validate.py
```

For each flow ZIP, local PAC commands (use fresh output directories for another receipt):

```bash
"$PAC" solution unpack --zipfile <current-flow.zip> --folder <unpacked> --packagetype Unmanaged
"$PAC" solution pack --folder <unpacked> --zipfile <roundtrip.zip> --packagetype Unmanaged
"$PAC" solution unpack --zipfile <roundtrip.zip> --folder <roundtrip-unpacked> --packagetype Unmanaged
"$PAC" solution create-settings --solution-zip <roundtrip.zip> --settings-file <settings.json>
"$PY" evidence/verify_delivery.py
```

The verifier expects the recorded `evidence/pac-final/{primary,literal}-*` and `out/pac-roundtrip/{primary,literal}.zip` layout and checks it against the current source and build. It fails rather than blessing a stale package. `pac help` reports version; `pac solution check` is **not offline** and was not run.

## Finalization changes and boundaries

Added fresh-provisioning execution tests and completed the inherited local WDL harness's provisioning functions/actions. Added interleaved-writer, cross-author and post-publication missing-receipt regressions. Corrected flow 00's stale read-own/edit-own package description. Recompiled inherited production fixes, rebuilt output, retained current compile/test/build/PAC/preservation evidence, and finalized these docs. `evidence/IMPLEMENTATION_NOTES.md` is an earlier checkpoint, superseded by this handoff.

Initial WSL `git status` could not resolve the Windows-owned worktree .git pointer. No pointer repair, Git write, commit, push or branch claim was made; source/package preservation is hash-based here. The parent owns any Windows Git reconciliation. All task artifacts/writes stay under `backend/core-native/**`; no ACL script, tenant/service/provider action or upload was executed.
