# Contract amendment proposal v0.1.2

**Status:** local engineering proposal. Not accepted. Does not modify v0.1.1 bytes.

Source contract copy: `backend/core-compatibility/contract-v0.1.1/` (from the frozen 2026-09-21 zip). Generated 3.0.0.0 originals stay under the review evidence tree and are not forked.

## 1. Command-key adapter `cmdk1`

v0.1.1 prose uses `<WorkID or 'new'>:<operation>:<sha256(payload)[:16]>`. The front door's action envelope uses `<scope>:<workId>:<actionClass>:<payloadHash>`. Neither is the other, and neither says when a **read** gets a fresh key.

This branch uses one versioned adapter, compatible with 3.0.0.0 as generated because the flow treats Title as an opaque unique key:

```
cmdk1:<scope8>:<caller8>:<operation>:<intent>:<workRef>:<digest16>
```

- `intent` is `m` (mutation, stable across retries of the same content), `r<n>` (nth read generation; a refresh mints n+1; poll/retry keep n), or `e<v>` (readiness evaluation at input-version v).
- Digest covers the business payload only: `Context` (correlation, timestamps) is excluded.
- Length is checked against the 255-character Title limit and the contract minimum of 8.

## 2. Fresh reads versus retry keys

A completed command row is a historical response. Reusing one GetWorkStatus/ListMyWork key forever freezes status. A new read intent mints a new generation; retries of that same read keep it. Readiness after new evidence is a new evaluation version, not a replay of NOT_READY.

## 3. Replay: adopt v0.1.1 §7a

Preserve the stored response, including `Created:true` when that was the original result. The earlier prose/fixtures that rewrite `Created:false` are recorded as fixture mismatches, not production behavior.

A duplicate-key write error is not a PASS until the recovered row matches operation, payload digest and scope. An inaccessible collision is denied/inconclusive. Permissions are never widened to recover it.

## 4. Validate by operation

The public root `oneOf` rejects two legitimate error pairs because GetWorkStatus and RequestDecisionReadiness overlap. Clients MUST validate request/response against the named operation schema, not the ambiguous root.

## 5. Create versus resume

v0.1.1 create-shaped schema requires `S1.Title` and `S1.SourceChannel`. A partial-resume reference that omits them is invalid under that schema. Do not insert undeclared fields into v0.1.1. A later accepted version should discriminate create (no WorkID, required Title/SourceChannel) from resume (WorkID required, S1 may be a delta). Until then this client refuses resume without those fields.

## 6. Employee projection

Employee views drop `RelatedWorkIDs`. Foreign work identifiers are not for employee rendering. Packet list/detail is a separate marked extension (`core-packet-list.v0.1-proposal`), not a sixth deployed operation.

## 7. What this amendment does not do

It does not enable live Binding A, accept the mock server as an authorization simulator, stuff Marketing artifacts into S1/evidence, or claim native Power Automate behavior.
