# Native CORE resumption — finalization complete

Implementation continued in place; ownership remains `backend/core-native/**` only. No tenant calls, import, ACL apply, model/provider calls, Send, commits or pushes.

## Verified in this pass
- Exact current `connector/Script.cs` compiled using isolated .NET 10.0.401 / C# 7.3 after an offline restore: zero errors/warnings (`final-restore.log`, `final-compile.log`; both local logs).
- All current tests: **58 passed, zero skipped** (`final-tests.xml`, `final-tests.log`): the original 30 plus 28 tenant-neutrality tests in `tests/test_target.py`. Includes inherited datetime and recovery corrections, actual generated WDL execution, fresh-site provisioning/repeat/403/type drift, interleaved stale writer rejection, post-publication/pre-completion missing receipt repair and nondisclosing cross-author reads. SharePoint and WDL host are explicitly local simulations.
- Primary and literal structural validators: 12 PASS (`final-structural.log`).
- Rebuilt 3.0.0.1 review-only OFF artifacts in `out/` for the neutral default target; `final-build.log` and `out/build-evidence.json` identify CURRENT hashes (older logs and hashes are historical).
- Eight historical source pins (seven generator modules, routing-policy source) are kept in `source-pins.json`; `upstream/` holds neutral copies matching their recorded hashes. `upstream_provenance.py` plus a client's local target file restores originals that match all eight pins (checked locally, outside the repository).
- PAC 2.12.1 unpack/pack/unpack/create-settings succeeded for both current flow ZIPs. `final-verification.json` verifies six workflow identities, OFF state, all JSON/XML/component semantics and actual final-package execution. Primary warnings reproduce on the original candidate; literal fallback has none.
- `final-handoff-check.json` is recomputed by `write_handoff_check.py` (package hashes listed in `../HANDOFF.md`, document hashes, test totals, Script.cs hash).

## Build target
Builds read a local target file kept outside the repository: `site`, `work_id_prefix` and the optional `arb_owner_note` (Authority_ARB configuration note; neutral text when absent). Without a file the neutral Contoso/AICOE default is used; the committed `out/` is that build. Client builds go to folders outside the repository. Details: `../README.md` and `../HANDOFF.md` (Build target).

## Completed handoff
Read `../HANDOFF.md` for exact F01–F12 dispositions, current package hashes, reproduction and explicit native gates. `final-verification.json` is the current machine receipt; `verify_delivery.py` rejects stale build/package/source combinations. All bounded local finish work is complete. No registered helper ID, native acceptance, ACL execution, tenant import/Save or Send is claimed. The next steps require separately authorized commissioning, not another implementation restart.

## Environment
`DOTNET_ROOT=/home/far_cdx/.cache/oss-demo-dotnet`, include in PATH. Point `DOTNET_CLI_HOME`, `NUGET_PACKAGES`, `NUGET_HTTP_CACHE_PATH` at a cache folder outside the repository. A clean checkout first runs `dotnet restore connector/local/CoreHarness.csproj --source <empty local dir>`, then `dotnet build connector/local/CoreHarness.csproj --no-restore -c Release`. Python `/home/far_cdx/.hermes/hermes-agent/venv/bin/python` (its zlib reproduces the recorded package bytes); PAC `/home/far_cdx/.cache/oss-demo-pac/pac`. PAC help prints version; do not use `pac solution check` (uploads).
