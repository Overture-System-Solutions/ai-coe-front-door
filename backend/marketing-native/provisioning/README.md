# Marketing native provisioning — operator boundary

**Delivered and tested locally only. No tenant connection, tenant/provider operation, import, membership change, business row, enablement or commit was performed.** Native execution and retention acceptance remain unqualified.

## What ships

- `New-MarketingLists.ps1`: real create-only PnP apply path, **offline dry-run by default**. Creates exactly three new lists and at most three named custom permission levels; never repairs existing targets. No business records.
- `marketing.v1.lists.json`: byte-identical pinned copy of the original review-only `backend/power-automate/marketing-runtime/provisioning.json`. Its historical `applyImplemented:false` describes the old descriptor, not this new script. Only its exact lists/fields are consumed.
- `operator-binding.template.psd1`: explicit unbound IDs/current-connection expectations. No credentials.
- `ProvisioningReceipt.ps1`: pinned local Windows-DPAPI/CreateNew recovery helper derived from the earlier one-page installer, with fully-qualified absolute-path validation added (drive-relative `C:folder` is rejected). The earlier installer is untouched.
- `New-MarketingBootstrap.ps1`: offline, create-new local configuration, controlled-input and commissioning templates. All enablement/qualification flags **false**. It does not register connectors or qualify the writer.
- `controlled-inputs.schema.json` and `ConvertTo-MarketingRecordPlan.ps1`: strict offline validation of **non-authorizing** controlled record candidates; optional protected exact canonical row plan. No canonical write API, approval issuer or activation path.
- `RETENTION-COMMISSIONING.md`: mandatory historical-result revocation and retention policy gate; **no lifecycle enforcement/cleanup script** is represented as implemented.

## Fixed native storage boundary

| New target | Relative URL | Exact effective list assignments after readback |
|---|---|---|
| AI CoE Marketing Canonical | `Lists/AICoEMarketingCanonical` | Existing verified writer user only: ViewListItems, OpenItems, AddListItems, EditListItems, Open, ViewPages, UseRemoteAPIs |
| AI CoE Marketing Requests | `Lists/AICoEMarketingRequests` | Writer user: safe built-in Read (`1073741826`); existing approved requester SharePoint group: AddListItems, Open, ViewPages, UseRemoteAPIs only |
| AI CoE Marketing Results | `Lists/AICoEMarketingResults` | Writer user only: ViewListItems, OpenItems, AddListItems, ManagePermissions, Open, ViewPages, UseRemoteAPIs |

Named roles are `AI CoE Marketing Canonical Writer`, `AI CoE Marketing Request Submit`, and `AI CoE Marketing Result Writer`. Existing exact roles can be reused, never changed. Any extra/missing permission refuses. Native dependency expansion must **fail the readback**, not silently add caller read/edit/delete rights.

All lists have unique ACLs, **ReadSecurity=1 / WriteSecurity=1**, required exact descriptor fields, disabled attachments/versioning/folders, Hidden and NoCrawl. Canonical/Requests Title and Results RequestId retain their unique indexes. Never change these to own-read/own-write (`2`) or remove uniqueness to get a failing tenant test to pass. Hidden/NoCrawl are not security controls.

Requests are immutable after participant creation: no caller read (including own), edit, delete, manage-list or manage-permission access. Never add an actor authority column. Trust native Author/Editor/timestamps only after service validation. Canonical and Results have no requester list grant. The flow must create Results privately, then independently reauthorize and grant exactly the verified request Author **Read `1073741826` on that item**, retaining only the configured writer as another assignment; verify bytes and ACL before returning success. List provisioning does not perform/test that flow grant.

Site collection administrators retain administrative access. A site owner/controller must not be a business acceptance persona. An admin's successful read is not proof of participant access. The writer may be the provisioning controller, but **never** the request Author/business participant.

## Prerequisites before anyone authorizes apply

Selected site: `https://osscontact.sharepoint.com/sites/CloudWaveDashboardDemo`.
User-designated later writer hint: `samuel.conrad@osscontact.com`.
These are **not** discovered SharePoint IDs, current connection identity, permissions, group membership, connector or controller qualification.

Use Windows `pwsh.exe` **7.6.6** and the already installed PnP.PowerShell **3.1.0**. No install, execution-policy relaxation, authentication, credentials or connection creation is performed by these scripts. Start from a separately approved **existing delegated PnP connection**, not app-only or a new identity. The script accepts only local context classifications `AzureADInteractive` or `DeviceLogin`; raw-token, app-only and unknown classifications stop before mutation. It never obtains/prints tokens. PnP 3.1.0's `ConnectionMethod`/`InitializationType` labels alone are not reliable proof of the authentication mode. Verify the exact web GUID, URL, current operator ID/login, actual existing writer ID/login, and both pre-existing approved group IDs through your approved controller process. Review source hashes in `evidence/provisioning/source-hashes.json` before execution.

Both groups must be private, controller-managed, nonempty direct-user SharePoint groups, with no self-edit/join. Their owner must be the selected controller group or the verified current controller user. Current operator must be a direct controller member and have actual web ManageLists/ManagePermissions. Controller/requester and writer/requester overlap, nested/security/broad groups, administrative requesters, unreadable membership, unsafe role definitions and any denied prerequisite read are refusals, not repair opportunities.

To retain readback access after removal of the automatic creator Full Control grant, the operator must be either **the verified writer/controller**, or an **already-existing site collection administrator/controller**. A different ordinary controller refuses before mutation. Do not elevate anyone to satisfy this script. If the existing governance cannot supply a qualifying session, stop and ask the controller for a separately reviewed route.

Reserve an exclusive commissioning window: flow OFF, frontend unbound, no competing provisioning/writer or role/membership changes. The script pins an immutable membership/owner/identity snapshot and custom role IDs, rereads the complete private list set before granting requester access, and checks principals/roles again before a success receipt. Even an otherwise-safe new group member is drift, not an automatically authorized addition. These checks cannot make site administration atomic. Approve the exact list/role names, site and groups; authorization of a demo site alone is insufficient.

**A read-only blocker report is a valid stopping point.** If current authentication, delegated identity, controller authority or the requested native capabilities cannot be established, do not run Apply. Retain only the exact operation, resource scope, time, error/status and content-free evidence reference using the approved read-only/controller route. Do not retry authentication, collect a token, create an app/user/group, add global membership, grant a broader role or activate a flow to make the test pass. The later designated writer and the existing live intake precursor do not qualify this separate Marketing binding.

## Commands (do not run apply as part of local delivery)

From the repository root, in Windows PowerShell 7:

```powershell
# Safe: offline, no PnP call and no files written.
.\backend\marketing-native\provisioning\New-MarketingLists.ps1
.\backend\marketing-native\provisioning\New-MarketingBootstrap.ps1

# Optional OFFLINE local files. Select a NEW private absolute directory.
.\backend\marketing-native\provisioning\New-MarketingBootstrap.ps1 `
  -WriteTemplates -OutputDirectory 'C:\PRIVATE-OPERATOR-DIRECTORY\marketing-unbound'
```

Copy the binding template into the controller's private workspace, fill **actual approved and verified** values (never synthetic test IDs), and inspect it. ReceiptPath must be a new absolute filename prefix under an already-existing private **Windows-local, non-UNC** directory. Use a non-synced operator-only location, not this repository, OneDrive or a shared download folder. DPAPI protects receipt payloads for this Windows user/machine, **not** independent controller approval; also protect the directory and input files with the operator's approved local access controls.

Only after separate current-controller authorization of this exact scope:

```powershell
Import-Module PnP.PowerShell -RequiredVersion 3.1.0
# Do NOT Connect-PnPOnline or supply credentials from this handoff.
$binding = Import-PowerShellDataFile 'C:\PRIVATE-OPERATOR-DIRECTORY\approved-binding.psd1'
.\backend\marketing-native\provisioning\New-MarketingLists.ps1 @binding `
  -Apply -ConfirmCreateOnly -ConfirmCurrentControllerAuthority
```

The two confirmation switches are explicit operator assertions, not cryptographic authorization. A 403, absent/unreadable identity, role mismatch, existing title **or URL**, write error or unexpected readback stops; no fallback treats it as absence. Existing lists are refused even if they look compatible. No CORE list, old Marketing list, data, membership or site permission is edited. Custom roles are newly created only when absent. Newly created lists are configured privately and read back before the sole requester grant is added.

**Partial failure is not rollback.** PnP calls are not transactional. Prepared DPAPI receipt is flushed before any native mutation; each returned created list ID gets a protected receipt before configuration. A timeout can leave a created role/list without a returned ID, or a participant grant before a final readback fails. Stop immediately, keep all receipts, keep Marketing OFF/unbound, and have the current controller inspect the exact names/IDs and last uncertain call. Do not rerun to repair, pick new names/prefixes to bypass an existing target, reset inheritance, broaden roles, delete lists/rows, or retry a possibly completed call blindly. There is intentionally no destructive rollback.

## Bootstrap without fabricating approval

The local templates retain empty list GUIDs, null writer ID, empty qualification/provider/model references and false controller/security/retention/provider/hosted gates. Actual list GUIDs from a later **applied readback receipt** may be entered into a private copy; that does not authorize `enabled=true`. `samuel.conrad@osscontact.com` appears only as a non-evidentiary writer hint. No participant is automatically assigned.

`controlled-inputs.template.json` begins with an empty (schema-valid) `records` array because actual identities, register, work scope, source hashes and approvals are unknown. The schema describes exact existing canonical shapes and permits only this **non-authorizing subset**:

| Key | Candidate restrictions |
|---|---|
| `member:<SharePointAuthorId>` | `enabled:false`, actual actor/roles/workIds/audience supplied; writer ID/actor forbidden; canonical work IDs `CW-...` only |
| `authority:<bindingRef>` | exact bindingRef/tenant; `synthetic:false`, `revoked:true`, expired finite UTC; existing review kinds or `sourceRegister` |
| `source:<id>` | exact source entry/actors/purposes/audiences/hash; `revoked:true`; same-site `.txt`/`.md` only, no binary extraction or ambiguous path |
| `qualification:QUAL-...` | `result:INCONCLUSIVE`, expired finite UTC, explicit bindingHash; never PASS |
| `receipt:<id>` | exact non-PASS `approveSourceRegister` record, `readbackHash:null`; observedAt/actor/hash must come from operator input, not a generated approval |

The planner validates **shape and consistency**, not truth, issuer authenticity, actual IDs/permissions or source bytes. Even a structurally valid file remains unqualified. Do not copy tests as real records. Do not insert an expired placeholder over an existing key: all plans are create-only; existing records require separately governed exact-ETag maintenance, not this tool.

```powershell
# OFFLINE shape validation only, no output file by default.
.\backend\marketing-native\provisioning\ConvertTo-MarketingRecordPlan.ps1 `
  -InputPath 'C:\PRIVATE-OPERATOR-DIRECTORY\controlled-inputs.json' `
  -WriterPrincipalId $binding.WriterPrincipalId `
  -ExpectedWriterActorId 'ACTUAL-VERIFIED-WRITER-EMAIL'
# Add -WritePlan -PlanPath <new absolute private file> only to retain a DPAPI row plan.
```

Each planned row is `Title=lowercase SHA256(UTF8(exact siteUrl + LF + RecordKey))`, exact TenantScope, compact RecordJson and SHA256 of those exact UTF-8 JSON bytes; ExpectedVersion is null (create-only). Site strings/keys are not normalized. There is no tenant plan apply command. The existing single-writer/controller process must separately verify authority, serialized ownership, successful complete absence reads, key uniqueness, exact rows and readback before any separately approved record insertion. Native active records/approvals use that existing controlled process and the runtime validators, not relaxed bootstrap flags.

**`register:active`, retained register snapshots and PASS approval/qualification receipts are intentionally not fabricated or accepted by this bootstrap generator.** The real Marketing owner must supply the approved versioned register, authenticated approval receipt matching snapshot hash/reference/actor/current owner authority, revoked-source set and actual source permissions/ETags/content hashes. Runtime shape: `register:active` holds `{register, snapshotRef, evidence, revoked}`; its `receipt:<evidence.receiptId>` and `authority:<evidence.approvedByBindingRef>` must be genuine current controlled records. The absence of this evidence is a gate, not permission to turn test examples into approvals.

## Native gates — none completed here

1. Current controller authorization, actual writer connection and disjoint ordinary business personas; exact three-list schema/ACL/role native readback.
2. Real participant POST succeeds; all own/other Requests GET/edit/delete, Canonical reads/writes, Results list reads/writes, Author/Editor forgery and duplicate UUID attempts fail as specified. Verify unique keys, plain Note limits, real ETags, list thresholds and complete pagination. Never weaken the script to pass.
3. Actual private-result create → fresh author/source authorization → exact Author-only item Read grant → content/ACL readback; other participant and writer-as-participant denial.
4. Hosted helper registration/Save/compile/limits, OFF flow import/Save, exact approved connections/model, frozen 1600-token bound, secure business inputs/outputs/run history, provider/truncation/error handling and durable crash/recovery tests. No fabricated API binding IDs or new host.
5. Approved source/authority/register governance and current repeated retrieval/disclosure checks, including stale/revoked source, membership changes and historical replay.
6. **Every retention/revocation requirement in `RETENTION-COMMISSIONING.md`**, with policy owner, real enforcement and direct historical-result denial tests. No enablement until accepted; flags alone do not enforce it.

## Repeatable local tests

From this worktree's repository root on Windows:

```powershell
pwsh.exe -NoProfile -NonInteractive -File tests/provisioning/Run-ProvisioningTests.ps1 -Case apply
pwsh.exe -NoProfile -NonInteractive -File tests/provisioning/Run-BootstrapTests.ps1
pwsh.exe -NoProfile -NonInteractive -File tests/provisioning/Run-IndependentTests.ps1 -Case all
pwsh.exe -NoProfile -NonInteractive -File tests/provisioning/Check-NativeSurface.ps1
```

Use a **fresh process for each command**. Fake PnP disables module autoload, uses synthetic `.invalid` actors and in-memory state; only local DPAPI test receipts are real. The native surface check imports installed local PnP command metadata and inspects the context-classification method, but never obtains a connection or invokes a PnP API. Native command metadata compatibility is not hosted/tenant proof. See repository-root `evidence/provisioning/verification.json`, `evidence/provisioning/TDD.md` and `evidence/provisioning/HANDOFF.md` for actual execution evidence, counts and limitations.

For one captured WSL rerun, use `python3 tests/provisioning/verify.py --phase <new-run-name> --independent all`. It invokes the same Windows executable in separate bounded processes, stores actual stdout/stderr and source hashes, and refuses to overwrite a run directory. Do not publish the synthetic test receipts as tenant evidence. This command is local verification only, not a provisioner or deployment command.
