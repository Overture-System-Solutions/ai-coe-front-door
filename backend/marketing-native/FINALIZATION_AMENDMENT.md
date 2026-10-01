# Parent-approved native final-result checkpoint amendment

The pure helper correctly cannot know a new immutable SharePoint row's real ETag until it has been written and read back. Preserve the Node public token rule; never guess an ETag.

The initial `Plan` may return `FinalizeRequired:true` with provisional `Result.storeVersion:null`. That result is private planning data, not a publishable success. `Projection` must refuse it. Existing successful read-only/failed results need no provisional token.

`FinalizeRequired` also remains true for every plan with outstanding writes, including review and repair operations that do not create a new artifact token. This lets an interrupted prepared review plan resume its same effects after an explicit operator release. Only complete actual readbacks clear that flag; a finalized plan with missing or conflicting writes is still rejected. Recorded-review replays must revalidate current reviewer/author role, authority, exact target version, required review kind, register and parent state before new disclosure, not merely source access.

After all planned writes are individually verified, the flow refreshes complete canonical records and calls `Plan` again. For a retained `native-plan:<UUID>` the helper must verify every retained Write against actual rows and recompute only service-dependent result fields (currently storeVersion) from those exact readbacks. No new ID, revision or provider call is permitted. It returns `FinalizeRequired:false` and the same logical plan with the finalized Result.

The flow persists/readbacks that finalized plan under the SAME native-plan key using the latest exact ETag, leaving its status `prepared` until publication. It rereads that plan before building Projection. Immediately before granting Author Read, the existing fresh-source/member/review acquisition remains mandatory; its Result must equal the finalized stored Result. Command completion, native-plan completion and writer release remain after verified projection/ACL readback.

The completed native-plan update must use the ETag from the finalized checkpoint, not the stale initial prepared ETag. An interrupted checkpoint is replayed through exact content readback, not regenerated. This is a necessary local contract repair, not native acceptance or a change to browser marketing.v1.
