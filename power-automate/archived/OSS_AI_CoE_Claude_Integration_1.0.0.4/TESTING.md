# Testing the Claude intake draft flow

Confirmed working on 2026-09-12 with `synthetic-request.json`.

## Why the designer cannot test it alone

The trigger is "When an HTTP request is received" with "Specific users in my tenant". The designer's
Test button only listens; a caller must POST JSON with a Microsoft Entra bearer token. The trigger URL
has no `sig` parameter, which is expected.

## Working caller flow

Instant flow ("Manually trigger a flow") with one action, **Invoke an HTTP request** from the
connector **HTTP with Microsoft Entra ID (preauthorized)** (`shared_webcontents`).

Connection (must be signed in as an account in the trigger's allowed-users list):

| Field | Value |
| --- | --- |
| Base Resource URL | `https://defaulte550987f2b7b4774bda109f6698f40.01.environment.api.powerplatform.com` |
| Microsoft Entra ID Resource URI | token audience for the flow service (`https://service.flow.microsoft.com/`; fall back to `https://api.powerplatform.com/` on a 401) |

Action:

| Field | Value |
| --- | --- |
| Method | `POST` |
| Url of the request | full trigger URL, `https://defaulte550987f...powerplatform.com/powerautomate/automations/direct/cu/25/workflows/<id>/triggers/manual/paths/invoke?api-version=1` |
| Headers | `Content-Type: application/json` |
| Body | contents of `synthetic-request.json` |

Pitfall that cost a day: the connector requires the request URL to sit under the connection's Base
Resource URL. A connection created with `https://service.flow.microsoft.com/` as the base rejects the
new `powerplatform.com` trigger URLs with HTTP 400 `BaseResourceUri ... must be a base of the full url`
before anything is sent. The base must be the trigger's own host.

## Reading results

| Status | Meaning |
| --- | --- |
| 200, `ok: true`, `draft` with 12 fields | success; `responseId` is the Anthropic message ID, not a case ID |
| 400 `INVALID_REQUEST` | body failed the schema or the conditional-answer checks |
| 413 `INPUT_TOO_LARGE` | body over 16,000 characters |
| 502 `AI_DRAFT_UNAVAILABLE` | flow ran but the Claude call, completion check or draft validation failed; open the run |
| 401 / 403 with no run in history | token audience wrong / caller not in the allowed-users list |
| 404 with no run | flow is off, or the URL was copied before the last Save |

In run history the Claude call hides inputs and outputs; the three Parse JSON steps show their outputs.
Use synthetic data only.
