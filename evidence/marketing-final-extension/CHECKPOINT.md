# Marketing final-extension checkpoint

Owned service/content/runtime changes are in progress; parent host/AppShell/CORE and UI sibling files are untouched.

- Re-read and preserved parent's durable opaque recovery implementation and four audit tests.
- Added runtime authorized `ListMarketingWorkV1` and content-only `SaveManualMarketingDraftV1` using the existing draft/repository/source/review pipeline, not a parallel writer.
- All three manual artifact kinds have executed successfully through the real dispatcher with explicitly fake external boundaries and zero provider calls; normal review requirements and downstream invalidation are exercised.
- Fixed a measured concurrency defect: distinct immutable SharePoint rows can share the same ETag, so public artifact `storeVersion` now binds exact revision/content/store token. Raw ETags remain confined to the store's CAS writes.
- Opaque manual mutation/recovery reference reuse across reload is exercised; original four recovery tests still pass.
- Added current-source/member checks before manual recovery commit. Revocation tests were observed failing first, then passed after the guard.
- API handoff: `API.md` in this directory. Payload editor must strip root server metadata; preserve verified exact parent/source references.

Pending before final: finish full-suite/no-emit validation, descriptor/package version 0.1.1, preserve historical archive, execute the final ZIP bytes, and record final hash/current-source receipt. Native host/trigger/tenant commissioning remains unbound; no native calls, sends, permission operations or commits were performed.
