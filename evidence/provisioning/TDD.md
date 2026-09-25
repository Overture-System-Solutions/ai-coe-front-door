# Provisioning continuation: reproduced failures and final verification

## Evidence scope

The inherited files were resumed, not replaced. `resumed-baseline/verification.json` records the actual starting state: the inherited provisioning and bootstrap suites each passed 29 grouped checks, and the installed local PnP command-surface check passed. Earlier timeout-era failing runs were not silently described as passing or reconstructed from memory.

Final authoritative result: [verification.json](verification.json), actual stdout/stderr in [final/](final/), and [source-hashes.json](source-hashes.json). Windows PowerShell **7.6.6**, PnP.PowerShell **3.1.0** local metadata only. Final checks: **29 provisioning + 30 bootstrap + 26 independent = 85 grouped behavior-check executions**, zero failed. These are overlapping behavior checks, not 85 distinct defects or tenant tests. The separate native-surface check covers four scripts and 33 PnP command sites plus the installed context-classification method. No tenant/authentication/model call occurred.

## RED → GREEN changes

| Safety boundary | Observed RED evidence | Implemented correction | GREEN evidence |
|---|---|---|---|
| Safe-looking membership changes were not treated as drift; changes after the grant were not checked | `red-group-drift-confirmed`: both before/after-grant cases returned apparent success | Pin value-only group-owner/member/writer identity hash; compare before grant and before final success | `green-group-drift`; final independent cases |
| A user-shaped current-user read was the only delegated-session check | `red-context-authentication`: app-only and raw-token classifications reached apply | Check existing context settings type, accepting only AzureADInteractive/DeviceLogin; retain exact native current-user/controller/writer checks | `green-context-authentication`; final app-only/raw-token/unknown refusals and device success |
| Role ID comparison used mutable role objects | `red-readback-boundaries`: changed custom role ID passed | Snapshot numeric IDs at validation; compare later readbacks to those values | `green-role-identity` |
| Returned list URL was not checked | `red-readback-boundaries`: correct title/ID at wrong URL passed | Load/read exact RootFolder.ServerRelativeUrl against the fixed target URL | `green-list-url` |
| Final public-request phase skipped empty checks on Canonical/Results | `red-readback-boundaries`: a newly nonempty canonical list passed | Only Requests can be nonempty after the requester grant; private lists still refuse unexpected activity | `green-private-emptiness` |
| Earlier list schema could drift while later lists were created | `red-readback-boundaries`: final schema failure occurred only after the requester grant | Re-read all three private list schemas/ACLs before granting requester access | `green-readback-boundaries` |
| Windows drive-relative paths counted as rooted, but were not absolute | `red-absolute-receipt-confirmed`: path validator accepted `C:Windows\\...`; `red-absolute-template`: directory-creation sentinel reached | Use IsPathFullyQualified for receipts and template directories; update both exact receipt-helper pins | `final`: bootstrap relative-path guard and independent receipt guard pass |

The receipt path probe performed **validation only**, never a write to the drive-relative target. The bootstrap negative test intercepted directory creation before any effect. All generated test fixtures/receipts remain inside this lane's evidence directory.

## Harness failures are not implementation findings

- `red-group-drift` initially failed because a wrapper referenced PowerShell `$script:` state from the invoked script's scope. The harness was corrected to explicit process-local test state; only `red-group-drift-confirmed` establishes the product defect.
- `red-delegated-connection` probed coarse public connection labels. PnP 3.1.0 source review showed interactive login labelled Credentials/ClientIDCertificate, so those labels were **not** used as the production authentication gate. The reproduced `red-context-authentication` cases instead exercise the locally installed context-settings type API. Metadata compatibility does not authenticate a real session.
- `red-absolute-receipt` initially hit the already-existing parent-directory refusal. The confirmed reproduction selected an existing parent without writing to it.

Public version-bound reference used for the label distinction: https://raw.githubusercontent.com/pnp/powershell/v3.1.0/src/Commands/Base/PnPConnection.cs (`CreateWithInteractiveLogin`). Installed reflection verified the public static `Microsoft.SharePoint.Client.InternalClientContextExtensions.GetContextSettings(ClientRuntimeContext)` method and the delegated context enum values. No connection instance or secret was printed.

## Coverage and limits

The suites exercise the real scripts with process-local fake PnP boundaries, denied prerequisite reads, existing title/URL refusal, current operator/controller/writer checks, writer/requester overlap, group and role drift, own-read/own-write versus uniqueness, field types/required/indexes/plain Note readback, private empty-list checks, protected receipts, create-only reuse refusal and disabled/non-authorizing bootstrap shapes. Positive independent cases cover a delegated device session and a nonadmin provisioning controller who is also the verified writer; that writer remains distinct from the requester.

Every final source hash was unchanged during the final run. The exact preserved descriptor still has three lists and 13 declared fields. No schema or ACL guarantee was relaxed to get a fake test to pass.

A late failure can still leave a partial native change or requester grant. No automatic cleanup, rollback, revocation or role/membership repair is authorized or implemented. The exclusive controller window, native permission dependency behavior, two ordinary business users, hosted helper/flow/connector/provider acceptance, genuine source-policy approvals and historical projection/retention enforcement remain separate unqualified gates.
