# Business Marketing UI handoff

## Completed in this lane

- `AppMarketing.tsx` routes `marketing.mode === 'live'` only to the new `AppBusinessMarketingWorkspace`. The synthetic service workspace and service-free labelled demonstration remain separate; legacy synthetic tests are unchanged.
- Business entry gates before mounting service effects. Unresolved/non-Marketing membership produces zero case, registry, authority, recovery or working-draft calls.
- Case selection is a server-returned canonical Work ID list, not free text, client role claims or a synthetic fallback. No Work ID cache was added; reselect a listed case when reopening Marketing.
- Approved, non-fixture register entries are explicitly selected, with version/location and limitations displayed; revoked entries are excluded. Meeting drafting cites the selected registered source/version/location and sends `text: ''`; the business facade/backend owns source reread, never caller notes.
- Campaign brief, accepted-brief content plan and current-packet meeting follow-through call the business drafting facade. Returned identifiers/revisions are not rewritten. Saved draft results must match refreshed server records.
- Current-identity review requests and accept/request-changes/reject decisions use exact artifact/revision/hash and current store version. Decisions appear only for resolved reviewer capability plus a matching, non-synthetic, non-revoked, unexpired backend authority. No reviewer impersonation is called.
- Explicit **Save working draft** saves objective/audience/manual JSON and editing target through `useFrontDoor().services.draftStore`, verifies load readback and restores on case remount. Workflow key is `marketing-` plus 48 SHA-256 hex characters (below 64). This UI never persists business text to browser storage or constructs a browser fallback. Save before navigating away; unsubmitted edits are not autosaved. Source selections require fresh confirmation on reopening.
- Manual JSON editor supports new typed artifacts, provider-returned fallback and author corrections. All three strict parsers run before `saveManualDraft`; corrections carry the exact original `artifactId` and `expectedStoreVersion`. The server remains authoritative for sources, parent acceptance, stale revisions and manual provenance.
- `recoverPending(false)` runs on authorized mount. Uncertain draft/request/decision/manual outcomes block new mutations. Only explicit repair calls `recoverPending(true)`. Review-request recovery is not cast to a decision or sent through `review.reconcileAttempt`. No intent text is persisted by this UI; opaque retention is owned by the facade/transport.
- Synchronous operation locks stop overlapping clicks; case switching is disabled during operations. Account/site/resolution/service changes remount the scope; async continuations stop after unmount before issuing follow-up reads/writes.

## Exact interface expectations (backend lane)

These are now present in the shared `IMarketingServices` source and passed the no-emit check:

```ts
listWork?: () => Promise<string[]>;
saveManualDraft?: (
  session: IMarketingSession,
  request: {
    workId: string;
    kind: ArtifactKind;
    payload: unknown;
    sourceIds: string[];
    artifactId?: string;
    expectedStoreVersion?: string; // ALWAYS supplied by UI for a correction
  }
) => Promise<DraftResult>;
recoverPending?: (repair?: boolean) => Promise<{
  kind: 'none' | 'recovered' | 'pending'; message: string; intentKey?: string;
}>;
```

Missing listWork or recovery fails closed; missing manual saving is explicitly labelled not bound. The host must supply its qualified server-only draftStore for live mode (this lane does not own host composition). No browser provider/store calls are used.

## Verified evidence

Commands from the Windows-owned dependency worktree:

```text
node.exe evidence/business-ui/run-owned.cjs
node.exe evidence/business-ui/typecheck.cjs
```

- Source Jest: **19 tests passed, 2 suites passed, zero failures or skips**. `owned-results.json` is the full receipt. Includes existing synthetic tests, real route/no fixtures, selected case/source calls, three draft invocations, zero unauthorized calls, current reviewer and six rejected authority variants, review-request remount recovery, server draft seam save/readback/reload, manual correction/version/validation, provider fallback, absent work listing, double-click lock and no follow-up after unmount.
- Strict TypeScript **5.8.3** no-emit: **zero diagnostics**, owned Marketing sources/tests plus imported dependency graph; `typecheck.json`.
- Separate red/green receipts preserve initial missing-path failures and passing slices. The Jest transformer rejects TS syntax diagnostics. The final runner restricts discovery to `src`, avoiding duplicate backend package manifests.

Tests use in-memory facade/draftStore doubles and block network. These are UI/source-contract checks, not real tenant/provider execution or native package acceptance. No Heft/shared build, HTTP/provider call, tenant change, commit, publication, send, assignment or schedule was performed.

## Files owned here

- Modified `src/webparts/aiCoeFrontDoor/components/app/AppMarketing.tsx`
- Modified `src/webparts/aiCoeFrontDoor/components/app/AppMarketingWorkspace.tsx` (exports existing `ArtifactBody` only)
- Added `src/webparts/aiCoeFrontDoor/components/app/AppBusinessMarketingWorkspace.tsx`
- Added `src/webparts/aiCoeFrontDoor/components/app/AppBusinessMarketingWorkspace.test.tsx`
- Added `evidence/business-ui/` runner, no-emit checker, red/green/final results and this handoff.

Parent: rerun this source suite after merging the backend lane, then perform the separately authorized host/native/package and tenant acceptance work. No other lane's files were edited here.
