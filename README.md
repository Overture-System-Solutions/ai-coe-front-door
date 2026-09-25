# AI CoE Front Door — SharePoint Framework web part

A SharePoint Framework (SPFx 1.23.2, React 17, TypeScript) web part that gives an AI Center of Excellence a governed
front door: five guided intake workflows (idea, tool or task check, team AI-use disclosure, help or training,
feedback), a telemetry snapshot and an administrator dashboard, all writing to SharePoint lists.

This project is the maintainable source for the web part that shipped as package **1.0.0.7** (`original/`). The
shipped package was reverse-engineered (see `docs/RECOVERY.md`) and then ported to idiomatic TypeScript with a
test-first approach. It builds the next in-place correction candidate, **1.0.0.17**, with the same solution, feature and web part
identities, and it is tenant neutral: the organization name is a web part property. Since 1.0.0.10 the front door can
also be spread over several native pages, one piece per page, since 1.0.0.11 it renders whole content pages from a
document in Site Assets, in its own style (see "Lay out the front door across pages"), since 1.0.0.12 the first
screen tells the truth: one work command, a route table that fails closed, a shared support footer, and a recorded
answer to what a move to another tenant would throw away (see "Rebind to another tenant"), since 1.0.0.13 every
submission is read back before the page says it was saved, each person sees their own requests on Status, the
request lists carry item-level security the script makes effective, and the telemetry strip sits on an owners-only
Operations page (see "Receipts", "My work", "List security" and "Deploy"), and since 1.0.0.14 the site's own groups
decide what a page offers: a leaders' Enterprise value page that shows a number only where a measure was recorded
with its evidence, the two operator pages behind their groups, the colours of the organization as a parameter, and
a run that reports the release it published and every binding the site still owes (see "Branding", "Palette
override", "Page permissions" and "Instance properties"), and since 1.0.0.15 a pilot team can be given a start page
of its own, keyed on the team's name and read by its own site group, and anyone can record how a task went on a page
whose every answer is a choice, so the row it writes holds no prompt, no output and no text of the work itself (see
"Deploy", "The outcome record" and "Lists"), and since 1.0.0.16 the consolidated application, Binding A CORE client,
Marketing draft/review contracts and an additive one-page `view:app` definition are in the package while live CORE
writes stay gated.

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
  simulated Site Assets document (`?page=operations` the operator-plane page that carries the telemetry strip,
  `?page=value` the leaders' Enterprise value page),
  `?layout=narrow` the narrow layout, and `?width=560` caps the mount so a section column can be eyeballed. Since
  1.0.0.13 the banner also carries two simulation switches (each reloads the page): `?deny=intakes` makes the
  simulated request list refuse every read, so Status and the first screen show *Needs access* and no count, and
  `?readback=fail` makes the read that follows a write fail, so a submission from a form page (`?view=idea`) shows
  the pending receipt, *Saved, not yet confirmed*, with its **Confirm again** button; the three requests of the
  preview person on Status are seeded, and another person's row is kept out of every read the way the list's
  item-level security keeps it out on a site. Since 1.0.0.14 two more: `?role=leader` (`employee`, `operator`,
  `designAuthority`, or the default site owner) makes the simulated site groups answer as that role, so the leader
  block on the first screen and the two protected pages can be seen offline — production resolves the role from
  identity and the bundle reads no role from the address — and `?palette=accent%3D%23008B83` sets the
  `paletteOverrides` property, so a tenant's colours can be tried without a tenant. The measures behind the
  Enterprise value page are seeded rows of a simulated measures list: one measured, one awaiting its baseline and
  one held back because its group is too small. `npm run preview -- --port 4174` changes the port;
  `npm run preview -- --bundle <path>` previews another bundle, for example the shipped one under
  `recovered/package/ClientSideAssets/`.
- `npm start` runs `heft start` for the SharePoint hosted workbench (requires a tenant; not needed for local work).
- `npm run verify -- --tests "<summary of the test run>"` checks the package the build wrote (identity, version, the
  shipped list schemas byte for byte, the bundle's data contracts, no word of the tenant list anywhere in the
  archive beyond the documented identifiers, every dependency pinned exactly) and writes `evidence/port-verification.json` and
  `evidence/dependency-inventory.json` (one row per runtime component of `package-lock.json`, with the sixteen
  inventory fields; what the lock file cannot say reads `AWAITING_TENANT_INVENTORY` until the tenant inventory
  fills it). Both files are committed with each release.

## Deploy 1.0.0.17

This is an **offline review candidate**, not authorization to import or activate business processing. After separate
approval, upload `sharepoint/solution/overture-ai-coe-front-door.sppkg` as an update of the existing app.
The solution id (`f125ebdf-4a9d-4e6e-8479-3a18874e7752`), feature id (`69ab84b7-608c-47ee-9623-af8ebaf2cb10`,
version 1.0.0.2) and web part id (`cf2e5904-0703-4fe4-ae5a-ec012d6fa689`) are unchanged, so the provisioned lists
are left untouched. 1.0.0.17 changes no shipped list schema. It retains consolidated `view:app` as the first
toolbox entry, adds the qualified v0.2.0 split CORE transport and recovery, server-side business drafts,
and the separate business Marketing facade while preserving the synthetic local store for loopback preview only.
The role-group keys (`marketingParticipant`, `marketingReviewer`) remain. The **additive** one-page script at
`sharepoint/pages/one-page/New-FrontDoorAppPage.ps1` places one `view:app` instance on an explicitly named
page. That script has dry-run, explicit apply/readback and instance-only rollback, no `-Overwrite`, and does not replace QuickLaunch or publish automatically. The sixteen-page
`pages.json` and `New-FrontDoorPages.ps1` are unchanged: they still create zero `app` instances.

What 1.0.0.15 already added remains: `pageOutcome`, the eleventh-then-twelfth toolbox outcome entry, **AI CoE Outcome Records**, **Record a task outcome**, the pilot start keyed on `PilotTeamName` / `PilotGroup` with `skipWhenBlank`.
Do first, before either script runs: create the site groups this instance should bind, including Marketing
participant and reviewer groups if those roles should open. Blank groups leave those roles unbound.

The sixteen-page script still runs without `-Overwrite` so existing pages keep their content and instance properties
are **updated in place**. The one-page script is a separate path: name `PageFile` and run `-DryRun` / `-CheckBindings`
first. Read its current README before any explicit apply. Live CORE command writes, Marketing send/publish/assign/schedule, and tenant provisioning from this worktree
are not authorized by the package alone.

Tenant acceptance for this release is **not claimed** from a local build. CORE requires the separately registered
and qualified helper plus native import/Save/ACL tests. Marketing's offline Node extension is **not Power Automate-importable**;
it requires binding into an approved existing canonical-writer host and authenticated trigger/Claude connector.
Business drafts require an approved server list, access/retention policy and secure-context Web Locks support.
`draftPolicyJson`, `coreBindingJson` and `marketingBindingJson` remain unbound by default. No browser business-text fallback exists.
Read `LIVE_BINDINGS_REQUIRED.md`, `backend/core-native/HANDOFF.md`, `backend/power-automate/marketing-runtime/HANDOFF.md`
and `docs/MEASUREMENT-AND-TEACHING.md` for the exact boundaries and remaining commissioning evidence.

### Rollback

Use the separately reviewed prior package only under explicit rollback authority. Earlier versions use browser draft
storage, so disable business draft entry rather than silently restoring that behavior. Follow the encrypted receipt,
instance-only rollback and drift checks in `sharepoint/pages/one-page/README.md`; keep pages, navigation and business records.
Do not use the legacy sixteen-page script as a rollback mechanism or delete/recycle a page to undo an instance update.

### Enable AI drafting of idea summaries

The idea workflow can ask a Power Automate flow (the organization's AI draft flow, behind its own model connector)
for the summary draft. The browser never holds a model key: the web part calls the flow's HTTP
trigger with a Microsoft Entra token for the Power Automate service, issued by the framework for the signed-in user.
Three one-time steps, all outside this repository:

1. Keep the flow's existing authenticated, explicitly approved caller restriction. Do not broaden it to everyone
   in the tenant merely to make a test pass. The owner must approve any caller change and verify hosted Save and authentication.
   Configure the authorized trigger URL without placing credentials in source, logs or shared documentation.
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

A third Branding property (since 1.0.0.14), `roleGroups`, binds site groups to the four roles the front door knows
(`employee`, `leader`, `operator`, `designAuthority`): pairs of a role id and a site group title, one pair per
semicolon, for example `leader=AI CoE Leaders;operator=AI CoE Operators`. The web part reads the groups of the
signed-in person once per page (`_api/web/currentuser/groups`), matches the titles case-insensitively and keeps
everyone an employee; a site owner (the one `manageWeb` check the web part has always made) also counts as an
operator, and the design-authority role stays unheld until a group is bound to it. A refused or unanswered read
never widens a role: the person keeps the employee role and the page says the membership was not confirmed. There
is no role selector anywhere in the bundle and no role is read out of the address; the offline preview simulates one
(`?role=`) behind its own banner. Roles decide what a page offers, never what the server hands out: list and page
permissions remain the control.

### Palette override

A fourth Branding property (since 1.0.0.14), `paletteOverrides`, carries the colours of the organization as
`key=#hex` pairs separated by semicolons, for example `accent=#008B83;ink=#102B3D`. The script writes it on every
instance from the `Palette` parameter, so a tenant's colours are a parameter and never code. Teal stays the default:
blank sets nothing and the shipped colours stand. Only a plain three- or six-digit hex colour is taken; a pair with
an unknown key or any other kind of value is dropped on its own, and nothing but a colour ever reaches the element.

The web part sets each pair as a custom property on its own element, exactly as it sets the theme colours
(`--bodyText` and the rest). The page-view rules read them with `var(--fd-x, <literal>)`, where the literal is the
colour the front door draws without a tenant value; **no stylesheet declares a `--fd-` value of its own**, because a
declaration inside the web part would win over the value set on the element above it and every override would be
dead (`styles/palette.test.ts` reads every compiled stylesheet and fails on one).

| Key | Custom property | Default | Where it is read |
|---|---|---|---|
| `accent` | `--fd-accent` | `#087f83` | the button back to the front door on the administration bar of a page view |
| `ink` | `--fd-ink` | `#10243e` | the question of the work command, the title of a notice, and on an operator page the release line, the heading, the name and the kind of a binding |
| `muted` | `--fd-muted` | `#5b6878` | the note under the work command, the evidence line and the note under the measure tiles, and on an operator page the document line, the receipt reference and the empty line of the bindings |
| `bg` | `--fd-bg` | `#f7fafc` | the quiet surface of a hand-off card whose route is closed |
| `paper` | `--fd-paper` | `#fff` | the surface of a notice |
| `focus` | `--fd-focus` | `#0b66d4` | the left edge of an information notice |
| `stateGreen` | `--fd-state-green` | `#ddf6f0` | the background of a green status pill and case tag |
| `stateBlue` | `--fd-state-blue` | `#e7f0fb` | the background of a blue (draft) status pill |
| `stateAmber` | `--fd-state-amber` | `#fff4cf` | the background of an amber status pill and case tag |
| `stateRed` | `--fd-state-red` | `#fde8e8` | the background of a red status pill and case tag |
| `line` | `--fd-line` | `#d6e0e8` | every hairline of the consolidated view: the tab row, card and panel borders, the quote edge |
| `soft` | `--fd-soft` | `#e5ebf0` | the quieter inner borders of the consolidated view: list separators, source, claim and variant blocks |
| `heroFrom` | `--fd-hero-from` | `#10243e` | the first stop of the entry panel's wash on the consolidated view |
| `heroTo` | `--fd-hero-to` | `#087f83` | the last stop of that wash |
| `heroGlow` | `--fd-hero-glow` | `#edf8f8` | the light bloom over the top right of that wash |
| `accentDark` | `--fd-accent-dark` | `#055d66` | the pressed accent: a primary button under the pointer, in the parts the consolidated view reuses |
| `accentSoft` | `--fd-accent-soft` | `#e8f7f6` | the tinted accent: the quiet brand surface those same parts draw |

Everything else keeps the shipped colours, including the legacy single-page view, which carries no `.ai-view` class
and reads no token. A state colour sets the background a pill is read against and never its ink, so check the
contrast of a value you set (WCAG 2.2 AA, 4.5:1 for the pill's text) before you publish it.

The nine colours of the reference palette (`08_FRONT-DOOR-AND-ENGINEERING-COCKPIT-SPEC-v3.3.md`, "Visual system")
are an example of such an override and are in no stylesheet: Navy `#062A46`, Deep blue `#0B4267`, Blue `#0878D1`,
Cyan `#21B5D8`, Teal `#008B83`, Ink `#102B3D`, Muted `#5B7180`, Background `#EDF5F9`, Paper `#FFFFFF`. As a
`Palette` value, five of them land on keys directly and the rest are a choice the page owner makes:

    accent=#008B83;ink=#102B3D;muted=#5B7180;bg=#EDF5F9;paper=#FFFFFF;focus=#0878D1

The consolidated view adds seven keys. Five reach its hairlines, its quiet surfaces and its entry panel, which the
shipped ten had no word for. The other two, `accentDark` and `accentSoft`, exist because that view mounts the front
door's own guided requests, requests list, usage strip and operator dashboard, and those parts colour themselves
from the theme variables of the shipped bundle rather than from these tokens. Inside the consolidated view alone,
those variables are pointed at the matching token, so a reused button follows the tenant's accent instead of
standing in the shipped teal next to a repainted shell; the two extra keys are the pressed and tinted states such a
button needs. Every legacy screen keeps the shipped colours exactly. The preset below paints the consolidated view
in the reference colours and is what the offline preview's `?palette=` carries:

    accent=#0878D1;ink=#062A46;muted=#5B7180;bg=#EDF5F9;paper=#FFFFFF;focus=#21B5D8;line=#D7E2E9;soft=#F6FAFC;heroFrom=#052A46;heroTo=#075D81;heroGlow=#21B5D8;accentDark=#0B4267;accentSoft=#EDF5F9

Keeping those colours a parameter rather than code is what lets the same build serve another tenant unchanged; a
test refuses any of them as a literal in a stylesheet.

*Regenerating the token-read map.* `styles/palette.test.ts` pins which selector reads which token. It is generated,
not hand-written: after changing `appShell.global.scss` or `coreWorkspace.global.scss`, rebuild and read the pairs back out of the compiled sheets
with postcss, then paste the block into the test. Hand-editing it is how the list drifts from the stylesheet.
The separate Cases sheet keeps labels and controls readable, uses the same palette fallbacks for fields, focus,
case selection and notices, and is scoped under `.ai-view--app .ai-case-workspace`; it does not restyle legacy screens.

Data contracts never change: intake ids (`OVT-AICOE-…`), list titles and field names, the localStorage draft keys
(`overture-ai-coe-front-door:draft:*`), download file names (`overture-ai-coe-*.txt`), the DOM scope id
(`overture-ai-coe-pilot`), the confirm dialog heading id (`overture-confirm-title`) and the `.overture-*` classes of
the shipped stylesheet. No phrase, tenant host, roster surname or secret shape of the tenant word list appears in
the built bundle, its strings chunk or the packaged manifest (a test and the verifier enforce this), and no client
word of the list appears anywhere in the archive beyond those documented identifiers (the verifier masks exactly
them before its client-word scan).

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
| `view` | `legacy` (default), `home`, `idea`, `toolCheck`, `teamUsage`, `helpTraining`, `feedback`, `telemetry`, `admin`, `page`, `outcome` (since 1.0.0.15) | The piece this instance renders. `legacy` is the whole front door as shipped; an instance whose property bag predates 1.0.0.10 parses to it. `page` renders one page of the content document. |
| `layout` | `wide` (default), `narrow` | `narrow` stacks cards, strip, tiles and content blocks for a half or one-third column. |
| `returnUrl` | site path (`SitePages/Requests.aspx`), root path or full URL | Where "All topics", "Back" on the first question and the dashboard's "Front Door" lead; blank returns to the site home. |
| `pageKey` | a key of the content document: `startHere`, `learn`, `useAi`, `requests`, `prompts`, `status`, `operations`, `value` as provisioned | Content page only: which page of the document this instance shows. |
| `contentUrl` | site path or URL; blank means `SiteAssets/ai-coe-pages.json` on a content page and no document on any other piece | The JSON document to read, once per instance and path. A content page always reads one; a wizard (or any other piece) reads one only when this is set, and then draws the document's shared footer (the support route) below its content, so the five form pages carry the same help in the same place as the content pages. An instance from before 1.0.0.12 has it blank and reads nothing. |
| `pageIdea` … `pageFeedback`, `pageTelemetry`, `pageAdmin`, `pagePolicy`, `pageOutcome` | same forms as `returnUrl` | Home tiles only: where each card, the resource strip and the admin bar link. A blank workflow page hides its card; `pageTelemetry` adds an "AI operations snapshot" entry to the resource strip; a blank `pagePolicy` keeps the policy library link. `pageOutcome` (since 1.0.0.15) is the *Record a task outcome* page: it shows a sixth card, and only on a home piece inside a page view — the single-page front door keeps its five. |

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
| `cards` | `columns` 2 (default) or 3; `items`, each `{ "title", "kicker", "body", "meta", "tone", "state", "route", "asOf", "source", "illustrative" }`; `body` is one string (a blank line starts a new paragraph) or an array of paragraphs; `meta` is the italic closing line (a data boundary, a source); `asOf` (a YYYY-MM-DD date), `source` (where the fact was read from) and `illustrative` (`true` for an example) draw the freshness line under the card (see *Freshness* below) |
| `lanes` | `items`, each `{ "tone": "green" or "amber" or "red", "title", "body", "note", "badge" }` |
| `statusRow` | `items`, each `{ "label", "text", "state", "route", "asOf", "source", "illustrative" }`, shown side by side as **label** — text, with the state pill after the text when `state` or `route` is set and the freshness line under the text when `asOf`, `source` or `illustrative` is set (see *Freshness* below) |
| `statusStrip` | `items`, each `{ "kind", "label", "text", "href", "state", "route", "asOf", "source", "illustrative" }` (the last three draw the freshness line under a `text` item; a `myRequests` item counts live rows and never carries one); `emptyText` (default "No requests from you yet."); `unavailableText` (default "Status unavailable: the request list could not be read."). `kind` is `text` (default; the item behaves as a `statusRow` item and needs `text`) or `myRequests` (the count of the signed-in person's own requests by plain status, "2 received · 1 in review", linked to `href` when set; `text` is an optional lead). The count comes from the request list (see *My work*); while the list cannot be read the item shows `unavailableText`, with the *Needs access* pill when the read was refused, and never a number. Only a strip with a `myRequests` item reads the list |
| `caseCards` | `items`, each `{ "id", "title", "description", "state", "historicalStage", "historicalHealth", "sourceDate", "nextAction", "caption", "illustrative" }`; an item needs `id`, `title` and `state`, a canonical status code (`AWAITING_SOURCE`, `IN_DELIVERY`, …; a pilot word or anything else drops the item). One card per case: the id as code, the state pill (*Awaiting source* for `AWAITING_SOURCE`, the plain wording of every other code, the code beside it on the operator plane), the title, the description, then "Historical stage: …", "Historical health: Green/Amber/Red" (`historicalHealth` is `green`, `amber` or `red`; anything else is dropped) and "Source: 28 Aug 2026" (`sourceDate`, a YYYY-MM-DD date) as chips, then "Next: …" and the caption. A `sourceDate` older than `settings.freshnessDays` adds the *Needs refresh* pill and, when no caption is given, "Do not infer progress."; `illustrative` adds the *Example* pill; without a `sourceDate` no date is shown. A `source` `{ "list" }` is accepted and ignored until a cases list exists (see *Case cards* below) |
| `workCommand` | `prompt` (the question above the input); `placeholder`; `submitLabel` (default `Start`); `route` (a key of the `routes` table, default `work`); `note` (the line under the input; in-text markup allowed); `emptyText` (shown when the sentence is empty, default "Say what you need done first."). One per page: the first screen's single primary control (see *The work command* below) |
| `notice` | `text` (in-text markup allowed); `tone` `info` (default) or `caution`; `title`. A short aside set apart from the prose (a data boundary, a pilot's limits, what the site records), rendered as a note with a toned left edge and its title, never colour alone |
| `rules` | `items`, each `{ "title", "text" }` (a rule needs a title; `text` may carry in-text markup); `title`; `ordered` (default `true`: a numbered list; `false` for bullets). A block needs at least one titled item |
| `supportRoute` | `label` (the route: the pilot channel, a mailbox); `href` (the label becomes a link; an off-site link opens in a new tab); `stopWhen` (a list of the situations in which to stop and ask); `reportFields` (a list of what a report should carry: the task type, the time, the status shown, what was expected); `routes`, each `{ "issue", "owner", "action", "kind" }` (a row needs an issue; a blank `owner` reads "not yet named"; `kind` is one of `identity`, `privacy`, `approval`, `claims`, `recovery`, `support` and lets the failure notice of a form page name the owner of an access failure (`identity`) or of anything else (`support`) without reading the row's wording; an unknown kind is dropped, the row stays). Rendered as a "Support" section with the two lists side by side and the routing rows as a description list, never a data grid element. Meant for the shared footer (below), so it is the same help in the same place on every page view (WCAG 2.2 3.2.6, Consistent Help) |
| `kpi` (since 1.0.0.14) | `items`, each `{ "id", "label", "illustrative" }`; `unavailableText` (default "Measures unavailable: the measures list could not be read."). One tile per measure: `id` is the `MeasureId` of a row of the *AI CoE Program Measures* list, `label` the wording above the number (the row's own title when none is given). Everything else comes from the row and never from the document: a measured row shows its number in its unit with "As of …" and its evidence reference (a `%` row is written as a proportion: 0.62 for 62%, 1 for 100%, and a value above 1 is read as the percentage it already is), and any other state shows its plain placeholder (*Not established*, *Pending baseline*, *Not available*, *Not shown: group too small*) with "Evidence required: …" under it. A blank value never becomes zero, a row covering fewer people than `settings.minimumCohort` is held back whatever it claims, and a list that cannot be read makes every tile read *Not available* and says so once. The measure id and the state code are shown on the operator plane alone; `illustrative` adds the *Example* pill |
| `workflowCards` (since 1.0.0.15) | `items`, each `{ "title", "input", "output", "humanDecision", "pass", "example", "href", "state", "illustrative", "family" }`; an item needs all five of `title`, `input`, `output`, `humanDecision` and `pass`, so no workflow is shown without saying what it takes, what it gives back, who decides and what counts as a pass. One card per workflow, the four answers as a description list; `example` adds a worked example below them, `illustrative` adds the *Example* pill, `href` adds one link ("Open this workflow"; off-site it opens in a new tab), and a `state` that is not *Available now* draws that state's pill and no link at all. `family` is read and never drawn: content can be tagged before a workflow catalogue list exists |
| `bindings` (since 1.0.0.14) | `title` (the wording above the rows; none when the page gives the section its own heading). The block carries nothing else: it renders the `release` and `bindings` the provisioning run wrote on the document — "Content release &lt;id&gt;, published &lt;date&gt;", then one row per `url`, `optional` and `group` parameter with its kind and a *Bound* or *Awaiting* pill. A value never appears, except the reference of a qualification receipt, which names a record. The block belongs to the operator plane and renders nothing at all on a page written for everyone |
| `piece` | `piece`: `home` (the five path cards and the resource strip; `pages` maps `idea`, `toolCheck`, `teamUsage`, `helpTraining`, `feedback`, `telemetry`, `admin`, `policy` to site paths or URLs), `telemetry` (the operations snapshot; the instance's usage metrics provider applies; an optional `kicker` replaces the strip's shipped "LIVE GOVERNANCE TELEMETRY" line and, only then, the tiles take their labels from `vocabulary.telemetry` by metric key, so the page names the feed and never a provider) or `myWork` (the signed-in person's own requests; see *My work* below) |

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

**Receipts (since 1.0.0.13).** Every submission is read back from the list before the page may say it was saved
(see *Behaviour notes*). On a form page (a page view) the acknowledgement reflects what the readback found:

- *Saved and confirmed*: the operation and its source ("Saved to the AI CoE request list on this site"), the
  reference and the time the row was confirmed, "Read back from the list", an "Open the record" link, the reminder
  that the acknowledgement is not an approval decision, and a *Draft only* pill (the request is recorded, nothing has
  been sent or decided). Below it a hand-off card, *Continue with …*, resolves the `assistant` route exactly as a tile
  does: open, it links there (in a new tab, with the reference appended as `?ref=` only when the row declares
  `carriesReference`); closed, it shows the route's state and links to the fallback. The reference is always shown
  as text for copying.
- *Saved, not yet confirmed*: SharePoint accepted the write but did not confirm it back. One button, **Confirm
  again**, sends the same request under the same reference: the service looks the rows up first and writes only what
  is missing, so nothing is duplicated. On an operator-plane page the class code (`INCONCLUSIVE`) is shown beside it.
- A failure notice for anything else: the class in words (*Needs access*, *Not available on this site*, *Not
  available right now; try again*, *Not supported*), the sentence the service attached (never the response body),
  what to do, who owns that kind of issue (the shared support route's `identity` row for an access failure, its
  `support` row otherwise, "not yet named" when blank) and when trying again makes sense; a transient failure offers
  **Try again**. In every case but *saved*, the answers are kept as a draft on this device: the wizard writes the
  draft again, so the form resumes on its review or summary step, and clears it only once the record is saved.

The legacy single-page view keeps its shipped acknowledgement and failure screens byte for byte, clears the draft on
every submit as it always did, and gains one branch: a pending record reads "Saved but not yet confirmed." with the
advice to open the form again and confirm with the same reference, never the "not created" heading above a record
that may exist.

**My work (since 1.0.0.13).** The `myWork` piece lists the signed-in person's own requests, and a `statusStrip`
item of kind `myRequests` counts them. Both read the *AI CoE Pilot Intakes* list through one service created with
the web part (`services/myWorkService.ts`): a single GET of
`items?$filter=RequestorEmail eq '<email>'&$select=Id,Title,IntakeId,WorkflowType,Status,SubmittedAt,Modified&$orderby=SubmittedAt desc&$top=20`
(apostrophes in the email doubled; the payload column is never asked for). Each row shows the workflow ("AI idea",
"Help or training", …), the status as its plain wording in a pill with an icon shape ("Received", "In review",
"Closed", "Needs attention", and the wording of the 26 canonical codes; the document's `vocabulary.requestStatuses`
may rename a code, and an operator-plane page shows the code beside it), the reference for copying, and the dates
("Sent Sep 1, 2026 · Updated Sep 2, 2026"; a missing date says so and is never invented). The filter is what the
web part asks for; what the server returns is decided by the list's item-level read security, which the 1.0.0.13
script makes effective (see *Deploy*): a site member sees their own rows and nothing else, and the piece shows
exactly those. A refused read (401 or 403) shows the *Needs access* pill and "You cannot read the request list on
this site."; a list that cannot be read at all (missing, a server failure, no network) shows "Status unavailable:
the request list could not be read."; the strip shows its `unavailableText` in both cases and never a number the
list did not give. Nothing here is an approval: the status is the list's word for where the request stands.

**Freshness (since 1.0.0.13).** A card, a `statusRow` item or a `statusStrip` text item may say when its fact was
last read back (`asOf`, a YYYY-MM-DD date) and from where (`source`); the page then draws a freshness line under it,
"As of 1 Sep 2026 · AI CoE check". Once the date is older than the document's threshold (`freshnessDays` under
`settings`, 30 unless the document says otherwise) the line adds the *Needs refresh* pill, so an old truth is never
read as a current one. A `source` with no
date (a parameter such as `{AssistantVerifiedDate}` left blank, or an unreadable date) draws the *Awaiting source*
pill and "Do not infer progress." instead of any date: nothing here invents one. An item marked `"illustrative": true`
draws the *Example* pill, so a worked example is never mistaken for a fact of this environment. The three pill labels
come from `vocabulary.chrome` (`needsRefresh`, `awaitingSource`, `example`); the clock is the page's, so a page left open
shows what was true when it loaded.

**Case cards (since 1.0.0.13).** The `caseCards` block shows one card per case: the record id, the state as a pill,
the stage and health the latest authoritative source recorded (labelled *historical*, never current), the day that
source was read, the next action and a caption. No cases list exists yet, so the block reads nothing: every item is
committed content, and the shipped Status page carries exactly one, `EXAMPLE-01`, marked `illustrative` (the *Example*
pill), in state `AWAITING_SOURCE` (the *Awaiting source* pill), with a made-up past `sourceDate` so the *Needs refresh*
pill and the caption "Do not infer progress" can be seen without a tenant fact. Each illustrative item is listed in
`docs/content-claims.md`; the definition test requires every case card to be illustrative or dated, keeps `state` out
of the user-plane lint (it is a code, not a text) and refuses a literal date on any other item. When a cases list
exists the block's `source` `{ "list" }` will name it; until then it is accepted and ignored.

**List security (since 1.0.0.13).** The two intake lists (*AI CoE Pilot Intakes*, provisioned by the package feature,
and *AI CoE Use Cases*, provisioned by the companion solution) carry item-level security once the 1.0.0.13 script has
run: `ReadSecurity 2 / WriteSecurity 2`, so site members read their own items and edit their own items, and the
`myWork` piece shows each person exactly the rows the server returns. Why it works: SharePoint bypasses item-level
security for any principal whose permission level holds **Override List Behaviors** (the Microsoft 365 permission
reference lists it as *Override Check-Out*). The default *Full Control* and *Design* levels hold it; the default *Edit*
level of the site Members group does not, and neither does *Contribute*. *Manage Lists* plays no part: a level that
holds Manage Lists without Override List Behaviors is still trimmed to its own items. So the script's "List security"
section (run before the document upload, from the `listSecurity` entries of `pages.json`, whose titles are the constants
of `services/lists.ts`) breaks each list's permission inheritance keeping the existing grants, gives the site's Owners
group Full Control (they read every row, as the admin dashboard needs), gives the same to every site group the entry's
`fullControlGroups` names (since 1.0.0.14 that is `OperatorsGroup` on both lists, so a person in the operators group
holds Full Control there and, without being a site owner, reads every request row and not only the rows they sent),
clears unique-value enforcement on any column that carries it, and sets the two flags; the Members group is left at their level.
*Why a secured list can carry no unique column:* SharePoint refuses the combination outright, with
`A list for which users can only view their own items cannot have fields that enforce unique values` — it will not
report a collision against a row it will not show. The feature's own `IntakeId` ships with
`EnforceUniqueValues="TRUE"` (`sharepoint/assets/intake-schema.xml`, which this package never rewrites), so the script
clears the flag on the site before it secures each list, and names every column it clears. The column keeps its index
and its Required flag: the id stays the record's identity and stays fast to look up, and nothing rests on the
database-level guard, because a retry finds its own row by reading the key back (`services/GovernanceService.ts`) and
a generated id already carries a random suffix. For the same reason no list the script creates declares a unique
column alongside `"security": "ownItems"` — `src/provisioning/listsDefinition.test.ts` refuses the pairing, since a run
that declared it would stop part-way with the list already stripped of its inheritance. Each name in `fullControlGroups` is a parameter of kind `group`, never a
group title, so nothing tenant-bound is committed; a group that is blank or that the site does not carry is reported
with a warning and granted nothing, the list is still secured, and that role then reads only its own rows until the
group exists and the script is rerun. A list the site does not carry is skipped with a
warning (the use-case list until the companion solution is installed), nothing is created, and a rerun changes nothing:
inheritance is broken once and a role already held is not granted twice. The optional `-HardenMembers` switch moves the
Members group from Edit to Contribute on each secured list; that removes Manage Lists (the right to change the list's
design and views) and is a separate hardening, not what makes read security work.

*Companion flows.* The connection the companion Power Automate flows use must hold Override List Behaviors on both
intake lists (Full Control, Design or a custom permission level that holds it), because the flows read and update
every row. An Edit-level connection keeps Manage Lists yet is trimmed to its own items: the flows would see only the
rows their own account created.

*Negative access test (tenant).* The deciding check for the item-level security decision (plan open decision 3),
run once per tenant with two accounts after the 1.0.0.13 script: as a plain site Member (not an owner) who has
submitted one request, open Status and confirm the piece lists that request only, then open the list in the
SharePoint UI and through REST (`_api/web/lists/getbytitle('AI CoE Pilot Intakes')/items`) and confirm only that
person's rows come back; then, as the flow connection's account or an owner, confirm every row is readable and the
companion flows still write and update rows. Record the outcome on the next line before the decision is closed.
Result: **not yet run** (replace with the date, the two accounts' roles and what each saw; if the Member sees another
person's row, the Member level or a group the Member belongs to holds Override List Behaviors and must be corrected).
The repository side of the same check is `src/security/negativeAccess.test.ts`: a refused read shows *Needs access*
and zero rows on Status and on the first screen, a second person's row never reaches the piece or the strip, a read
trimmed by the server shows no number the list did not give, and a response body with a secret shape never reaches
the DOM. `src/webparts/aiCoeFrontDoor/AiCoeFrontDoorWebPart.test.ts` adds the all-providers-unavailable run over the
built bundle: the draft flow down and every off-site route blank, Start here still renders, the work command keeps the
sentence as a draft and hands off to the guided request, the closed tile reads *Needs access*, and a request saves
and reads back.

**Lists (since 1.0.0.14).** A list the front door needs but the package feature does not provision is declared in the
`lists` section of `pages.json` and created by the script's "Lists" section, which runs before the content document is
uploaded. 1.0.0.14 declares one: *AI CoE Program Measures*, the measures an operator records by hand and the
Enterprise value page reads. Its columns are `MeasureId` (text, indexed, unique, required: the key each measure tile
names), `Value` (number), `Unit` (text), `State` (choice: `MEASURED`, `NOT_ESTABLISHED`, `PENDING_BASELINE`,
`NOT_AVAILABLE`, `INSUFFICIENT_VOLUME`, required), `PeriodStart` and `PeriodEnd` (date), `EvidenceRef` (text),
`EvidenceNote` (multi-line text) and `CohortSize` (number); `Title` is the list's own column. A site without the list
is not an error: every measure then reads *Not available*.

1.0.0.15 declares a second one: *AI CoE Outcome Records*, one row per task outcome recorded on the
*Record a task outcome* page. Its columns are `OutcomeId` (text, indexed, required: the record's key, shown
as *Reference* on the receipt; **not** unique, see *List security*), `RecordedAt` (date), `TaskType` (text), `Outcome` (choice: `Accepted`, `Corrected`,
`Unavailable`, `Stopped`), `ReviewState` (choice: `Reviewed by me`, `Reviewed by someone else`, `Not reviewed`),
`CorrectionCategory` (choice: `fact`, `source`, `audience`, `policy`, `brand`, `action boundary`),
`RouteAvailability` (choice: the five truth labels) and `WorkflowVersion` (text). Every one of them is a choice from
a fixed list or a value the web part writes itself, so nothing typed, prompted or produced can reach the list.

*What the outcome list still records about a person.* No column names the submitter, but SharePoint writes Created By
and Modified By on every item of every list. So this list carries its own security in `pages.json`
(`"security": "ownItems"`, `"fullControlGroups": ["OperatorsGroup"]`, `"hideFromDefaultView": ["Author", "Editor"]`)
and the script applies it where it creates the list: inheritance broken, the owners and the operators group at Full
Control, `ReadSecurity 2 / WriteSecurity 2` last, and the two built-in person columns taken off the default view. A
person therefore reads only the rows they recorded; operators and owners read them all; the columns and the rows
themselves are never removed. `settings.minimumCohort` is what keeps a measure derived from these rows from being
shown for a group too small to be anonymous.

*How a percentage is written.* A measure whose `Unit` is `%` is written as a proportion: 0.62 for 62%, and 1 for the
whole. The tile multiplies a value between 0 and 1 by a hundred and shows a value above 1 as the percentage it already
is (62 also reads *62%*), so 1 reads *100%* and never *1%*; write one percent as 0.01. The list's own description says
the same, where the operator fills the row in.

*Additive only.* The script creates a list the site does not carry (a generic list, whose description is written once,
in the same step that creates it, so a page owner's own wording is never overwritten) and
gives a list it already carries only the columns it lacks, each added to the default view; it never removes a column,
never renames one and never changes a column's type, because a tenant's rows are in it. A later release appends a
column, or declares another list; a column that must mean something else gets a new name and the old one is left where
it is. The script carries a `# Migration:` note that each version adds a line to, and the end-of-run summary names the
lists it ensured. Rerunning changes nothing. The list titles and column names live in `pages.json` and, for the web
part, in `services/lists.ts`; `src/provisioning/listsDefinition.test.ts` checks that the two agree, that every column a
service selects exists on the list, and that a choice column carries the same values the web part maps.

*Rolling it back.* Lists and columns are additive and stay: an older package ignores a list it does not read, and a
list an operator no longer wants is deleted by hand (its rows go with it, so export them first).

*Reverting it.* `Set-PnPList -Identity 'AI CoE Pilot Intakes' -ReadSecurity 1 -WriteSecurity 1` then
`Set-PnPList -Identity 'AI CoE Pilot Intakes' -ResetRoleInheritance`, and the same for *AI CoE Use Cases*; the rows
are untouched. This is the list part of the 1.0.0.13 rollback (see *Rollback* under *Deploy*).

**Who writes which record.** Every record the front door touches, who creates it, who changes it afterwards and who
reads it, so no two writers meet on one row and every reader's view can be named:

| Record | Written by | Updated by | Read by |
|---|---|---|---|
| A request row in *AI CoE Pilot Intakes* (key `IntakeId`, `OVT-AICOE-…`) | the web part, one row per submission from any of the five wizards, `Status` `Submitted - Pilot`; read back by id before the receipt; a retry finds the row and writes nothing twice | the companion flows and site owners in the list UI (status, triage); the web part never updates a row | the person who sent it (the `myWork` piece and the `myRequests` count: their own rows, as the list's item-level security returns them), the admin dashboard (owners: every row), the companion flows (their connection holds Override List Behaviors) |
| A use-case row in *AI CoE Use Cases* (key `CoEID`) | the web part, for the governance workflows only (an AI idea, a tool-check review request, team AI use), `Status` `Submitted`; a retry finds the row by `CoEID` and skips it | the companion flows (triage, approval, outcome) | the admin dashboard; the companion flows |
| An outcome row in *AI CoE Outcome Records* (key `OutcomeId`, `OVT-AICOE-…`; since 1.0.0.15) | the web part, one row per outcome recorded on *Record a task outcome*: five choices, the key, the moment and the version of the questions, read back by id before the receipt; a retry finds the row and writes nothing twice | nobody: no flow and no page updates a row, and the web part never does | the person who recorded it (their own rows, as the list's item-level security returns them), the site owners and the operators group in the list UI; no page of the front door reads the list back |
| A decision row in *AI CoE Decisions* | the companion flows | the companion flows | the admin dashboard |
| Usage rows in *AI Usage Daily*, incidents in *AI CoE Incidents* | the companion telemetry solution (every six hours; an over-budget incident) | the companion telemetry solution (an incident is resolved when spend is back under budget) | the `telemetry` piece on the owners-only Operations page and the legacy landing strip; nothing in the web part writes them |
| The content document, `SiteAssets/ai-coe-pages.json` | the script, on every run, from `pages.json` and the parameters | a page owner by hand in Site Assets, until the next run rewrites it (Site Assets keeps every version) | every page view: the seven content pages and, for the shared footer, the five form pages |
| A draft (`overture-ai-coe-front-door:draft:<workflow>` in the browser's localStorage) | the wizards as answers are given; the work command, as the first answer of the idea wizard | the wizards (kept after a failed or pending submission on a form page, cleared once the record is saved; the legacy view clears it on every submit) | the wizards and the home tiles ("Resume draft") on the same browser only; never sent anywhere |
| A case card on Status | nobody at run time: committed content of `pages.json` (one illustrative card, `EXAMPLE-01`) | the page definition, by a commit | the Status page; a cases list is not part of this release |

The envelope may also carry six optional sections, and a page may name its plane and the role it is written for; each
is lenient and a malformed one is dropped, never the document:

| Key | Shape |
|---|---|
| `shared` | `{ "footer": [ blocks ] }` — the `footer` blocks every page view draws below its content, in the same relative place: the content pages and the five wizard pages alike (any instance whose `contentUrl` is set). Read like a page's blocks, less `hero`, `piece` and `workCommand`, which belong to one page each and are left out here. Meant for the `supportRoute` block, so the pilot's support route is the same help in the same place everywhere |
| `routes` | `{ "<key>": { "label", "href", "state", "verifiedOn", "receiptRef", "fallback", "note", "roles", "carriesReference", "capabilityId" } }` — the named destinations tiles, the call to action, status items and the work command point at. A row needs a `label`; `state` is a truth-state key or activation code; `verifiedOn` (YYYY-MM-DD) and `receiptRef` (the tenant qualification receipt reference) are what an off-site `href` needs before it opens; `fallback` names the row people are sent to while this one is closed (`guidedIntake` by default); `roles` limits the row to role ids (everyone when absent); `carriesReference` lets the hand-off card after a saved request append the record reference to the row's own link as `?ref=<reference>` (see *Receipts*; the fallback link never carries it); `capabilityId` is reserved. Resolution fails closed, in this order: an unknown key goes to the `guidedIntake` row (no such row: "No fallback is configured", no link); roles named and none held, a blank `href`, or a state other than *Available now* keep the label and link to the fallback with their own pill; an *Available now* off-site `href` without a valid, not-future `verifiedOn` or without `receiptRef` shows "Awaiting source" and links to the fallback; a site path or same-origin URL needs neither. Off-site links never carry user text |
| `settings` | `{ "freshnessDays": 30, "minimumCohort": 5 }` — whole numbers (1–3650 and 1–1000); anything else keeps the default |
| `vocabulary` | string maps only, unknown keys ignored, a blank keeps the default: `truthStates` `{ "<key>": { "label", "definition" } }` for `availableNow`, `draftOnly`, `needsApproval`, `needsAccess`, `notSupported`; `requestStatuses` `{ "<code>": "plain wording" }`; `chrome` `{ "badge", "example", "needsRefresh", "awaitingSource", "protectedPage" }` (`badge` is the wizard-page header badge, default "Governed intake"); `roles` `{ "<roleId>": "name" }`; `telemetry` `{ "<feedId>": "name" }`. `{organization}` and `{role}` in the text are filled by the web part, not by the script |
| `release` (since 1.0.0.14) | `{ "id", "publishedAt", "source" }` — what the provisioning run called the content it uploaded (`ContentRelease`, or the time of the run when that parameter is blank), the day it published it (YYYY-MM-DD) and where it wrote it. Written by the run, never by hand; a release without an `id` is dropped and no date is invented for one without `publishedAt` |
| `bindings` (since 1.0.0.14) | `[ { "name", "kind", "state", "receiptRef" } ]` — one row per `url`, `optional` and `group` parameter, with `kind` one of those three and `state` `bound` or `awaiting`, exactly as the run's end-of-run summary prints them. Written by the run; a row missing a name, a known kind or a known state is dropped. No value travels with a row, except `receiptRef` on a bound qualification receipt, which names a record. Rendered by the `bindings` block on an operator page |
| page `plane` | `user` (default) or `operator` |
| page `requiredRole` (since 1.0.0.14) | a role id or a list of them, any one of which opens the page (`employee`, `leader`, `operator`, `designAuthority`). The site's own permissions are what actually keep a page shut — the script grants the same groups from the page's `permissions` — so this only tells someone who does reach the page whose page it is: they see the protected wording and no block, and no piece of the page asks a list for anything |

The truth states are the five plain-language states of the activation playbook, with their definitions:
Available now, Draft only, Needs approval, Needs access, Not supported. The web part also knows the six activation codes
(`DESIGNED`, `QUALIFIED`, `AVAILABLE`, `ACTIVE`, `PAUSED`, `RETIRED`), the plain wording of the four pilot statuses
and the 26 canonical status codes (anything else reads "Status unavailable"), and the placeholders a measure shows
instead of a number (`src/webparts/aiCoeFrontDoor/content/truthStates.ts`).

**The sixteen pages** described in `sharepoint/pages/pages.json` (five in the top navigation, the Prompts page linked
from Learn and Use AI, the two operator pages behind their site groups — Operations and Enterprise value — the pilot
team's start page behind its own group, five form pages and the outcome record under Requests, one owners-only admin page), each with one
front-door instance and, for the nine content pages, the blocks of the content document. A page may be keyed on a
parameter with `skipWhenBlank` (since 1.0.0.15 the role start names `PilotTeamName`): a run without a value for it
builds no page, uploads no blocks for it, adds no navigation node, and drops every tile, card and in-text link that
targets it, each with a warning, so nothing on the site points at a page that was not built:

| Page | Instance | Blocks |
|---|---|---|
| Start here (site home) | `page`, key `startHere` | hero with the operating promise and no call to action, the `workCommand`, three `prominent` tiles on the `work`, `improve` and `value` routes, a `statusStrip` (the assistant with its verified date, Requests, and the person's own request count linked to Status), the leader block (`cards` with `audience` `["leader"]`, two static links: enterprise AI value through the `value` route, and Status), the three rules, the data-boundary `notice`, the private-pilot `notice` (dropped by the script when `PilotTeamName` is blank), the "What this site records" `notice` (since 1.0.0.15; unconditional), the three illustrative `workflowCards` (unconditional: a tenant that names no pilot team still sees the three workflows), three persona cards, and a card to the pilot team's start page (dropped with that page when `PilotTeamName` is blank) |
| Learn | `page`, key `learn` | intro, an unnumbered orientation `rules` list, four exercise cards with a duration kicker (the fourth ends at the outcome record since 1.0.0.15), how completion is checked, a note for team leads and the link to Prompts |
| Use AI | `page`, key `useAi` | the one prompt pattern, prompt cards by audience with their data boundaries as meta lines, what the page does not do |
| Requests | `page`, key `requests` | the three lanes (the governance bodies are parameters), what is not asked of you, registering AI already in use, the data-boundary `notice`, then the `home` piece (the five path cards, the outcome record as a sixth since 1.0.0.15, and the resource strip; return page for every form; no snapshot link, since the strip sits on the owners-only Operations page) |
| Prompts (out of the navigation since 1.0.0.13; linked from Learn and Use AI) | `page`, key `prompts` | three starter prompts, what is in the library, what Draft means |
| Status | `page`, key `status` | the `myWork` piece (the person's own requests, trimmed by the list's item-level security), the one illustrative `caseCards` example, what is running (the assistant through its route, dated by `AssistantVerifiedDate`) and what is not (closed as *Not supported*, dated by `StatusDate`), how to check a request (with the link to the outcome record since 1.0.0.15), what to do when something is wrong |
| Operations (site owners and the operators group, not in the nav, operator plane) | `page`, key `operations`, `permissions` `groups:OperatorsGroup`, `requiredRole` `["operator"]`, with `telemetryProvider` (the only instance that uses it) and `plane` `operator` | the heading "Operations diagnostics", the `telemetry` piece under the kicker "Diagnostics: usage and cost, not a measure of value", its tiles named from `vocabulary.telemetry` (the feed, never a provider), then the `bindings` block: what this content release is and which tenant inputs the site holds |
| Enterprise value (site owners, the leaders group and the operators group, not in the nav, operator plane; since 1.0.0.14) | `page`, key `value`, `permissions` `groups:LeadersGroup,OperatorsGroup`, `requiredRole` `["leader","operator"]`, `plane` `operator` | the heading "Enterprise AI value", the "How to read this page" `notice`, the three measure tiles (`kpi`: `useful-safe-completion-rate`, `median-time-to-useful-outcome`, `repeat-use-useful-completion-rate`, each read from the *AI CoE Program Measures* list and shown as a placeholder with its evidence note until it is measured), then the three illustrative Hypothesis / Forecast / Realised cards, which carry no figure |
| The pilot team's start (the pilot group, not in the nav; since 1.0.0.15) | `page`, key `roleStart`, file `Pilot-start.aspx`, title `{PilotTeamName} start`, `permissions` `groups:PilotGroup`, `skipWhenBlank` `PilotTeamName` | the hero "Start with one real task.", the three illustrative `workflowCards` with their worked examples, the three rules (Start here's, word for word), the five checks before you accept a result as an unnumbered `rules` list, the ten-minute quick start and the prompt pattern as two cards, and the "Start small" `notice`. The page binds no role: the site group is what keeps it shut, and the card on Start here is its only link |
| Explore an AI idea, Check a tool or task, Register team AI use, Get help or training, Share feedback | one wizard each, `returnUrl` Requests, `contentUrl` set so the shared footer (the support route) shows below the wizard; the idea page alone carries `draftServiceUrl` | none of their own; the document's `shared` footer |
| Record a task outcome (a child of Requests; since 1.0.0.15) | `outcome`, key `outcome`, file `Record-a-task-outcome.aspx`, `returnUrl` Status (where the person's own work is), `contentUrl` set so the shared footer shows below it | none of its own; the piece is the outcome record, five questions that are all choices — task type, how it went, whether a person reviewed it, what kind of correction it needed (asked only after *Corrected*) and what the page said about the route — and one row in *AI CoE Outcome Records* |
| AI CoE admin dashboard (site owners only, not in the nav) | `admin`, `returnUrl` Requests | none |

**The outcome record (since 1.0.0.15).** *Record a task outcome* is a page of its own, a child of Requests, reached
from the sixth home card (the `outcome` entry of a home piece's `pages` map in the content document, or the property
`pageOutcome` on a hand-placed Home tiles instance), from Status ("Used AI for a task?") and from the fourth Learn
exercise. It is a wizard like the other five, but every one of its questions is a
choice: there is no free-text step in it at all, so a prompt, an answer, a document name or a client name cannot be
typed into it. What it writes is one row in *AI CoE Outcome Records*: `TaskType`, `Outcome`, `ReviewState`,
`CorrectionCategory` (asked only after *Corrected*), `RouteAvailability`, the `OutcomeId` shown on the receipt, the
time it was saved and the workflow version. Start here says the same thing to the person, in the notice *What this
site records*:

> When you record how a task went, only the task type, outcome, review state, correction category and route availability are saved, together with SharePoint's own record of who saved it, which only operators can see. Your prompt and the output are never stored. The feedback form is different: what you type there is kept as text.

Two details of the wizard are worth knowing. Its five *route availability* options are the shipped truth-state
labels even on a site that renames them through `vocabulary.truthStates`, because they are the Choice values of the
`RouteAvailability` column and renaming them there would stop the row matching the list. And an unfinished outcome
draft resumes when the page is opened again but shows no **Resume draft** badge on the home tiles, which read the
five shipped workflows only.

That last sentence of the notice is the honest part: *Share feedback* is a wizard with typed answers, and those
answers are stored as text in the intake list, as they always were. The outcome record is the only piece in the front door that promises
otherwise, and it keeps the promise by having nothing to type.

*Who can read an outcome row.* No column of the list names the person, but SharePoint stamps **Created By** and
**Modified By** on every item of every list, so the rows are pseudonymous, never anonymous. The list is therefore
created with its own item-level security (`"security": "ownItems"` in the `lists` section): the submitter reads only
the rows they recorded, the site owners and the operators group read them all, and the two built-in person columns
are taken off the default view so a page owner opening the list is not shown a name the page never asked for. When a
measure is one day derived from these rows, `minimumCohort` in the document's `settings` is what keeps it from being
shown for a group small enough that a single person's rows could be picked out of it.

The text is the front door's own copy of a short pilot site and carries tokens: `{OrganizationName}` and the other
`parameters` declared at the top of `pages.json` (people, dates, counts, record ids), `{Page:key}` for links between the
pages, and `{Url:Name}` for links to things outside the package (the assistant, Teams, the chat tool, the prompt
library, the support route). No product name is committed: the assistant and the chat tool are named by the
`AssistantName` and `ChatName` parameters, the governance bodies by the three `GovernanceBody*` parameters (blank
reads "a named approver (not yet named)", the fast path "the AI CoE") and the support owners by the six `*OwnerLabel`
and `BusinessApproverLabel` parameters (blank reads "not yet named"). The two off-site routes (`work`, `assistant`)
take their `state`, `verifiedOn` and `receiptRef` from parameters and stay closed, falling back to the guided request,
until all three are set after tenant proof; the on-site routes (`guidedIntake`, `improve`, `value`,
`valueFallback`) are available by content because the same script provisions their pages. Since 1.0.0.14 a route row
may name `roles`: `value` leads to the Enterprise value page for a leader or an operator and, for anyone else, to
its `valueFallback` row (Status), exactly as a closed route falls back. A block that names a parameter in
`skipWhenBlank` is dropped, with a warning, when that parameter is blank (the pilot notice, keyed by
`PilotTeamName`). Every claim the pages make that rests on something outside the committed text (a verified date, a
truth state, a route whose proof comes from the tenant, a default literal the bundle still carries) has a row in
`docs/content-claims.md` with its state, class, owner and what the pages may say until it is proved;
`src/provisioning/contentClaims.test.ts` keeps the ledger complete against `pages.json` and the bundle. Each parameter declares a `kind`: `text` parameters are required; `url` parameters may be blank, which turns
an in-text link into its label and marks a tile or call to action pointing at it `needsAccess`, so it stays on the
page shown as closed (a labelled non-link with its state; the script says which); `optional` parameters may be blank
too, and a blank one takes the `default` its declaration carries (only an `optional` parameter may declare one) or
stays empty; a `group` parameter (since 1.0.0.14) carries the title of a site group, which the script looks up on the
site once, and a blank or unknown title is a warning rather than an error: the page that names the group stays
owners-only and the role the group would bind stays unbound. Tokens inside the `routes` table and the `shared` sections are resolved the same way; the `vocabulary`
and `settings` sections are copied as written. `src/provisioning/pagesDefinition.test.ts` checks the structure, the
tokens, that the web part's parser accepts every block once the tokens are resolved, and that no word of the tenant
list is in the file: `src/provisioning/tenantWords.json` is the one list of client names, tenant hosts, the reference
roster, case ids and secret shapes that the provisioning tests scan `pages.json`, `parameters.sample.json` and the
script against. That list is deliberately not tenant-neutral (it is what the scans look for), lives outside
`src/webparts`, is imported by nothing in the web part and is never packaged.

**Page permissions.** Every page declares one of three modes. `inherit` leaves the page with the site's own
permissions. `owners` gives the site's Owners group Full Control and nobody else: the admin dashboard and the
Operations page. `groups:<Name>[,<Name>]` (since 1.0.0.14) does the same and gives Read to each site group named,
where every name is a `group` parameter, so the group titles stay in `parameters.json` and no tenant's group is
committed. In both cases the script resets the page's item permissions first (breaking inheritance on an item that is
already unique would keep stray grants from an earlier run), so SharePoint itself refuses the page to everyone else;
the role a page asks for in the document decides only what the web part offers and is never the access control. A
group parameter that is blank, or that names a group the site does not carry, grants nobody, which leaves that page
owners-only rather than open.

**Instance properties (since 1.0.0.14).** Every front-door instance carries the properties `pages.json` declares for
it (`view`, `pageKey`, `contentUrl`, `layout`, the Branding properties from their parameters), and two the script
composes. `roleGroups` pairs each role id with the site group of a `group` parameter
(`leader=…;operator=…;designAuthority=…`): the definition binds the roles, the parameters carry the titles, and only
the pairs whose group this site carries are kept, so a group that is blank or not there leaves its role unbound.
`paletteOverrides` carries the `Palette` parameter, so a tenant's colours are a parameter and never code; blank keeps
the shipped colours.

*On a page that already exists* the properties are **updated in place**: the script reads the page's front-door
instance, writes the bag with `Set-PnPPageWebPart -PropertiesJson` and republishes the page. The page itself, its
sections and any edit made to it in the browser are left as they are, so a site upgraded from an earlier version takes
this version's properties without `-Overwrite`. If the update fails (no front-door instance on the page, a page locked
by an open editor, a refused write) the script says so, names the page and goes on, and the way out is to rerun with
`-Overwrite` or to set the values in that instance's property pane.

*What `-Overwrite` costs.* `-Overwrite` recycles pages and nothing else: **every page `pages.json` declares** that
already exists, the five form pages and the admin page included, is sent to the site recycle bin and rebuilt from the
definition; browser edits are recoverable from the recycle bin but are not carried over. No list, column, row or list
permission is touched by it (see *Lists*). Reach for it to rebuild a page's layout, not to move a property.

*The bindings summary.* Each run ends by naming the content release (the `ContentRelease` parameter, or the date and
time of the run) and then every `url`, `optional` and `group` parameter as `BOUND` or `AWAITING`, with its kind. A
parameter this run was not given reads `AWAITING` even where a declared default stands in for it, and a group title
the site does not carry reads `AWAITING` because the role behind it stays unbound. Only the name, the kind and the
state are printed: a value belongs to the tenant and never goes to the console.

**Applying it** (site owner, outside this repository; the build and tests never touch a tenant):

1. Deploy 1.0.0.16 and "Get it" on the site, so the component is available to the script. Create the site groups
   the definition binds (leaders, operators, design authority, and since 1.0.0.15 the pilot team's) before the run,
   so the pages that name them are not left owners-only.
2. Copy `sharepoint/pages/parameters.sample.json` to `sharepoint/pages/parameters.json` (ignored by git), fill in the values.
3. Run, with PowerShell 7.4 and the pinned PnP.PowerShell version from the script header: the script is written for
   that version and no other. `src/provisioning/pnpCmdletParameters.json` records, per cmdlet, the parameters that
   version accepts, and the suite fails on a parameter it does not have, because a wrong one binds only at run time
   and would stop the run on the site. Regenerate that file and change the `#Requires` line together. Interactive login needs
   your own Entra app registration once (`Register-PnPEntraIDAppForInteractiveLogin`); pass its id with `-ClientId`,
   or set the `ENTRAID_CLIENT_ID` environment variable and omit the parameter:

       pwsh ./sharepoint/pages/New-FrontDoorPages.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ParameterFile ./sharepoint/pages/parameters.json -ClientId <app id>

   Optional, appended to that line: `-DraftServiceUrl <flow trigger URL>` for the AI draft flow,
   `-TelemetryProvider openai` or `both` (the default is `claude`), `-Overwrite` to rebuild pages that already
   exist, and `-HardenMembers` to move the site Members group from Edit to Contribute on the secured intake lists
   (see *List security*; not needed for read security). Every parameter is named; anything else on the line is rejected.

   The script first checks that the front-door component is available on the site (and stops if it is not), then
   looks up the site group of every `group` parameter (see *Page permissions*), then
   puts the two intake lists under item-level security (see *List security*; a list the site does not carry is
   skipped with a warning), then ensures the declared lists (see *Lists*; a missing list is created, an existing one
   is given only the columns it lacks and keeps its rows), then
   resolves the tokens and uploads the content document to Site Assets (creating the library if the site has none,
   and reading the file back to make sure), then creates the pages, verifying after each one that SharePoint bound
   the component to the instance. A page that already exists is not rebuilt: its front-door instance's properties are
   updated in place and the page is republished (see *Instance properties*), so the page keeps its content and its
   browser edits. `-Overwrite` instead sends every existing page
   to the site recycle bin and rebuilds it from `pages.json`: edits made in the browser are recoverable from the
   recycle bin, not carried over. `-Overwrite` recycles pages and nothing else: every page `pages.json` declares,
   the five form pages and the admin page included, is rebuilt; no list, column, row or list permission is touched by
   it, and the lists stay additive on every run (see *Lists*).
   A page whose build fails part-way is recycled so the next run recreates it. The
   navigation is rebuilt every run; it replaces every QuickLaunch node, including the three list links the package
   feature adds and the template defaults. The admin page and the Operations page get owners-only item permissions
   (see *Page permissions*). This needs a
   communication site, whose horizontal top navigation is the QuickLaunch; on any other site the script stops unless
   `-AllowNonCommunicationSite` is given, because there the QuickLaunch is the left navigation.
   On a site that already carries the pages of an earlier version, run without `-Overwrite`: the content document is
   rewritten from `pages.json`, so the existing content pages show the new document at once (the first screen, the
   routes, the shared footer; my work and the case card on Status); every existing page keeps its content and gets its
   instance properties updated in place, so `contentUrl` on the five form instances and the Branding properties
   (`governanceReference`, `reviewSystemName`, `roleGroups`, `paletteOverrides`) arrive without rebuilding anything
   (see *Instance properties*); the intake lists are secured and the declared lists ensured on every run; and a page
   the definition adds — Operations, Enterprise value, the pilot start and the outcome page — is created on that run
   with the permissions its `groups:` mode names, unless a `skipWhenBlank` parameter of its own is blank. The
   end-of-run summary names the release and every binding that is still `AWAITING` a value.
4. Open each page once: check the narrow layout where a piece sits in a column, and add the links behind the tiles
   and calls to action the script reported as shown as closed once their URL parameters are known (rerun with
   `-Overwrite`, or edit the document in Site Assets).

Manual fallback: upload a hand-written `ai-coe-pages.json` to Site Assets, create the sixteen pages by hand, add the
matching toolbox entry to each (**AI CoE: Content page** with the page key for the nine content pages, **AI CoE:
Record a task outcome** for the outcome page), type the
return page into the form pages' property pane, paste the AI draft flow URL on the Explore an AI idea page, pick
the usage metrics provider on Operations, restrict Operations and the admin page to site owners, and edit the
navigation in the site header.

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
| `PilotTeamName` | `parameters.json` | optional | the private-pilot notice is dropped from Start here, and the pilot team's start page is not built at all (with the card that leads to it) |
| `PilotMembers` | `parameters.json` | optional | "the named pilot members" (the declared default; the notice itself is dropped when `PilotTeamName` is blank) |
| `GovernanceReference` | `parameters.json` | optional | default wording (see "Branding"); reported AWAITING in the run summary |
| `ReviewSystemName` | `parameters.json` | optional | default wording (see "Branding") |
| `LeadersGroup` | `parameters.json` (a site group title) | group | the leader role stays unbound and a page that names the group stays owners-only |
| `OperatorsGroup` | `parameters.json` (a site group title) | group | the operator role is held only by site owners, and a page that names the group stays owners-only |
| `DesignAuthorityGroup` | `parameters.json` (a site group title) | group | the design authority role stays unbound |
| `PilotGroup` | `parameters.json` (a site group title) | group | the pilot team's start page stays owners-only (the page itself is only built when `PilotTeamName` is set) |
| `ContentRelease` | `parameters.json` | optional | the run names the release by its own date and time in the summary |
| `Palette` | `parameters.json` | optional | `paletteOverrides` is cleared on every instance and the shipped colours stand |
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
| `roleGroups` | web part property (Branding), written by the script from the group parameters (1.0.0.14) | property | no site group is bound: everyone holds the employee role, a site owner also the operator role, and a page that asks for another role is not offered |
| `paletteOverrides` | web part property (Branding), written by the script from `Palette` (1.0.0.14) | property | no palette token is set and the shipped colours stand |
| `draftServiceUrl` | web part property (AI drafting) on the idea page, written by the script from `DraftServiceUrl` | property | plain summaries |
| `telemetryProvider` | web part property (Telemetry) on Operations, written by the script from `TelemetryProvider` | property | `claude` |
| AI CoE Pilot Intakes | the package feature (`sharepoint/assets/intake-schema.xml`), untouched on upgrade | list | absent: a submission fails and the visitor sees the shipped failure screen |
| AI CoE Use Cases | the companion Power Automate solution | list | absent: the dashboard section reads as unavailable |
| AI CoE Decisions | the companion Power Automate solution | list | absent: the dashboard section reads as unavailable |
| AI Usage Daily | the companion telemetry solution | list | absent: every usage tile keeps "Awaiting data" |
| AI CoE Incidents | the companion telemetry solution | list | absent: no alerts are shown |
| AI CoE Program Measures | the script's "Lists" section, from the `lists` entries of `pages.json` (since 1.0.0.14) | list | absent: every measure reads "Not available" |
| AI CoE Outcome Records | the script's "Lists" section, from the `lists` entries of `pages.json`, with the item-level security of its own declaration (since 1.0.0.15) | list | absent: an outcome cannot be saved and the page reports it as not available on this site (failure class `SOURCE`), with the answers kept; nothing else reads the list |
| Item-level security on AI CoE Pilot Intakes and AI CoE Use Cases (since 1.0.0.13) | the script's "List security" section, from the `listSecurity` entries of `pages.json`, on every run | list security | script not run: the lists keep the site's inherited permissions, every site member reads every row, and the `myWork` piece shows whatever the server returns; run the script, then the two-account test under *List security* |
| The Operations page (since 1.0.0.13) | created by the script, behind `OperatorsGroup` from 1.0.0.14 (owners always), with `telemetryProvider` from `TelemetryProvider`; its plane and blocks in `pages.json` | page | not created (the script not run): the strip is on no page; the legacy landing keeps its own |
| The Enterprise value page (since 1.0.0.14) | created by the script, behind `LeadersGroup` and `OperatorsGroup` (owners always); its plane, measures and blocks in `pages.json` | page | not created (the script not run): no page reads the measures list, and the `value` route falls back to Status for everyone |
| The pilot team's start page (since 1.0.0.15) | created by the script from `PilotTeamName` (its title and its `skipWhenBlank` key) and behind `PilotGroup` (owners always); its blocks in `pages.json` | page | not created (no pilot team named, or the script not run): the card on Start here that leads to it is dropped with it, and no other page links to it |
| The *Record a task outcome* page (since 1.0.0.15) | created by the script as a child of Requests; the sixth card reaches it through the `outcome` entry of the Requests home `piece` block in the content document (the `pageOutcome` property does the same for a hand-placed Home tiles instance); its piece is the outcome record, its list *AI CoE Outcome Records* | page | not created (the script not run): the sixth card is not shown, nothing writes outcome rows, and the rest of the front door is unchanged |
| `vocabulary.telemetry` (since 1.0.0.13) | the `vocabulary` section of `pages.json`, copied verbatim into the content document | document text | a missing feed label keeps the bundle's feed name for that tile (a portability exception below) |

Rebinding in the contract's order: **export and package** with `npm ci`, `npm run build` and `npm run verify`
(the `.sppkg` and the two evidence files); **rebind the tenant configuration** with a new `parameters.json` from the
sample and the property pane values above; **reauthorize the connections** (approve the package's Microsoft Flow
Service / User request, point `DraftServiceUrl` at the new tenant's flow, reconnect the companion solutions);
**remap identities and sources** (the site's owners group, the four companion lists, the usage rows, the
companion flows' connection with Override List Behaviors on the secured intake lists); **requalify**
(the tenant acceptance steps under "Deploy", the two-account list-security test, a qualification receipt for each
off-site route, the tenant inventory that fills the `AWAITING_TENANT_INVENTORY` fields of
`evidence/dependency-inventory.json`); then **activate** by
setting the route states, dates and receipt references and rerunning the script. Workflow logic, schemas, the
content document's structure and the tests travel unchanged.

## Portability exceptions

What the built bundle still carries from its first tenant, each with an owner and how it moves (GOV-113). A test
(`src/portability/thrownAway.test.ts`) holds this table to the list:

| Exception | Where | Owner | Migration treatment |
|---|---|---|---|
| `TESS`, the review-system name | the blank value of `reviewSystemName` in `branding/branding.ts`; rendered in the legacy view only, read by `services/toolPolicyEvaluator.ts` and `summaries/teamUsageSummary.ts` | AI CoE | set `ReviewSystemName` on rebind and the literal is never rendered; the literal leaves the bundle when the legacy view's parity pin is retired |
| The governance reference, "version 1.1, August 26, 2026" | the blank value of `governanceReference` in `branding/branding.ts`; rendered in the legacy view only | AI CoE policy owner | set `GovernanceReference` on rebind; the script reports it AWAITING until then |
| `OVT-AICOE-`, the record id prefix | `services/intakeId.ts`; the `IntakeId` column of AI CoE Pilot Intakes (unique key), relied on by the companion flows, and since 1.0.0.15 the `OutcomeId` column of AI CoE Outcome Records (the same generator, the same prefix, shown as *Reference* on that page's receipt) | AI CoE records owner | kept as the record key of both lists; a tenant work-id prefix waits for a work-records list; existing rows keep their ids |
| `overture-ai-coe-front-door:draft:`, the localStorage draft key prefix | `content/constants.ts` | front-door maintainers | kept: drafts are per browser and per pilot; renaming would orphan drafts in progress |
| `overture-ai-coe-pilot`, the DOM scope id, the `.overture-*` classes and `overture-confirm-title`, the confirm dialog heading id | `content/constants.ts`; `styles/theme.global.scss` (the shipped stylesheet, reproduced rule for rule); `controls/ConfirmDialog.tsx` | front-door maintainers | kept: the stylesheet parity suite pins every rule and the legacy screens are parity-locked; changes only with a deliberate stylesheet release; with the package name, the solution name, the draft key prefix and the download file names these are the documented identifiers the verifier masks before its client-word scan of the archive |
| The telemetry feed labels (`Claude API spend this month`, `OpenAI API spend this month` and the rest) | `content/telemetryTiles.ts`, `services/UsageMetricsService.ts` | AI CoE operations | product names of the usage feeds, not of a tenant; the legacy strip keeps them verbatim (parity); the page-view strip on the owners-only Operations page (1.0.0.13) takes its labels from `vocabulary.telemetry`, so the page names the feed and never a provider |
| The vendor name in the shipped list schemas (site column group) and in the package publisher block | `sharepoint/assets/*.xml` (byte-identical to 1.0.0.7); the developer block of `config/package-solution.json` | package maintainers | metadata, never rendered; changing the schemas would break the in-place upgrade; with the documented identifiers above, the two are the recorded exemptions of the verifier's package scan |
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
    src/provisioning/                 checks on the page definition, the provisioning script (with the cmdlet
                                      parameters of the pinned PnP.PowerShell version), the tenant word list,
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
- A few of those additive rules read a tenant colour as `var(--fd-x, <literal>)` (see "Palette override"). No
  stylesheet declares a `--fd-` value: the web part sets them on its own element and a declaration inside would win
  over it. `styles/palette.test.ts` reads every compiled stylesheet and holds that line, the fallback literals and
  the rules each token is read in.
- The stylesheets must keep the `.global.scss` suffix: the SharePoint Framework loader hashes every selector of any
  other stylesheet name as a CSS module (`AiCoeFrontDoorWebPart.test.ts` asserts the injected selectors).
- `AiCoeFrontDoor.module.scss` is the one CSS module (two classes), as shipped.

## Tests

`npm test` runs 901 tests in seven layers: pure modules (branding, definitions, page views, the content document
parser and markup, form engine, services, summaries), React Testing Library component and journey tests with fake
services (including every content block), bundle-level lifecycle tests that
load the built AMD bundle in a simulated SPFx host, a journey parity suite that plays every workflow through the
shipped 1.0.0.7 bundle and the port side by side (screens, drafts, downloads and posted list items must match), the
stylesheet parity test plus the page view and responsive stylesheet guards, a preview-server test, a hostile-document test (script
tags, executable link schemes, a 200 kB string, arrays nested fifty deep and `__proto__` keys render as text and dead
anchors), the negative-access suite over the list security (`src/security/negativeAccess.test.ts`, see *List
security*), and static checks on the page definition, the provisioning script, the tenant word list, the claims
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

Since 1.0.0.13 every submission is read back before the page may say it was saved: after the POST the service reads
`items(<Id>)?$select=Id,IntakeId,Modified` and reports the record *saved* only when the row comes back under the same
identifier; a write that was accepted but not confirmed is reported *pending* (class `INCONCLUSIVE`), never as a
failure. A retry hands the same identifier back, and the service then looks the rows up (`IntakeId eq`, and `CoEID eq`
on the use-case list) before writing anything, so a retry completes the record and never duplicates it. The POST
bodies and their order are unchanged; the parity trace compares screens, drafts, downloads and POSTs, not GETs.

## Provenance and rules

`original/` keeps the shipped package unchanged, `recovered/` its byte-exact extraction and `docs/RECOVERY.md` the
recovery method. The JavaScript reassembly tooling of the recovery was retired once this port reached parity;
`scripts/extract.py` and `tests/test_extract.py` remain for the package extraction.

Keep this repository internal. Git is local-only; nothing is pushed or deployed from here. No secrets are stored.
