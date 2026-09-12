# AI CoE Front Door — SharePoint Framework web part

A SharePoint Framework (SPFx 1.23.2, React 17, TypeScript) web part that gives an AI Center of Excellence a governed
front door: five guided intake workflows (idea, tool or task check, team AI-use disclosure, help or training,
feedback), a telemetry snapshot and an administrator dashboard, all writing to SharePoint lists.

This project is the maintainable source for the web part that shipped as package **1.0.0.7** (`original/`). The
shipped package was reverse-engineered (see `docs/RECOVERY.md`) and then ported to idiomatic TypeScript with a
test-first approach. It builds the next in-place upgrade, **1.0.0.8**, with the same solution, feature and web part
identities, and it is tenant neutral: the organization name is a web part property.

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
  banner's field to try the branding property. `npm run preview -- --port 4174` changes the port;
  `npm run preview -- --bundle <path>` previews another bundle, for example the shipped one under
  `recovered/package/ClientSideAssets/`.
- `npm start` runs `heft start` for the SharePoint hosted workbench (requires a tenant; not needed for local work).

## Deploy 1.0.0.8

Upload `sharepoint/solution/overture-ai-coe-front-door.sppkg` to the app catalog as an update of the existing app.
The solution id (`f125ebdf-4a9d-4e6e-8479-3a18874e7752`), feature id (`69ab84b7-608c-47ee-9623-af8ebaf2cb10`,
version 1.0.0.2) and web part id (`cf2e5904-0703-4fe4-ae5a-ec012d6fa689`) are unchanged, so the three provisioned
lists (AI CoE Pilot Intakes and its two schemas under `sharepoint/assets/`) are left untouched. The other four lists
the web part reads (AI CoE Use Cases, AI CoE Decisions, AI Usage Daily, AI CoE Incidents) are provisioned by the
companion Power Automate demo solution, exactly as before.

After deployment, open the web part's property pane and set **Organization name**.

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

## Layout

    src/webparts/aiCoeFrontDoor/
      AiCoeFrontDoorWebPart.ts        SPFx lifecycle, property pane, service creation (once, in onInit)
      branding/                       organization wording derived from the property
      content/                        workflow definitions, home cards, telemetry tiles, constants
      workflows/                      form engine, per-workflow session reducers, types
      services/                       SharePoint governance and telemetry services, drafts, policy evaluator,
                                      Claude draft flow client (Entra token through AadHttpClient)
      summaries/                      deterministic summary drafts, review indicators, export texts
      controls/, components/          React controls and pages (React Testing Library tests alongside)
      context/                        providers for branding, catalog, services and the last submission
      styles/                         Tailwind input, hand-written rules, theme block, stylesheet parity test
    src/testing/                      fakes: SharePoint list store, services, AMD bundle host, journeys
    src/parity/                       journey parity suite against the shipped bundle
    src/preview/                      offline preview host and its server test
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

`npm test` runs 212 tests in six layers: pure modules (branding, definitions, form engine, services, summaries),
React Testing Library component and journey tests with fake services, bundle-level lifecycle tests that load the
built AMD bundle in a simulated SPFx host, a journey parity suite that plays every workflow through the shipped
1.0.0.7 bundle and the port side by side (screens, drafts, downloads and posted list items must match), the
stylesheet parity test, and a preview-server test. Any React `act()` warning fails the suite.

## Behaviour notes

The port preserves the shipped behaviour, including these traits inherited from 1.0.0.7:

- The tool check never creates its own SharePoint record; the guidance page's "Guidance record created" line reflects
  the last submission of the session, otherwise it reports that no record was created.
- "Answers that shaped this result" on the guidance page is always empty (the shipped build lost the list to an ES5
  `Set` spread); the parity suite pins this.
- The disclosure summary draft is deterministic, and so is the idea draft until a Claude draft flow URL is configured.
  The shipped code contained dormant calls to a model provider that were never reached; the idea path now goes through
  the governed flow instead, the feedback-theme path stays deterministic.
- Drafts live in the browser's localStorage; two web parts on one page share the `overture-ai-coe-pilot` scope id.
- `data-theme` is set from the SharePoint theme but no rule consumes it.

Two internal defects were fixed: the telemetry service is created once (the shipped build refetched on every render;
the parity suite documents the difference) and intake id suffixes use `crypto.getRandomValues` in the same format.

## Provenance and rules

`original/` keeps the shipped package unchanged, `recovered/` its byte-exact extraction and `docs/RECOVERY.md` the
recovery method. The JavaScript reassembly tooling of the recovery was retired once this port reached parity;
`scripts/extract.py` and `tests/test_extract.py` remain for the package extraction.

Keep this repository internal. Git is local-only; nothing is pushed or deployed from here. No secrets are stored.
