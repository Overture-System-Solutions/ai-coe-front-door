# Measurement/teaching handoff

**Completed bounded local work. No external call, tenant action, model/send/scheduler/task operation, commit or shared Heft build.** Parent owns the full integrated build and any separately authorized commissioning.

## Delivered

- `services/workflowOutcomeAggregation.ts` and test: existing outcome schema/choices only; strict source/method/period/scope qualification, exact-byte binding from the CLI, exact duplicate reconciliation, fail-closed invalid/conflicting rows, human-review consistency, whole-report cohort/cell suppression, reported outcome/review/route/theme counts and descriptive reviewed-pass/correction proportions. Baseline, cost, savings, participant adoption/repeat, safety and the three existing value KPIs stay explicitly unknown. Never emits `MEASURED` or a tenant import payload.
- `scripts/aggregate-workflow-outcomes.cjs` and `.test.cjs`: **actually invoked** offline command using that exact TypeScript service; no second aggregator, no tenant writer. Mandatory explicit local input/qualification/expected-scope/as-of/output; hashes source, qualification, expected scope, command and source dependency closure; refuses overwrite; body-free failures. This is a manual operator review/publication bridge, not authenticated analytics. Trusted issuer/approval provenance remains a manual commissioning prerequisite.
- `components/app/AppSections.tsx` and new test: Engineering/Improvement **Getting started** controls with neutral source/role/stop/recovery/teach-back guidance; existing outcome/help/feedback controls reused; manual proposal/retest path and expandable commissioning checklist. Original heading retained for compatibility, with explicit manual-path note. No private source links or raw transcripts bundled.
- `docs/MEASUREMENT-AND-TEACHING.md`: exact contracts, candidate formula/denominator, privacy attestation limits, unsupported scorecard mapping, approval/binding/export/reconciliation/publication/readback/recovery checklist and unperformed two-user acceptance. No approved business method or dataset fabricated.

## Verified output

[Machine summary](verification-summary.json) and `verify.cjs` bind current owned files and CLI reports.

- **43 focused tests / 2 suites passed.** Includes the actual existing GovernanceService save/readback over the local fake list transport and aggregation of its fields; guide controls/real same-app form entry, keyboard Enter/Space and narrow-layout DOM behavior. These are local tests, not native accessibility/visual/no-builder acceptance.
- **144 regression tests / 7 suites passed, zero failed/skipped** in `regression-verified.json`. Includes AppShell, AppValue, outcome choices, GovernanceService and program measures reader; no files in those unrelated implementations were edited.
- **4 CLI subprocess tests passed**, including source-byte tamper, non-overwrite, invalid as-of and body-free parse errors (`cli-final-execution.json`).
- **No-emit TypeScript check passed** (`typecheck-final-execution.json`) using the pre-existing evidence/frontend-audit tsconfig and its explicit generated-SCSS typing substitute. Not a package build.
- `git diff --check` for the edited AppSections passed.

Actual final CLI runs, all explicitly synthetic:

| Current artifact | Result |
|---|---|
| `synthetic-report-verified.json` | Exit 0; review-required/manual-only; 11 input events → 10 unique + 1 exact duplicate; 5 Accepted/5 Corrected; pass and correction proportions each 0.5 |
| `synthetic-unknown-report-verified.json` | Exit 2; missing method approval blocks counts |
| `synthetic-suppressed-report-verified.json` | Exit 2; small cohort suppresses all counts and totals |

The `*-verified.json` reports are current. Earlier unsuffixed synthetic reports and red/intermediate Jest receipts are development history, not additional evidence or final results. The earlier blocked report predated the fix preserving the synthetic notice on failed qualification.

## Issues resolved / limits

- Existing Jest lives at installed `@jest/core`, not a top-level `jest` module; source runner scopes roots to `src` to avoid unrelated generated backend package name collisions.
- TDD receipts preserve missing-feature and gate failures. The first expanded regression found an AppShell assertion for the old heading; fixed by retaining that heading and adding the honest manual note, without editing AppShell or its test. Final rerun is green.
- Outcome events lack participant/workflow identity and task duration. Therefore no Marketing adoption, first/repeat participant rate, safety certification, time savings or existing value KPI is inferred. Event counts cannot establish distinct people; source/privacy owners must supply trusted scoped attestations and review cells/complements/linked-report differencing. Forged refs or a dishonest export scope are not authenticated by this offline tool.
- UI guidance is client-neutral and exposes no source originals. Native source access, trusted approval issuer, tenant permissions/export completeness, measurement notice, authorized manual publication/readback, and two-user/no-builder commissioning remain unsupplied/unperformed.

## Re-run

```text
node.exe evidence/measurement-audit/run-tests.cjs
node.exe --test scripts/aggregate-workflow-outcomes.test.cjs
node.exe node_modules/typescript/bin/tsc -p evidence/frontend-audit/tsconfig.owned.json --noEmit --pretty false
node.exe evidence/measurement-audit/verify.cjs
```

Regression command is preserved exactly in `regression-verified-execution.json`. The offline command's `--out` must be a **new** path; do not overwrite the verified evidence to rerun a fixture. CLI input fixtures are under `fixtures/` and are never approved business evidence.
