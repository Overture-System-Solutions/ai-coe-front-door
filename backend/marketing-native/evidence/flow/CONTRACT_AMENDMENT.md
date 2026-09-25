# Flow lane journal interoperability — private layout detail

No extra Evaluate mode or common payload key is introduced. The seven modes and PascalCase inputs in IMPLEMENTATION_CONTRACT.md remain authoritative.

Node-compatible stored values (RecordJson serialized/hashed only by InspectWrite):
- `writer:marketing`: `{status:"claimed",requestId,token:<RunId>,claimedAt}`; idle `{status:"idle",previousRequestId}`. Absent can be create-only claimed; a held claim never expires or automatically transfers.
- `command:<UUID>`: `{fingerprint,actorId,operation,payload,status:"pending",startedAt}`; completion adds `result` and sets `status:"completed"` only after VerifyProjection.
- `provider:<UUID>`: `{status:"pending",wireHash}` before invoking; `{status:"completed",wireHash,response:<raw actual Claude response>}` retained/read back before artifact planning. A pending existing row never triggers another call.
- New already-authorized key `native-plan:<UUID>`: `{status:"prepared",fingerprint,plan:<exact successful Plan response with Result and Writes>}`. Same bytes/readback precede applying writes. On verified projection plus verified command completion, retain fingerprint+plan and change only status to `completed`. This completion is also the queue's durable verified-publication receipt. No additional public-list fields.

## Helper/parent integration requirements

Preflight/Plan must validate the entire Records snapshot, including these private values. A Plan invoked after a retained native-plan must reauthorize original source/member/review context and return the original Result (not a newly generated revision). It must not manufacture completion from a prepared write plan; original Write readbacks and projection grants are flow-owned. During the one in-flight provider invocation the freshly persisted pending provider row is visible to the pre-dispatch Plan; Plan may authorize current wire, but the flow alone owns the no-retry decision. On process restart, an existing pending provider row refuses before invocation.

The flow provides ProviderResponse=null until there is an actual retained response. Common Now is fresh utcNow at each helper evaluation. The flow retains request Row from a service GET and compares subsequent service reads. The default Config.enabled/controllerQualified/securityQualified are all false. No writer==Author shortcut is allowed.

Source HttpRequest returns must be qualified as plain text body plus actual ETag header. Missing/wrapped/non-text bytes cannot be declared valid by the helper. All source permission and metadata observations are real HttpRequest actions. Before_Read_Allowed prevents retrieval without mask 33 and matching metadata ETag; helper Plan checks all after-read observations and content hash against a fresh canonical snapshot.

The parent's compiled-helper execution tests are still required; structural tests are not native execution proof.

## Resumed flow-lane clarification

The pre-disclosure private ACL must contain only the configured writer principal; an existing Author Read grant is not accepted as a private state. A crash after granting but before completion requires explicit operator reconciliation, including any necessary revocation; the flow does not assert that breaking already-unique inheritance removes grants. Flow-generated Now and CommandStart are UTC milliseconds (`utcNow('yyyy-MM-ddTHH:mm:ss.fffZ')`); immutable service-provided request timestamps remain untouched. See HELPER_INTEROP.md for the final-helper cross-boundary checks still owned by the parent.
