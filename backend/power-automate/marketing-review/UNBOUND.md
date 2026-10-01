# Marketing review / artifact persistence — unbound candidate

The five CORE operations do not save Marketing artifacts or record their reviews. This folder is a **candidate
extension**, not an accepted backend, not a sixth already-deployed endpoint, and not a competing store.

Live execution stays gated until:

1. The CORE owner accepts an artifact/review extension on the existing backend lane.
2. List/library GUIDs, connection identity and ACLs are bound.
3. `LIVE_BINDINGS_REQUIRED.md` items 2–4 are confirmed.

Local synthetic persistence is `PersistentSyntheticArtifactStore` (browser storage, `testRecord: true`).
`DisabledLiveArtifactStore` is what a real site receives.

`flow-template.json` is a shape only: no trigger URL, no connection, no environment. Do not import it.
The sibling `development/power-automate` tree is untouched.
