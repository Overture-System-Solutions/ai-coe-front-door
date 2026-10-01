# Marketing native runtime — operator starting point

**Local review candidate. Not registered, imported, enabled or qualified in Microsoft.** This adds Marketing to the existing working intake; it does not replace the Claude connector, idea-draft flow, governance chain or CORE release.

## What the two packages are

- `AICoEMarketingIntegrity_1_0_0_0_REGISTRATION_CANDIDATE.zip`: the pure C# script, OpenAPI descriptor and registration instructions. This is **custom-connector registration material, not a Power Automate solution ZIP**. The script performs no network I/O and does not store drafts or host Claude.
- `AICoEMarketingAutomation_1_0_0_0_UNBOUND_REVIEW_ONLY.zip`: the separately packaged **OFF** Power Automate solution. `UNBOUND_MARKETING_INTEGRITY` is an intentionally unresolved helper API identity. **Do not import this unbound review archive as a working integration.** Its emitted graph is the graph used by the offline integration tests; registration/binding and native Save remain the next controlled phase.

Power Automate owns SharePoint and Claude calls. SharePoint owns immutable requests, canonical records and private result projections. Claude drafts through the existing connector. Human review remains required. Nothing in this runtime sends, publishes externally, schedules Marketing, or configures Monday.com.

## Configuration sequence — later, separately authorized native phase

1. Have the current controller authorize the exact commissioning scope and window. The selected later destination is OSS **CloudWaveDashboardDemo**; Sam's writer designation is not an authenticated principal ID or a qualification receipt. Confirm the current writer through the approved controller route. Do not add a second writer or widen roles to make a test pass.
2. Review `connector/README.md` and register the helper separately in the approved environment. Enable its custom script for **Evaluate**, save, and test refusals with synthetic inputs. Confirm supported hosted APIs, size/time limits, connector licensing and DLP. Keep registration/authentication in Microsoft's UI; do not put credentials in files or chat. Record the **actual** runtime API name, Dataverse connector ID and logical/schema name from native readback. Do not derive one identifier from another.
3. Complete `connector-binding.template.json` with those verified identifiers and the existing SharePoint/Claude connection choices. Preserve the existing Claude API name literally. The local generator currently emits only unbound review packages: a separately reviewed binding pass must replace the helper API/logical metadata in the flow connection reference and the connector resource/nested Dataverse connector ID in solution XML, regenerate settings, and repeat PAC and exact-ZIP verification. Merely changing a connection-instance ID does not bind an unknown API.
4. Review `provisioning/README.md` and use its create-only dry-run. Apply only after the separately scoped controller approval. Existing-list differences, denied reads, identity/group drift, partial state or unexpected permissions require reconciliation; they are not permission to repair or delete. Preserve the exact receipts. The bootstrap planner accepts deliberately **inactive/unqualified** records; it does not issue business approvals or activate the runtime.
5. Bind only the exact server configuration fields: `enabled`, `siteUrl`, `canonicalListId`, `requestListId`, `resultListId`, `writerPrincipalId`, `readRoleDefinitionId`, `qualificationReceiptRef`, `provider`, `controllerQualified`, `securityQualified`. Keep all three boolean activation flags **false**. Operator annotations are not Config fields. Genuine qualified records must bind the exact canonical configuration/provider hashes, current people, Work IDs, sources, audiences/purposes, reviewers and policy—not synthetic fixture records.
6. Import the **newly bound OFF** flow under the existing authorized writer, select approved connections, reopen the native designer and Save. Verify the actual state; an update import can preserve a prior enabled state. Native Save is not established by PAC roundtrip. Verify secure inputs/outputs and no automatic retries on every business connector action.
7. Before any enablement, satisfy `NATIVE_GATES.md`, including historical-result revocation and retention enforcement. Use two distinct existing nonadmin business callers; the writer must not double as the participant. Test immutable requests, current source permissions, exact-version review, failure and recovery, and other-user denial. No real business data or paid provider test is implied by the local package.

## Privacy and recovery

Canonical records and Results lists must be service-private. A result is initially private, then freshly reauthorized, granted **Read** to its verified original Author, and checked by content/ACL readback. New artifact versions are finalized from actual immutable-row ETags before a result can be projected. Old projections are not automatically revoked by disabling membership or changing sources; retention and historical-grant revocation must be commissioned separately.

A crash holds the writer claim. The runtime never steals it after a timer. An unknown provider outcome is never automatically retried. An operator must establish that the original run ended and reconcile its exact records/ETags before releasing the same claim. After an Author grant already exists, the private-ACL gate intentionally holds replay; breaking inheritance is not revocation. See `ROLLBACK.md` for the stop/reconciliation boundary. A public return value is not proof of native acceptance.

## Evidence and source

The final delivery receipt is `VERIFICATION.json`. It must be produced by actual final-package verification, not by this guide. Detailed local evidence and reproducible tests live in the existing worktree at `backend/marketing-native/` and `evidence/provisioning/`. Tests use real generated WDL and the exact compiled production script with explicitly fake external SharePoint/provider boundaries; they do not use a Node host in the deployed path.

No secrets, tenant changes, live model calls, commits or pushes are part of this local delivery.

`NATIVE_SOURCE_SNAPSHOT.zip` preserves the authored native sources/tests for maintenance in the existing `development/overture-ai-coe-front-door-audit-fixes` worktree. It is not a standalone SDK installer or a substitute for the preserved CORE/Node/schema dependency inputs in that project. From that worktree, local repetition uses `python3 -B backend/marketing-native/tests/integration/verify_release.py --phase <new-unique-name>` after rebuilding the helper and OFF packages; the script refuses existing evidence directories and failed/nonzero-count verification.
