# Marketing extension API — UI integration contract

The additive protocol stays `marketing.v1`. Candidate package will be `0.1.1`; `0.1.0` remains historical.

```ts
listWork?: () => Promise<string[]>;
saveManualDraft?: (session: IMarketingSession, request: {
  workId: string;
  kind: ArtifactKind;
  payload: unknown;
  sourceIds: string[];
  artifactId?: string;
  expectedStoreVersion?: string;
}) => Promise<DraftResult>;
```

`ListMarketingWorkV1` accepts `{}` only. It returns sorted unique canonical IDs from the verified current Author's private enabled `member.workIds` (bounded at 500). It never scans other members or discloses another user's IDs.

`SaveManualMarketingDraftV1` uses the existing artifact schema, source gate, immutable repository, receipts and review pipeline. `payload` is **content-only**: remove these root fields from a displayed envelope payload when opening the editor: `schemaVersion`, `workId`, `briefId`, `planId`, `followThroughId`, `registerId`, `registerVersion`, `createdAt`. The server refuses supplied metadata rather than silently ignoring it. It derives these fields anew. No state, actor, permissions, envelope, provenance, receipt or accepted decision can be submitted.

Keep exact **parent references** (`acceptedBrief` for a content plan, `campaignPacket` for follow-through) and version-pinned source references in the content. They are verified, not treated as grants. Approval requirement `authorityBindingRef` must remain null; it is not an authority selector. Content-group IDs (asset/proposal/requirement IDs) remain part of the strict artifact schema. For new plans/follow-through, scope requirements to those content groups, not a made-up server artifact ID.

For an existing artifact pass both `artifactId` and the exact most-recent server `storeVersion`; this token is opaque and revision-bound. Do not infer or edit it. New drafts omit both. Manual save returns normal `DraftResult`, with provenance `manual / human / none`, no provider qualification, and no inferred acceptance. All normal review kinds still apply.

Do not persist business editor text or server artifacts in browser storage. The existing durable opaque recovery reference must be stored before mutation dispatch. Both automatic drafts and manual saves are draft-class recovery operations. `recoverPending(false)` polls retained IDs; `true` may create only one same-root bounded recovery command. Only validated facade acknowledgments clear the retained reference.

This document is the UI handoff, not a claim of a commissioned native binding. Native trigger, approved existing Node-capable canonical-writer host/connector bridge and tenant qualification remain separately gated.
