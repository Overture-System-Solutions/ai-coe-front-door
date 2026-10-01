# Final CloudWave UI UAT refinements — September 24

All seven requested refinements are implemented in the existing `fix/coe-audit-server-drafts` working copy. This is a source/preview update only, not a new SharePoint package or tenant activation. Hot reload remains unimplemented at Sam's direction.

## Changes
- Home: the enterprise-value entry uses the same capability decision as the tab. Hidden for employees, Marketing participants/reviewers, design authority without the read capability, and pending/unresolved membership; available to qualified leaders/operators/site owners. Navigation and service gates remain.
- Cases: 24px top padding around **What happens to a request / Truth controls**.
- Cases: **Show saved cases / Hide saved cases** toggles the library, with `aria-expanded` and `aria-controls`. Hiding does not change the selected case or unsaved answers; reopening reads the current authorized list again. Existing busy/recovery gates remain.
- Marketing: removed the duplicate plain `marketing.label` paragraph, preserving the synthetic warning banner.
- Labelled demonstration: 24px bottom padding around the workflow-card row containing **Campaign brief**.
- Improvement: 24px top padding around the starter row containing **Register team AI use**.
- Registration form only: reused the pre-existing centered `ai-workflow-shell` (48rem maximum). Tabs, section heading, Improvement overview and other forms are unchanged. Browser dimensions: 768px form versus 1398px available at desktop; responsive 348px form at a 390px viewport.

## Verification
- Production Heft compilation/lint/bundle/tests: **1191 passed / 125 suites / zero failures**. `heft-production.log`.
- Focused source-Jest: **130 passed / 12 suites / zero failures or skipped tests**. `all-source.json`. These overlap the production tests; do not add the counts.
- Actual built-bundle browser: seven simulated roles; eight desktop/mobile layout checks; accessible empty/populated saved-case toggle; selected case and unsaved-answer preservation; retained simulation labels; zero script errors/external requests. `final-browser.json`.
- Previous UAT browser regression rerun from an evidence-local copy: PASS. `browser-verification.json`. Earlier verification files were not overwritten.
- 112 non-blocking lint warnings: every flagged source line existed in the captured pre-change source. This is not a lint-clean claim. `lint-warning-review.json`.
- `git.exe diff --check`: PASS. Narrow production diff reviewed against `before-final-ui.zip`, including previously untracked source.
- Prior 1.0.0.17 `.sppkg` is byte-identical. No package-solution invocation, tenant/model action, commit or push.

## Preview

http://127.0.0.1:4173/?view=app&organization=CloudWave&role=marketingParticipant

Running process: `proc_656b15fc7f4c`. Exact served bundle SHA-256: `7b60a8146d15a53a62f58c07acc9455f4253b443a3fd9c729f6b06a555b8399b`. `VERIFICATION.json` binds source hashes, requested changes, previous package and the pre-change archive.

## Reproduce

```text
node.exe evidence/ui-final-2026-09-24/run.cjs '' all-source
node.exe node_modules/@rushstack/heft/lib/start.js test --clean --production
node scripts/preview.mjs --port 4173
```

Use the Windows-owned Node/dependencies for Heft/source tests. Run browser checks with `uv run --offline --no-project --with playwright python evidence/ui-final-2026-09-24/check_final_ui.py` and the installed Chromium path in `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; the system Python need not contain Playwright. Stop/restart only the owned preview if rebuilding changes the selected hash-named bundle. No package or tenant commissioning is implied.

The initial new-browser attempts exposed test-harness text normalization and an ambiguous substring selector; both were corrected without changing product behavior or weakening acceptance. Earlier failed logs are retained. Final browser receipt is the passing third run.
