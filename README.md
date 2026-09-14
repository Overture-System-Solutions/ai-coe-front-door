# AI CoE Front Door — SharePoint Framework web part

A SharePoint Framework (SPFx 1.23.2, React 17, TypeScript) web part that gives an AI Center of Excellence a governed
front door: five guided intake workflows (idea, tool or task check, team AI-use disclosure, help or training,
feedback), a telemetry snapshot and an administrator dashboard, all writing to SharePoint lists.

This project is the maintainable source for the web part that shipped as package **1.0.0.7** (`original/`). The
shipped package was reverse-engineered (see `docs/RECOVERY.md`) and then ported to idiomatic TypeScript with a
test-first approach. It builds the next in-place upgrade, **1.0.0.10**, with the same solution, feature and web part
identities, and it is tenant neutral: the organization name is a web part property. Since 1.0.0.10 the front door can
also be spread over several native pages, one piece per page (see "Lay out the front door across pages").

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
  with its links pointing back at the preview, `?layout=narrow` the narrow layout, and `?width=560` caps the mount so
  a section column can be eyeballed. `npm run preview -- --port 4174` changes the port;
  `npm run preview -- --bundle <path>` previews another bundle, for example the shipped one under
  `recovered/package/ClientSideAssets/`.
- `npm start` runs `heft start` for the SharePoint hosted workbench (requires a tenant; not needed for local work).

## Deploy 1.0.0.10

Upload `sharepoint/solution/overture-ai-coe-front-door.sppkg` to the app catalog as an update of the existing app.
The solution id (`f125ebdf-4a9d-4e6e-8479-3a18874e7752`), feature id (`69ab84b7-608c-47ee-9623-af8ebaf2cb10`,
version 1.0.0.2) and web part id (`cf2e5904-0703-4fe4-ae5a-ec012d6fa689`) are unchanged, so the three provisioned
lists (AI CoE Pilot Intakes and its two schemas under `sharepoint/assets/`) are left untouched. The other four lists
the web part reads (AI CoE Use Cases, AI CoE Decisions, AI Usage Daily, AI CoE Incidents) are provisioned by the
companion Power Automate demo solution, exactly as before.

After deployment, open the web part's property pane and set **Organization name**. The **Telemetry → Usage metrics
provider** dropdown defaults to Claude (see below). Existing instances keep rendering the whole front door on one
page: the new **Page layout → Piece shown on this page** dropdown defaults to that, and the new properties are
ignored until another piece is chosen.

### Enable Claude drafting of idea summaries

The idea workflow can ask the "OSS Demo - Claude Intake Draft" Power Automate flow (the organization's Claude
custom connector) for the summary draft. The browser never holds a model key: the web part calls the flow's HTTP
trigger with a Microsoft Entra token for the Power Automate service, issued by the framework for the signed-in user.
Three one-time steps, all outside this repository:

1. In the flow, set the trigger's **Who can trigger the flow** to **Any user in my tenant** (it ships restricted to
   one user). Copy the trigger URL after saving.
2. In the SharePoint admin center, **API access** page, approve the pending request from this package:
   **Microsoft Flow Service / User**. If the page reports that scope as unavailable on your tenant, change the
   `scope` in `config/package-solution.json` to a delegated permission the tenant exposes (for example
   `Flows.Read.All`), rebuild and re-upload; the flow only checks the token's audience and the caller's identity.
3. In the web part's property pane, **AI drafting → Claude draft flow URL**, paste the trigger URL.

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
| Workflow header | Contoso AI CoE Lab | AI CoE Lab |
| Hero badge | CONTOSO AI COE | AI COE |
| Downloaded summaries, first line | Contoso AI CoE — *workflow title* | AI CoE — *workflow title* |
| Policy reference on review requests | Contoso AI CoE governance controls, version 1.1, August 26, 2026 | AI CoE governance controls, … |
| Company-information help text | …includes Contoso, client, partner, and internal work information… | …includes company, client, partner, and internal work information… |
| External-sharing question | Would the output be shared outside Contoso? | Would the output be shared outside the organization? |
| Team AI-use disclosure | …helps Contoso provide better guidance… / …real AI use at Contoso. | …helps the organization… / …real AI use at the organization. |

Data contracts never change: intake ids (`OVT-AICOE-…`), list titles and field names, the localStorage draft keys
(`overture-ai-coe-front-door:draft:*`), download file names (`overture-ai-coe-*.txt`) and the DOM scope id
(`overture-ai-coe-pilot`). The word "Overture" does not appear in the built bundle (a test enforces this).

## Lay out the front door across pages

The shipped experience is one web part that switches screens in memory. Since 1.0.0.10 each instance can instead
render exactly one piece, so the front door can be laid out over native site pages under a top navigation, beside
Text and Quick Links web parts, in the style of a short communication site. The wizards, drafts, list writes and
downloads are unchanged; only where the pieces sit and how they link to each other differs.

**Properties** (group *Page layout*, and *Page links* for the home tiles):

| Property | Values | Meaning |
|---|---|---|
| `view` | `legacy` (default), `home`, `idea`, `toolCheck`, `teamUsage`, `helpTraining`, `feedback`, `telemetry`, `admin` | The piece this instance renders. `legacy` is the whole front door as shipped; an instance whose property bag predates 1.0.0.10 parses to it. |
| `layout` | `wide` (default), `narrow` | `narrow` stacks cards, strip and tiles for a half or one-third column. |
| `returnUrl` | site path (`SitePages/Requests.aspx`), root path or full URL | Where "All topics", "Back" on the first question and the dashboard's "Front Door" lead; blank returns to the site home. |
| `pageIdea` … `pageFeedback`, `pageTelemetry`, `pageAdmin`, `pagePolicy` | same forms | Home tiles only: where each card, the resource strip and the admin bar link. A blank workflow page hides its card; `pageTelemetry` adds an "AI operations snapshot" entry to the resource strip; a blank `pagePolicy` keeps the policy library link. |

The toolbox offers one entry per piece (**AI CoE: Home tiles**, **AI CoE: Explore an AI idea**, …) on the same
component, each presetting `view`; the original **AI CoE Front Door** entry stays the single-page version. Exits from
a piece are full page loads; the home tiles are ordinary links, so the page router and the browser back button work.
Drafts stay in the browser's localStorage and are shared by every instance on the site, so a draft begun on a form
page shows as "Resume draft" on the home tiles when that page next loads, and a form page resumes its draft on load.
Place **one instance per page**: the DOM scope id and several heading ids are document-global.

**The twelve pages** described in `sharepoint/pages/pages.json` (six in the top navigation, five form pages under
Requests, one owners-only admin page):

| Page | Piece on it | Around it |
|---|---|---|
| Start here (site home) | none | intro line, four Quick Links tiles, prompt cards, persona cards, status and support |
| Learn | none | four short exercises, how completion is checked, a note for team leads |
| Use AI | none | prompt cards by audience with their data boundaries |
| Requests | `home` (the five path cards and resource strip; return page for every form) | the three lanes, what is not asked of you, registering AI already in use |
| Prompts | none | three starter prompts, what is in the library, what Draft means |
| Status | `telemetry`, with `telemetryProvider` (the only instance that uses it) | what is running and what is not, how to check a request, what to do when something is wrong |
| Explore an AI idea, Check a tool or task, Register team AI use, Get help or training, Share feedback | one wizard each, `returnUrl` Requests; the idea page alone carries `draftServiceUrl` | nothing |
| AI CoE admin dashboard (site owners only, not in the nav) | `admin`, `returnUrl` Requests | nothing |

The text is the front door's own copy of a short pilot site and carries tokens: `{OrganizationName}` and the other
`parameters` declared at the top of `pages.json` (people, dates, counts, record ids), `{Page:key}` for links between the
pages, and `{Url:Name}` for links to things outside the package (the Concierge agent, Teams, Copilot Chat, the prompt
library). Text parameters are required; URL parameters may be blank, which keeps the sentence and drops the link;
links made from URL parameters open in a new tab. `src/provisioning/pagesDefinition.test.ts` checks the structure,
the tokens and that no client or tenant name is in the file; the wording is the page authors' to edit in the browser
afterwards.

**Applying it** (site owner, outside this repository; the build and tests never touch a tenant):

1. Deploy 1.0.0.10 and "Get it" on the site, so the component is available to the script.
2. Copy `sharepoint/pages/parameters.sample.json` to `sharepoint/pages/parameters.json` (ignored by git), fill in the values.
3. Optionally capture the two native web part templates: on a scratch page add a Quick Links web part in *Button*
   layout with exactly one link and a Button web part with one link, both titled `{Title}` and pointing at
   `https://example.invalid/{Url}`, publish it, then compose each template from the web part's two JSON parts (the
   `PropertiesJson` holds the item, `ServerProcessedContent` holds its title and link):

       $c = Get-PnPPageComponent -Page <scratch> -InstanceId <id>
       @{ properties = ($c.PropertiesJson | ConvertFrom-Json -AsHashtable); serverProcessedContent = ($c.ServerProcessedContent.ToString() | ConvertFrom-Json -AsHashtable) } | ConvertTo-Json -Depth 30 | Set-Content sharepoint/pages/quicklinks.template.json

   and the same into `button.template.json`. Then edit both files so every title value is exactly `{Title}` and every
   link value is exactly `{Url}`: drop the `https://example.invalid/` prefix and decode any `%7B`/`%7D` the editor
   introduced (the script normalises that prefix and encoding itself, but refuses a template without the two
   placeholders or without the `properties` and `serverProcessedContent` keys). Delete the scratch page. Without the
   templates the script creates everything else and warns.
4. Run, with PowerShell 7.4 and the pinned PnP.PowerShell version from the script header. Interactive login needs
   your own Entra app registration once (`Register-PnPEntraIDAppForInteractiveLogin`); pass its id with `-ClientId`,
   or set the `ENTRAID_CLIENT_ID` environment variable and omit the parameter:

       pwsh ./sharepoint/pages/New-FrontDoorPages.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ParameterFile ./sharepoint/pages/parameters.json -ClientId <app id> [-DraftServiceUrl <flow trigger URL>] [-TelemetryProvider claude] [-Overwrite]

   The script first checks that the front-door component is available on the site and that the templates, when
   present, have the expected shape; only then does it create pages. Existing pages are skipped unless `-Overwrite`
   is given, which sends them to the site recycle bin and rebuilds them from `pages.json`: edits made in the browser
   are recoverable from the recycle bin, not carried over. A page whose build fails part-way is recycled so the next
   run recreates it. The navigation is rebuilt every run; it replaces every QuickLaunch node, including the three
   list links the package feature adds and the template defaults. The admin page gets owners-only item permissions.
   This needs a communication site, whose horizontal top navigation is the QuickLaunch; on any other site the
   script stops unless `-AllowNonCommunicationSite` is given, because there the QuickLaunch is the left navigation.
5. Open each page once: check the narrow layout where a piece sits in a column, and add the prose where a URL
   parameter was blank.

Manual fallback: create the twelve pages by hand with the same section layouts, add the matching toolbox entry per
piece, type the page links and return page into the property pane, paste the Claude draft flow URL on the Explore an
AI idea page, pick the usage metrics provider on Status, and edit the navigation in the site header.

## Layout

    src/webparts/aiCoeFrontDoor/
      AiCoeFrontDoorWebPart.ts        SPFx lifecycle, property pane, service creation (once, in onInit)
      branding/                       organization wording derived from the property
      content/                        workflow definitions, home cards, telemetry tiles, page views, constants
      workflows/                      form engine, per-workflow session reducers, types
      services/                       SharePoint governance and telemetry services, drafts, policy evaluator,
                                      Claude draft flow client (Entra token through AadHttpClient)
      summaries/                      deterministic summary drafts, review indicators, export texts
      controls/, components/          React controls and pages (React Testing Library tests alongside)
      context/                        providers for branding, catalog, services and the last submission
      styles/                         Tailwind input, hand-written rules, theme block, page view modifiers, parity tests
    src/testing/                      fakes: SharePoint list store, services, AMD bundle host, journeys
    src/parity/                       journey parity suite against the shipped bundle
    src/preview/                      offline preview host and its server test
    src/provisioning/                 checks on the page definition and the provisioning script
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
- The stylesheets must keep the `.global.scss` suffix: the SharePoint Framework loader hashes every selector of any
  other stylesheet name as a CSS module (`AiCoeFrontDoorWebPart.test.ts` asserts the injected selectors).
- `AiCoeFrontDoor.module.scss` is the one CSS module (two classes), as shipped.

## Tests

`npm test` runs 290 tests in seven layers: pure modules (branding, definitions, page views, form engine, services,
summaries), React Testing Library component and journey tests with fake services, bundle-level lifecycle tests that
load the built AMD bundle in a simulated SPFx host, a journey parity suite that plays every workflow through the
shipped 1.0.0.7 bundle and the port side by side (screens, drafts, downloads and posted list items must match), the
stylesheet parity test plus the page view stylesheet guard, a preview-server test, and static checks on the page
definition and the provisioning script. Any React `act()` warning fails the suite.

## Behaviour notes

The port preserves the shipped behaviour, including these traits inherited from 1.0.0.7:

- The tool check never creates its own SharePoint record; the guidance page's "Guidance record created" line reflects
  the last submission of the session, otherwise it reports that no record was created. On its own page (the
  `toolCheck` view) that can only be a review request filed in that instance, so the line usually reports that no
  record was created; the wording is pinned by the parity suite.
- "Answers that shaped this result" on the guidance page is always empty (the shipped build lost the list to an ES5
  `Set` spread); the parity suite pins this.
- The disclosure summary draft is deterministic, and so is the idea draft until a Claude draft flow URL is configured.
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
