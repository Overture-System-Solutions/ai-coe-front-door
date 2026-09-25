# Native Microsoft Marketing execution contract — local implementation

## Scope and preservation

Implement under `backend/marketing-native/` in the existing `fix/coe-audit-server-drafts` worktree. Preserve the verified 1.0.0.17 frontend, CORE 3.0.0.1, Marketing Node 0.1.1, original exports and delivered ZIPs byte-for-byte. No commits, tenant/model calls, permissions, new hosting, sends or publication. User selected OSS CloudWaveDashboardDemo and samuel.conrad@osscontact.com as the authorized later writer. Approval of the Microsoft environment is not proof of native permission/connector qualification.

## Architecture decided here

Power Automate performs all I/O. A pure C# custom-connector helper performs parsing, source/review/identity planning, hashes and response validation; it MUST NOT forward HTTP or invoke Node. Its generated Script.cs must compile as C# 7.3 with APIs compatible with the documented .NET Standard 2.0 / supported namespaces; local .NET 10 ScriptBase tests do not prove hosted compatibility. Microsoft documents one script, at most 1 MB, and a two-minute execution bound. Native Save/limits remain a separate gate.

Keep frontend `marketing.v1` wire and the existing three-list storage schema from `backend/power-automate/marketing-runtime/provisioning.json`: immutable create-only Requests, service-only Canonical, private Results with a verified Author-only Read grant. Title for canonical rows is SHA256(siteUrl + newline + RecordKey), RecordJson/RecordHash retain their existing meaning. Preserve the existing canonical key vocabulary. Do not reuse CORE canonical lists or write legacy intake IDs.

New solution: **AICoEMarketingAutomation**, version **1.0.0.0**, publisher prefix `aicoe`. Distinct deterministic workflow and helper IDs, recorded in the manifest; do not reuse live intake/CORE workflow IDs. Single flow `AI CoE Marketing 01 Command` is the sole Marketing canonical writer; recurrence trigger with concurrency 1 and bounded sequential queue processing. No independent parallel writer is introduced. All actions use the current approved writer's SharePoint connection. External writer/trigger qualification is mandatory.

Helper logical name/reference: `aicoe_marketingintegrity`; operation `Evaluate`; projected parameters `body/Mode` and `body/Payload` (Payload is a JSON string). Registered runtime API name remains `UNBOUND_MARKETING_INTEGRITY` until supplied/verified; helper registration material is separate from the flow solution. Existing Claude connector operation `GenerateIntakeDraft` and its projected argument paths are reused without editing the connector or idea-only flow. Freeze the 1600-token bound and reject truncation; no wider cost/data authority is implied. Prompts/model/schema are server-owned. Existing Claude API identity is in `marketing-runtime/connector-binding.json` and saved export comparisons.

## Pure helper interface (authoritative for parallel implementation)

One `public partial class Script : ScriptBase`; output Script.cs assembled from authored parts. `ExecuteAsync` dispatches to public static `JObject Evaluate(string mode, JObject payload)`. Every successful helper result has `Valid: true`; every refusal has `Valid:false, Error:<content-free code>` with no business text. Helper failures stop the flow, never default success.

Common operation input:
- `Config`: server-controlled existing config.example.json fields (`enabled`, `siteUrl`, requestListId, resultListId, canonicalListId, qualificationReceiptRef, writerPrincipalId, readRoleDefinitionId, provider); plus `controllerQualified` and `securityQualified`, both false by default.
- `Row`: service-fetched immutable SharePoint request (Id, Title UUID, Operation, ProtocolVersion, PayloadJson, AuthorId, EditorId, Created, Modified, Author.{Id,Email,LoginName}). Never trust payload identity/roles.
- `Records`: complete array of canonical SharePoint rows `{Id,Title,RecordKey,TenantScope,RecordJson,RecordHash,@odata.etag}`. Duplicate keys, corrupt hashes, malformed/unsupported records or unbounded snapshots refuse.
- `Now`: flow-generated UTC timestamp; `RunId`: workflow run identity. Source/authority expiry must be finite and current.
- `Sources`: service-observed array `{sourceId, versionOrETag, content, contentETag, permissionLowBefore, permissionLowAfter, metadataETagBefore, metadataETagAfter}`. Root canonical Records is reread after the last content read and immediately before provider dispatch/publication. The helper checks source metadata, register receipt, current owner authority, audience/purpose, source hash and permission mask 33 from both permission observations. Only same-site approved plain text is supported; never pretend binary files were extracted.
- `ProviderResponse`: optional actual Claude Messages response, obtained only by flow I/O or from its retained original response checkpoint.

Modes:
1. `Preflight(common)` verifies configuration/qualification, request/Author/current membership and operation, current work/artifact access. Returns `Fingerprint`, `SourceRequests` array of `{sourceId,versionOrETag,PermissionUri,MetadataUri,ContentUri}`, and `NeedProvider` boolean. URIs are relative approved-site `_api/` paths, generated only from approved canonical source metadata, not caller URLs. Include sources required by referenced parent/replayed artifacts. No mutation plan/payload disclosure before source checks.
2. `Plan(common with Sources and optional ProviderResponse)` redoes all authority/source guards. If an AI draft needs inference and no retained response exists, returns `{Valid:true,NeedProvider:true,ProviderWire:<existing projected connector arguments>,ProviderWireHash}`. Otherwise returns `{Valid:true,NeedProvider:false,Result:<exact marketing.v1 operation value>,Writes:[...]}`. Supports all 16 operations in the existing operations.json, including manual saves, all normal reviews, safe reads and original-intent recovery. Do not return fabricated defaults for unsupported paths.
3. `InspectWrite({Config,Write,Rows})` returns `{Valid:true,AlreadyApplied,ItemId,ExpectedETag}` only for absent create-only records, exact idempotent bytes or a matching explicit update ETag. Write is `{Key,Value:<object>,ExpectedVersion:<etag or null>}`; null means create-only. Conflicts refuse. Returned `Fields` is the actual SharePoint row object using the existing title/key/JSON/hash scheme.
4. `VerifyWrite({Config,Write,Rows})` requires exactly one complete matching readback and returns `{Valid:true}`; no apparent PASS without readback.
5. `Page({Config,Page})` normalizes a successful REST collection into `{Valid:true,Rows,Next}`; validate same-site/list-relative continuation and fail rather than truncate/skip.
6. `Projection({Config,Row,Result})` creates the exact existing `{protocol,requestId,operation,tenantScope,actorId,value,valueHash}` result and its SharePoint `Fields`; does not grant/read records itself. Returns `{Valid:true,Fields,Projection}`.
7. `VerifyProjection({Config,Row,Projection,Rows,Permissions})` validates exact current projection bytes/identity and the Author-only Read assignment plus the configured writer principal; rejects all other grants. The writer cannot double as the participant identity. Flow must reauthorize the value with a fresh Plan immediately before granting/disclosing a result; historical projections are not a new access grant.

## Durable orchestration obligations

Use the private canonical `writer:marketing` CAS claim under concurrency 1, `command:<request UUID>`, `provider:<UUID>` and new private `native-plan:<UUID>` journal entries. A plan must be persisted/read back before its writes. A provider intent must be persisted/read back before invoking Claude; its raw response must be retained/read back before constructing the artifact. An unknown provider result is held for operator reconciliation, never replayed blindly. Generic HTTP/helper/Claude action retries are NONE. A held writer claim has no timed takeover; after crash an operator must establish the prior run ended, reconcile exact ETags/intent and release it. Same-root replay returns confirmed originals only after fresh source/member/review checks.

Write canonical plans sequentially with exact-ETag CAS/create-only, actual readback after every effect, and no public success until result content and its per-item permissions read back. No completion based only on a WritePlan. Recheck current permissions/registry/source versions after awaited retrieval, before inference and before publication. Store receipts and command completion durably; preserve pending intent on failure, emit content-free diagnostics and keep all business run-history inputs/outputs secure. Trigger, endpoint, token, model and authority never come from browser text.

## Ownership

- Helper lane: `connector/**`, helper fixtures/tests under `tests/helper/**`; implements all semantic modes above and compiles exact final Script.cs. Use the existing Node tests/TypeScript schemas as reference, not as a deployed runtime.
- Flow/packaging lane: `generator/**`, `tests/flow/**`, `out/**`, connector-binding templates. Builds executable native WDL, source-pinned donor components, all OFF, local PAC roundtrip. Do not invent a helper API ID.
- Provisioning lane: `provisioning/**`, `tests/provisioning/**`, operational bootstrap/retention guidance. Create-only isolated lists/roles, offline fake-PnP tests, no real writes.
- Parent: shared contract changes, cross-lane tests, preservation, compiled-helper/generated-WDL execution, final documentation and delivery. No shared Heft build is needed while frontend wire remains compatible.

Capture RED/GREEN behavior and source hashes. Mark limitations honestly; do not replace an unimplemented path with a fixture or a success-shaped response. Native execution gates stay explicit even after local success.
