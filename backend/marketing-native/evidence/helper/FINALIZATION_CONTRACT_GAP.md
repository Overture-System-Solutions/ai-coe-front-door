# Blocking result-token contract issue discovered during implementation

A new immutable `envelope:<id>:<revision>` does not have a service-observed ETag before it is created. Node public storeVersion = SHA256(canonical({key,revision,payloadHash,version:<actual ETag>})). The frozen flow currently retains `Plan.Result` before its writes, builds Projection from that retained result, and requires fresh Plan.Result to equal it. This cannot produce a truthful version token for a new artifact without guessing the service ETag.

Helper implementation will mark draft plans whose immutable row has not read back `FinalizeRequired:true`, with `Result.storeVersion:null`. Projection MUST refuse that provisional value. After writes, a fresh Plan using retained native-plan plus exact actual canonical readbacks can materialize the real storeVersion and return `FinalizeRequired:false` without generating a new revision. Parent flow/contract needs a finalization phase before building the private Projection and a durable final-result checkpoint. Do not relax token binding or guess `1`/`\"1\"`/`W/\"1\"`.

This is an explicit integration gate, not a claim the existing WDL already supports this phase. Helper stays content-free/fail-closed at Projection if the flow was not amended.
