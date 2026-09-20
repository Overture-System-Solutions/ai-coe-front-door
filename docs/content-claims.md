# Content claims ledger

Every claim the front door makes that rests on something outside the committed page text: a verified
date, a truth state, a route whose proof comes from the tenant, an example item, or a default literal
the built bundle still carries. One row per claim, with what the pages may say until the claim is
proved. The AI CoE maintains the ledger per release; `src/provisioning/contentClaims.test.ts` keeps it
complete against `sharepoint/pages/pages.json` and the bundle: one row per `asOf` item, per `state`
field, per illustrative item, per route and per bundle default literal, every column filled, and no
row on the user plane in the prohibited state. Wording here follows the change engine's rule: forecast
value and tool availability are never converted into a production claim.

## Claim states

- `PROVED_NOW`: proved in the environment the page runs in, by the package or the same provisioning run;
  the pages may state it plainly.
- `ACCEPTED_DESIGN_NOT_LIVE`: the design is accepted and committed, the capability is not yet live; the
  pages may describe it only as something that is not yet available.
- `UNPROVED_OR_STALE`: not proved here, or proved once and not since; the pages show the closed state
  ("Needs access", "Awaiting source") and never the claim, until the parameter that proves it is set.
- `PROHIBITED`: may not be rendered at all; the user-plane lint refuses it and this ledger never keys a
  prohibited row to a user-plane page (see "Prohibited wording").

## Classes

- `illustrative`: an example item, labelled as such on the page; it may carry an `EXAMPLE-` id and a
  literal past date so freshness can be shown without a tenant fact. No illustrative item ships in
  1.0.0.12; the first is the Status case card of 1.0.0.13.
- `design`: a claim the committed content may make because the design guarantees it, such as an
  on-site route whose target page the same script provisions before it uploads the document.
- `binding`: a claim whose truth comes from a parameter (`sharepoint/pages/parameters.json`, never
  committed) or from a default literal in the built bundle, never from the committed content.

## Keys and planes

- `<page key>/<block type>[<block index>]/items[<item index>].<field>` names an item field in
  `pages.json` (`shared` for the footer); `routes/<route key>` a row of the route table;
  `bundle/<property>` a default literal in the bundle and the web part property that replaces it.
- A row's plane is its page's `plane` (user unless `operator`); route, shared and bundle rows are user
  plane. The observation date is the day the row was last checked against the repository, not a tenant
  fact.

## Ledger

| Key | Claim | Claim state | Class | Source | Owner | Observed | Permitted wording | Where |
|---|---|---|---|---|---|---|---|---|
| `routes/work` | "Start" opens the work destination in a new tab and the sentence never enters a URL | `UNPROVED_OR_STALE` | `binding` | `{Url:WorkCommandUrl}`, `{WorkCommandState}`, `{WorkCommandVerifiedDate}` and the tenant qualification receipt `{WorkCommandReceiptRef}`, all parameters | AI CoE (page owner sets the parameters after tenant proof) | 2026-09-20 | Closed until state, date and receipt are all set: "Needs access" and the guided request opens with the sentence filled in. Then "Available now" with the verified date; never "Available now" from committed content | Start here work command and tile 01 · Work, resolved by `resolveRoute` |
| `routes/assistant` | "Ask {AssistantName}" opens the approved assistant in a new tab | `UNPROVED_OR_STALE` | `binding` | `{Url:AssistantUrl}`, `{AssistantState}`, `{AssistantVerifiedDate}` and the tenant qualification receipt `{AssistantReceiptRef}`, all parameters | AI CoE (page owner sets the parameters after tenant proof) | 2026-09-20 | Closed until state, date and receipt are all set: "Needs access" with the guided request as fallback. Then "Available now" with the verified date | Start here status row, Status "What is running", the Learn and Requests links |
| `routes/guidedIntake` | The guided request page is available now | `PROVED_NOW` | `design` | `{Page:idea}`: the same script provisions the page before the document upload; `pagesDefinition.test.ts` checks every page link resolves | AI CoE | 2026-09-20 | "Use the guided request instead" with the "Available now" pill | The fallback of every closed route |
| `routes/improve` | The Requests page is available now | `PROVED_NOW` | `design` | `{Page:requests}`: provisioned by the same script; every page link checked | AI CoE | 2026-09-20 | "Start a request" with the "Available now" pill | Tile 02 · Improve on Start here |
| `routes/value` | The Status page is available now | `PROVED_NOW` | `design` | `{Page:status}`: provisioned by the same script; every page link checked | AI CoE | 2026-09-20 | "See what has been measured" with the "Available now" pill; the page itself says what is not measured | Tile 03 · Value on Start here |
| `startHere/tiles[2]/items[2].description` | Enterprise AI value is shown as measured, pending a baseline or not yet available | `ACCEPTED_DESIGN_NOT_LIVE` | `design` | Plan step 24 (the `kpi` block and the program measures list, release 1.0.0.14); until then Status carries "What is running" and "What is not running" only | AI CoE | 2026-09-20 | "What has been measured, what is pending a baseline, and what is not yet available." No number, adoption figure or time-saved claim without a measured baseline behind it | Tile 03 · Value on Start here |
| `startHere/statusRow[3]/items[0].asOf` | {AssistantName} answers from approved sources only and says when something is not established, as of a verified date | `UNPROVED_OR_STALE` | `binding` | `{AssistantVerifiedDate}` from an AI CoE check recorded in the receipt `{AssistantReceiptRef}`; freshness from the same date | AI CoE | 2026-09-20 | The text as written, with the freshness date from the parameter and the route pill: "Needs access" until the assistant route is proved, then "Available now" | Start here status row |
| `startHere/statusRow[3]/items[1].state` | Requests can be sent now; a person reads every request; there is no automated reply and no agreed response time yet | `PROVED_NOW` | `design` | The intake list and the five form pages ship with the package (feature list `AI CoE Pilot Intakes`); reading every request is the AI CoE's own commitment | AI CoE | 2026-09-20 | "Available now" with the text as written; never a response time, an automated acknowledgement or a triage state | Start here status row |
| `status/cards[1]/items[0].asOf` | What is running: the assistant grounded in approved sources, the prompts library with {PromptCount} records all in draft, and the Learn exercises, as of a verified date | `UNPROVED_OR_STALE` | `binding` | `{AssistantVerifiedDate}` and the receipt `{AssistantReceiptRef}` for the assistant; `{PromptCount}` and `{StatusDate}` read back by the page owner | AI CoE | 2026-09-20 | The card as written with its freshness date; the assistant line carries the route pill; the prompts stay "Draft — in review" and "not {OrganizationName} guidance" | Status page, first card |
| `bundle/governanceReference` | Review requests and the guidance export quote "<coeName> governance controls, version 1.1, August 26, 2026" | `UNPROVED_OR_STALE` | `binding` | The shipped literal in `src/webparts/aiCoeFrontDoor/branding/branding.ts` (a first-tenant policy version and date); replaced by the `governanceReference` property from `{GovernanceReference}` in plan step 11 | AI CoE policy owner | 2026-09-20 | Legacy view only, and only while the property is blank (parity with the shipped package). Page views render "<coeName> governance controls (reference not yet set)"; the script reports a blank `GovernanceReference` as AWAITING | Tool-check and team-usage review requests, the guidance export |
| `bundle/reviewSystemName` | Tool guidance and team-usage summaries name "TESS" as the review system that takes a request with manager endorsement | `UNPROVED_OR_STALE` | `binding` | The shipped literal in `src/webparts/aiCoeFrontDoor/services/toolPolicyEvaluator.ts` and `summaries/teamUsageSummary.ts`; replaced by the `reviewSystemName` property from `{ReviewSystemName}` in plan step 11 | AI CoE | 2026-09-20 | Legacy view only, and only while the property is blank (parity with the shipped package). Page views render "the review system" | Tool-check results and team-usage summaries |

## Prohibited wording

Prohibited claims are never rendered, so no user-plane row above carries `PROHIBITED`. The user-plane
lint in `src/provisioning/pagesDefinition.test.ts` refuses them in `pages.json` before they reach a
page:

- provider and product names in page text (the assistant and the chat tool are parameters);
- workflow and route codes in UPPER_SNAKE form, and the engineering words connected, connector, lease
  and automation level;
- hype: transform, unlock, revolutionise, best in class, fully autonomous, enterprise-wide, guaranteed,
  eliminates risk; invented adoption or return figures;
- freshness words (live, running, answering) in a text without a date, and literal dates outside an
  illustrative item;
- "Available now" committed on an off-site destination; availability off site is proved by the tenant
  qualification receipt named on the route row, never by content.
