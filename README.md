# AI CoE Front Door — SharePoint Framework web part

A SharePoint Framework (SPFx 1.23.2, React 17, TypeScript) web part that gives an AI Center of Excellence a governed
front door: five guided intake workflows (idea, tool or task check, team AI-use disclosure, help or training,
feedback), a telemetry snapshot and an administrator dashboard, all writing to SharePoint lists.

This project is the maintainable source for the web part that shipped as package **1.0.0.7** (`original/`). The
shipped package was reverse-engineered (see `docs/RECOVERY.md`) and then ported to idiomatic TypeScript with a
test-first approach. It builds the next in-place upgrade, **1.0.0.12**, with the same solution, feature and web part
identities, and it is tenant neutral: the organization name is a web part property. Since 1.0.0.10 the front door can
also be spread over several native pages, one piece per page, since 1.0.0.11 it renders whole content pages from a
document in Site Assets, in its own style (see "Lay out the front door across pages"), and since 1.0.0.12 the first
screen tells the truth: one work command, a route table that fails closed, a shared support footer, and a recorded
answer to what a move to another tenant would throw away (see "Rebind to another tenant").

## Work with it

Use Node.js 22.14 or newer (below 23) and npm.

    npm ci
    npm test
    npm run build
    npm run preview

- `npm test` runs `heft test`: the Tailwind step, Sass, TypeScript, ESLint, webpack and Jest.
- `npm run build` runs the production build and writes `sharepoint/solution/overture-ai-coe-front-door.sppkg`.
- `npm run preview` serves an offline preview of the last build at http://127.0.0.1:4173 against a simulated
  SharePoint host (fictional user, in-memory lists, external network blocked). Add `?organization=Contoso` or use the
  banner's field to try the branding property; `?provider=openai` or `?provider=both` (or the banner's selector) tries
  the telemetry modes against seeded sample usage rows; `?view=home` (or any other piece, see below) shows one piece,
  with its links pointing back at the preview, `?page=learn` (or the banner's page selector) a content page from a
  simulated Site Assets document, `?layout=narrow` the narrow layout, and `?width=560` caps the mount so a section
  column can be eyeballed. `npm run preview -- --port 4174` changes the port;
  `npm run preview -- --bundle <path>` previews another bundle, for example the shipped one under
  `recovered/package/ClientSideAssets/`.
- `npm start` runs `heft start` for the SharePoint hosted workbench (requires a tenant; not needed for local work).
- `npm run verify -- --tests "<summary of the test run>"` checks the package the build wrote (identity, version, the
  shipped list schemas byte for byte, the bundle's data contracts, no word of the tenant list anywhere in the
  archive, every dependency pinned exactly) and writes `evidence/port-verification.json` and
  `evidence/dependency-inventory.json` (one row per runtime component of `package-lock.json`, with the sixteen
  inventory fields; what the lock file cannot say reads `AWAITING_TENANT_INVENTORY` until the tenant inventory
  fills it). Both files are committed with each release.

## Deploy 1.0.0.12

Upload `sharepoint/solution/overture-ai-coe-front-door.sppkg` to the app catalog as an update of the existing app.
The solution id (`f125ebdf-4a9d-4e6e-8479-3a18874e7752`), feature id (`69ab84b7-608c-47ee-9623-af8ebaf2cb10`,
version 1.0.0.2) and web part id (`cf2e5904-0703-4fe4-ae5a-ec012d6fa689`) are unchanged, so the three provisioned
lists (AI CoE Pilot Intakes and its two schemas under `sharepoint/assets/`) are left untouched; 1.0.0.12 changes no
list, column or permission. The other four lists the web part reads (AI CoE Use Cases, AI CoE Decisions, AI Usage
Daily, AI CoE Incidents) are provisioned by the companion Power Automate solutions, exactly as before.

After deployment, open the web part's property pane and set **Branding → Organization name**; **Governance
reference** and **Review system name** may stay blank (see "Branding"). The **Telemetry → Usage metrics provider**
dropdown defaults to Claude (see below). Existing instances keep rendering the whole front door on one page: the
**Page layout → Piece shown on this page** dropdown defaults to that, and the page properties are ignored until
another piece is chosen. Then apply the page definition (see "Applying it"): on a site that already carries the
1.0.0.11 pages the script runs without `-Overwrite` first, and the tenant acceptance for this release is to submit
the work command with every URL blank and see the idea wizard resume the sentence, tab through Start here and see
the focus rings, open a form page and see the support footer below the wizard, and confirm the property pane has no
provider-named draft-flow label.

### Rollback

Redeploy the 1.0.0.11 package from that release's build and rerun that version's `New-FrontDoorPages.ps1`: the
content document is rewritten from that version's `pages.json` (Site Assets keeps every version, so the 1.0.0.12
document stays in its history), the older bundle ignores the two Branding properties it does not know, and because
1.0.0.12 changes no list, column or permission there is nothing else to revert. Pages are additive: a page created
by a later run remains until an owner removes it.

### Enable AI drafting of idea summaries

The idea workflow can ask a Power Automate flow (the organization's AI draft flow, behind its own model connector)
for the summary draft. The browser never holds a model key: the web part calls the flow's HTTP
trigger with a Microsoft Entra token for the Power Automate service, issued by the framework for the signed-in user.
Three one-time steps, all outside this repository:

1. In the flow, set the trigger's **Who can trigger the flow** to **Any user in my tenant** (it ships restricted to
   one user). Copy the trigger URL after saving.
2. In the SharePoint admin center, **API access** page, approve the pending request from this package:
   **Microsoft Flow Service / User**. If the page reports that scope as unavailable on your tenant, change the
   `scope` in `config/package-solution.json` to a delegated permission the tenant exposes (for example
   `Flows.Read.All`), rebuild and re-upload; the flow only checks the token's audience and the caller's identity.
3. In the web part's property pane, **AI drafting → AI draft flow URL**, paste the trigger URL (the script sets it
   on the idea page from `-DraftServiceUrl` or the `DraftServiceUrl` parameter).

Leave the URL blank to keep the deterministic summaries; the behaviour is then identical to 1.0.0.7. When the flow
cannot answer (not configured yet, permission not approved, flow off, invalid input, or the model call failing), the
visitor sees the shipped choice: "Try again" or "Continue without AI help", which uses the plain summary. AI-drafted
submissions carry a `draftSource` object in `PayloadJson` (provider, model, responseId, requestId, draftOnly,
humanReviewRequired); records built without the flow are unchanged. `npm run preview` can simulate the flow with the
banner's checkbox (it only echoes the answers; no model is called).

### Usage telemetry

The "AI operations snapshot" strip on the landing page reads the **AI Usage Daily** and **AI CoE Incidents** lists.
Usage rows carry a `Provider` column (`anthropic` or `openai`; blank rows count as `openai`, the shipped assumption)
and a `MetricType` of `cost` (daily `Amount` in USD) or `completions` (daily `Requests`, `InputTokens`,
`OutputTokens`, optionally per `Model`). The service sums each provider over the current and previous UTC month; the
**Usage metrics provider** property only decides which tiles are shown:

| Mode | Tiles | Alerts panel wording |
|---|---|---|
| Claude (default) | Claude API spend, Claude API tokens (input + output), Claude output tokens, Open CoE alerts | AI CoE alerts and usage overages |
| OpenAI (as shipped in 1.0.0.7) | OpenAI API spend, requests, tokens, Open CoE alerts, exactly as 1.0.0.7 rendered them | AI CoE alerts and ChatGPT / Work overages |
| Claude and OpenAI | Both sets, Claude first, then Open CoE alerts | AI CoE alerts and usage overages |

Anthropic's usage report has no request counts, so the Claude set shows output tokens where the OpenAI set shows
requests. A provider without rows keeps showing "Awaiting data". Nothing in the web part calls a model provider: the
rows are written by the companion Power Automate solution
`development/power-automate/OSS_AI_CoE_Claude_Telemetry_1.0.0.0` (Anthropic Admin API usage and cost reports,
every six hours), which also opens a `Cost` incident with `Provider` `anthropic` when month-to-date spend exceeds the
`ClaudeMonthlyBudgetUsd` row of the **AI CoE Configuration** list and resolves it when spend is back under budget.
That incident appears in the alerts panel like any other open incident. Switching the property never refetches; the
mode is a presentation choice.

## Branding

Everything organization-specific is derived from the `organizationName` property (`branding/branding.ts`). With the
value `Overture` the web part reproduces the 1.0.0.7 wording verbatim; blank keeps the wording neutral.

| Where | Value set (`Contoso`) | Blank |
|---|---|---|
| Workflow header (legacy view) | Contoso AI CoE Lab | AI CoE Lab |
| Header of a wizard page view (since 1.0.0.12) | Contoso AI CoE | AI CoE |
| Hero badge | CONTOSO AI COE | AI COE |
| Downloaded summaries, first line | Contoso AI CoE — *workflow title* | AI CoE — *workflow title* |
| Policy reference on review requests | Contoso AI CoE governance controls, version 1.1, August 26, 2026 | AI CoE governance controls, … |
| Company-information help text | …includes Contoso, client, partner, and internal work information… | …includes company, client, partner, and internal work information… |
| External-sharing question | Would the output be shared outside Contoso? | Would the output be shared outside the organization? |
| Team AI-use disclosure | …helps Contoso provide better guidance… / …real AI use at Contoso. | …helps the organization… / …real AI use at the organization. |

Two more Branding properties (since 1.0.0.12) stand in for the two literals the shipped package carried from its
first tenant. Blank keeps the shipped wording in the legacy view only, so the parity suites hold byte for byte; a
page view reads neutral wording; a filled value is quoted in either view:

| Property | Pane label | Blank, legacy view | Blank, page view | Set |
|---|---|---|---|---|
| `organizationName` | Organization name | neutral wording (table above) | the same | the name, as above |
| `governanceReference` | Governance reference | *CoE name* governance controls, version 1.1, August 26, 2026 | *CoE name* governance controls (reference not yet set) | quoted as given on review requests and in the guidance export |
| `reviewSystemName` | Review system name | TESS | the review system | quoted as given in tool guidance and team-usage summaries |

The script writes both on every instance from the `GovernanceReference` and `ReviewSystemName` parameters and
reports a blank `GovernanceReference` as AWAITING in its end-of-run summary; both default literals are rows of
`docs/content-claims.md` (class `binding`) and of "Portability exceptions" below.

Data contracts never change: intake ids (`OVT-AICOE-…`), list titles and field names, the localStorage draft keys
(`overture-ai-coe-front-door:draft:*`), download file names (`overture-ai-coe-*.txt`) and the DOM scope id
(`overture-ai-coe-pilot`). No phrase, tenant host, roster surname or secret shape of the tenant word list appears in
the built bundle, its strings chunk or the packaged manifest (a test and the verifier enforce this).

## Lay out the front door across pages

The shipped experience is one web part that switches screens in memory. Since 1.0.0.10 each instance can instead
render exactly one piece (the home tiles, one wizard, the telemetry strip or the dashboard), and since 1.0.0.11 an
instance can render a whole **content page**: the structure of a short communication site (a hero, headings,
paragraphs, quick-link tiles, three-column cards, the three request lanes, a status row, notices, a short set of
rules) drawn in the front door's own style, with the home tiles or the telemetry strip embedded between the blocks, and
since 1.0.0.12 every page view draws the document's shared footer (the support route) below its content. The six
navigation pages of the site are therefore front-door pages too. The wizards, drafts, list writes and downloads are unchanged; only where the
pieces sit and how they link to each other differs.

Since 1.0.0.12 the chrome of a page view says only what is true: a wizard page heads with the CoE name (`branding.coeName`,
no "Lab") and a badge reading **Governed intake** (the document's `vocabulary.chrome.badge` overrides the wording; nothing
claims a connection the page has not proved); every page view shows a visible "Signed in as …" line (`p.ai-page-identity`)
and the legacy view alone keeps its screen-reader-only one, so the person is announced once either way; the piece sits in
a `region` landmark named after the workflow, the page title or the piece (Home tiles, AI operations snapshot,
Administrator dashboard, Content page), while the legacy shell keeps its `main` landmark; and the hero illustration on a
content page is decoration, hidden from assistive technology, where the landing page keeps its named image.

**Properties** (group *Page layout*; *Page content* for a content page; *Page links* for the home tiles):

| Property | Values | Meaning |
|---|---|---|
| `view` | `legacy` (default), `home`, `idea`, `toolCheck`, `teamUsage`, `helpTraining`, `feedback`, `telemetry`, `admin`, `page` | The piece this instance renders. `legacy` is the whole front door as shipped; an instance whose property bag predates 1.0.0.10 parses to it. `page` renders one page of the content document. |
| `layout` | `wide` (default), `narrow` | `narrow` stacks cards, strip, tiles and content blocks for a half or one-third column. |
| `returnUrl` | site path (`SitePages/Requests.aspx`), root path or full URL | Where "All topics", "Back" on the first question and the dashboard's "Front Door" lead; blank returns to the site home. |
| `pageKey` | a key of the content document: `startHere`, `learn`, `useAi`, `requests`, `prompts`, `status` as provisioned | Content page only: which page of the document this instance shows. |
| `contentUrl` | site path or URL; blank means `SiteAssets/ai-coe-pages.json` on a content page and no document on any other piece | The JSON document to read, once per instance and path. A content page always reads one; a wizard (or any other piece) reads one only when this is set, and then draws the document's shared footer (the support route) below its content, so the five form pages carry the same help in the same place as the content pages. An instance from before 1.0.0.12 has it blank and reads nothing. |
| `pageIdea` … `pageFeedback`, `pageTelemetry`, `pageAdmin`, `pagePolicy` | same forms as `returnUrl` | Home tiles only: where each card, the resource strip and the admin bar link. A blank workflow page hides its card; `pageTelemetry` adds an "AI operations snapshot" entry to the resource strip; a blank `pagePolicy` keeps the policy library link. |

The toolbox offers one entry per piece (**AI CoE: Home tiles**, **AI CoE: Explore an AI idea**, …, **AI CoE: Content
page**) on the same component, each presetting `view`; the original **AI CoE Front Door** entry stays the single-page
version. Exits from a piece are full page loads; tiles and in-text links are ordinary links, so the page router and
the browser back button work, and links to another origin (Teams, the assistant) open in a new tab. Drafts stay in
the browser's localStorage and are shared by every instance on the site, so a draft begun on a form page shows as
"Resume draft" on the home tiles when that page next loads, and a form page resumes its draft on load. Place **one
instance per page**: the DOM scope id and several heading ids are document-global, and a content page may carry one
hero and one home piece for the same reason, and one work command because it is the page's single primary control.

**The content document** lives in the site's Site Assets library as `ai-coe-pages.json` (the script uploads it; a
page owner can download it, edit it and upload it again under the same name, and Site Assets keeps the previous
copy in its version history). It is UTF-8 JSON:

    {
      "version": 1,
      "pages": {
        "learn": { "title": "Learn", "blocks": [ { "type": "paragraph", "text": "Four short things." } ] }
      }
    }

| Block | Fields |
|---|---|
| `hero` | `title`; `text` (the line under it); `badge` (replaces the organization badge); `cta` `{ "label", "href", "state", "route", "note" }` (the action fields below; a `cta` needs a label and at least one of `href`, `state`, `route`) |
| `heading` | `text`; `level` 2 (default) or 3 |
| `paragraph` | `text` |
| `tiles` | `prominent` (true for the page's main choice: three to a row); `items`, each `{ "title", "kicker", "href", "state", "route", "description", "note", "icon", "tone" }`; `icon` is one of the web part's icon names (`MessageSquare`, `BriefcaseBusiness`, `Inbox`, `LayoutDashboard`, `Lightbulb`, …; an unknown name shows the light bulb); an item needs a title and at least one of `href`, `state`, `route` |
| `cards` | `columns` 2 (default) or 3; `items`, each `{ "title", "kicker", "body", "meta", "tone", "state", "route", "asOf", "source" }`; `body` is one string (a blank line starts a new paragraph) or an array of paragraphs; `meta` is the italic closing line (a data boundary, a source); `asOf` is a YYYY-MM-DD date and `source` where the fact was read from (parsed now, drawn from 1.0.0.13) |
| `lanes` | `items`, each `{ "tone": "green" or "amber" or "red", "title", "body", "note", "badge" }` |
| `statusRow` | `items`, each `{ "label", "text", "state", "route", "asOf", "source" }`, shown side by side as **label** — text, with the state pill after the text when `state` or `route` is set |
| `workCommand` | `prompt` (the question above the input); `placeholder`; `submitLabel` (default `Start`); `route` (a key of the `routes` table, default `work`); `note` (the line under the input; in-text markup allowed); `emptyText` (shown when the sentence is empty, default "Say what you need done first."). One per page: the first screen's single primary control (see *The work command* below) |
| `notice` | `text` (in-text markup allowed); `tone` `info` (default) or `caution`; `title`. A short aside set apart from the prose (a data boundary, a pilot's limits, what the site records), rendered as a note with a toned left edge and its title, never colour alone |
| `rules` | `items`, each `{ "title", "text" }` (a rule needs a title; `text` may carry in-text markup); `title`; `ordered` (default `true`: a numbered list; `false` for bullets). A block needs at least one titled item |
| `supportRoute` | `label` (the route: the pilot channel, a mailbox); `href` (the label becomes a link; an off-site link opens in a new tab); `stopWhen` (a list of the situations in which to stop and ask); `reportFields` (a list of what a report should carry: the task type, the time, the status shown, what was expected); `routes`, each `{ "issue", "owner", "action" }` (a row needs an issue; a blank `owner` reads "not yet named"). Rendered as a "Support" section with the two lists side by side and the routing rows as a description list, never a data grid element. Meant for the shared footer (below), so it is the same help in the same place on every page view (WCAG 2.2 3.2.6, Consistent Help) |
| `piece` | `piece`: `home` (the five path cards and the resource strip; `pages` maps `idea`, `toolCheck`, `teamUsage`, `helpTraining`, `feedback`, `telemetry`, `admin`, `policy` to site paths or URLs) or `telemetry` (the operations snapshot; the instance's usage metrics provider applies) |

`tone` on tiles and cards is `teal` (default), `blue`, `violet`, `gold` or `cyan`. Every `text`, `body`, `note` and
`meta` string may carry in-text markup: `[label](href)`, `**bold**` and `*italic*` (flat, no nesting; anything
incomplete stays literal, so `[describe it]` is just text). Links are site paths (`SitePages/Requests.aspx`, resolved
against the site), root paths, `http(s)` URLs, `#anchors` or `mailto:` addresses. Since 1.0.0.12 every other
scheme (`javascript:`, `data:`, `vbscript:`, `tel:`, …) and a protocol-less `//host` target render as a dead `#`
anchor and are never appended to the site URL; only a URL on another origin opens in a new tab. The envelope is
strict (`"version": 1` and a `pages` object, or the instance reports the document as unavailable; a file over 512 kB
is refused before it is parsed and reported as too large); inside a page it is lenient: a block or item the web part
does not understand is left out and the rest of the page still renders, so a typo hides one card, not the page, and a
key named `__proto__` is skipped wherever the document is a map. Text is always rendered as text: a `<script>` tag or
an `<img onerror>` written into a title shows as those characters, never as markup (the lint configuration makes
`react/no-danger` an error, so nothing under the web part can write raw HTML). The script rewrites the document on
every run, so lasting wording changes belong in `pages.json`; a quick correction can be made in Site Assets and shows
on the next page load.

**Action states.** A tile, the hero call to action and a status item may carry `state` (one of the five truth-state
keys `availableNow`, `draftOnly`, `needsApproval`, `needsAccess`, `notSupported`, or an activation code `DESIGNED`,
`QUALIFIED`, `AVAILABLE`, `ACTIVE`, `PAUSED`, `RETIRED`) and `route` (a key of the document's `routes` table). `route`
wins over `href` and `state`; a filled `href` with neither stays a plain link; an item with a state and no link is a
labelled non-link (shown as closed, with its state pill and, when a route supplies one, a link to the fallback); a
`RETIRED` item is not rendered; `DESIGNED` and `QUALIFIED` read "Coming: not yet enabled", `PAUSED` reads "Paused".
Only an item that resolves to *Available now* opens its own link, and only an off-site link opens in a new tab.

**The work command.** The `workCommand` block is the first screen's one command: a question, a one-line text
input and a button. On submit the sentence is saved on this device as the draft of the *Explore an AI idea* wizard
(its first answer, "What work would you like to improve?"), and the route the block names is resolved against the
`routes` table exactly as a tile is. When that route resolves to *Available now* the destination opens in a new tab
and a status line says so (the route's `note`, or a default); anything else, including an unknown route key, opens
the fallback (the guided intake) in the same tab, where the wizard resumes with the sentence already filled in. The
sentence never enters a URL. An empty sentence shows `emptyText` and goes nowhere; a route with no fallback link
shows "No fallback is configured" and saves nothing.

The envelope may also carry four optional sections and a page may name its plane; each is lenient and a malformed one
is dropped, never the document:

| Key | Shape |
|---|---|
| `shared` | `{ "footer": [ blocks ] }` — the `footer` blocks every page view draws below its content, in the same relative place: the content pages and the five wizard pages alike (any instance whose `contentUrl` is set). Read like a page's blocks, less `hero`, `piece` and `workCommand`, which belong to one page each and are left out here. Meant for the `supportRoute` block, so the pilot's support route is the same help in the same place everywhere |
| `routes` | `{ "<key>": { "label", "href", "state", "verifiedOn", "receiptRef", "fallback", "note", "roles", "carriesReference", "capabilityId" } }` — the named destinations tiles, the call to action, status items and the work command point at. A row needs a `label`; `state` is a truth-state key or activation code; `verifiedOn` (YYYY-MM-DD) and `receiptRef` (the tenant qualification receipt reference) are what an off-site `href` needs before it opens; `fallback` names the row people are sent to while this one is closed (`guidedIntake` by default); `roles` limits the row to role ids (everyone when absent); `carriesReference` lets a hand-off card append the record reference; `capabilityId` is reserved. Resolution fails closed, in this order: an unknown key goes to the `guidedIntake` row (no such row: "No fallback is configured", no link); roles named and none held, a blank `href`, or a state other than *Available now* keep the label and link to the fallback with their own pill; an *Available now* off-site `href` without a valid, not-future `verifiedOn` or without `receiptRef` shows "Awaiting source" and links to the fallback; a site path or same-origin URL needs neither. Off-site links never carry user text |
| `settings` | `{ "freshnessDays": 30, "minimumCohort": 5 }` — whole numbers (1–3650 and 1–1000); anything else keeps the default |
| `vocabulary` | string maps only, unknown keys ignored, a blank keeps the default: `truthStates` `{ "<key>": { "label", "definition" } }` for `availableNow`, `draftOnly`, `needsApproval`, `needsAccess`, `notSupported`; `requestStatuses` `{ "<code>": "plain wording" }`; `chrome` `{ "badge", "example", "needsRefresh", "awaitingSource", "protectedPage" }` (`badge` is the wizard-page header badge, default "Governed intake"); `roles` `{ "<roleId>": "name" }`; `telemetry` `{ "<feedId>": "name" }`. `{organization}` and `{role}` in the text are filled by the web part, not by the script |
| page `plane` | `user` (default) or `operator` |

The truth states are the five plain-language states of the activation playbook, with their definitions:
Available now, Draft only, Needs approval, Needs access, Not supported. The web part also knows the six activation codes
(`DESIGNED`, `QUALIFIED`, `AVAILABLE`, `ACTIVE`, `PAUSED`, `RETIRED`), the plain wording of the four pilot statuses
and the 26 canonical status codes (anything else reads "Status unavailable"), and the placeholders a measure shows
instead of a number (`src/webparts/aiCoeFrontDoor/content/truthStates.ts`).

**The twelve pages** described in `sharepoint/pages/pages.json` (six in the top navigation, five form pages under
Requests, one owners-only admin page), each with one front-door instance and, for the navigation pages, the blocks
of the content document:

| Page | Instance | Blocks |
|---|---|---|
| Start here (site home) | `page`, key `startHere` | hero with the operating promise and no call to action, the `workCommand`, three `prominent` tiles on the `work`, `improve` and `value` routes, a status row (the assistant with its verified date, Requests), the three rules, the data-boundary `notice`, the private-pilot `notice` (dropped by the script when `PilotTeamName` is blank), three persona cards |
| Learn | `page`, key `learn` | intro, an unnumbered orientation `rules` list, four exercise cards with a duration kicker, how completion is checked, a note for team leads and the link to Prompts |
| Use AI | `page`, key `useAi` | the one prompt pattern, prompt cards by audience with their data boundaries as meta lines, what the page does not do |
| Requests | `page`, key `requests` | the three lanes (the governance bodies are parameters), what is not asked of you, registering AI already in use, the data-boundary `notice`, then the `home` piece (the five path cards and resource strip; return page for every form) |
| Prompts | `page`, key `prompts` | three starter prompts, what is in the library, what Draft means |
| Status | `page`, key `status`, with `telemetryProvider` (the only instance that uses it) | what is running and what is not, the `telemetry` piece, how to check a request, what to do when something is wrong |
| Explore an AI idea, Check a tool or task, Register team AI use, Get help or training, Share feedback | one wizard each, `returnUrl` Requests, `contentUrl` set so the shared footer (the support route) shows below the wizard; the idea page alone carries `draftServiceUrl` | none of their own; the document's `shared` footer |
| AI CoE admin dashboard (site owners only, not in the nav) | `admin`, `returnUrl` Requests | none |

The text is the front door's own copy of a short pilot site and carries tokens: `{OrganizationName}` and the other
`parameters` declared at the top of `pages.json` (people, dates, counts, record ids), `{Page:key}` for links between the
pages, and `{Url:Name}` for links to things outside the package (the assistant, Teams, the chat tool, the prompt
library, the support route). No product name is committed: the assistant and the chat tool are named by the
`AssistantName` and `ChatName` parameters, the governance bodies by the three `GovernanceBody*` parameters (blank
reads "a named approver (not yet named)", the fast path "the AI CoE") and the support owners by the six `*OwnerLabel`
and `BusinessApproverLabel` parameters (blank reads "not yet named"). The two off-site routes (`work`, `assistant`)
take their `state`, `verifiedOn` and `receiptRef` from parameters and stay closed, falling back to the guided request,
until all three are set after tenant proof; the three on-site routes (`guidedIntake`, `improve`, `value`) are
available by content because the same script provisions their pages. A block that names a parameter in
`skipWhenBlank` is dropped, with a warning, when that parameter is blank (the pilot notice, keyed by
`PilotTeamName`). Every claim the pages make that rests on something outside the committed text (a verified date, a
truth state, a route whose proof comes from the tenant, a default literal the bundle still carries) has a row in
`docs/content-claims.md` with its state, class, owner and what the pages may say until it is proved;
`src/provisioning/contentClaims.test.ts` keeps the ledger complete against `pages.json` and the bundle. Each parameter declares a `kind`: `text` parameters are required; `url` parameters may be blank, which turns
an in-text link into its label and marks a tile or call to action pointing at it `needsAccess`, so it stays on the
page shown as closed (a labelled non-link with its state; the script says which); `optional` parameters may be blank
too, and a blank one takes the `default` its declaration carries (only an `optional` parameter may declare one) or
stays empty. Tokens inside the `routes` table and the `shared` sections are resolved the same way; the `vocabulary`
and `settings` sections are copied as written. `src/provisioning/pagesDefinition.test.ts` checks the structure, the
tokens, that the web part's parser accepts every block once the tokens are resolved, and that no word of the tenant
list is in the file: `src/provisioning/tenantWords.json` is the one list of client names, tenant hosts, the reference
roster, case ids and secret shapes that the provisioning tests scan `pages.json`, `parameters.sample.json` and the
script against. That list is deliberately not tenant-neutral (it is what the scans look for), lives outside
`src/webparts`, is imported by nothing in the web part and is never packaged.

**Applying it** (site owner, outside this repository; the build and tests never touch a tenant):

1. Deploy 1.0.0.12 and "Get it" on the site, so the component is available to the script.
2. Copy `sharepoint/pages/parameters.sample.json` to `sharepoint/pages/parameters.json` (ignored by git), fill in the values.
3. Run, with PowerShell 7.4 and the pinned PnP.PowerShell version from the script header. Interactive login needs
   your own Entra app registration once (`Register-PnPEntraIDAppForInteractiveLogin`); pass its id with `-ClientId`,
   or set the `ENTRAID_CLIENT_ID` environment variable and omit the parameter:

       pwsh ./sharepoint/pages/New-FrontDoorPages.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ParameterFile ./sharepoint/pages/parameters.json -ClientId <app id>

   Optional, appended to that line: `-DraftServiceUrl <flow trigger URL>` for the AI draft flow,
   `-TelemetryProvider openai` or `both` (the default is `claude`), and `-Overwrite` to rebuild pages that already
   exist. Every parameter is named; anything else on the line is rejected.

   The script first checks that the front-door component is available on the site (and stops if it is not), then
   resolves the tokens and uploads the content document to Site Assets (creating the library if the site has none,
   and reading the file back to make sure), then creates the pages, verifying after each one that SharePoint bound
   the component to the instance. Existing pages are skipped unless `-Overwrite` is given, which sends them
   to the site recycle bin and rebuilds them from `pages.json`: edits made in the browser are recoverable from the
   recycle bin, not carried over. A page whose build fails part-way is recycled so the next run recreates it. The
   navigation is rebuilt every run; it replaces every QuickLaunch node, including the three list links the package
   feature adds and the template defaults. The admin page gets owners-only item permissions. This needs a
   communication site, whose horizontal top navigation is the QuickLaunch; on any other site the script stops unless
   `-AllowNonCommunicationSite` is given, because there the QuickLaunch is the left navigation.
   On a site that already carries the pages of 1.0.0.11, run without `-Overwrite` first: every existing page is
   skipped and the content document is rewritten from `pages.json`, so the six navigation pages show the new
   document at once (the first screen, the routes, the shared footer). The five form instances need `contentUrl`,
   and every instance the two Branding properties, which this release's script writes only when it creates a
   page: rerun with `-Overwrite` (every page is rebuilt from `pages.json`; browser edits go to the recycle bin) or
   set the values in each instance's property pane. The end-of-run summary names the bindings that are still
   awaiting a value.
4. Open each page once: check the narrow layout where a piece sits in a column, and add the links behind the tiles
   and calls to action the script reported as shown as closed once their URL parameters are known (rerun with
   `-Overwrite`, or edit the document in Site Assets).

Manual fallback: upload a hand-written `ai-coe-pages.json` to Site Assets, create the twelve pages by hand, add the
matching toolbox entry to each (**AI CoE: Content page** with the page key for the six navigation pages), type the
return page into the form pages' property pane, paste the AI draft flow URL on the Explore an AI idea page, pick
the usage metrics provider on Status, and edit the navigation in the site header.

## Rebind to another tenant

The portability and migration contract (reference document 24, v3.3) sets one acceptance rule (§ 8): if the first
tenant disappeared tomorrow and this component had to be deployed elsewhere, what would be thrown away? The target
answer is "tenant configuration, credentials, identities, bindings and branding only". Its migration pattern (§ 9),
never a rebuild, is:

    EXPORT / PACKAGE -> REBIND TENANT CONFIG -> REAUTHORIZE CONNECTIONS -> REMAP IDENTITIES / SOURCES -> REQUALIFY -> ACTIVATE

This section is the front door's answer: every tenant-bound input it takes, where
that input lives, its kind and what blank means. `src/portability/thrownAway.test.ts` builds the same inventory from
`pages.json`, the web part manifest and the services and fails when a row is missing here.

No credential lives in the repository or the package: the AI draft flow is reached with an Entra token the framework
issues for the signed-in user, the lists with that user's SharePoint session, and the script signs in interactively
with the operator's own app registration (`-ClientId`). Identities are resolved at run time (the signed-in user on
the identity line, the site's owners group on the admin page). Bindings, the proof behind an off-site route
(`state`, `verifiedOn`, `receiptRef`), come from parameters and never from committed content.

| Input | Home | Kind | Blank means |
|---|---|---|---|
| `OrganizationName` | `parameters.json` (from the sample) | text | must be filled; written to `organizationName` on every instance |
| `DraftServiceUrl` | `parameters.json`, or `-DraftServiceUrl` on the command line | url | no AI drafting: plain summaries on the idea page |
| `TelemetryProvider` | `parameters.json`, or `-TelemetryProvider` on the command line | text | must be filled: `claude`, `openai` or `both` |
| `AssistantName` | `parameters.json` | text | must be filled, for example `the assistant` |
| `AssistantUrl` | `parameters.json` | url | route `assistant` closed: label kept, "Needs access", fallback to the guided request |
| `AssistantState` | `parameters.json` | optional | route `assistant` closed |
| `AssistantVerifiedDate` | `parameters.json` | optional | route `assistant` reads "Awaiting source" until the date and the receipt reference are set |
| `AssistantReceiptRef` | `parameters.json` | optional | route `assistant` reads "Awaiting source" |
| `ChatName` | `parameters.json` | text | must be filled, for example `the chat tool` |
| `ChatUrl` | `parameters.json` | url | the link on Prompts becomes its label |
| `WorkCommandUrl` | `parameters.json` | url | every sentence of the work command opens the guided request |
| `WorkCommandState` | `parameters.json` | optional | the guided request |
| `WorkCommandVerifiedDate` | `parameters.json` | optional | route `work` reads "Awaiting source" |
| `WorkCommandReceiptRef` | `parameters.json` | optional | route `work` reads "Awaiting source" |
| `SupportUrl` | `parameters.json` | url | the support route keeps its label without a link |
| `SupportOwnerLabel` | `parameters.json` | optional | "not yet named" |
| `IdentityOwnerLabel` | `parameters.json` | optional | "not yet named" |
| `PrivacyOwnerLabel` | `parameters.json` | optional | "not yet named" |
| `BusinessApproverLabel` | `parameters.json` | optional | "not yet named" |
| `ClaimsOwnerLabel` | `parameters.json` | optional | "not yet named" |
| `RecoveryOwnerLabel` | `parameters.json` | optional | "not yet named" |
| `GovernanceBodyFastPath` | `parameters.json` | optional | "the AI CoE" (the declared default) |
| `GovernanceBodyArchitecture` | `parameters.json` | optional | "a named approver (not yet named)" |
| `GovernanceBodyExecutive` | `parameters.json` | optional | "a named approver (not yet named)" |
| `PilotTeamName` | `parameters.json` | optional | the private-pilot notice is dropped from Start here |
| `PilotMembers` | `parameters.json` | text | must be filled (shown only while the pilot notice is kept) |
| `GovernanceReference` | `parameters.json` | optional | default wording (see "Branding"); reported AWAITING in the run summary |
| `ReviewSystemName` | `parameters.json` | optional | default wording (see "Branding") |
| `TeamsUrl` | `parameters.json` | url | the sentence stays, the link is dropped |
| `PromptLibraryUrl` | `parameters.json` | url | the sentence stays, the link is dropped |
| `StatusDate` | `parameters.json` | text | must be filled |
| `PromptCount` | `parameters.json` | text | must be filled |
| `PromptsAddedCount` | `parameters.json` | text | must be filled |
| `PromptsAddedDate` | `parameters.json` | text | must be filled |
| `PromptTestRecordCount` | `parameters.json` | text | must be filled |
| `PromptStatusCounts` | `parameters.json` | text | must be filled |
| `PromptIdAdminQueue` | `parameters.json` | text | must be filled |
| `PromptIdMorningBrief` | `parameters.json` | text | must be filled |
| `PromptIdRepeatableWork` | `parameters.json` | text | must be filled |
| `LeadTeamContinuation` | `parameters.json` | text | must be filled |
| `organizationName` | web part property (Branding), written by the script from `OrganizationName` | property | neutral wording |
| `governanceReference` | web part property (Branding), written by the script from `GovernanceReference` | property | the shipped literal in the legacy view, "reference not yet set" in page views |
| `reviewSystemName` | web part property (Branding), written by the script from `ReviewSystemName` | property | the shipped literal in the legacy view, "the review system" in page views |
| `draftServiceUrl` | web part property (AI drafting) on the idea page, written by the script from `DraftServiceUrl` | property | plain summaries |
| `telemetryProvider` | web part property (Telemetry) on Status, written by the script from `TelemetryProvider` | property | `claude` |
| AI CoE Pilot Intakes | the package feature (`sharepoint/assets/intake-schema.xml`), untouched on upgrade | list | absent: a submission fails and the visitor sees the shipped failure screen |
| AI CoE Use Cases | the companion Power Automate solution | list | absent: the dashboard section reads as unavailable |
| AI CoE Decisions | the companion Power Automate solution | list | absent: the dashboard section reads as unavailable |
| AI Usage Daily | the companion telemetry solution | list | absent: every usage tile keeps "Awaiting data" |
| AI CoE Incidents | the companion telemetry solution | list | absent: no alerts are shown |

Rebinding in the contract's order: **export and package** with `npm ci`, `npm run build` and `npm run verify`
(the `.sppkg` and the two evidence files); **rebind the tenant configuration** with a new `parameters.json` from the
sample and the property pane values above; **reauthorize the connections** (approve the package's Microsoft Flow
Service / User request, point `DraftServiceUrl` at the new tenant's flow, reconnect the companion solutions);
**remap identities and sources** (the site's owners group, the four companion lists, the usage rows); **requalify**
(the tenant acceptance steps under "Deploy", a qualification receipt for each off-site route, the tenant inventory
that fills the `AWAITING_TENANT_INVENTORY` fields of `evidence/dependency-inventory.json`); then **activate** by
setting the route states, dates and receipt references and rerunning the script. Workflow logic, schemas, the
content document's structure and the tests travel unchanged.

## Portability exceptions

What the built bundle still carries from its first tenant, each with an owner and how it moves (GOV-113). A test
(`src/portability/thrownAway.test.ts`) holds this table to the list:

| Exception | Where | Owner | Migration treatment |
|---|---|---|---|
| `TESS`, the review-system name | the blank value of `reviewSystemName` in `branding/branding.ts`; rendered in the legacy view only, read by `services/toolPolicyEvaluator.ts` and `summaries/teamUsageSummary.ts` | AI CoE | set `ReviewSystemName` on rebind and the literal is never rendered; the literal leaves the bundle when the legacy view's parity pin is retired |
| The governance reference, "version 1.1, August 26, 2026" | the blank value of `governanceReference` in `branding/branding.ts`; rendered in the legacy view only | AI CoE policy owner | set `GovernanceReference` on rebind; the script reports it AWAITING until then |
| `OVT-AICOE-`, the intake id prefix | `services/intakeId.ts`; the `IntakeId` column of AI CoE Pilot Intakes (unique key), relied on by the companion flows | AI CoE records owner | kept as the record key; a tenant work-id prefix waits for a work-records list; existing rows keep their ids |
| `overture-ai-coe-front-door:draft:`, the localStorage draft key prefix | `content/constants.ts` | front-door maintainers | kept: drafts are per browser and per pilot; renaming would orphan drafts in progress |
| `overture-ai-coe-pilot`, the DOM scope id, and the `.overture-*` classes | `content/constants.ts`; `styles/frontDoor.global.scss` (the shipped stylesheet, reproduced rule for rule) | front-door maintainers | kept: the stylesheet parity suite pins every rule; changes only with a deliberate stylesheet release |
| The telemetry feed labels (`Claude API spend this month`, `OpenAI API spend this month` and the rest) | `content/telemetryTiles.ts`, `services/UsageMetricsService.ts` | AI CoE operations | product names of the usage feeds, not of a tenant; the legacy strip keeps them verbatim (parity); page views take labels from `vocabulary.telemetry` when the strip moves to an operators page in 1.0.0.13 |
| The vendor name in the shipped list schemas (site column group) and in the package publisher block | `sharepoint/assets/*.xml` (byte-identical to 1.0.0.7); the developer block of `config/package-solution.json` | package maintainers | metadata, never rendered; changing the schemas would break the in-place upgrade; the two are the recorded exemptions of the verifier's package scan |
| `src/provisioning/tenantWords.json`, the tenant word list | outside `src/webparts`, imported by nothing in the web part, never packaged (the verifier asserts the archive holds neither the file nor its entries) | front-door maintainers | deliberately not tenant-neutral: it is what every scan looks for; on rebind it is replaced with the words of the new first tenant |

## Implementation route

The design authority's decision, recorded here: route 1, the SharePoint Framework shell plus SharePoint lists (this
web part, its content document and the lists it writes), is the front door's implementation, rather than a rebuilt
native-page or portal route. The evidence this release train produces for it: the keyboard focus, reduced-motion and
reflow tests over the page-view stylesheets (`styles/pageViews.test.ts`, `styles/pageResponsive.test.ts`), the
hostile-document test, the route table that fails closed, the two verifier evidence files
(`evidence/port-verification.json`, `evidence/dependency-inventory.json`), and from 1.0.0.13 the negative-access
suite over item-level list security. The tenant checks still owed before the route is confirmed: accessibility
evidence on a real site (an assistive-technology pass over the six pages and a wizard), performance (page load with
the bundle on a communication site) and support evidence (the support route staffed; the two-account list-security
test of 1.0.0.13). Sources: the front-door specification's implementation options and the governance register's
accessibility and support requirements (FD-41, FD-42, GOV-13, GOV-37).

## Layout

    src/webparts/aiCoeFrontDoor/
      AiCoeFrontDoorWebPart.ts        SPFx lifecycle, property pane, service creation (once, in onInit)
      branding/                       organization wording derived from the property
      content/                        workflow definitions, home cards, telemetry tiles, page views, the content
                                      document schema and parser, in-text markup, constants
      workflows/                      form engine, per-workflow session reducers, types
      services/                       SharePoint governance and telemetry services, the content document reader,
                                      drafts, policy evaluator, Claude draft flow client (Entra token through AadHttpClient)
      summaries/                      deterministic summary drafts, review indicators, export texts
      controls/, components/          React controls and pages (React Testing Library tests alongside);
                                      components/pages/ renders a content page and its blocks
      context/                        providers for branding, catalog, services and the last submission
      styles/                         Tailwind input, hand-written rules, theme block, page view modifiers, parity tests
    src/testing/                      fakes: SharePoint list store, services, AMD bundle host, journeys
    src/parity/                       journey parity suite against the shipped bundle
    src/preview/                      offline preview host and its server test
    src/provisioning/                 checks on the page definition, the provisioning script, the tenant word list,
                                      the claims ledger and the release verifier
    src/portability/                  the thrown-away test: the rebind inventory and the portability exceptions
    scripts/verify-package.mjs        the release verifier (package checks, tenant word scan, dependency inventory)
    sharepoint/assets/                list schemas provisioned by the package feature
    sharepoint/pages/                 page definition, parameter sample and PnP PowerShell script (operator tools)
    parity/                           stylesheet fixtures extracted from 1.0.0.7
    original/, recovered/, docs/RECOVERY.md, evidence/   provenance of the shipped package

## Styling

The shipped stylesheet is reproduced exactly (`styles/cssParity.test.ts` proves it rule for rule):

- `styles/tailwind.css` (`@tailwind utilities`) is compiled by a Heft phase (`config/heft.json`,
  `scripts/tailwind-task.js`) into `styles/tailwind.generated.global.scss` before Sass runs, from the class names in
  the web part sources. The output is git-ignored; `tailwind.config.js` keeps the shipped `important` prefix.
- `styles/frontDoor.global.scss` holds the hand-written rules verbatim; `styles/theme.global.scss` holds the theme
  block the shipped bundle injected at runtime, scoped to the web part root without changing the cascade.
- `styles/pageViews.global.scss` and `styles/pageResponsive.global.scss` are additive: every rule is scoped under a
  `.ai-view` class the legacy view never carries, so the shipped rules are never shadowed. The first holds the page
  view modifiers, the block rules and the keyboard focus ring (every link and form control in a page view shows the
  shipped 3px ring); the second holds only media queries (one column below 800px, no hero illustration below 480px,
  no transitions or hover lifts under `prefers-reduced-motion`). `styles/pageViews.test.ts` and
  `styles/pageResponsive.test.ts` guard the scope, the at-rule split and the rules.
- The stylesheets must keep the `.global.scss` suffix: the SharePoint Framework loader hashes every selector of any
  other stylesheet name as a CSS module (`AiCoeFrontDoorWebPart.test.ts` asserts the injected selectors).
- `AiCoeFrontDoor.module.scss` is the one CSS module (two classes), as shipped.

## Tests

`npm test` runs 532 tests in seven layers: pure modules (branding, definitions, page views, the content document
parser and markup, form engine, services, summaries), React Testing Library component and journey tests with fake
services (including every content block), bundle-level lifecycle tests that
load the built AMD bundle in a simulated SPFx host, a journey parity suite that plays every workflow through the
shipped 1.0.0.7 bundle and the port side by side (screens, drafts, downloads and posted list items must match), the
stylesheet parity test plus the page view and responsive stylesheet guards, a preview-server test, a hostile-document test (script
tags, executable link schemes, a 200 kB string, arrays nested fifty deep and `__proto__` keys render as text and dead
anchors), and static checks on the page definition, the provisioning script, the tenant word list, the claims
ledger, the release verifier and its evidence (`src/provisioning/verifyPackage.test.ts`: the version, the exact
pins, the sixteen inventory fields on every row), the thrown-away inventory (`src/portability/thrownAway.test.ts`)
and the lint configuration (`react/no-danger` is an error and no source under the web part uses
`dangerouslySetInnerHTML`). Any React `act()` warning fails the suite.

## Behaviour notes

The port preserves the shipped behaviour, including these traits inherited from 1.0.0.7:

- The tool check never creates its own SharePoint record; the guidance page's "Guidance record created" line reflects
  the last submission of the session, otherwise it reports that no record was created. On its own page (the
  `toolCheck` view) that can only be a review request filed in that instance, so the line usually reports that no
  record was created; the wording is pinned by the parity suite.
- "Answers that shaped this result" on the guidance page is always empty (the shipped build lost the list to an ES5
  `Set` spread); the parity suite pins this.
- The disclosure summary draft is deterministic, and so is the idea draft until an AI draft flow URL is configured.
  The shipped code contained dormant calls to a model provider that were never reached; the idea path now goes through
  the governed flow instead, the feedback-theme path stays deterministic.
- Drafts live in the browser's localStorage and are shared by every front-door instance on the site, which is what
  lets the home tiles show "Resume draft" for a form on another page. Place one instance per page: two instances on
  one page share the `overture-ai-coe-pilot` scope id and several heading ids.
- `data-theme` is set from the SharePoint theme but no rule consumes it.
- The shipped strip always showed the OpenAI tiles; the port defaults to the Claude tiles and keeps the OpenAI strip
  as the "OpenAI (as shipped in 1.0.0.7)" mode, which the parity suite runs in. This is a documented difference, not a
  data change: rows without a provider still count as OpenAI.

Two internal defects were fixed: the telemetry service is created once (the shipped build refetched on every render;
the parity suite documents the difference) and intake id suffixes use `crypto.getRandomValues` in the same format.

## Provenance and rules

`original/` keeps the shipped package unchanged, `recovered/` its byte-exact extraction and `docs/RECOVERY.md` the
recovery method. The JavaScript reassembly tooling of the recovery was retired once this port reached parity;
`scripts/extract.py` and `tests/test_extract.py` remain for the package extraction.

Keep this repository internal. Git is local-only; nothing is pushed or deployed from here. No secrets are stored.
