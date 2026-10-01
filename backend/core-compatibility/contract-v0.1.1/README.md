# CloudWave AI CoE — UI ⇄ flow interface contract v0.1.1 (CANDIDATE)

**Why this exists.** Samuel's SharePoint front door needs to call the core automation and read its results. As of 2026-09-21 no flow definition, solution export or environment record exists in the CloudWave tenant; Brian's flows live only in his maker environment. Rather than wait, the interface and the flows agree on **this contract**: Samuel builds against it (with the mock), Brian's flows implement it, and the first real call is a conformance test, not a discovery exercise.

**Authority.** Candidate, Jordan's engineering lane. Payload field definitions are the RC2 `3.4.0-rc2` schemas (hash-pinned, 26/26 readable members verified in the CloudWave copy). Everything else here is proposed and needs one confirmation from Brian (§7). Nothing here is a tenant object, endpoint or permission.

**Files.** `ui-flow-contract.schema.json` (Draft 2020-12 envelopes), `mock/<Operation>/*.json` (23 recorded request/response pairs from the validated UAT fixtures, incl. 4 negative cases), `mock_server.py` (stdlib-only local stand-in), `mock/index.json` (hash binding to fixtures and RC2 schemas).

---

## 1. Operations

Five operations cover the idea → business-case MVP. The UI never chooses a lane, tier or authority; it sends facts and receives a projection.

| Operation | Purpose | Request (beyond `Context`) | Success response (beyond `Result`, `ReceiptID`, `Work`) | Authority class |
|---|---|---|---|---|
| `CreateOrResumeWork` | S1 intake: create a Work ID or resume one | `S1` (Title*, SourceChannel*, ProblemStatement, DesiredOutcome, Requester, Department, Sponsor, AccountableOwner, SourceRefs[], DataClassification, DecisionRequested, Risks[] — policy triggers as `TRIGGER_<name>`, critical risks as `CRITICAL_<name>`), `WorkID` (null to create) | `Created` bool, `ClarificationRequired[]` (S1 gaps, e.g. `S1_PROBLEM_STATEMENT`) | WRITE_BUSINESS_RECORD |
| `GetWorkStatus` | own-status for one Work ID | `WorkID` | — | READ |
| `ListMyWork` | the signed-in person's work | `Requester` | `Items[]` of `Work` projections | READ |
| `SubmitEvidenceResponse` | SME returns an S2–S5 packet | `WorkID`, `EvidencePacketID`, `Response`, `KnownAssumedUnknown` (KNOWN/ASSUMED/UNKNOWN/MIXED) | `PacketStatus` (RETURNED → validated later by flow) | WRITE_BUSINESS_RECORD |
| `RequestDecisionReadiness` | recompute gates; never routes to a board itself | `WorkID`, optional `PayloadHash`, `EvidenceSetHash` (64-hex, client-computed via SubtleCrypto; flow stores them with `HashProvenance=CLIENT_COMPUTED`, else `NOT_PROVIDED`) | `DecisionReadinessState` (READY/NOT_READY/…), `BlockingGates[]`, `DecisionPacketID` or null | WRITE_BUSINESS_RECORD |

`Work` projection (what the UI is allowed to render): `WorkID, Title, Stage, State, EmployeeStatus, Lane, NextAction, NextOwner, NextDate, Version, LastValidatedAt, OpenEvidenceGaps[], DuplicateStatus, RelatedWorkIDs[]`. **No scores, tiers or RAG colours cross this boundary to employee views**; operator views get them from the canonical record, not from this contract.

## 2. Context envelope (every request)

```json
"Context": { "CorrelationID": "CORR-UAT-FAST-001", "IdempotencyKey": "<stable per intent>", "ClientVersion": "spfx-candidate-0.1", "TenantLabel": "CloudWave-PrivatePilot", "TestRecord": true }
```
`IdempotencyKey` = `<WorkID or 'new'>:<operation>:<sha256(payload)[:16]>`. A retry with the same key **must** return the identical response (`Created:false` on replay). `TestRecord:true` rows never enter production totals (v3.2 ALM rule).

## 3. Result envelope

Success: `{"Result":"PASS","ReceiptID":"RCPT-…","Work":{…}, …}`. Failure (fail-closed, from `audit-receipt.v1.Result`):

| `Result` | `ErrorClass` (examples) | UI behaviour | HTTP (mock) |
|---|---|---|---|
| `FAIL` | `VALIDATION_FAILED`, `NOT_FOUND` | show message; nothing was written | 422 |
| `DENIED` | `NOT_AUTHORIZED` | "You don't have access to this work" — never reveal existence | 403 |
| `RECONCILIATION_REQUIRED` | `STALE_LEASE_OR_VERSION` | re-read (`GetWorkStatus`) then retry **same** key after `RetryAfterSeconds` | 409 |
| `INCONCLUSIVE` | provider outage | show "pending", keep key, retry later; never show success | 409 |

Every error carries a `ReceiptID` — the UI shows it so a human can find the audit receipt.

## 4. Status mapping (RC2 `work-record.v2.State` → employee wording)

Started (DRAFT) · Need one answer (CLARIFYING) · Working (READY_FOR_TRIAGE, EVIDENCE_BUILDING, NOT_DECISION_READY, PROJECT_ACTIVATING, IN_DELIVERY, AT_RISK, BLOCKED, REVALIDATION_REQUIRED) · With the right reviewer (AWAITING_SME, DECISION_READY, READY_FOR_AI_COE, READY_FOR_ARB, READY_FOR_ELT) · Ready for you (APPROVED, APPROVED_WITH_CONDITIONS, DEFERRED, VALUE_REVIEW, IMPROVEMENT_PROPOSED) · Done (REJECTED, OPERATING, RETIRED). The flow computes `EmployeeStatus`; the UI does not derive it.

## 5. Transport — two supported bindings (Brian picks one; the contract is identical)

**A. List-write + polling flow (recommended; matches the Sept-7 2.1 design decision "recurrence polling kept, item triggers rejected").** The SPFx web part writes the request as a row to a **command list** (`AI CoE Case Command` — proposed name; ST-xx numbering is Brian's) under the signed-in user's identity via SharePoint REST; a scheduled flow claims rows by `IdempotencyKey` (unique index), executes, writes the response JSON back to the same row (`ResponseJson`, `Result`, `ReceiptID`) and the UI polls the row. Pros: no SAS URL in client code, item-level security gives own-status for free, resumable. Cons: latency = poll interval.

**B. HTTP request trigger.** One flow per operation with "When an HTTP request is received"; the SAS URL is a **tenant parameter** (web-part property / tenant property bag), never in source. Pros: synchronous. Cons: SAS secret in client-reachable config; needs the Power Platform environment to be provisioned and owned durably (ALM-D1 still unnamed).

Either way the **per-tenant parameter set** (needed because the dashboards and front door are "needed both places" — standup 19:10) is: `aicoe_SiteUrl`, `aicoe_EnvironmentLabel`, `aicoe_CommandListId` (GUID) or the five endpoint URLs, `aicoe_CasesListId`, `aicoe_EvidenceListId`, `aicoe_NotificationEmail`. Names follow the 2.1 environment-variable convention; values are `AWAITING_*` until Brian provisions.

## 6. Column map for binding A (proposed; GUIDs `TBD_NATIVE`)

`AI CoE Case Command`: `Title`(=IdempotencyKey, unique) · `Operation`(choice) · `WorkID` · `RequestJson`(note) · `ResponseJson`(note) · `Result`(choice) · `ReceiptID` · `CorrelationID` · `Claimed`(bool) · `ClaimedAt` · `TestRecord`(bool). Read/write security: **read-own / edit-none** (the 2.1 J-STATUS-02 fix). Canonical stores the flow writes to are the RC2 records (`work-record.v2`, `evidence-packet.v2`, `decision-packet.v2`, `event.v2`, `audit-receipt.v1`) in whichever lists Brian names — the UI never reads those lists directly for employee views.

## 7. What Brian needs to confirm (one message)

1. Binding A or B. 2. List names/GUIDs and environment ID (or "not provisioned yet"). 3. Whether his flows implement these five operations or a different set — differences are contract changes, not UI hacks. 4. Which list model his flows use (v3.2 ST-xx names vs the 2.1 eleven-list model). 5. Whether `EmployeeStatus` is computed in the flow (as here) or the UI.

## 7a. v0.1.1 changes (2026-09-21, driven by the flow build)

`S1` gains `DecisionRequested` and `Risks[]`; `RequestDecisionReadiness` gains optional `PayloadHash`/`EvidenceSetHash` (Power Automate cannot compute SHA-256 — client-computed with provenance was the decision); `ListMyWork` success has no `Work` (only `Items[]`). **Binding A replay semantics:** the command list's `Title` = `IdempotencyKey` is unique, so a replayed create is rejected by SharePoint at write time — the UI then reads the existing row's `ResponseJson`, which is the identical response. **Identity:** the flow takes the caller identity from the command row's `Author`, never from the payload. `Requester` in `ListMyWork` must equal that identity or the call is `DENIED`. Implemented by `AICoECoreAutomation 3.0.0.0` flow `AI CoE 01 Case Command`.

## 8. Conformance

`mock/` pairs are the acceptance fixtures: when Brian's flows exist, replaying each `request` against the real endpoint must produce a response that validates against `ui-flow-contract.schema.json` and matches the recorded `Result`/`State`. The four negative pairs (unknown ID, other user's work, missing Title, stale lease) are the fail-closed proofs the UAT script's Part D needs.

Run the mock: `python3 mock_server.py --port 8787` → `POST http://localhost:8787/api/<Operation>` with the `request` object; `GET /api/_pairs` lists what is loaded. Verified 2026-09-21: 23/23 pairs valid; create → `CLARIFYING / Need one answer`; replay returns identical body; unknown ID → 422 `NOT_FOUND`; stale lease → 409 `RECONCILIATION_REQUIRED`.
