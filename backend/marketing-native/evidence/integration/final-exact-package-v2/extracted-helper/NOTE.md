# Removed from the tip: the extracted helper script

Removed on 2026-10-15 when the repository was made tenant-neutral. These were byte copies of the helper script extracted from that verification's package, and that script carried the client Work ID prefix. They are captured verification output, not regenerable sources. The current helper is the neutral default rendering (`connector/Script.cs`); `generator/build_target.py` renders it for a target.

The removed files remain in git history at commit d7cd658 under the same path:

- `backend/marketing-native/evidence/integration/final-exact-package-v2/extracted-helper/Script.cs`
- `backend/marketing-native/evidence/integration/final-exact-package-v2/extracted-helper/Script.csx`

This folder's `VERIFICATION.json` and `local/ScriptDigest.g.cs` still record the removed script's SHA-256.
