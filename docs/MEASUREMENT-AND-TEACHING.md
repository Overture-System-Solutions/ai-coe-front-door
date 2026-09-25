# Measurement and teaching — bounded local integration

**Status: offline implementation, manual commissioning/publication bridge. No approved business dataset, approved business measurement method, tenant export/write, model call or human no-builder acceptance is supplied by this work.** Synthetic fixtures are test inputs, not a measured pilot. Nothing schedules collection, sends messages, assigns work or promotes a policy.

## Reachable in the one-page app

- **Engineering → Getting started: safe task and review** opens client-neutral quick-start, employee/reviewer/champion/operator guidance, permitted-source checks, stop/recovery and teach-back instructions. Existing **Check a tool or task** and **Get help or training** controls remain the entry points.
- **Improvement → Getting started** leads to the existing **Record a task outcome** and **Share feedback** controls. No replacement tracker or new outcome schema was added.
- **Improvement → Proposed manual improvement path** explains feedback → minimal proposal → authorized review → repair → retest receipt → measurement. The operator commissioning checklist stays in this document rather than in an employee-facing card. These are instructions, not automatic assignment, approval or an enterprise learning loop.
- The support destination remains the existing site-bound footer. Unbound support is an incomplete commissioning prerequisite, not permission to improvise a destination. Marketing remains role-gated and the synthetic workspace remains clearly labelled. No internal source document or private transcript is imported or linked into this guidance bundle.

## What the command actually does

`node scripts/aggregate-workflow-outcomes.cjs` loads and invokes `src/webparts/aiCoeFrontDoor/services/workflowOutcomeAggregation.ts` using the repository's installed TypeScript compiler. It reuses the existing outcome choice constants and `OUTCOME_COLUMNS`; there is no second algorithm in the CLI and no dependency on shared Heft/lib output. No credentials or network client are constructed.

Inputs are local JSON files, not URLs:

```text
node scripts/aggregate-workflow-outcomes.cjs --input export.json --qualification qualification.json --scope expected-scope.json --as-of YYYY-MM-DD --out NEW-report.json
```

On WSL with this dependency-owning Windows checkout, use `node.exe`. All arguments are required. Each file is limited to 10 MiB. The output must not exist; no input or earlier report is overwritten. Exit **0** means **review-required**, never approved/published; **2** means evidence blocked or privacy suppressed; **1** means invocation/parse/dependency/output failure. Errors do not echo input bodies. `--help` prints the usage.

The command hashes the **exact source bytes**, compares them to the qualification, and records hashes of source, qualification, expected scope, command and loaded source modules. It does not authenticate a receipt issuer, obtain approval or discover tenant truth. **Trust is an explicit manual commissioning prerequisite**, described below; a matching hash or a reference-shaped string alone cannot create it. Keep inputs and reports in an access-controlled operator workspace, not a broadly shared document library. File mode 0600 is only an additional local hint; Windows ACLs/retention remain the operator's responsibility.

### Export contract (existing events, not a new tracker)

```json
{
  "schemaVersion": "workflow-outcomes-export.v1",
  "scope": { "tenant": "bound-tenant-id", "site": "bound-site-id", "list": "bound-outcome-list-id", "cohort": "bound-cohort-ref" },
  "rows": []
}
```

`scope` uses opaque IDs/references, not customer content or person names. Scope is an export envelope, **not an added column on the outcome list**. Exact tenant/site/list/cohort must agree between export, qualification and separately supplied expected-scope file. Because the existing event does not contain a tenant/cohort field, source-native membership/access/export qualification is necessary; this command cannot independently detect a dishonest envelope around mixed-client rows.

Select exactly the ten existing fields written by `GovernanceService.submitOutcome`:

`Title, OutcomeId, RecordedAt, TaskType, Outcome, ReviewState, CorrectionCategory, RouteAvailability, WorkflowVersion`.

Do not export `Author`, email, M365 identity, item metadata, prompt, output, source bodies or extra fields. The service rejects extras rather than silently accepting private content. `Title` must be the writer's fixed `Task outcome — {OutcomeId}`; the ID must retain `OVT-AICOE-YYYYMMDD-XXXXXXXX` with eight uppercase base-36 characters. Version is the existing `1.0`. `RecordedAt` uses the writer's canonical UTC ISO timestamp with milliseconds. If a native export uses another serialization, an authorized exporter must document that projection **before** its final bytes are hashed; the aggregator does not silently normalize tokens.

Choices come from `content/workflows/outcome.ts`. Corrected requires one of the existing six correction categories. Other outcomes require an empty category. Accepted/Corrected with `Not reviewed` is inconsistent and blocks the entire report. An invalid row, unsupported version, invalid timestamp, out-of-period row or conflicting duplicate blocks the entire export: no denominator is silently reduced. Exact duplicates under the same OutcomeId count once, independent of JSON key order. Distinct IDs are distinct **recorded attempts**, not independently proven distinct business tasks; the source owner must reconcile semantic duplicates.

### Qualification contract

See [the executable synthetic fixture](../evidence/measurement-audit/fixtures/synthetic-qualification.json) for the exact shape. **Every approval/receipt in that fixture is invented and labelled synthetic; none may be copied into a business run.**

| Field | Required meaning before business use |
|---|---|
| `schemaVersion` | `workflow-outcomes-qualification.v1` |
| `mode` | Explicit `synthetic` or `business`; changing this label does not approve use |
| `scope` | Same four exact opaque bindings as export and expected-scope file |
| `period.start`, `.end` | Exact calendar days, inclusive UTC; completed and non-reversed |
| `sourceReceipt.reference` | Opaque reference to retained source-native export/readback, paging completeness, exclusions and reconciliation evidence |
| `sourceReceipt.sha256` | Lowercase SHA-256 of the exact final export file bytes |
| `sourceReceipt.complete` | Boolean true, asserted by the authorized source owner after full paging/permission/exclusion checks; a partial own-items query is not a cohort export |
| `method.id` | `content-free-outcomes-v1`, the candidate formula below, requiring explicit scoped approval |
| `method.approvalRef` | Trusted retained approval for this method/version, scope, period, reporting population, denominator and freshness policy |
| `privacy.approvalRef` | Trusted retained approval for the **whole proposed report**, cell/complement/differencing risk, participant notice and retention |
| `privacy.cohortSize` | Distinct people represented by the exported unique events, proven separately; NOT event count or an eligible-cohort/adoption denominator |
| `privacy.minimumCohort` | Approved reporting threshold; the local floor is five and cannot be lowered by input |
| `privacy.minimumCellCohort` | Separately evidenced lower bound on distinct people in **every nonzero published outcome/review/route/theme cell, rate numerator/denominator and relevant complement**; NOT a guess from counts |
| `freshnessDays` | Approved nonnegative integer maximum age of period end as of the supplied calendar day |

References accept only bounded opaque alphanumeric/dot/underscore/colon/hyphen tokens, not free text or links. Retain the signed/ACL-protected original evidence and its authorized issuer outside the data export. This local command checks shape/consistency/byte binding, not signatures or current permissions.

Privacy is intentionally conservative: missing/non-integer people or cell qualification blocks; fewer than `max(5, minimumCohort)` people/cell people suppresses the **whole** report, including totals and reconciliation counts. A nonzero event cell below the attested minimum suppresses the report too. The code does not infer that enough events prove enough people. Whole-report suppression avoids releasing a total from which a withheld category can be subtracted; the privacy owner must additionally check linked reports, correlations and differencing across periods. No non-person exemption is allowed for these human task outcomes.

### Candidate formulas and explicit unknowns

All returned counts describe **reported fixed choices**, not independently audited review correctness or a safety certification. Let A be unique Accepted events with either reviewed state and C be unique Corrected events with either reviewed state.

- `reviewedOutputs = A + C`.
- `reviewedOutputPass = A / (A + C)`; `materialCorrectionRate = C / (A + C)`.
- Ratios are proportions, not percentages. With no reviewed denominator, ratios are **absent**, never zero.
- Outcomes, review states, route availability and the six correction themes are fixed-choice counts. Zero is allowed only as an observed category count inside a fully qualified, nonsuppressed export, never as a missing metric/cost.
- The denominator convention is an **implementation candidate requiring owner approval**, not a newly invented business-approved method. There is no baseline trend/gate or causal value claim.
- Eligible/active adoption, first useful participant outcome and repeat useful participant outcome remain unknown: the content-free schema has neither an approved roster nor participant linkage. Do not add identities to this export to make those rates appear.
- The existing value IDs `useful-safe-completion-rate`, `median-time-to-useful-outcome`, `repeat-use-useful-completion-rate` remain unknown. Accepted does not establish safety; timestamps do not establish task duration; duplicate-free event volume does not establish repeat participants. Do not map these descriptive task ratios into those existing tiles.
- Baseline, cost and verified savings remain unknown. Safety, honest-unavailable negative-path acceptance, recovery, support confidence and champion teach-back need their own actual receipts. An `Unavailable` report is not proof that a fallback worked. Candidate scale thresholds in the source scorecard are not approved commitments.

## Manual commissioning and publication workflow

1. **Authority and binding — currently unsupplied here.** The authorized business/metric/privacy owners approve a bounded tenant/site/list/cohort/window, this method or an already approved interim manual method, its denominator, freshness, baseline/comparison rules, privacy policy, participant notice and support/stop/recovery owners. Retain verifiable approvals with version, issuer authority and date in existing approved records. Never treat fixture IDs as those approvals. No business export is authorized by this document.
2. **Export and qualify.** Under separate authorization, the source owner reconciles all native pages, roles, cohort membership, exclusions and save/readback receipts. Project only the existing fixed-choice fields. Reconcile duplicate intent IDs and source inconsistencies before final hashing. The privacy owner separately establishes distinct-person/cell evidence without putting identities into this export. Cross-client material never enters the operator input.
3. **Run locally.** Copy the reviewed qualification and independently selected expected scope into the authorized workspace. Verify their trusted provenance and hashes out of band, then invoke the CLI with the actual as-of day. Retain the exact command, input hashes, report hash and local execution status. On blocked/suppressed output, do not publish counts or replace unknowns with zero. Repair/requalify a new export; keep the prior attempt.
4. **Review, do not auto-promote.** The metric/privacy owners inspect reconciliation, every formula and all disclosure risks. Confirm whether the evidence supports only self-reported task statistics or a stronger externally reviewed measure. Any already approved manual measurement is an interim process **only with its actual bindings/approval**, not a default granted by this build. A new method needs its own approval; do not silently rename it to the candidate method ID.
5. **Explicit publication bridge.** There is **no tenant writer or import payload** in this command. A separately authorized operator may use the existing `AI CoE Program Measures` list only for a measure whose definition, evidence and authority have been approved. Enter its real `MeasureId`, title, state, value/unit, period, evidence reference/note and applicable distinct-person cohort. Do not use the whole-export cohort as a reviewed subset's exact cohort without evidence. Missing baselines/costs/savings stay absent/unknown. Preserve the old row/version for recovery. Do not invent a mapping into the three existing value KPIs or redesign the scorecard to fit the available data.
6. **Readback and recovery.** Read back the exact target row, reference, period and cohort, then check the authorized Enterprise value presentation. Its existing evidence/current-period/privacy gates remain unchanged. A failed or uncertain write stays uncertain; reconcile the native row/version before retry or rollback under the existing operator authority. Retain publication and readback receipts separately from aggregation. This work performed none of these tenant actions.

## Governed proposal/retest follow-through

Reuse **Share feedback** for a small usability/source/correction proposal, and retain its existing receipt. Do not place prompts, client output or private transcripts into that feedback merely to substantiate a theme. An authorized owner manually links that reference to the already approved decision/work record: affected version, evidence reference, narrow proposed change, actual accepted owner, approval/stop authority, permitted test and retest receipt. Do not invent an assigned person or due date. After authorization and repair, retest the same task plus the relevant failure/recovery case and record the distinct outcome attempt. Close or defer using the real reviewer decision/readback, not a count going up. This does not commission an enterprise improvement engine.

## Teaching acceptance still required

A locally tested guidance button or simulated reviewer does not prove independent employee success. Under separate native test authorization, two users use their own identities without a builder narrating the path: find the correct role entry and current permitted sources; perform a small task; inspect/review the exact draft version; save/read back; handle missing source, refused access, pending save and duplicate-safe retry; record an outcome; propose a correction; find help and explain the stop condition. Observe keyboard and narrow-screen use in the actual host. Keep the source/version, personas, permitted data, result, failures and recovery receipts in the existing acceptance record. Champion/office-hours owner and schedule must be explicitly supplied. A four-week observation window starts only after readiness and is not evidence already collected.

## Local reproduction and evidence

```text
node.exe evidence/measurement-audit/run-tests.cjs
node.exe --test scripts/aggregate-workflow-outcomes.test.cjs
node.exe node_modules/typescript/bin/tsc -p evidence/frontend-audit/tsconfig.owned.json --noEmit --pretty false
```

The evidence-local source-Jest transformer rejects syntax errors; the no-emit check uses the existing evidence-local SCSS declaration substitute. Neither command is native SPFx package-build acceptance. The parent integration lane owns the full isolated build.

For a synthetic CLI demonstration, use `evidence/measurement-audit/fixtures/synthetic-outcomes.json`, `synthetic-qualification.json`, `synthetic-scope.json`, `--as-of 2026-09-23` and **a new output path**. Expected observations are in the current machine-verified reports and [handoff](../evidence/measurement-audit/HANDOFF.md). Never load these fixtures into a business measures list.

## Source basis (internal operator provenance, not bundled links)

- Existing [outcome definition and fixed choices](../src/webparts/aiCoeFrontDoor/content/workflows/outcome.ts), [actual writer/readback](../src/webparts/aiCoeFrontDoor/services/GovernanceService.ts) and [manual measures reader](../src/webparts/aiCoeFrontDoor/services/programMeasuresService.ts).
- Existing [page definitions](../sharepoint/pages/pages.json), especially `roleStart` and the three `value` KPI IDs. No replacement metric design or separate LMS was introduced.
- The supplied Marketing-first activation source files under `../../cloudwave-engineering-references/CW-AICOE-MARKETING-FIRST-ACTIVATION-v1-2026-09-19/`: `04_EMPLOYEE_10_MINUTE_QUICK_START.md` (source/review/stop/outcomes), `05_CHAMPION_AND_OFFICE_HOURS_TOOLKIT.md` (role, teach-back, minimal feedback, recovery), `08_MEASUREMENT_AND_SCALE_SCORECARD.md` (definitions, privacy, source-native denominators, unapproved candidate gates). These remain draft/candidate material; the UI is a client-neutral adaptation, not publication of their originals.
- Requested audit scope: project `conversations/cloudwave-front-door-gap-audit-2026-09-22.md`, sections 6 and 8. Source requirements, local code/tests, commissioning and human acceptance are distinct evidence levels.
