# One-page Front Door: additive installer and draft-list preparation

**Local authoring/test artifacts only. No live site, tenant, ACL, import, connection or retention change is authorized by this work.** Both scripts default to offline dry-run and never authenticate. The existing sixteen-page definition and other provisioning scripts are untouched.

## Offline commands

From the repository root, with Windows PowerShell 7:

```powershell
pwsh.exe -NoProfile -File tests/audit-provisioning.ps1
pwsh.exe -NoProfile -File tests/audit-draft-provisioning.ps1
node.exe evidence/installer-audit/run-definition.cjs
```

Tests define process-local fake PnP functions and synthetic `.invalid` identities; DPAPI encryption/decryption is exercised on Windows. They do not import or invoke the real PnP module. Fake tests prove script behavior, not native tenant acceptance.

## Page operator contract (separate future authorization)

`New-FrontDoorAppPage.ps1 -DryRun -CheckBindings` lists binding names/states only, never values.

Apply requires **all** of `-ApplyToSite -ConfirmLiveApply -SiteUrl <explicit HTTPS site> -ReceiptPath <absolute private local filename prefix>` and an existing matching authenticated PnP connection. The receipt directory must already exist. Retain receipts on the same Windows user/machine; DPAPI recovery is not portable. Do not put real receipts or parameter files in Git, shared sync folders or public evidence directories.

- Creates a new page/section when absent, or adds/updates exactly one matching component. Never replaces navigation, uploads content, changes page ACLs, recycles/deletes a page or edits unrelated controls.
- Blank template bindings preserve existing configured values. A composite property with any missing binding (such as roleGroups) preserves the entire existing property rather than erasing configured roles. To intentionally clear an existing binding, use a separately reviewed edit, not the blank sample.
- New optional `DraftListId`, `DraftPolicyJson`, `CoreBindingJson`, `MarketingBindingJson` tokens are blank/disabled. Supplying JSON is not qualification. No script flips `qualified` or `enabled` to true.
- **Does not publish.** Publishing a shared page can publish somebody else's pending edits. Page-owner review/publication is a separate gate.
- Uses immutable `.prepared.json` before the first mutation and `.applied.json` only after readback, with config/content hashes and a DPAPI-sealed recovery payload. Plain metadata has no property values. An incomplete prepared receipt means reconcile manually; never blindly retry or overwrite it.
- Rollback requires `-Rollback -ConfirmLiveRollback -SiteUrl <same site> -ReceiptPath <same prefix>`. It decrypts the applied receipt, verifies the exact instance and component/property/position hashes, writes `.rollback-prepared.json`, restores the original property bag or removes only the new component, reads back, then writes `.rolled-back.json`. A newly created page/section is intentionally retained. Post-apply component drift is rejected.
- Use a single-writer maintenance window. PnP component commands do not offer an atomic compare-and-swap; hashes detect observed drift, not a distributed lock. Failure after a side effect may need controller reconciliation. Rollback never resets permissions or deletes lists/rows.

## Create-only server draft preparation (separate future authorization)

`New-FrontDoorDraftList.ps1` requires `-Apply -ConfirmCreateDraftList -ConfirmPrivateController -SiteUrl <site> -ControllerGroupId <id> -WriterGroupId <different id> -ReceiptPath <private prefix>`.

Groups must already exist; the script does not create groups or change memberships. Both use controller-managed membership; the controller group has private membership visibility. Nested/broad principals, overlapping controller/writer identities, ordinary site-admin writers and an operator outside the controller group are rejected. These direct-membership checks do not prove all effective tenant rights.

The script explicitly rejects **every existing AI CoE User Drafts list**, including a seemingly matching one. It does not silently reconcile, reset inheritance or broaden existing permissions. Read denials propagate, never become absence. Only the newly created list can be configured. One absent custom role may be added at site-collection scope; an existing role must match exactly or the script refuses.

Schema matches `services/serverDraftStore.ts`:

| Internal name | Type | Constraint |
|---|---|---|
| Title | Text | Indexed, **not unique** |
| WorkflowId | Text | Not unique |
| DraftJson | Note | Plain text, no append, not unique |
| IsCleared | Boolean | Not unique |
| RetentionPolicyRef | Text | Not unique |
| AccessPolicyRef | Text | Not unique |
| ExpiresAt | DateTime | Not unique |

No unique columns are allowed. ReadSecurity=2 / WriteSecurity=2. The newly created list breaks inheritance **without copying grants**, gives the private controller Full Control, removes only the creator's automatic direct grant, and grants the ordinary group the custom **Read + AddListItems + EditListItems** role. No ManageLists, OverrideListBehaviors, DeleteListItems or ManagePermissions for ordinary writers. Attachments and versioning are disabled; no business rows are written. Final schema, settings, role and list ACL readback are mandatory before an applied receipt. Failures retain the prepared receipt and leave the host unbound; do not run broad cleanup.

## Live gates that remain external

1. Named operator/site authority and the correct installed SPFx/PnP version; native command behavior and page save/publication reviewed in the single-writer window.
2. Independent ordinary accounts A/B: UI and REST own-read/write, cross-user read/update denial, duplicate-key handling, clear/expiry, native page apply/rollback and no bypass permission from other identities or site-admin status.
3. Approved retention policy, deletion/expiry enforcement (including historical versions, recycle/retention copies and audit requirements), controller ownership and recovery runbook. `ExpiresAt` alone does not delete records or constitute retention compliance.
4. Host `IServerDraftPolicy`: qualified, qualificationReceiptRef, retentionPolicyRef, accessPolicyRef, retentionDays and qualifiedUntil must come from accepted external commissioning. This installer always reports **qualified=false** and never creates that acceptance evidence.
5. CORE v0.2.0 and Marketing transport/workflow qualification, approved list bindings, reference receipts and test records remain separate from creating a draft list.

Official signature references checked: [Remove-PnPPageComponent](https://pnp.github.io/powershell/cmdlets/Remove-PnPPageComponent.html), [Get-PnPPageComponent](https://pnp.github.io/powershell/cmdlets/Get-PnPPageComponent.html), [Add-PnPRoleDefinition](https://pnp.github.io/powershell/cmdlets/Add-PnPRoleDefinition.html), [New-PnPList](https://pnp.github.io/powershell/cmdlets/New-PnPList.html), [Set-PnPList](https://pnp.github.io/powershell/cmdlets/Set-PnPList.html), [Set-PnPListPermission](https://pnp.github.io/powershell/cmdlets/Set-PnPListPermission.html), [Add-PnPFieldFromXml](https://pnp.github.io/powershell/cmdlets/Add-PnPFieldFromXml.html). Local fixtures are not an execution of these native commands.
