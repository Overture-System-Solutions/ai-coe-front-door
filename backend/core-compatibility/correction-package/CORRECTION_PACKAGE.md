# Minimal source-pinned correction package (proposal)

**Not applied.** This is a request for the existing CORE/backend lane and controller/single tenant writer. Jordan's 3.0.0.0 delivery is not silently forked. Originals under `evidence/bld-core-front-door-review-2026-09-22/` stay byte-identical.

Pinned source (complete package generator):
`evidence/bld-core-front-door-review-2026-09-22/extracted/AICoECoreAutomation_3_0_0_0_PACKAGE-2026-09-21/AICoECoreAutomation_3_0_0_0/generator/`

Line citations match `deliverables/CloudWave_Front_Door_Completion_2026-09-22/CORE_ANALYSIS.md`.

| Id | Priority | Pin | Proposed correction | Native proof still required |
|---|---|---|---|---|
| F01 | Blocker | `flows.py:157–164`, `210–214`, `179–182` | Bootstrap Log and Definitions before dependent ID writes. Denied/transient GET is not confirmed absence. | Fresh-empty-site first-run and repeat-run |
| F02 | Blocker | `flows.py:204–208`; frontend list tests unique+read-own | Create-only request ingress; immutable operation/payload/scope; service-owned results; do not drop unique Title | Two-account API tests on the approved site |
| F03 | High | `flows.py:15`, `:471`, OData at `:124,:349,:355,:374` | Operation-specific ParseJson before claim/write; safe queries | Malformed inputs on the actual flow path |
| F04 | High | `flows.py:374–398`; `reference.py:136–149` | Required packet set from policy; missing/duplicate/wrong-work fail closed | Remove-one / missing-three / duplicate |
| F05 | High | `flows.py:511` | S1 completeness before triage; material edits invalidate ready packets | P03/P04 native rerun |
| F06 | High | `model.py:135`; `flows.py:543–553` | TestRecord-enforced UAT; AutoValidate off for business data; human validation route | Isolated UAT rows |
| F07 | High | `flows.py:457–482` | Recoverable claim/lease; real failure receipts; no duplicate intent on uncertain timeout | Injected failure before/after each durable write |
| F08 | High | `wdl.py:109` | Compare-and-set across flows 01/02/03 | Two interleaved writers |
| F09 | High | `flows.py:427–438` | One validated RecordJson per mutation; columns derived from it | Column-versus-JSON parity |
| F10 | High | `flows.py:266,:286–288`; `reference.py:75` | Bind requester to caller; nondisclosing duplicate signal | Two-caller native |
| F11 | High | `flows.py:72–84,:493–502` | No zero hashes as integrity; persist actual receipts | Receipt readback comparison |
| F12 | Medium/high | flows 02–05 paging/cursors/send window | Continuation/tie-breaker; keep flow 04 off | Native paging and send-off |

## Marketing persistence/review extension

Not among the five operations. Candidate unbound definitions: `backend/power-automate/marketing-review/`. Do not stuff artifacts into S1/evidence.

## Adoption route

Controller/single tenant writer. This branch continues frontend/Marketing local work with live CORE disabled (`LIVE_CORE_REASONS`).
