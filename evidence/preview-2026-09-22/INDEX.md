# Offline preview 2026-09-22 — current 1.0.0.16 bundle

Host: `http://127.0.0.1:4173` (`npm run preview`; npm ate `--port`, so the script used its default 4173). Served `/bundle.js` from `dist/ai-coe-front-door-web-part_bdf4f9638d8cc3d90ffa.js` (newest hashed dist file; also the ClientSideAssets entry in the sppkg). Simulated site URL contains `/simulated-site`, so the CORE workspace used the local engine, not live SharePoint writes. Preview banner was hidden for product-UI captures.

Not live acceptance. `SendEnabled` stayed false. No tenant, flow, or paid model call.

| File | What was checked |
|---|---|
| `01-home-owner.png` | Owner, `view=app`, Home tab and seven sections. |
| `02-cases-owner.png` | Cases / synthetic Binding A idle form. |
| `03-cases-completed.png` | Create work completed locally: `Command: completed. completed: Working`, Work ID `CW-LOCAL_0001`. Packet projection labelled `core-packet-list.v0.1-proposal`. |
| `04-engineering.png` | Engineering guided-request starters. |
| `05-marketing-empty.png` | Synthetic Marketing workspace empty, labelled synthetic, content plan locked. |
| `06-marketing-accepted.png` | Brief `BRIEF-MUCYGS7N-0001` accepted; receipt `RCPT-MUCYHSED-0003`; fictional Marketing Owner; no send/publish. |
| `07-improvement.png` | Intended Improvement; capture raced with the next tab click (Enterprise value loading). Improvement was still opened and snapshotted in the accessibility tree. |
| `08-enterprise-value.png` | Measures with evidence / pending baseline / group too small. |
| `09-system-map.png` | Layers including CORE Binding A gated and Control = a person. |
| `10-home-command-roundtrip.png` | Home sentence carried into the idea form: “I need a weekly operations pack without copying numbers by hand.” |
| `11-draft-saved.png` | `Draft saved on this device.` |
| `12-marketing-survives-nav.png` | Accepted brief still listed after leaving Marketing and returning. |
| `13-marketing-labelled-demo.png` | Labelled demonstration was opened (`Demo — no live actions`; durable store is the synthetic workspace). Capture raced with Home; the accessibility snapshot recorded the demo banner and three workflow cards. |
| `14-keyboard-cases.png` | ArrowRight from a focused Home tab selected Cases and moved focus to the Cases heading. |
| `15-marketing-reload-accepted.png` | Full reload of `?view=app` recovered `BRIEF-MUCYGS7N-0001` Accepted from the synthetic persistent store. |
| `16-employee-role-denial.png` | Employee: Home/Cases/Engineering/Improvement only. Clicking “Review enterprise AI value” stayed on Home with “This part of the front door is not available to you.” Simulated requests stayed `GET site groups` and `GET …/ai-coe-pages.json` (zero Program Measures / Decisions / Intakes / command-list reads). |
| `17-error-denied-intakes.png` | `deny=intakes`: My requests showed “Needs access You cannot read the request list on this site.” Viewport capture is the Cases form; the refusal is in the accessibility snapshot. |
| `18-mobile-375.png` | `?width=375` plus 375×812 device metrics: tabs wrap, command box stacks, no tenant contact. |
| `19-owner-admin-dashboard.png` | Owner: left section group, **Admin** flush right, click opens `AI CoE Admin Dashboard`. |
| `20-owner-cases-admin-right.png` | Owner: Cases still opens from the left group; Admin stays on the right, unselected. |
| `21-owner-home-admin-right.png` | Owner Home: same left-group / right-Admin split. |
| `22-keyboard-end-admin.png` | End from a focused Home tab selects Admin and opens the dashboard. |
| `23-mobile-375-admin-right.png` | 375×812: section tabs wrap together; Admin is on its own row, flush right; no overlap. |
| `24-employee-role-denial.png` | Employee: Home/Cases/Engineering/Improvement only, no Admin control. Clicking “Review enterprise AI value” stayed on Home with the refusal copy. Simulated requests stayed `GET site groups` and `GET …/ai-coe-pages.json` (zero Intakes / Decisions / Use Cases / Program Measures). |
| `25-improvement-register-team-gap.png` | Owner Improvement: **Register team AI use** with 20px gaps from the sibling starters; larger “What happens / What an outcome keeps” panels stay below. |
| `26-mobile-375-register-team-gap.png` | `?width=375` plus 375×812: starters stack with 20px gaps; larger panels remain below; no overlap. |
| `27-owner-enterprise-value-usage.png` | Owner Enterprise value: **Usage** heading plus AI operations snapshot (moved from System map). |
| `28-owner-system-map-no-usage.png` | Owner System map: layers only, including the Telemetry “Usage lists” card; no usage strip. |
| `29-employee-value-denied.png` | Employee Home after “Review enterprise AI value”: stayed on Home; no Enterprise value / usage. Fetches stayed `GET site groups` and `GET …/ai-coe-pages.json`. |
| `30-mobile-375-enterprise-value-usage.png` | `?width=375` plus 375×812: Usage on Enterprise value stacks; no overflow. |

A later preview process was killed and restarted so `/bundle.js` is the current heft compile `dist/ai-coe-front-door-web-part.js` (1,905,820 bytes at 17:44). Usage now lives on Enterprise value, not System map.

Pending list-write receipt (`readback=fail` through a full form submit) was not walked to a screenshot in this pass; existing Jest journeys cover it. Local CORE polling completed in one turn, so queued/processing were not held on screen.
