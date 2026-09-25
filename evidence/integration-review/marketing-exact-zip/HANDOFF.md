# Marketing runtime/backend handoff — verified offline candidate

Scope: `services/marketing/**`, `content/marketing/**`, `backend/power-automate/marketing-runtime/**` only. Authority: project `evidence/implementation-2026-09-23/IMPLEMENTATION_CONTRACT.md`. No shared Heft build, commit, tenant/import/model/send/publication/scheduling or live permission operations. Original Claude/OpenAI exports and idea-only flow were not changed.

## Outcome and evidence

- Windows Node **v22.16.0** source suite: **30 passed, 0 failed, 0 skipped, 0 cancelled**.
- Strict standalone TypeScript check: **9 Marketing service files, 0 diagnostics**, including their dependency graph. Parent still owns integrated Heft/UI/package verification.
- Tests exercise M01 source revocation, M02 superseded-parent acceptance, M03 durable receipt/completion failure and same-intent recovery, M04 required review kinds, scope/hash tampering, current reviewer authority, immutable Author-based dispatch, all three draft/review journeys, server audience/permission/ETag/hash retrieval, uncertain provider recovery without a second call, replay after membership revocation, result ACL readback, bounded pagination/network deadline and dependency-complete packaged invocation.
- Package smoke executes real compiled services, real SharePoint CAS adapter and the public `createMarketingInvocation` wrapper through **fake SharePoint/provider boundaries**. It verifies the existing-writer callback, content-free control response and retained private draft projection. No test is tenant/model evidence.
- Exact evidence: `evidence/source-suite.tap`, `evidence/typecheck.txt`, `evidence/test-results.json`; final-ZIP smoke and hashes: `out/zip-smoke.tap`, `out/package-receipt.json`.

Commands from the worktree root:

```text
node.exe --test backend/power-automate/marketing-runtime/tests/*.test.cjs
python3 backend/power-automate/marketing-runtime/package.py
```

`out/marketing-runtime-offline-0.1.0.zip` is an **offline Node extension candidate**, NOT a native/importable Power Automate solution. `out/candidate/manifest.json` pins the compilation inputs and shipped files. `package.py` checks the ZIP/CRCs/member hashes and exercises the compiled bytes extracted from that exact ZIP. The disabled binding template contains no credentials.

## Exact frontend factory integration (parent-owned host wiring)

Import `createBusinessMarketingServices` from `services/marketing/businessServices` (also re-exported by `marketingServices`). Options type: `IBusinessMarketingOptions` from `services/marketing/businessTransport`.

```ts
createBusinessMarketingServices({
  binding: {
    enabled: true, // choose only with complete validated configuration
    siteUrl, // https://<tenant>.sharepoint.com/sites/<site> or /teams/<site>
    requestListId, // immutable create-only Marketing ingress; GUID
    resultListId,  // distinct private service-owned projection list; GUID
    qualificationReceiptRef // QUAL-...; server verifies its own binding receipt
  },
  session: {
    actorId, // exact SharePoint Author.Email identity, not display name
    tenantScope: siteUrl, // exact same string, no trailing slash
    resolution // host-resolved IRoleResolution; NEVER transmitted as authority
  },
  http: {
    request: async (method, url, body?) => ({ status, body: parsedJson })
    // IMarketingHttpClient: method is 'GET' | 'POST'. Signed-in SPHttpClient,
    // JSON odata=nometadata. No service/provider credentials in this client.
  },
  pollAttempts: 4, // optional; clamped to 1..20
  wait: async () => { /* host supplies bounded delay between polls */ },
  newId: () => crypto.randomUUID() // optional; default is crypto.randomUUID()
});
```

Return type is existing `IMarketingServices`. Keep the synthetic factory explicitly separate. Recompose on identity/tenant changes. Raw browser provider/store operations intentionally remain disabled; call the draft/review facade, never its raw provider/store. Invalid bindings produce `liveReasons` and fail closed; there is no text-cache fallback. The browser sends **no** actor, roles, tenant or authority claims. Meeting input serializes only source/version/locator references, not `notes.text`.

Persist only scoped opaque recovery references, never objective/audience/notes/result bodies. Draft errors return `intentKey`; recover via `draft.reconcileAttempt(session, intentKey)`. Review errors recover via `review.reconcileAttempt(intentKey)`. `RecoverMarketingIntentV1` accepts either the original command UUID or retained durable intent key, checking current Author/work access. Fresh reads always mint new UUIDs across service instances. Parent must retain any pre-dispatch opaque UUID needed for browser-crash recovery through its existing scoped-reference mechanism; this factory itself does not access local/session storage.

## Exact server invocation contract

```js
const { createMarketingInvocation } = require('./server/invoke.cjs');
const { createSharePointHttp } = require('./server/sharepoint.cjs');
const invoke = createMarketingInvocation({
  config, // config.example.json, filled server-side and independently qualified
  sp: createSharePointHttp({ siteUrl: config.siteUrl, getAccessToken }),
  invokeClaude, // async frozen connector wire => actual parsed Claude message
  runAsCanonicalWriter // async (scope, operation) => existing controller execution
});
await invoke({ requestItemId }); // exactly one positive numeric ID; no payload claims
```

Server config adds distinct `canonicalListId`, positive `writerPrincipalId`, `readRoleDefinitionId: 1073741826`, and `provider: { model, qualificationReceiptRef }`. All three list GUIDs must differ. `runAsCanonicalWriter` scope is `{ extension: 'marketing.v1', siteUrl, requestItemId }`; its existing operator authority/serialization is mandatory. Return is `{protocol, requestId, operation, projectionConfirmed}`, not business content. `sp.request(method,url,body?,headers?)` returns `{status,body,etag?}`. The supplied OAuth HTTP implementation refuses off-site URLs/redirects and imposes a 30-second network deadline. Canonical enumeration is capped at 20 pages. The host must also bound token acquisition/connector calls and restrict run-history/logging.

`invokeClaude(wire)` receives only the server-built body projection keys enumerated in `connector-binding.json`; credentials/connection stay in the existing host. Provider attempts have durable intent and retained response; an unknown outcome is uncertain and never auto-retried. Frozen connector token bound remains 1600: truncation is rejected, not silently treated as a draft. Larger outputs need separate native qualification rather than modifying working exports implicitly.

## Files and ownership

- Retained/corrected: draft/review/repository/source validation and business client adapters in Marketing services; required-review derivation in Marketing content.
- Server: `runtime.cjs`, `sharepoint.cjs`, `source-registry.cjs`, `provider.cjs`, `invoke.cjs`.
- Build/package: `build.cjs`, `package.py`, disabled `config.example.json`, `provisioning.json`, `connector-binding.json`, README, tests, evidence and generated `out/` candidate/ZIP.
- No competing CORE case writer: Marketing writes its own artifact/source/review/intent/receipt/membership records only.

## Explicit remaining gates — not falsely called complete

1. **Existing execution-host/connector binding remains external implementation/integration**, not just a secret to paste. Install this invocation into an approved existing Node-capable canonical-writer bridge; bind the authenticated request-ID trigger and existing Claude connector there. Ordinary Power Automate WDL cannot execute Node. If no such approved surface exists, this archive alone cannot deploy; select an authorized compatible/no-new-cost route or port it. No new paid host was introduced.
2. `provisioning.json` is a **review descriptor, not an installer**. Separately authorize actual list/private-ACL/create-only-role setup, then test native Author immutability, unique keys, ETags, result Author-only Read grants, source access and canonical isolation. Never combine read-own list settings with unique columns.
3. Approve business-data/provider boundary, current source register plus source-register owner authority/receipts, named reviewers/membership/work audiences, and exact server qualification records. The packaged fake records are tests, not deployment approvals.
4. Complete native end-to-end/persona, real connector response/truncation, source revocation, concurrency/process-death and recovery acceptance. Current lock uses CAS and has no blind automatic takeover: after a crash an authorized operator must reconcile the exact original command/provider/intent and release by current ETag through the existing controller.
5. Membership revocation blocks new dispatch/recovery/replay but does **not** erase historical private projections already granted to that Author. Commission projection retention/revocation policy and native ACL lifecycle before enablement. SharePoint administrators retain administrative access.
6. Parent wires the factory and owns integrated frontend/CORE/full build. No production-ready, native import or live-commissioned claim is made by this lane.
