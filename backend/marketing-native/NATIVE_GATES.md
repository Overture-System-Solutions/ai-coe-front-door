# Native commissioning gates — all unperformed

These gates separate local implementation/testing from registration, configuration and live acceptance. None is satisfied by PAC pack/unpack, a C# test shim, a synthetic fixture receipt, a template value or Sam's writer designation alone.

| Gate | Required evidence before activation |
|---|---|
| Current authority | Existing controller approves exact environment/site, artifacts, operator, writer, actions and commissioning window. No inferred new app, group, user or permission authority. |
| Helper runtime | Separate registration, actual API/Dataverse/schema identities, Evaluate custom code enabled, native Save and bounded execution with supported C#/.NET APIs. DLP/licensing and payload/size/time limits checked in that environment. |
| Flow binding | Actual helper identity and existing Claude connection are represented consistently in workflow JSON, native connection-reference XML and deployment settings; exact bound ZIP is PAC-verified and the imported OFF flow opens and Saves. |
| Authentication | Approved existing delegated writer connection; actual principal matches writerPrincipalId. No copied cookies, tokens in files, broad consent workaround or participant/writer self-test. |
| SharePoint schema | Exact isolated three-list contract, types/limits/unique keys and exact row readback, not a successful POST alone. Denied reads do not prove absence. |
| Privacy | Canonical and Results service-private; Requests submit-only; immutable verified Author/Editor; two existing ordinary participants cannot read/edit/delete each other's requests or private state. Exact Author Read grant and unexpected-grant rejection demonstrated. |
| Sources | Genuine approved same-site plain-text source registry/receipt, current permission masks, metadata and body ETags/hash, source owner authority, purpose/audience and freshness. Binary/HTML/file wrappers fail rather than being treated as extracted plain text. |
| Business authority | Current member Work IDs and roles, human reviewer identity/authority, retention and access policies, provider/config qualification hashes. Bootstrap disabled records and test fixtures are not approvals. |
| Provider | Existing Claude connector and approved model support exact structured-output fields, max_tokens=1600, stream=false and thinking=disabled. Real bounded synthetic draft, refusal/truncation/timeout behavior, usage/cost and secure history are verified. No automatic retry of an uncertain paid call. |
| Durable workflow | Same Work ID/actor, current source checks before provider and new disclosure, immutable revision-bound public version, real readback receipts, exact-version review, stale-parent/revoked-source refusal, operation-specific recovery and held-writer reconciliation. |
| Retention/revocation | Approved retention/access rules and actual enforcement for historical result item grants, source/provider text, canonical history and request/result rows. Turning the flow/member off is not revocation of an existing item grant. See provisioning/RETENTION-COMMISSIONING.md. |
| Human acceptance | Distinct author/reviewer journeys, truthful pending/failed states, no cross-user disclosure, no duplicate effects after reload/retry and verified UI readback using the exact compatible frontend/configuration. |

The supplied packages remain OFF/unbound/unqualified. Completing these local packages does not implement Monday.com, change the working intake chain, or authorize Marketing sending, publication, assignment or scheduling.
