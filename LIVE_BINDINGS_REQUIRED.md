# Native integration and activation gates — candidate 1.0.0.17

## Confirmed direction, not an executed deployment

Sam selected **OSS SharePoint CloudWaveDashboardDemo** for testing and designated **samuel.conrad@osscontact.com** as the authorized writer. The preserved OSS exports identify `https://osscontact.sharepoint.com/sites/CloudWaveDashboardDemo`; this is not CloudWave production. Verify the exact site/environment and authenticated permissions before any native write. Marketing must use an **approved Microsoft environment**; no separate Node host or paid infrastructure is assumed.

The final local correction build is **1.0.0.17** on `fix/coe-audit-server-drafts`. See [the current handoff](docs/RC2-SINGLE-WEBPART-HANDOFF.md) and [byte-bound verification](evidence/release-1.0.0.17/VERIFICATION.json). Earlier five-binding/1.0.0.16 wording is superseded: some remaining work is implementation, not configuration.

## Remaining implementation

1. **Marketing execution in Microsoft:** the tested `marketing-runtime-offline-0.1.1.zip` is a Node extension, not a Power Automate import. A compatible approved Microsoft execution/trigger/Claude-connector integration or a native port remains to be implemented and qualified. The existing idea-only draft flow must not be silently widened; keep working OSS exports intact.
2. **Legacy-to-CORE journey:** preserve existing IntakeId/CoEID values and verify their explicit association with the CORE-returned WorkID end to end. Optional LegacyRefs and mapping code do not alone prove an integrated native journey. Since 1.0.0.19 the front door shows a business case's LegacyRefs when the service returns them, but the native projection (`connector/Script.cs` `Projection`) does not return them yet, and nothing creates a business case from a request: the rule for which cases need one is undecided (two options are shown in Cases).
3. **Marketing provisioning:** its descriptor is not an installer. Actual private canonical/membership/source/review/request/result lists and their ACL/retention lifecycle require a scoped implementation/commissioning path under the approved writer.
4. **Monday.com:** no setup or integration has been implemented. Board, field, operation, synchronization and authority scope must be established first; preserve Monday/ARB governance.

## Native qualification and business inputs

- Bind approved Power Platform environment, SharePoint list/library GUIDs, connections and support/stop ownership. Selecting a test site is not proof these exist or are correct.
- CORE 3.0.0.1 uses transport **v0.2.0**. Register and qualify the separate pure integrity helper, bind its actual environment-assigned API name, then validate import/designer Save and exact request/result contracts. It preserves six workflow identities; importing updates can affect existing flows even when packaged OFF. Do not import blindly.
- Verify current source/register approvals, permitted data/provider scope, named reviewers, private authority/membership records and qualified policy references. Do not substitute synthetic fixtures or default an approver to Sam.
- Server drafts require a dedicated list, current access/retention qualification and native own-item isolation. The browser requires Web Locks for cross-tab coordination; no business-text browser fallback exists. Expiry checks are not a deletion/retention service. Commission retention of list versions and historical projections as well.
- The page and draft-list installers are locally tested; page apply remains additive and does not publish. Review encrypted prepared/applied receipts, controller groups and rollback steps first. Do not reuse synthetic DPAPI fixture receipts.
- Run two-account access tests and native concurrency/process-death/recovery tests. Confirm source revocation before replay/provider disclosure, current-version human review, saved-result readback and retained IDs. Offline models of SharePoint/WDL/provider behavior are not native acceptance.
- Keep Marketing sending, publishing, assignment and scheduling disabled. Existing legacy receipt/approval notifications are preserved working functionality, not removed by this boundary.

## Local verification boundary

Production suite: 1,154 tests across 120 suites passed. Additional source/runtime checks: 96 Node tests, 30 native CORE tests, 9 exact-Marketing-ZIP checks, 13 page-installer and 9 draft-installer assertions. These groups overlap and must not be summed as unique tests. Seven-role offline browser checks passed with no page errors or external requests. Non-blocking lint warnings and the three documented primary CORE PAC warnings remain visible.

No import, designer Save, live provider call, tenant permission change, deployment, commit or push was performed.
