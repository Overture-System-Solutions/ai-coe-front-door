# UI UAT refinement checkpoint — September 24

## Final result — complete

All four changes are implemented and served by the restarted preview `proc_0c7be0def8d9` on port 4173. Full production build/test: **1,177 passed / 123 suites / zero failures**; 85 non-blocking warnings recorded. `VERIFICATION.json` binds the new served bundle `5bb8d3984ff9b9e11aedc35dcbb46c5f311f90d27e4db5ad16ea4e6cdce651de`, unchanged prior .sppkg and native Marketing delivery, and the exact before-UAT snapshot.

Actual desktop/mobile browser checks pass all four requests, case creation/response/save/new-case selection, unsaved navigation guard, full-width bordered controls and 390px no-overflow. No JavaScript errors or external requests. Fixed a preview-only long role-selector width; final screenshots confirm the sticky navbar is above Cases rather than the mid-form artifact caused by a scrolled section capture. Home current/client/log updated. No new .sppkg, tenant/model action, commit or push. Next is user UAT, not outstanding work from the historical notes below.

## Earlier working notes (superseded by final result)

User requested four UI changes after screenshot brave_qGA19XXOsB.png: misplaced operator commissioning control in Improvement, remove System map navbar, Engineering starter-region vertical padding, and redesign confusing Cases inputs. Vision review confirmed borderless/truncated fields, duplicate implementation notices, raw identifiers/statuses and cramped response controls.

## Parent-owned work

- Preserved 348 frontend/config/preview/build/package files in `before-uat.zip`; the prior .sppkg SHA-256 is `5a01fd5a6c40a3e2b71999de9cba44a2a7fe630148c9debc7d83885d2fc7a86b`.
- Reworked AppCoreWorkspace: blank new-case form, clear create/edit/select/new-case controls, visible multiline fields, concise practice notice, readable status/next step, named requested-information topics, explained certainty, larger response, metadata in Technical details.
- Preserved partial-field updates, scoped reference-only recovery and server/role validation. Added optional onDirtyChange and protects unsaved case/response/review edits. Successful validation clears its transient form; explicit discards do not delete records.
- New stylesheet `styles/coreWorkspace.global.scss` is scoped to the consolidated Cases view. Imported from AppCoreWorkspace; source-only Jest requires the local CSS stub.
- Original Cases tests retained and query labels migrated; five new UAT tests added. `cases-all-green.json/log`: **20 passed, zero failed/skipped, two suites**. RED logs preserved. Full production build and browser are NOT yet rerun; the running preview still serves the previous bundle.

## Parallel shell lane

Batch `deleg_5d908519`, child `sa-0-5a253ea3`, owned AppShell/AppSections/content-appSections plus their tests and appShell.global.scss. Requested three other changes plus wiring AppCases(onDirtyChange) through to AppCoreWorkspace and the existing shell guard. Do not overwrite its source. Last steer returned no live child, so completion is pending delivery, not proof of success. Read its actual handoff after result arrives.

Late requested copy: Cases section summary should read “Start a case, add requested information, and follow its review.” That last steer missed the child and may still need a parent edit.

## Remaining before finishing

1. Reconcile shell handoff and parent-rerun its tests; inspect shared source and Cases callback.
2. Full Heft production build/test with Windows node.exe, without package-solution or tenant writes. Preserve the previously verified .sppkg and native Marketing release bytes. Fix actual build/test failures rather than weaken checks.
3. Restart only the owned offline preview on 4173 (`proc_5ba3cce8c70e`, validate current process first) so it serves the new bundle, not the old startup-captured hash. Verify served hash matches new dist.
4. Real browser UAT checks: no System map for owner/operator; Improvement no misplaced commissioning control; Engineering positive top/bottom starter padding; Cases creation/save/selection/evidence and unsaved exit/discard; full-width labelled fields at desktop/mobile, no overflow/console errors/external calls. Use synthetic text only. Take local screenshot if needed and use vision_analyze to review actual new Cases layout.
5. Update current home/client/log with a concise UI-only result; do not represent this as a new native deployment or silently replace the 1.0.0.17 package. Report same preview URL ready for refresh.
