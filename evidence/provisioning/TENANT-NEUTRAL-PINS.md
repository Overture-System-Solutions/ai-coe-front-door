# Re-pinned provisioning sources (tenant-neutral repository, 2026-10-15)

Three pinned provisioning sources changed when the repository was made tenant-neutral. Their SHA-256 pins were
updated in `source-hashes.json`, `final/source-hashes.json` and `parent-verification/source-hashes.json`. No other pin
changed. The earlier `green-*` and `red-*` run folders keep their historical pins.

| File | Before (commit d7cd658) | After | Change |
|---|---|---|---|
| `backend/marketing-native/provisioning/controlled-inputs.schema.json` | `a1a3c901a22d42d29202d89b4a9c4988309a9557cb487aba4d8812b16686c817` | `ccc7b782fc9c262343d078a5bdb895115fd609b89da74b92c296e07c54c9f60a` | Work ID pattern prefix only: the committed file is now the rendering for the neutral default build target (`^AICOE-...`). `generator/build_target.py` renders it for another target; the target's rendering reproduces the before-file byte for byte. |
| `backend/marketing-native/provisioning/README.md` | `22589670576cf3e119c054ef3307a81bc96185408abfe84c042fb32d9232dd42` | `058b879d07854e54b844696f390a0bd30eb7f779524d98689ac977aad54ecf59` | Documentation only: the member-record row names `<work_id_prefix>-...` instead of a client prefix, and a *Build target* note was added. |
| `tests/provisioning/Run-BootstrapTests.ps1` | `80bbf5535d1adfdd138e7a6d4a078bf7f259fb1e1edfa940b0e9fb38d6fed984` | `c400b5ce854f92cc30f71970cf9e20d881080468c93e8f3b11e80230b638c8f7` | Test inputs only: the selected site is a Contoso site passed with `-SiteUrl`, and the synthetic member record uses `AICOE-TEST`. Re-executed: see below. |

The PowerShell suites were re-executed on 2026-10-15 against these sources, offline with the fake PnP module:
`pwsh.exe -NoProfile -NonInteractive -File tests/provisioning/Run-BootstrapTests.ps1` passed 30 checks, and
`python3 -B tests/provisioning/verify.py --phase tenant-neutral-2026-10-15 --independent all` passed every suite
(provisioning 29 checks, bootstrap 30, native surface, independent 26; sources unchanged during the run). Its logs,
`source-hashes.json` and `verification.json` are in `tenant-neutral-2026-10-15/`. The records in `parent-verification/`
and `final/` still describe the earlier run; only their source pins moved.

Fifteen earlier `bootstrap-tests/` run folders whose synthetic inputs used the former client-specific Work ID format
left the tip (see `bootstrap-tests/NOTE.md`). The previous pins and those folders remain in git history at commit d7cd658.
