# Helper completion handoff

- **31/31 helper tests pass**, no skips; exact C# 7.3/net10 shim build: **0 warnings, 0 errors**. `finish-tests.log`, `finish-build.log`.
- **22/22 actual generated-WDL + compiled-helper scenarios pass, all 16 operations**, full semantic comparison; SharePoint/provider remain explicit fakes. `finish-connected.json` is this lane's read-only use of the parent runner.
- Fixed inherited snapshot/Projection integrity failures; inherited Unicode implementation was already in authored source but missing from the old DLL. Added a compiled-source digest guard to prevent recurrence.
- Real `lists(guid'<id>')` pagination, verbose/odata ETag aliases, conflict refusals, seven-fraction-digit native timestamps and finalized-write/ETag checks pass.
- Recovery regression fixed narrowly: only an exact completed original intent, same actor/result, **zero new writes** may retain historical saved state. Other mutation plans still refuse changed state (red/green regression retained). Finalization changes only storeVersion; final plan replays unchanged.
- Added separate OpenAPI 2.0 Evaluate Mode/Payload-string registration files, apiProperties, README/deployment metadata, byte-identical Script.csx, offline package builder and registration ZIP. **Not a solution import.**

## Exact final bytes

- Script.cs / Script.csx: **99901 bytes** (limit checked at 1,000,000).
- Script SHA-256: `9dead8bb1670f64a517dee06d685ea1c789fed6ac0bef4a6cf9e644661f397f6`
- Compiled harness DLL SHA-256: `7d6a76c4bb619d7fdab23ae35de724311a6ab4069d736302c257644b3eabfab2`
- Registration ZIP: `../../connector/AICoEMarketingIntegrity_1_0_0_0_REGISTRATION_CANDIDATE.zip`
- ZIP SHA-256: `9ad1e16d880428340e00d1de4d0c107ed0ea674ef3afef71cc22ea294b29d047`; every member read back byte-for-byte.
- Complete receipt: `finish-verification.json`; package members: `registration-manifest.json`.

## Changed files / boundaries

Authored helper parts 00/10/30/40 plus new 25_RecordIntegrity; generated Script.cs/Script.csx; build.py/local harness/project/generated digest; new package.py, apiDefinition.swagger.json, apiProperties.json, deployment.json, README.md; new helper native-interop/registration tests; helper evidence. Existing 20 tests were preserved. No generator, integration/provisioning source, tenant, model/network call, paid/new dependency or commit.

Hosted custom-code API compatibility, native Save, ACL/REST/provider/runtime qualification and parent final-flow-ZIP gates remain unperformed here. Removed direct System.Globalization reference and used Newtonsoft's invariant culture through System.IFormatProvider; local net10 compilation is **not hosted .NET Standard qualification**. Linux git status could not resolve this Windows-owned worktree's gitdir; no Git metadata was changed.
