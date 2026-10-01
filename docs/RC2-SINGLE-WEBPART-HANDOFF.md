# RC2 single web part and Marketing plumbing — state of the branch

Branch `feature/rc2-single-webpart-marketing`, worktree
`development/overture-ai-coe-front-door-rc2-single-webpart`, base commit
`da5df6cc98fd2360a3779866470114f4508c8ec9` (`reference-alignment`, package 1.0.0.15).

Nothing here is deployed, imported, merged or pushed. No tenant was contacted. Committed HEAD remains
`b748e45c7eded09d518813fb5f2cb4cd749cbac7`. The uncommitted working tree packages **1.0.0.16**.

## Local implementation baseline (recorded 2026-09-21)

Seven decisions supplied by Brian as the baseline for local work on this branch. They govern what is built here.
They are **not** business approvals, and none of them binds a production identity, source or site. The immutable
RC2 and Marketing reference packages are unchanged and must stay so; these decisions live here, not there.

1. **The approved-source register is a controlled INPUT to each workflow.** Preparing and approving it is a
   pilot-preparation deliverable; retaining the approved snapshot is pilot evidence. Every run cites the register id
   and version and lists the sources actually used plus any evidence gaps. **Generated output can never approve a
   new source.** `09_SOURCE_REGISTER.md` records the activation package's own provenance and is explicitly *not*
   the runtime allowlist for Marketing business content. Until a real register is approved, this branch uses a
   separate, clearly labelled **synthetic fixture** register.

2. **The Marketing owner and the copy approver are unbound.** The reviewed package names neither. It assigns
   strategy and voice validation to the Marketing owner and copy and channel approval to Marketing/communications;
   those may be one person, and this branch does not assume it. No production identity is defaulted to Samuel,
   Brian, Jordan or Clay — routing a decision does not make someone the approver. Local tests use fictional,
   labelled reviewers. Real approval and routing stay blocked until the appropriate owner confirms identity and
   authority.

3. **Workflow 1's output definition for v1 is the playbook's list**: audience, pain points, message, channel plan,
   content calendar, evidence gaps, review needs. The quick start is supplementary guidance, not a replacement; its
   owners and dependencies are carried as optional proposed/planning fields that **must not create assignments**.
   Source citations and version/provenance metadata are preserved, and unknowns are represented explicitly. This is
   a local schema baseline and does not claim an approved machine-readable schema already existed.

4. **`contentCalendar` is one shared concept, two distinct versioned outputs.** Workflow 1 carries the high-level
   campaign schedule; workflow 2 elaborates it into asset- and channel-specific entries linked to the accepted
   brief's version, and must not silently overwrite that accepted brief. Entries use **relative weeks or phases**
   until an approved start date exists. Neither field creates an Outlook event or schedules publication.

5. **Initial generated-copy policy** is the campaign brief's message-house guidance plus the copy deck's
   prohibited-claims guidance. Avoided words: *transform*, *unlock*, *revolutionize/revolutionise*,
   *best in class*. Invented ROI or adoption figures and unsupported availability, security or capability claims are
   prohibited. **Passing a word check is not proof that a claim is true.** `docs/content-claims.md`'s additional
   restrictions stay scoped to the user interface and are not applied to schema keys, citations or technical
   documentation. Any further CloudWave brand or legal vocabulary policy is an explicit **pending input**.

6. **Site is unbound.** The first slice is local and fixture-backed. `CloudWaveDashboardDemo` is an existing OSS
   demo site, not CloudWave production; this branch neither creates a site nor assumes permission to deploy to that
   one. The live destination stays configurable and unbound until the existing controller or an authorized owner
   confirms site, environment and test scope, preferring an approved existing sandbox over provisioning another.

7. **Local work proceeds ahead of the real register**, using independent contracts, drafting adapters, review-flow
   definitions, simulated persistence and clearly labelled fixtures. This is **not** blanket approval of later
   numbered steps: any tenant binding, permission change, live test, flow activation or invitation remains gated.
   Fixtures must never be usable as production approvals, sources or identities, and every missing live dependency
   stays explicit with its live route failing closed.

## What is built and exercised

| Area | State | Evidence |
|---|---|---|
| Consolidated view (`view: app`), seven sections, rebuilt to the RC2 reference | Locally implemented and tested | `components/app/`, 11 shell tests, rendered in the offline preview |
| RC2 component kit (pill, panel, status card, metric, case card, steps, flow, layer, aside, buttons) | Locally implemented and tested | `components/app/kit/`, 17 tests |
| Seven extra palette keys so the reference colours arrive by configuration | Locally implemented and tested | `content/palette.ts`, README preset |
| The palette carried into the reused parts, so one page has one accent | Locally implemented and tested | `appShell.global.scss` theme bridge, `styles/palette.test.ts`, seen in the preview |
| The reused requests list given the kit's surface inside this view | Locally implemented and tested | `appShell.global.scss`, seen in the preview |
| Capability gate over the sections and their services | Locally implemented and tested | `services/authorization.ts`, 8 cases + 4 shell cases, proved in preview at three roles |
| Work identity mapping (tenant record key ↔ canonical Work ID) | Locally implemented and tested | `content/workIdentity.ts`, 7 cases |
| Idempotency key, payload hash, outcome classes | Locally implemented and tested | `content/actionEnvelope.ts`, 15 cases |
| Existing intake, my work, outcome record, telemetry, admin queue | Reused unchanged inside the new shell | shipped services, existing suites |
| Approved-source register contract + synthetic fixture | Locally implemented and tested | `content/marketing/sourceRegister.ts`, 5 cases |
| `CampaignBrief.v1` schema and validator | Locally implemented and tested | `content/marketing/campaignBrief.ts`, 10 cases |
| Generated-copy policy (avoided words, uncited figures) | Locally implemented and tested | `content/marketing/copyPolicy.ts`, 5 cases |
| Marketing drafting operations (brief, content plan, follow-through) | **Superseded 2026-09-22** — see completion matrix | synthetic workspace + labelled demo |
| Power Automate review flows for Marketing | **Still unbound** — template only, no tenant flow | `backend/power-automate/marketing-review/UNBOUND.md` |
| Runtime/connector boundary to CORE | **Superseded 2026-09-22** — Binding A client local; live writes gated | `services/core/`, `LIVE_BINDINGS_REQUIRED.md` |

## The three architectural decisions worth knowing

**The consolidation is of pages, not components.** The repository was already a single web part: one component id
with eleven toolbox entries, each presetting a different `view`. The work was to put the surfaces back into one
instance, not to merge components.

**`legacy` was not restyled.** `src/parity/journeys.parity.test.ts` plays six journeys through the shipped 1.0.0.7
bundle and the port side by side and compares every screen's text, every draft, every download name and every POST
body; `styles/cssParity.test.ts` refuses any rule added to or removed from the shipped stylesheets. The RC2 shell is
therefore a new `app` view with its own additive stylesheet. `legacy` keeps rendering exactly as it shipped, and
because `parseFrontDoorView` still falls back to `legacy`, every property bag written before this branch is
unaffected. What a *new* instance gets is decided by the first toolbox entry, which presets `app`.

**The prototype's colours are configuration, not code.** `styles/palette.test.ts` holds a list of the eight
reference-palette colours and fails the build if one appears in a stylesheet: they are an example tenant override.
The shell therefore reads `--fd-*` tokens with the front door's own shipped fallbacks, and a CloudWave tenant
reaches the prototype's navy/blue/cyan through the `Palette` provisioning parameter. This is a deliberate
difference from the demo and it is what keeps the view portable to another tenant.

That decision had a hole in it, found by looking at the rendered page rather than at the tests. The parts this view
reuses — the guided requests, the requests list, the usage strip, the operator dashboard — colour themselves from
the theme variables of the shipped bundle (`--color-*`), not from the palette tokens, so a site that set a palette
got a repainted shell wrapped around reused buttons in the shipped teal: one page, two accents. The view now points
those theme variables at the matching token for its own subtree, which is why `accentDark` and `accentSoft` exist —
a button needs a pressed and a tinted state, and the accent alone has no word for either. Seven of the twelve fall
back to the literal the variable already held; five (the muted ink, the page backing, and the three of an
information notice) fall back to the front door's own token instead, a deliberate small change reaching this view
alone. The shipped declarations and every legacy screen are untouched.

## The security consequence of consolidating, and what was done

Before this branch the protected surfaces were separate SharePoint pages and the item permissions the provisioning
script applies to those pages were the control. As internal sections that control is gone.

The bundle had no authorization of its own: the only permission read in the whole web part is one client-side
`manageWeb` hint, `requiredRole` only decided what was drawn, and every data service issued its REST call
unconditionally.

`services/authorization.ts` now names the roles each capability accepts, decides before a section mounts, and runs a
service call only when the capability is allowed — the test that matters asserts the call count stays zero on a
denial. It fails closed: while membership is unresolved every capability beyond `employee` is refused.

**This is defence in depth and must not be read as the boundary.** The client is under the user's control. Item-level
list security (`ReadSecurity 2`) and the page permissions the script applies remain the real control, and the
deciding two-account tenant test for them is still recorded as not performed.

## Completion matrix (2026-09-22, uncommitted 1.0.0.16)

| Item | Status | Evidence |
|---|---|---|
| §4a protected read before redirect | **Implemented and locally exercised** | `gatedServices.test.ts`, `AppShell.test.tsx` (employee Home card does not call `getMeasures`); preview employee: zero forbidden list fetches |
| Home command text round-trip | **Implemented and locally exercised** | `AppShell.test.tsx`; preview screenshot `10-home-command-roundtrip.png` |
| Marketing state survives navigation/reload | **Implemented and locally exercised** | synthetic `localStorage` adapter; preview `12-…` and `15-…`; `marketingServices.test.ts` |
| Runtime validators (citation `[{}]`, bad dates, extra identity keys, fixture relabelled approved) | **Implemented and locally exercised** | `marketing.test.ts`, `schemas.test.ts` |
| Bounded Marketing participant role | **Implemented and locally exercised** | `authorization.ts` / `authorization.test.ts`; `AppShell.test.tsx` |
| Support route or explicit unbound | **Implemented and locally exercised** | `AppShell.test.tsx` unbound vs configured href |
| One-page `view:app` definition | **Implemented; dry-run only** | `sharepoint/pages/one-page/`; `onePageDefinition.test.ts`. **Not executed** against a site (`-ApplyToSite` unused) |
| Binding A typed client/transport | **Implemented locally; live disabled** | `services/core/*`; `coreConformance.test.ts`, `coreWorkService.test.ts`, `commandKey.test.ts` |
| Versioned command-key adapter, fresh-read vs retry, §7a replay | **Implemented and locally exercised** | `commandKey.ts`; engine preserves `Created:true` |
| Pending/queued/processing/completed + bounded poll of same command | **Implemented**; preview completed in one turn | `localCoreEngine.ts`; screenshot `03-cases-completed.png` |
| Conformance vs generated flows | **Recorded** (green/amber/red) | `backend/core-compatibility/CONFORMANCE_MATRIX.md` |
| Contract amendment + correction package | **Recorded, not silently forked** | `CONTRACT_AMENDMENT_v0.1.2-proposal.md`, `correction-package/`, `regressions/native-defects.json` |
| Packet list/detail | **Extension only** | `packetProjection.ts`; `core-packet-list.v0.1-proposal` |
| Marketing envelope + CampaignBrief.v1 / ContentPlan.v1 / MeetingFollowThrough.v1 | **Implemented and locally exercised** | JSON Schemas under `content/marketing/schemas/`; runtime `schema.ts` |
| Source-register gate | **Implemented** | `sourceGate.ts`; fixture relabelled approved stays unusable |
| Three draft operations + durable review | **Implemented on synthetic persistent adapter** | `services/marketing/*`; preview accept + reload `BRIEF-MUCYGS7N-0001` |
| Labelled demonstration | **Implemented, separate mode** | `AppMarketing.tsx`; does not share the durable store |
| `npm test` / production build | **Locally exercised** | 1039 passed, 0 failed, 0 skipped, 113 suites |
| Package 1.0.0.16 + preserved IDs | **Locally exercised** | solution `f125ebdf-4a9d-4e6e-8479-3a18874e7752`, feature `69ab84b7-608c-47ee-9623-af8ebaf2cb10` v1.0.0.2, web part `cf2e5904-0703-4fe4-ae5a-ec012d6fa689` |
| Offline preview of current bundle | **Locally exercised** | port 4173; `evidence/preview-2026-09-22/` |
| Live CORE / tenant / Send / paid models | **Externally blocked** | `LIVE_BINDINGS_REQUIRED.md`; `SendEnabled=false` |
| Binding B / browser-visible SAS | **Not in scope** | baseline decision |
| OpenAI `demoDataOnly` off | **Not in scope** | stays on |
| Defaulting approvers to Samuel/Brian/Jordan/Clay | **Not in scope** | fictional labelled reviewers only |
| Whole-site QuickLaunch replacement / implicit `-Overwrite` | **Not in scope** | one-page script refuses both |

## What was not built as of 2026-09-21 (history)

The following paragraphs are the 2026-09-21 handoff. They are kept so the later local work can be compared with the earlier pause. They are **not** the current tree: schemas, drafting/review adapters and Binding A now exist locally; live CORE and Marketing business routes remain unbound.

**The three Marketing drafting operations (2026-09-21).** The existing model-connection service is idea-only and
synthetic-demo-only — one method `draftIdea`, `workflowId` hard-coded to `'idea'`, and `demoDataOnly: true` set as a
type-level literal on every request with no code path that can turn it off. The three operations need their own
versioned contracts, provider adapters and a real-data qualification gate. The contracts they would be built on
(work identity, payload hash, idempotency, outcome classes, consequential-action refusal) are in place; the
operations themselves are not.

A second reason that paused the 2026-09-21 work: the playbook defined each operation as four prose lines (input, output, human decision,
pass) with no field schema, no types and no citation format, and the quick start gave operation 1 a materially
different field list than the playbook does. Those local schema decisions are now recorded in `content/marketing/` (JSON Schema + runtime validators). The permitted-source list the three operations take as a **business** input still does not exist as an approved register; the branch uses a labelled synthetic fixture and refuses a relabelled-approved copy.

**The Power Automate review flows (2026-09-21).** Not authored. The existing artifacts are a useful reference but not a base: the
five-flow demo solution has never been imported or run in a tenant and hard-codes an OSS demo site and one mailbox
into all five flow definitions, which is exactly what the binding contract forbids.

**The CORE integration boundary (2026-09-21).** Left unbuilt on purpose. The CORE-001/002 review rejects both units on seven
reproduced defects, states plainly that the library is not the tenant deployment, and forbids creating a second
canonical store or writer or routing around the existing controller. Building an adapter now would have to guess
the corrected interface.

## Exact remaining live bindings (still unbound)

Local schemas, adapters and review protocol now exist; they do not satisfy these live gates:

1. An approved permitted-source register the three operations take as input. Owner: Brian / claims owner.
2. Named Marketing strategy/voice owner, copy/channel approver, and meeting/sender roles. Owner: business owner of those roles — not defaulted here.
3. The corrected native CORE ingress (unique Title + read-own, F01–F12) plus accepted contract version. Owner: Jordan, via the controller.
4. Tenant/site/environment, access groups, support/stop, retention. See `LIVE_BINDINGS_REQUIRED.md`.
5. The two-account tenant test for item-level list security, still not performed.

## Commands

```
npm ci
npm test            # 2026-09-22 uncommitted: 1039 passing, 0 failed, 0 skipped, 113 suites
npx heft build      # writes dist/ for the preview and the bundle tests
npm run preview     # offline host on 127.0.0.1:4173; pass the port as a positional if npm eats --port
npm run build       # production build and package
node scripts/verify-package.mjs --tests "…"  # npm run verify -- --tests is eaten by npm
```

The preview takes `--port`, which is worth using: a stale host will happily serve the previous bundle's HTML.
The reference-palette preset for `?palette=` is in the README under "Palette override".

## Baseline and new failures

At the base commit: 903 total, 0 failures. On the committed branch HEAD: **992 total, 0 failures**. Uncommitted 1.0.0.16: **1039 total, 0 failures, 0 skipped, 113 suites**. None weakened, none skipped.

Intentional expectation updates, all structural: twelve views rather than eleven, twelve toolbox entries, the new
default entry, the preview chooser, the property-pane dropdown, the six-file stylesheet list, the palette key list
and the token-read map.

One pre-existing lint warning at `src/provisioning/provisioningScript.test.ts:151` predates this branch.

## Verified in the offline preview

Mounted at `?view=app` with the reference palette, at a site owner's membership: seven tabs, the entry panel, the
three ways in, "What matters now" drawn from the resolved role, and the section heading taking focus on a change.

- **Every section opened.** Home, Cases, Engineering, Marketing, Improvement, Enterprise value, System map.
- **The Marketing journey walked end to end.** Campaign brief → drafting → draft, version 1 → waiting for review →
  changes requested (a fictional reviewer asking that an availability claim be held until it has an approved
  source) → redrafted → accepted → saved as `DEMO-BRIEF-002, version 2`. The content plan, refused until then
  because it needs an accepted brief, became available at exactly that point. Every screen carried
  **Demo — no live actions**.
- **The guided request opens inside the same instance**, with no page load, and its primary button now resolves to
  the tenant accent (`rgb(8, 120, 209)`) rather than the shipped teal.
- **The gate at three roles.** An employee sees four tabs, a leader five (Enterprise value appears, System map does
  not), a site owner all seven.
- **Keyboard.** Arrow keys move along the tab list and wrap, Home and End jump to the ends, focus follows the
  selection, and exactly one tab is in the tab order.
- **Responsive.** At 1050 the entry panel's two columns become one; at 720 the choices, starters and measures
  become one column and the pinned nav goes static; at 400 the chips and tabs wrap to two rows with no horizontal
  overflow of the document (`scrollWidth` equals `clientWidth`).
- **Reduced motion** is already honoured by the shipped theme sheet, which turns off the 120ms colour transition on
  everything inside `.overture-app` under `prefers-reduced-motion: reduce`. This view adds no animation of its own,
  so there is nothing further to disable. The block in `appShell.global.scss` that names two buttons is therefore
  redundant rather than load-bearing.

These are local, mock-backed results against a simulated host. They are not tenant acceptance.

## Known rough edges in this view

Honest list, none of them blocking, none of them hidden:

1. `AppMarketing.tsx` draws its own `.ai-app-panel` surfaces instead of the kit's `.ai-app-surface`. It matches
   visually; it is not literally sharing the components.
2. Reused components emit their own `h2` inside a section the shell has already headed with an `h2`, so on Cases
   and System map the document outline goes `h2 → h3 → h2`. Correcting it means retagging shipped components,
   which the parity suites pin, so it is left alone and recorded here.
3. The usage strip keeps colours of its own and does not follow the palette bridge.
