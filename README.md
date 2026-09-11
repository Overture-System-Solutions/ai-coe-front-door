# Overture AI CoE Front Door — recovered working repository

This is the editable recovery of the **1.0.0.7 SharePoint package**, not the missing original TypeScript/React source project. Start here, then open `src/` in your editor.

## Work with it

Use Node.js 22 or newer and npm. From this folder:

    npm ci --ignore-scripts
    npm test
    npm run preview

Open http://127.0.0.1:4173 in your browser. If that port is occupied, use `npm run preview -- --port 4174`. The preview runs the actual recovered React UI with a newly written, explicitly simulated SPFx/SharePoint host. No live SharePoint or model calls are made. Use fictional data only. “Connected,” “live,” and submission-success labels inside the original UI are simulated; the yellow banner explains this.

Edit files under `src/`, run `npm run build`, then refresh the preview. There is no automatic watch/rebuild. The JavaScript and CSS edit-propagation test proves source edits reach the rebuilt bundle. `npm test` rebuilds first and exercises the recovery, UI, all five submission routes against local fixtures, and preview-server boundaries.

The Python extraction test is separate: `python3 -m unittest discover -s tests -p 'test_*.py' -v` in WSL, or `py -3 -m unittest discover -s tests -p test_*.py -v` in Windows if the Python launcher is installed. Normal editing and preview use only Node/npm.

## Where to start editing

- `src/services/governance-service.js`: actual intake and core Use Cases writes, dashboard queries, shared IDs and field mappings (`Wt`, alias `qt`).
- `src/components/idea-workflow.js`: idea UI; the current early return skips the AI request (`At`, inner function `C`).
- `src/services/idea-summary.js`: deterministic draft builder (`Ue`) and dormant provider request (`Fe`).
- `src/services/feedback-summary.js`: dormant feedback-provider request (`Ze`).
- `src/workflows/definitions-and-theme.js`: question definitions, labels and theme strings (`fe` holds the workflow definitions).
- `src/components/landing-page.js`: home-page composition (`St`); home-card labels also live in `src/components/usage-dashboard.js` (`mt`).
- `src/components/governance-dashboard.js`: admin interface (`yt`).
- `src/services/usage-metrics-service.js`: reads usage/incident lists (`Qt`); this is not an OpenAI API connection.
- `src/styles/AiCoeFrontDoor.global.css`: extracted, editable global CSS. Additional styles remain in the recovered theme/style-loader JavaScript.
- `src/webpart/AiCoeFrontDoorWebPart.js`: SPFx lifecycle and wiring (`Jt`).

These are descriptive recovery filenames, not recovered original filenames. Minified identifiers are retained intentionally. The fragments share one lexical scope and are assembled in order; they are not independent ES modules. Do not import or reorder them as standalone modules. `src/recovery-map.json` maps each fragment and symbol back to exact offsets in the packaged JavaScript.

## What is preserved

- `original/overture-ai-coe-front-door.sppkg`: unchanged source artifact S181.
- `recovered/package/`: all 20 non-directory ZIP entries, byte-for-byte, including JavaScript, license notice, XML manifests, list schemas and four PNG assets.
- `recovered/inventory.json`: every entry's length and SHA-256; the archive also contains three directory entries.
- `src/`: 23 formatted JavaScript sections, the runtime template, extracted CSS and reconstruction map.
- `scripts/`, `preview/`, `tests/`, `package.json`, `package-lock.json`: newly authored recovery/development tooling, not original project files.
- `docs/RECOVERY.md`: provenance, dependency versions and limitations.
- `evidence/`: actual verification logs/report from this recovery session.

## Important limits

The package contains no `.ts`, `.tsx`, `.scss`, `.map`, original `package.json`, build configuration or Git history. Original interfaces, JSX, comments and unminified names cannot be recovered exactly. The CSS references a missing source map; that reference is preserved, not evidence that the map exists. This repository does not pretend to reconstruct the author's original project structure.

`npm run build` produces an AMD JavaScript bundle in `dist/`, with the original SPFx dependency contract and accompanying assets. This is a working local rebuild/preview path, **not a native SPFx toolchain or an importable replacement `.sppkg`**. The old hash-looking filename is retained for reference in `dist/`; do not upload it over the deployed asset. Before deployment, reconstruct/review native SPFx packaging, update version/cache references, and validate the package and live tenant separately.

The baseline rebuild has the same parsed JavaScript structure as the original (formatting, comments and literal spelling aside). Intentional source edits should change `equivalentToPackagedBaseline` to `false` in `dist/build-report.json`; that flag is informational, not a reason to discard edits. `npm run recover` refuses to overwrite an existing `src/`; do not delete your edits to rerun recovery. For an independent recovery use `node scripts/recover.mjs --out <new-empty-path>`.

No AI behavior was added or “fixed” during recovery. The dormant calls are to Anthropic, not OpenAI, and must not be enabled by adding a browser-side key. The proposed OpenAI/Power Automate connection remains a separate, unimplemented change subject to OSS policy/licensing and human-review requirements.

Git is local-only, initialized on `main`. Files are staged as the initial baseline; no commit or remote was created, and nothing was pushed or deployed. Keep this repository internal; application rights are not reassigned by recovery. The packaged third-party license notice is preserved.
