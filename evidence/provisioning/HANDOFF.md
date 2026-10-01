# Marketing provisioning/bootstrap — completed local lane

**Local implementation and verification complete; native commissioning remains UNQUALIFIED. No tenant was connected to or changed.** All edits are confined to `backend/marketing-native/provisioning/**`, `tests/provisioning/**` and `evidence/provisioning/**`. No frontend, C# helper, flow generator, original descriptor, commit or deployment was changed by this lane.

## Verified result

[verification.json](verification.json) records the final execution on Windows PowerShell **7.6.6**:

- Provisioning: **29/29** grouped checks.
- Bootstrap: **30/30** grouped checks.
- Independent fault injection: **26/26** scenarios.
- Local PnP.PowerShell **3.1.0** syntax/API metadata: **4 scripts / 33 command sites**, plus the installed context-classification method. No native API invocation.
- **85 passing grouped behavior-check executions**, zero failed. Counts overlap by safety behavior and do not represent native acceptance.
- **16 source files** pinned; all unchanged during the final run. The copied marketing.v1 descriptor remains byte-identical to the preserved original: **3 lists / 13 declared fields**.

Actual logs are in `final/`; [TDD.md](TDD.md) distinguishes confirmed RED→GREEN defects from harness-only failures. Earlier synthetic `.applied.json` receipts, including those produced while reproducing a defect, are historical fixture output—not tenant successes.

## Corrections retained

The original scripts/templates were preserved and hardened, not restarted. Provisioning now rejects safe-looking group membership/owner drift, changed custom role IDs, app-only/raw-token/unknown session classifications, wrong list URLs, late private rows and earlier-list schema drift before participant access. Receipt/template paths must be fully qualified; Windows drive-relative paths are rejected. The owned receipt helper was adapted and both source pins updated; the earlier one-page installer's helper is untouched.

The create-only boundary remains: three new isolated Marketing lists, at most three missing bounded custom permission levels, no existing-list repair, no membership/identity creation, no business rows, no automatic rollback and no enablement. Denied reads never imply absence. ReadSecurity/WriteSecurity stay 1; unique keys are retained. The requester gets only the bounded request-submit list role after private readback. Canonical and Results retain only the verified writer as an explicit list principal.

## Operator starting point

Open [the operator README](../../backend/marketing-native/provisioning/README.md) and [the retention/revocation gate](../../backend/marketing-native/provisioning/RETENTION-COMMISSIONING.md). They contain the exact offline and separately gated apply commands, current-controller prerequisites, failure reconciliation and bootstrap record restrictions.

1. Keep the native flow **OFF**, frontend **unbound**, and all supplied qualification flags **false**. Run default offline dry-runs or generate new local templates if needed.
2. Later selected test scope is **OSS CloudWaveDashboardDemo**; writer hint is **samuel.conrad@osscontact.com**. Neither establishes a principal ID, delegated connection, native permission, controller approval or successful test. Do not infer IDs from the hint.
3. Resolve actual existing identities/site/groups through the approved read-only controller route. Use the current writer/controller, or an already-existing site-admin/controller, for apply/readback. Do not elevate or add membership. Reserve an exclusive commissioning window and separately authorize the exact create-only list/role changes.
4. A **distinct ordinary business caller** is mandatory for writer-versus-requester tests; native cross-user isolation requires **two** existing nonadmin participants A/B. Never use Sam's writer/admin session as proof of ordinary caller access.
5. Stop with content-free read-only blocker evidence if authentication, capability or authority is unsupported. No new app/user/group, token collection, broader role or activation workaround is authorized.
6. Controlled input/schema validity is not approval. The planner only accepts disabled members, revoked/expired authorities and sources, INCONCLUSIVE qualifications and non-PASS register receipts. There is no tenant row-plan apply command, active register fabrication or real approval issuer here.
7. A failed/uncertain apply is not atomic rollback. Keep exact private receipts and IDs, stop, and obtain current-controller reconciliation. Never retry by picking new prefixes/names, resetting ACLs or deleting partial state.

## Mandatory native gates — not performed

- Existing delegated authentication, exact writer/current operator/controller authority and actual schema/ACL/role readback.
- Native request-only creation, own/other read/edit/delete denial, Author/Editor integrity, uniqueness/ETags/text limits/pagination and writer-authored-request denial.
- Real private-result creation, fresh source/member authorization, exact Author-only item Read assignment, content/ACL readback and second-user denial.
- Hosted helper/connector registration and Save, OFF flow import/Save, approved connections/model, secure run history, provider execution/truncation/failure and durable recovery.
- Genuine current source/register/authority/policy evidence. Bootstrap files do not issue it.
- **Historical projection revocation and retention lifecycle policy plus actual native enforcement/acceptance.** Turning off membership/the flow or revoking a source does not revoke an existing Results item Read grant. No retention schedule, cleanup authority, purge implementation or extra writer is invented. Keep activation blocked until this gate is accepted.

## Source identities

Full manifest: [source-hashes.json](source-hashes.json).

| Source | SHA-256 |
|---|---|
| New-MarketingLists.ps1 | `06bd5fe8176bb025fe46ea324078b5dd0ada4897b4ab547a83de46c6f1dd7d81` |
| New-MarketingBootstrap.ps1 | `1c73c9c416b12ca3125e6ccbf8a3e1c80c52d05090868cad1c47bf7ac680b5cf` |
| ConvertTo-MarketingRecordPlan.ps1 | `77f1e0cb9823295eee8b2f6c520a70208f1ef8a13d1714d5fbfb0d26924d6dd7` |
| ProvisioningReceipt.ps1 | `de862638c455939a7dfb634498fb5d1117ce3d1592b066dee11db0d93a98b48a` |
| Preserved and copied marketing.v1 descriptor | `690903876bf650bacaf33436620cf99ef26386a8c44748e9b31cae4df3ad6b25` |

Repeatable capture from WSL: `python3 tests/provisioning/verify.py --phase <new-name> --independent all`. Use a new phase; do not overwrite these receipts. The README also lists each standalone Windows test command.
