# RC2 single web part and Marketing plumbing — state of the branch

Branch `feature/rc2-single-webpart-marketing`, worktree
`development/overture-ai-coe-front-door-rc2-single-webpart`, base commit
`da5df6cc98fd2360a3779866470114f4508c8ec9` (`reference-alignment`, package 1.0.0.15).

Nothing here is deployed, imported, merged or pushed. No tenant was contacted. The package version is unchanged.

## What is built and exercised

| Area | State | Evidence |
|---|---|---|
| Consolidated view (`view: app`) with six internal sections | Locally implemented and tested | `components/app/`, 934 tests, rendered in the offline preview |
| Capability gate over the sections and their services | Locally implemented and tested | `services/authorization.ts`, 8 cases, proved in preview at three roles |
| Work identity mapping (tenant record key ↔ canonical Work ID) | Locally implemented and tested | `content/workIdentity.ts`, 7 cases |
| Idempotency key, payload hash, outcome classes | Locally implemented and tested | `content/actionEnvelope.ts`, 15 cases |
| Existing intake, my work, outcome record, telemetry, admin queue | Reused unchanged inside the new shell | shipped services, existing suites |
| Marketing drafting operations (brief, content plan, follow-through) | **Not built** | see below |
| Power Automate review flows for Marketing | **Not built** | see below |
| Runtime/connector boundary to CORE | **Not built** | see below |

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

## What is not built, and why

**The three Marketing drafting operations.** The existing model-connection service is idea-only and
synthetic-demo-only — one method `draftIdea`, `workflowId` hard-coded to `'idea'`, and `demoDataOnly: true` set as a
type-level literal on every request with no code path that can turn it off. The three operations need their own
versioned contracts, provider adapters and a real-data qualification gate. The contracts they would be built on
(work identity, payload hash, idempotency, outcome classes, consequential-action refusal) are in place; the
operations themselves are not.

A second reason to pause: the playbook defines each operation as four prose lines (input, output, human decision,
pass) with no field schema, no types and no citation format, and the quick start gives operation 1 a materially
different field list than the playbook does. The permitted-source list all three require as input does not exist
anywhere in the package. Those are decisions for Samuel and Brian, not for an implementer to invent.

**The Power Automate review flows.** Not authored. The existing artifacts are a useful reference but not a base: the
five-flow demo solution has never been imported or run in a tenant and hard-codes an OSS demo site and one mailbox
into all five flow definitions, which is exactly what the binding contract forbids.

**The CORE integration boundary.** Left unbuilt on purpose. The CORE-001/002 review rejects both units on seven
reproduced defects, states plainly that the library is not the tenant deployment, and forbids creating a second
canonical store or writer or routing around the existing controller. Building an adapter now would have to guess
the corrected interface.

## Exact remaining bindings and dependencies

1. A field schema for each Marketing output, and the reconciled field list for operation 1. Owner: Samuel/Brian.
2. The permitted-source register the three operations take as input. Owner: Brian.
3. The corrected CORE interface, or an explicit decision to integrate through the controller as a bounded work
   request. Owner: Jordan, via the controller.
4. Tenant bindings: all 20 in `16_DEPLOYMENT_BINDINGS` are `null` and awaiting source, qualification, approval or an
   owner. None may be fabricated.
5. The two-account tenant test for item-level list security, still not performed.

## Commands

```
npm ci
npm test            # 934 passing, 0 failures; one pre-existing lint warning
npx heft build      # writes dist/ for the preview and the bundle tests
npm run preview     # offline host on 127.0.0.1:4173; ?view=app&role=employee|leader|operator
npm run build       # production build and package
npm run verify      # package verifier
```

## Baseline and new failures

Baseline in this worktree before any change: 934 total, 0 failures — recorded as 903 at the base commit, plus the 31
added here. No test was weakened. Intentional expectation updates, all structural: twelve views rather than eleven,
twelve toolbox entries, the new default entry, the preview chooser, the property-pane dropdown, and the six-file
stylesheet list.

One pre-existing lint warning at `src/provisioning/provisioningScript.test.ts:151` predates this branch.

## Verified in the offline preview

Mounted at `?view=app`: six tabs, the entry panel, the three choices, the section heading taking focus on a change.
The guided idea request opens inside the same instance with no page load. The gate was exercised at three roles —
an employee sees four tabs, a leader five (Enterprise value appears, System map does not), a site owner all six.
Selected-tab background resolves to the accent token `rgb(8, 127, 131)`, cards to a three-column grid.

These are local, mock-backed results against a simulated host. They are not tenant acceptance.
