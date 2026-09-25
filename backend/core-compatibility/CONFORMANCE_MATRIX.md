# Binding A conformance matrix (local, 2026-09-22)

Against **actual generated 3.0.0.0 flow definitions** and the v0.1.1 fixture pairs. The shipped mock is not the acceptance simulator.

Legend: **green** = local client/engine agrees with generated semantics; **amber** = mismatch recorded, client follows generated or the amendment; **red** = native defect, live mode stays disabled; **extension** = not one of the five deployed operations.

| Operation | Local client | Generated 3.0.0.0 | Fixture v0.1.1 | Verdict | Reason |
|---|---|---|---|---|---|
| CreateOrResumeWork | Typed request, cmdk1 mutation key, poll same Title | Create Version **1**, S1 gaps, unique Title | Version **2**, replay Created:false | **amber** | Engine matches generated Version 1. Fixture Version 2 and Created:false stay visible. Partial resume without Title/SourceChannel is refused. |
| GetWorkStatus | Fresh `r<n>` key per refresh; poll same command | Own-work projection | Final-status pairs | **green** (local) | Fresh-read amendment. Live unique+read-own Title pairing is **red** (F02). |
| ListMyWork | Fresh read generation; caller-scoped | Own-work list | Own-work pair | **green** (local) | Cross-user isolation in MemoryCommandTransport. Native RelatedWorkIDs disclosure is **red** (F10). |
| SubmitEvidenceResponse | Mutation key; new eval version after evidence | Packet RETURNED; later validation | S3 finance pairs | **amber** | Local packet projection is an extension. No authorized packet-list op in the five. |
| RequestDecisionReadiness | Evaluation `e<v>`; new v after evidence | READY_FOR_* (ARB lane READY_FOR_ARB); PREPARATION branch DECISION_READY | DECISION_READY / Lane PREPARATION | **amber** | Local engine uses READY_FOR_ARB (ARB lane). Fixture PREPARATION/DECISION_READY pair kept visible. Incomplete S1 cannot pass (F05 locally gated). |
| Packet list/detail | Local `core-packet-list.v0.1-proposal` | Not in five ops | Absent | **extension** | Marked extension. Live packet IDs remain unbound. |

## Cross-cutting

| Topic | Verdict | Reason |
|---|---|---|
| §7a replay preserves Created:true | **green** (local) / **amber** (fixtures) | Client preserves stored body. Fixtures rewrite Created:false. |
| Mock HTTP 200 cached negatives | **red** | `mock_server.py` is illustrative only. |
| Unique Title + read-own | **red** | SharePoint rejects that pairing. No native corrected ingress. Live writes gated (F02). |
| Root oneOf | **amber** | Client validates by operation. |
| Live Binding A | **red** | See LIVE_CORE_REASONS and F01–F12. `SendEnabled` stays false. |

This matrix is local source/test evidence. It is not native Power Automate execution or tenant acceptance.
