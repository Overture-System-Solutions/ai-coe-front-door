# Marketing Integrity — separate private connector registration candidate

This is a **local, unbound registration bundle**, not a Power Automate solution import ZIP. The existing helper and all seven modes are retained. `Script.cs` is generated from `parts/*.cs`; `Script.csx` is its byte-identical PAC upload alias. `apiDefinition.swagger.json` declares OpenAPI 2.0 `Evaluate` with required `body/Mode` and `body/Payload` (one JSON string). `apiProperties.json` enables custom code for Evaluate. The response is an object: boolean `Valid`, content-free `Error` on refusal, and mode-specific fields. `Fields`, `Projection` and `ProviderWire` are objects, not double-encoded strings. `Result` deliberately supports operation-dependent object/array/null values.

No tenant, connection, permission, model or external service call is part of the local build. No new/paid dependency was installed. The helper does not forward HTTP; `unused.invalid` is intentionally non-routable. Power Platform manages the private service-owner connection; an empty API authentication definition is not permission to publish or share this helper with participants.

## Reproduce locally (from backend/marketing-native)

```text
python3 connector/build.py
/home/far_cdx/.cache/oss-demo-dotnet/dotnet build connector/local/MarketingHarness.csproj --no-restore -c Release
python3 -B -m unittest discover -s tests/helper -v
/home/far_cdx/.cache/oss-demo-dotnet/dotnet connector/local/bin/Release/net10.0/MarketingHarness.dll --script-hash
```

The harness compiles the exact generated Script.cs with C# 7.3 and .NET 10, using the already-present SDK's Newtonsoft.Json. The emitted digest is compiled into the harness; the test compares it with the current source bytes to catch stale DLLs. The inherited Unicode failure was precisely such a stale-DLL case: the existing authored `Quote` implementation already preserved JavaScript JSON.stringify U+0085/U+2028/U+2029 bytes, but the previous DLL had not been rebuilt.

`evidence/helper/source-manifest.json` records part and current script hashes. `evidence/helper/finish-verification.json` is the earlier helper-lane checkpoint; the parent's final delivery `VERIFICATION.json` supersedes its package/source hashes after integrated review fixes. Run evidence is offline only; explicit fake external systems are not native SharePoint/provider receipts.

## Interoperability and finalization

- Page accepts real `lists(guid'<id>')/items` continuations, relative or same-site absolute, and the older helper's `guid='<id>'` spelling for backwards compatibility. Only the three configured lists and exact collection endpoints are allowed. Wrong host/site/list, credentials, fragments, traversal, invalid/ambiguous continuation types refuse. Rows are appended without deduplication; flow owns loop/cycle bounds and final-empty-Next assertion.
- ETags are accepted as `@odata.etag`, `odata.etag` or verbose `__metadata.etag`. Page exposes the exact value as `@odata.etag`; conflicting aliases, wildcard, empty or control-character tags refuse. Canonical modes also accept these native aliases directly. No weak/strong/version spelling is normalized or guessed.
- Immutable Created/Modified remain exact-equality guarded and accept genuine UTC timestamps with zero through seven fractional digits. The flow's own millisecond clock and the original second-precision artifact timestamps remain unchanged.
- `FINALIZATION_AMENDMENT.md` governs writes. A provisional saved result has storeVersion=null and Projection refuses it. A retained plan rechecks every Write against exact RecordJson readbacks. Missing/conflicting finalized effects refuse; an unfinished provisional plan is retained without generating a new revision or invoking a provider. Finalization changes only storeVersion, deriving it from `{key,revision,payloadHash,version:<actual row ETag>}` with the existing Node canonical hash rule.
- A finalized plan replays unchanged. Only recovery of an exact completed original intent with no new writes can return its original historical saved state after a later review. New mutation plans continue to refuse changed state before publication. The actual envelope/token/effects still must match; fresh membership/source acquisition remains mandatory before publication.
- Outstanding review and repair writes also keep FinalizeRequired=true until every effect reads back. The parent reproduced and repaired partial-review restart after an explicitly simulated operator release. Recorded-review replay rechecks current author/reviewer role, reviewer authority, exact target/token, required review kind, register and parent validity before new disclosure. A persisted decision is not permanent authority to issue another success projection.
- The whole canonical snapshot now validates recognized record families, including inactive envelopes' payload hashes. Projection also validates the supported operation, request shape and result category rather than accepting an arbitrary operation name.

## Future authorized registration — NOT performed

1. Obtain explicit tenant authorization through the existing single-writer controller. Create/select the separate **AICoEMarketingIntegrity** solution with publisher prefix `aicoe`. Preserve the working intake/CORE connectors and their identities.
2. Use `deployment.json`'s PAC command, or import this OpenAPI and upload/paste the exact Script.cs in the custom connector designer. This ZIP is **not** a Dataverse solution import. Enable custom code on Evaluate and keep it private to the approved service owner. Do not run the command without separate authorization.
3. Qualify hosted compilation, APIs/crypto, DLP, input/output privacy, payload bounds, two-minute execution budget and no-forwarding behavior. Source size is checked against the contract's conservative **1,000,000-byte** interpretation of Microsoft's 1 MB limit. `System.Globalization` is no longer imported/referenced directly: invariant formatting uses Newtonsoft's invariant default culture via `System.IFormatProvider`. This is a source-surface improvement, **not proof of hosted .NET Standard 2.0 compatibility**.
4. Read back the actual runtime API name, Dataverse connector GUID and exact logical/schema name. Keep `UNBOUND_MARKETING_INTEGRITY` in the flow binding template until actual readback/qualification; do not derive a runtime API identifier from a GUID or invent a connection/receipt. Preserve encoded identifier bytes.
5. Parent owns subsequent flow rebinding/package verification. Native designer Save, actual REST/ETag/paging/content shapes, private list/Author-only ACL checks with two real accounts, provider truncation/cost qualification and crash-held writer reconciliation remain separate acceptance gates. Keep flows OFF.

Documentation baseline: project `IMPLEMENTATION_CONTRACT.md`, `FINALIZATION_AMENDMENT.md`, `evidence/flow/HELPER_INTEROP.md`, existing CORE registration README/deployment example, and [Microsoft custom-connector custom-code documentation](https://learn.microsoft.com/en-us/connectors/custom-connectors/write-code). No network documentation fetch or hosted acceptance was performed in this lane.
