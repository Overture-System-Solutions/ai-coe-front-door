# Recovery provenance and boundaries

> **Superseded by the TypeScript port (2026-09-11).** The formatted JavaScript sections, the AMD reassembly scripts
> and their tests described below were retired after the web part was ported to a native SharePoint Framework
> project (see the repository README). `original/`, `recovered/` (including `recovered/recovery-map.json`),
> `evidence/` and `scripts/extract.py` remain as provenance. The stylesheet fixtures under `parity/` and the journey
> parity suite in `src/parity/` continue to check the port against the shipped bundle.

## Source

Source ID: S181 in the internal OSS AI CoE catalog.

Original artifact: `resources/TempTegriaAndCloudwaveResources/overture-ai-coe-front-door.sppkg` in the parent project; originally supplied from the same-named Downloads resource folder.

Package SHA-256: `97e5e1e3ff5e6c68188ae9d395ac5763dd8e8342a2b514416e51581d714f6500`.

Package manifest version: `1.0.0.7`.
Product ID: `f125ebdf-4a9d-4e6e-8479-3a18874e7752`.
Web part ID: `cf2e5904-0703-4fe4-ae5a-ec012d6fa689`.
Component manifest version: `1.0.0` (different from package version; neither identifier was normalized).
AMD module ID: `cf2e5904-0703-4fe4-ae5a-ec012d6fa689_1.0.0`.

The component XML declares React and React DOM `17.0.1`, plus `@microsoft/sp-core-library`, `@microsoft/sp-webpart-base`, `@microsoft/sp-page-context`, and `@microsoft/sp-http`, all `1.23.2`. The preview pins the actual React versions but simulates the narrow SPFx host contract; it does not install or replace Microsoft's native SPFx toolchain. The packaged notice identifies bundled lucide-react `1.30.0` and Microsoft helper code; it is retained verbatim.

## Method

1. Preserve original package bytes; verify its SHA-256 and every member's CRC.
2. Extract every ZIP member without executing archived content, rejecting unsafe paths and overwrites.
3. Parse the actual bundled JavaScript using pinned Acorn. Recover the 103 statements in its main application closure into 23 contiguous, ordered sections with responsibility-based names; retain the outer AMD/webpack runtime and all other code in a readable template.
4. Decode the embedded global stylesheet literal into a CSS file. Leave other inline/transformed CSS expressions in place to preserve executable structure.
5. Format recovered JavaScript with pinned Prettier, without renaming identifiers or reverse-transpiling generator state machines.
6. Reassemble using explicit markers. Compare parsed structures against the original, ignoring only offsets, raw-literal spellings and comments. Store source offsets as UTF-16 code units, not byte offsets.
7. Mount the actual recovered bundle using React 17.0.1 and a clearly labeled in-memory SharePoint fixture host. Test all five workflow routes against these fixtures. This is local behavior evidence, not Microsoft API/tenant evidence.

The previous solution-build workspace supplied comparison evidence and a formatted bundle for inspection, but this repository's reproducible extraction starts from the independently hashed S181 package. The Power Automate solution workspace is unchanged and is not duplicated here.

## Reproduce extraction separately

    python3 scripts/extract.py --package original/overture-ai-coe-front-door.sppkg --out <new-empty-directory>
    node scripts/recover.mjs --out <another-new-empty-directory>
    node scripts/build.mjs --src <that-recovered-source-directory> --out <new-build-directory>

The source-recovery script consumes this repository's preserved `recovered/package` baseline. It is intentionally checksum-bound to S181; it must not silently apply the same statement boundaries to another version.

## Evidence and limits

See `../recovered/inventory.json`, `../src/recovery-map.json`, `../evidence/verification.json`, and their neighboring test logs. Build outputs are ignored by Git and reproducible with `npm run build`. The preview server binds only to loopback, serves an explicit asset allowlist, denies network connections via CSP, and contains no API key or cloud credentials. Draft localStorage belongs only to the preview's local origin; do not use client/patient data even in the preview.

No original `.map` files or TypeScript/TSX/SCSS sources are present. Four PNGs, list-provisioning XML, relationships, component metadata and the license notice are preserved as original bytes. Source-map availability elsewhere, full native SPFx packaging, pixel-for-pixel appearance, real Microsoft authentication, production security and live approval/model execution are not established by these tests.

The current user reported that the original project cannot be obtained and authorized local recovery into Git. No broader UI redesign, tenant change, deployment, paid service, remote repository, task-board mutation or initial commit was implied.
