# Engineering form width follow-up — September 24

Complete: applied the same centered `ai-workflow-shell` used by Improvement registration to all three Engineering forms:
- Explore an AI idea
- Check a tool or task
- Get help or training

Only form content is wrapped. The Engineering heading, starter cards, page and navigation remain full-width. The existing Improvement registration width is retained; feedback/outcome forms and backend behavior are unchanged. One shared conditional wrapper avoids duplicating layout logic. No stylesheet change was needed.

## Verified
- All three new regression cases first failed on the missing wrapper, then passed.
- Focused source-Jest: **133 tests / 12 suites / zero failures or skips**.
- Production Heft build/compile/bundle/test: **1,194 tests / 125 suites / zero failures**; 112 existing non-blocking lint warnings remain. Test groups overlap.
- Built-bundle browser checks: **all three forms × desktop/mobile/configured narrow column = nine passing checks**, including unchanged outer width, centered form geometry, no horizontal overflow and unsaved-text guard/retention. Desktop forms are 768px maximum; phone forms are 348px in a 390px viewport. The existing narrow-column rule deliberately removes the redundant maximum inside an already constrained column (518px form in a 560px mount).
- The previous seven-role and final-UI browser regression also passes from an evidence-local copy, preserving earlier receipts.
- Only `AppShell.tsx` and `AppSections.test.tsx` changed under src, verified against the before archive. Previous .sppkg remains byte-identical; no packaging, tenant change, real model call, commit or push.

## Current preview and evidence

http://127.0.0.1:4173/?view=app&organization=CloudWave&role=marketingParticipant

Preview process: `proc_1d5b9c4e1a4e`. `VERIFICATION.json` binds the current served bundle, changed source and prior package hashes. `browser-results.json` records the nine form checks; `final-browser.json` records the earlier UI regression against this new bundle.

Reproduce source checks with `node.exe evidence/ui-engineering-forms-2026-09-24/run.cjs '' all-source-green`, production with `node.exe node_modules/@rushstack/heft/lib/start.js test --clean --production`, and browser checks with the same installed Chromium and scoped Playwright environment used by the preceding UI handoff. Restart only the owned preview after a hash-named bundle changes.

The first browser attempts exposed harness assumptions about the pre-existing narrow-column CSS override and the help form's choice-first step. The harness was corrected to exercise those actual paths; no product code was changed or acceptance requirement waived in response. Earlier logs remain historical; the third form-browser run is the passing receipt.
