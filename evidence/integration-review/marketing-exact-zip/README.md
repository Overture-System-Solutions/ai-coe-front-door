# Marketing offline runtime extension candidate

This is executable **Node 22 CommonJS**, with compiled shared validators/services and three JSON schemas. It is **not a Power Automate import solution**, not installed anywhere, and not a live/paid provider result. Configuration is disabled and unbound by default. The original Claude/OpenAI exports and idea-only flow remain unchanged.

## Local verification

From the repository root with its Windows dependency tree:

```text
node.exe --test backend/power-automate/marketing-runtime/tests/*.test.cjs
node.exe backend/power-automate/marketing-runtime/build.cjs
```

`build.cjs` assembles `out/candidate` with manifest hashes. No shared Heft build, tenant access or credentials are used. `package.py` creates and verifies the explicit offline ZIP. Tests use **fake SharePoint/provider boundaries**, exercising actual source, provider-wire parsing, services and dispatcher. See HANDOFF.md for exact counts and scope.

## Callable server entry

```js
const { createMarketingInvocation } = require('./server/invoke.cjs');
const { createSharePointHttp } = require('./server/sharepoint.cjs');
const execute = createMarketingInvocation({
  config: qualifiedConfig,
  sp: createSharePointHttp({ siteUrl: qualifiedConfig.siteUrl, getAccessToken }),
  invokeClaude, // existing approved connector invocation; credentials remain in host
  runAsCanonicalWriter // existing controller's guarded serialized execution callback
});
await execute({ requestItemId: 123 }); // only the saved request ID, not actor/content
```

The wrapper returns only content-free projection confirmation. Business drafts/results are retained in private Marketing lists. The browser writes immutable requests and reads Author-only results using `createBusinessMarketingServices`; it never calls the provider. Binding this module into an actual approved existing Node-capable execution surface and wiring the native trigger/connector remain **explicit integration gates**. No new host is purchased or provisioned. Ordinary Power Automate cannot import/execute these `.cjs` files.

## Security and recovery

- Existing writer governs Marketing-owned artifacts, revisions, requests, source snapshots, decisions, intents, receipts and membership only. No CORE case mutation methods exist.
- Verify request Author against current server membership/work scope; reject client identity/role fields. Source bytes come from permission/ETag/hash-checked SharePoint documents, never caller meeting text. Sources must match an approved register receipt and current owner authority.
- Every saved draft and recorded decision requires durable exact readback. Required artifact-specific reviews, current source/authority and parent revisions determine acceptance.
- Same immutable command recovers its retained result. Fresh reads create a new UUID. Partial durable artifact/receipt writes use their original intent without regenerating. An unknown provider attempt stays uncertain; it is never automatically retried.
- A crashed process can leave `writer:marketing` claimed. Stop the original worker, inspect its exact command/provider/intent and native connector outcome, and have the existing authorized operator reconcile before releasing by exact ETag. No automatic timeout takeover or general lock-reset CLI ships.
- Result ACLs are read back before success. Membership revocation blocks new dispatch/replay but does not erase already granted historical projections; commission the retention/revocation lifecycle before enabling.
- Restrict host logs and flow run-history inputs/outputs. Persist opaque recovery IDs only in the browser, not business text, objectives, notes or provider replies.

## Provisioning and configuration

`provisioning.json` is an explicit review descriptor, **not an apply script**. No ACL/list operations were run. `config.example.json` remains disabled/empty; do not fill it with credentials. `connector-binding.json` names the exact callable bridge and frozen Claude body fields. Qualified provider response parsing rejects truncation, refusal and tool output. Approval of business data, source register, named reviewers and actual tenant persona/permission/connector/crash tests are required separately.

Initial server-owned records are governed configuration, not browser seed data: `member:<SharePointAuthorId>` (enabled, actorId, roles, workIds, audience); `authority:<bindingRef>` (actor/scope/tenant/expiry/revocation); `qualification:<ref>` (result/bindingHash/expiry); `register:active` (register, snapshotRef, evidence, revoked); `receipt:<registerApprovalId>`; and `source:<id>` (exact register entry, actors, purposes, audiences, contentHash, revoked). Review authority uses the four existing review kinds; register approval authority uses `sourceRegister`. Never copy test records as approvals.
