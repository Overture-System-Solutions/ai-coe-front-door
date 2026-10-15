# Removed from the repository tip

**What:** 15 earlier bootstrap test run folders (outputs of `tests/provisioning/Run-BootstrapTests.ps1`): `0a335390ee344fc3b657190f309f47b6`, `17b06d2ffdb94f9fbf92fc3270e287e0`, `4ed8d53c8df9492d9790d5e694b8c213`, `5c0e18d0f00a4700b051fa704233bdeb`, `73045349977d45689a6cebcc433058f6`, `7e2fcdf2143343c5bdd061253283603e`, `8ded7a2c91534c1182a3e0c41a35d33c`, `b210342bebcc480a97a93d2fe7a99e92`, `b55ff06d738945d3b59dd9d1ae3f6529`, `b9d4cf68b7404029aaad4320ea08704b`, `cc6b962bc76142ac949bbc78e8b14a07`, `cf445b514b9840bdadce2038420f69f4`, `dd2492384f1b46d29dd5cf07d0cd90e9`, `df3b4bfa628c4a4f8780d5d4d817beab`, `dfc711e486f54a67807ddfe6e3f0dd3e`.

**Why:** tenant-neutral repository, 2026-10-15. Their synthetic member records used a Work ID in the former client-specific format. They are captured test output and cannot be rewritten honestly; the bootstrap test now uses a Contoso site and `AICOE-TEST` Work IDs.

**What replaced them:** the neutral runs of 2026-10-15, `611524e169f743f5a552a94e638ebabc` (direct `pwsh.exe` run) and `7efd8109fbae4e51a7a73a98336984c0` (from `python3 tests/provisioning/verify.py --phase tenant-neutral-2026-10-15 --independent all`, logs in `../tenant-neutral-2026-10-15/`). The folders `de4d108e1a594cf7a4adc4208561f061` and `ec0ac01e4b0948d98eb478cde8071455` stay: they hold no client value.

**Where they remain:** git history at commit `d7cd658`, under the same path: `evidence/provisioning/bootstrap-tests/<folder>`.
