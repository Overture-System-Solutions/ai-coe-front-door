# Shell UAT source-only handoff

## Changes
- Removed the Improvement operator commissioning control/component; retained proposal/retest guidance and existing operator documentation (documentation not edited).
- Removed `map` from `AppSectionId`, section registry and AppShell rendering; stale `map` parsing returns Home. Admin/Enterprise value/Usage service and mount gates remain unchanged.
- Added `.ai-app-starters--engineering { padding-block: 24px; }` under `.ai-view--app`; card internals, narrow/mobile columns and Improvement spacing remain unchanged.
- Wired optional `onDirtyChange` through AppCases to AppCoreWorkspace and the existing shell unsaved guard. Cases warning uses Save case changes/Save response, while Marketing/guided draft text remains unchanged.

## Changed source/tests (all under src/webparts/aiCoeFrontDoor)
- components/app/AppShell.tsx
- components/app/AppShell.test.tsx
- components/app/AppShell.cases.test.tsx (new)
- components/app/AppSections.tsx
- components/app/AppSections.test.tsx
- content/appSections.ts
- content/appSections.test.ts (new)
- styles/appShell.global.scss

## Verification
Windows Node v22.16.0, source transform rejecting TypeScript syntax errors, network disabled, CSS stub for the parent's new Cases stylesheet. No Heft, shared generated output, package, commit or tenant/model/network action.

- TDD red/green recorded for commissioning removal, map/navigation removal, Engineering padding and Cases dirty-state wiring.
- `node.exe evidence/ui-uat-2026-09-24/shell/run.cjs '' green-owned`: **60 passed / 4 suites / zero skips**, before the later in-progress parent Cases edit.
- Strict no-emit import-graph TypeScript check initially passed with zero diagnostics (tool output). Later read below is blocked by parent edit.
- ESLint: **0 errors, 1 existing no-script-url warning** in the unsafe-support-URL negative fixture (`AppShell.test.tsx`). Details in eslint.json.
- In-memory sass-embedded compilation verified scoped 24px Engineering padding and retained narrow single-column styling. No CSS/generated build files were written.
- Owned tracked-file `git diff --check` passed. Diff against before-uat.zip reviewed; prior dirty edits preserved.

## Latest integration result
The parent syntax race was resolved before the last rerun. Latest `typecheck.json` again has **zero diagnostics**. `final-regression.json` has **113 passed / 17 failed, 9 passing / 2 failing suites**. All four owned suites pass again (60 tests), as do authorization/gated-services and Marketing/value suites. Remaining failures are confined to parent-owned `AppCoreWorkspace.test.tsx` and `AppCoreWorkspace.uat.test.tsx`, including the still-unmigrated `List my work` label and new tests clicking disabled controls before initial service checks settle. Parent owns those migrations; no child changes were made there.

Earlier failed logs (`green-regression.json`, `final-owned.json`) preserve the transient parent-source syntax race (AppCoreWorkspace.tsx line 76 TS2353/TS1005 and line 272 TS17008); these errors no longer appear in the final typecheck. Do not present the full integration as all-green while the parent Cases tests are unfinished.

After the parent finishes Cases, rerun:
```
node.exe evidence/ui-uat-2026-09-24/shell/run.cjs '' completed-regression regression
node.exe evidence/ui-uat-2026-09-24/shell/typecheck.cjs
```

Documentation follow-up outside this lane: docs/MEASUREMENT-AND-TEACHING.md line 9 still describes the removed Improvement accordion; keep the real operator instructions but remove that obsolete UI-location claim.
