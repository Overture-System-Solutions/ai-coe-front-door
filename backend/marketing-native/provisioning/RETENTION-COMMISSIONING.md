# Historical-result revocation and retention: mandatory commissioning gate

**Unqualified. No cleanup, retention job, permission revocation, purge or tenant/provider operation has been run or implemented here.** Configuration/checklist booleans and policy-reference metadata are not enforcement. Keep native Marketing OFF and frontend unbound until the current controller accepts a real scoped policy, enforcement route and evidence.

## Why a separate gate exists

A Results item receives a direct verified-Author Read assignment. Once granted, changing `member:<id>.enabled`, source revocation, register expiry, review state, flow OFF, requester group membership, or frontend navigation does **not** remove that historical item's Read assignment. Blocking a new Plan/replay is necessary but cannot undo earlier disclosure. Author-only does not mean author-only-while-current.

Canonical rows can retain provider responses, prompts/source-derived text, original intents, plans, revisions, approvals and receipts. Immutable Requests retain PayloadJson. An expired qualification record or a RetentionPolicyRef cannot erase any of these bytes. Hidden/NoCrawl are not revocation; disabled versioning is not a purge guarantee. Administrative access, preservation holds, recycle bins, backups, flow run history and copies already downloaded are separate concerns.

## Decisions the accountable owner must supply (no defaults invented)

1. A scope-bound policy reference, authenticated owner/current-controller authorization, actual site and exact three Marketing list GUIDs; explicit exclusion of CORE, existing intake, source libraries and other sites.
2. Which event revokes access: removal/disablement of member, source/register revocation or permission loss, authority expiry, artifact supersession, work/audience change, pilot termination. Define historical-read exceptions and their explicit current authority. Never silently treat a historical result as a fresh grant.
3. A finite, approved revocation response SLA and monitoring/escalation owner. If no approved native enforcement route can meet it, the pilot stays disabled. Do not invent a new scheduled writer/paid host to fill the gap.
4. Retention period/event and disposition per record class: Requests, Results, canonical artifacts and versions, raw provider checkpoints, source-derived snapshots, intents/plans, security/approval receipts, diagnostics and secured flow run history. State holds, investigations, export restrictions, deletion authority and which copies cannot be recalled. No implicit fixed days in this package.
5. The approved lifecycle enforcement process/tool, current controller/single-writer serialization, bounded reviewed scope, failed/incomplete pagination behavior, exact-version reconciliation, readback and audit evidence. **An empty process reference is a blocker.**
6. Accepted administrative-access model and access to the private DPAPI receipts; qualified use of a separate nonadministrative business persona. Avoid making the author also the administrator/controller/writer.

## Required commissioning exercises on a separately authorized test scope

Use at least two distinct existing nonadmin participant accounts A/B, plus the separately verified writer/controller. Do not fabricate actors or add membership automatically. Record exact IDs privately; publish only content-free evidence references.

- A submits a real immutable request. A cannot read/edit/delete even its own request or forge Author/Editor; B cannot either. Writer reads without changing Author/Editor/timestamps. Reject writer-authored requests.
- A's result is created privately. No A/B list grant exists. Just before disclosure, flow revalidates current member/work/review/source permissions and current register/owner authority, grants only A Read on the exact result item and verifies both content and ACL. B's direct REST result access fails. Writer remains the only other explicit assignment; no controller group, creator Full Control residue, inherited grant, sharing link or alternate principal.
- Create and retain historical A results across different request IDs, pages of results and source versions. Revoke each policy-defined cause in turn. Prove new dispatch/replay is denied **and** prove historical direct result URLs/REST reads as A are denied within the approved SLA. Removing requester group membership alone is not this proof.
- Inspect/verify the exact item role assignments as controller and attempt read again as the affected ordinary user. An admin's 200 response neither invalidates participant isolation nor proves revocation. Check no unintended link/group grants remain.
- Test source permission loss during awaited retrieval, immediately before provider dispatch, and immediately before result grant. Reject disclosure when authorization changes; do not count a check taken before the wait as a lease.
- Test complete enumeration, page continuation failure/403, unknown counts, duplicate RequestId, changed ACL/ETag, concurrent writer, mid-operation error and crash. Stop rather than skip an item or call a partial batch complete. Keep exact uncertain scope for reconciliation, never auto-replay an unknown provider or cleanup effect.
- Test the approved disposition route with the selected retention/hold cases. Verify exact intended records and lack of unintended deletions across all three lists and other stores. Confirm the real native behavior of recycle bins/holds/backups; do not claim hard erasure from an HTTP success. Author data previously exported cannot be reliably recalled by revoking SharePoint access.
- Record native service/flow run IDs and exact resource/version/scope, identities used, input-state/output-state hashes, observation times, policy owner acceptance and content-free failure details. Keep business inputs/outputs secure and do not create PASS by editing the supplied checklist.

## No broad cleanup action is authorized by this handoff

There is deliberately **no executable cleanup/apply command**. The Results writer role has ManagePermissions for its ordinary Author grant; it has no DeleteListItems. Canonical/Request service roles also do not receive deletion or lifecycle administration rights. Do not broaden them for cleanup.

If the existing controller later commissions a cleanup route, its separate reviewed design must:

- Be current-controller-authorized and scoped to explicit already-verified Marketing list GUIDs and exact item IDs/RequestIds/principals; no tenant/site-wide removal, wildcard IDs, default delete-all, inherited-ACL reset or mass membership change.
- Serialize with the sole canonical writer and stop or reconcile the original worker before touching its state. Retain an exact immutable reviewed plan and hash with actor/scope/expiry, per-item current ACL and ETag/identity observations, reason, policy/hold decision, precise operation and expected readback. A hash alone does not authenticate approval.
- Refuse drift or uncertain scope before any effect; bound item count and handle full pagination; never treat 403/404 or missing data as successful absence without the approved exact-read semantics.
- Distinguish **revoke an exact historical Author Read assignment** from **dispose of content**. Only the former changes immediate participant access; the latter requires separate retention/legal-hold authority. Never infer a deletion rule from a revoked member or an old Created timestamp.
- Read back exact targeted permissions/records after each effect and exercise the affected user's actual denial. Preserve uncertainty without claiming completion; use content-free, private audit receipts. Do not automatically retry or destructively roll back partial outcomes.

These are constraints for a later authorized design, not a runnable deletion recipe or a representation that lifecycle enforcement exists. Actual approved policy/enforcement and native tests remain a hard deployment gate.

## Gate completion and drift

The supplied `commissioning.template.json` has `retentionQualified:false`, `historicalResultRevocationTested:false`, `lifecycleEnforcementImplemented:false`, null retention/SLA fields and empty evidence references. Keep them false unless the existing governance process has genuine current scoped evidence and accepts the deployment binding. Neither this generator nor the fake-PnP suite issues that evidence. Retention is part of **security qualification before enabled=true**, not a post-launch to-do.

On group, writer, site/list, schema/role, source policy, flow/helper/connector/model, retention route or controller-authority changes, requalify the affected binding. Fail closed or suspend under the controller's policy rather than carrying forward a generic old PASS.
