# Frontend audit verification handoff

## Outcome and ownership

**Complete; delegated frontend ownership returned to the parent.** No commit was made. No further edits are in progress.

Worktree: `/mnt/c/Users/scfre/JuliannaAI/OSS-AI-CoE/development/overture-ai-coe-front-door-audit-fixes`.

This continuation changed only these application files:

- `src/webparts/aiCoeFrontDoor/components/app/AppCoreWorkspace.tsx`
- `src/webparts/aiCoeFrontDoor/components/app/AppCoreWorkspace.test.tsx`
- `src/webparts/aiCoeFrontDoor/components/app/AppMarketingWorkspace.tsx` (one missing JSX closing brace)
- `src/webparts/aiCoeFrontDoor/content/measures.ts`

Inherited changes in AppShell, AppChrome, AppValue, appSections and their existing tests were preserved and verified rather than reimplemented. New test configuration, red/green results, checkpoint and this handoff are confined to `evidence/frontend-audit/`. No host/context/CORE-service/Marketing-service implementation was edited. The worktree already contains unrelated parent/worker changes; this is not a claim of ownership over its full Git diff.

## Implemented and verified

1. **Metric privacy:** the previously failing `measures.app.test.ts` now passes. `IAppMeasurePolicy.privacy` is explicitly `people | nonPerson`; missing cohort metadata does not imply non-person. The non-person exemption applies only when no cohort is recorded; a recorded small cohort remains suppressed. Evidence reference, finite value, valid completed period and freshness checks remain required. AppValue continues explicitly using `people`.
2. **CORE recovery:** optional `recoverPending(session)` runs on mount before a fresh ListMyWork. A visible **Recover pending result** action reads the original result. Unknown, queued, inconclusive, disabled or thrown recovery outcomes prevent new commands; synchronous operation guards prevent overlapping clicks. A recovered result is applied without replaying CreateOrResumeWork. Unmount prevents follow-up list calls. Services without the optional method retain the existing manual-list behavior.
3. **Human evidence validation:** the form is offered only when the existing page context has a **resolved `designAuthority` role** and the service supplies `validateEvidence`. Employee, operator/site-owner, Marketing reviewer, pending and unresolved contexts do not expose the action and make zero validation calls. No role is fabricated or switched. The caller supplies an explicit disposition, a meaningful assertion and nonempty source references. The UI passes the original selected packet ID and signed-in session; it does not manufacture ExpectedVersion. The service owns the observed version and the native server remains the actual authorization authority. Packets are refreshed after a successful validation write. Synthetic services without the method explain that validation is unavailable.
4. **Native truthfulness:** ListMyWork uses v0.2.0 parsing for live mode, so a genuinely null LastValidatedAt is accepted without inventing a date. Synthetic mode keeps v0.1.1 parsing. Live mode has a native notice and empty initial business fields rather than synthetic sponsor/problem defaults.
5. **Inherited JSX defect:** reproduced root TypeScript TS1005 at AppMarketingWorkspace line 320, then added the missing `}`. The earlier transpile-only Jest harness had emitted JavaScript despite this syntax error. The retained evidence-local source transformer now rejects TypeScript syntax diagnostics, and a deliberately invalid in-memory TSX probe confirms it rejects `'}' expected`.

## Exact verification

Final unfiltered owned source run: **71 passed, 6 suites, 0 failed, 0 skipped/pending**.

| Test file | Passed |
|---|---:|
| `components/app/AppShell.test.tsx` | 36 |
| `components/app/AppCoreWorkspace.test.tsx` | 14 |
| `components/app/AppMarketingWorkspace.test.tsx` | 2 |
| `components/app/AppValue.test.tsx` | 12 |
| `content/measures.test.ts` | 5 |
| `content/measures.app.test.ts` | 2 |

These paths are beneath `src/webparts/aiCoeFrontDoor/`. There are no separate AppChrome or appSections test files in this tree; their routing/role/support behavior is exercised by AppShell tests. The owned runner also searches for an appSections test if one is later added.

New CORE tests cover:

- `renders unvalidated native work without a fabricated date or synthetic write notice`
- `does not call human validation for an unauthorized or unresolved reviewer context %j` — five contexts
- `explains unavailable synthetic human validation instead of inventing authority`
- `keeps recovery failure fail-closed and makes no follow-up call after unmount`
- `offers explicit human validation only to resolved design authority and refreshes the original packet after saving`
- `recovers the original pending command before fresh reads and never resubmits an unknown mutation`

Existing selectable case, same-WorkID clarification, classified packet answer, scoped opaque remount selection, keyboard focus, safe support-route, unsaved-draft survival, reviewer entry and zero unauthorized service-fetch tests all passed in the same unfiltered run. `verification-summary.json` contains every exact executed test name, programmatically reconciled counts, command exit codes and SHA-256 values for the owned source/test snapshot. `owned-results.json` is the full Jest result; `owned-results.log` is the terminal summary.

### Reproduction commands (from the worktree, WSL)

```sh
'/mnt/c/Program Files/nodejs/node.exe' evidence/frontend-audit/run-owned.cjs
'/mnt/c/Program Files/nodejs/node.exe' node_modules/typescript/bin/tsc --noEmit --pretty false -p evidence/frontend-audit/tsconfig.owned.json
```

Both final commands returned **exit 0**. The syntax-rejection probe returned exit 0. Scoped `git diff --check` returned exit 0.

The runner uses installed `@jest/core`, jsdom and a direct TypeScript source transformer. `ts-jest` is not installed in the dependency-owning tree; no package was installed and no dependency manifest changed. Network access is denied by the test setup. No Heft clean/build or shared lib output was touched.

### TypeScript scope and remaining acceptance

The plain root `tsc --noEmit --pretty false` initially reproduced the JSX error. After fixing it, it reported the missing Heft-generated `AiCoeFrontDoor.module.scss` declaration and a privacy-policy type spelling mismatch; the latter was fixed to match AppValue's existing explicit `people` policy.

The final evidence-local TypeScript configuration checks the full `src/**/*.ts(x)` graph with no emit and an explicitly labelled declaration for build-generated SCSS imports. It reports no diagnostics. **This is not a claim of a native Heft/package build.** The parent should still run its independently owned full build/typecheck with real generated SCSS typings. `red-typescript.log`, `typescript-after-syntax.log`, `typescript-owned.log`, `tsconfig.owned.json`, and `scss-generated-contract.d.ts` make this distinction inspectable.

The positive human-validation UI test uses the optional service interface over a local fixture; native ExpectedVersion/authorization/receipt behavior is the parent's adapter-test responsibility. The front-door Design authority group and native validator authority must be genuinely bound to the intended reviewer. Merely seeing this form does not establish permission, tenant commissioning, a native saved validation receipt or deployment. No tenant write, provider call, external send or live acceptance was attempted. Native qualification and business bindings remain explicit external gates.

Red/green artifacts include `red-privacy.log`, `green-privacy.json`, `red-recovery.json`, `green-recovery.json`, `red-validation.json`/`.log`, and `red-native-ui.json`/`.log`; final full-source results supersede the filtered development runs. `CHECKPOINT.md` was saved before final handoff. The discovered source-transpiler/typecheck pitfall was also recorded in the existing OSS AI CoE procedural skill.
