# 1.0.0.0 - Anthropic usage and cost ingestion with a settable spend alert

## Scope

New solution pair, independent of every earlier delivery:

| Item | Value |
|---|---|
| Connector solution | `OSSCloudWaveClaudeTelemetryConnector` 1.0.0.0, connector `cwdd_ossclaudetelemetry` ("OSS Claude Telemetry"), id `a3299c63-ca70-50e5-b836-e86788be5250` |
| Flow solution | `OSSCloudWaveClaudeTelemetry` 1.0.0.0, flow "OSS Demo - Claude Telemetry", id `0024bbee-d19d-50c5-a199-a5755c0c4044`, packaged Off |
| Connection references | `cwdd_claudetelemetryconnection` (new, admin key) and `cwdd_sharedsharepointonline` (the demo solution's SharePoint reference) |
| Anthropic operations | `GetUsageReport` = GET `/v1/organizations/usage_report/messages`, `GetCostReport` = GET `/v1/organizations/cost_report`; `x-api-key` from the connection, `anthropic-version: 2023-06-01` internal header |
| Schedule | Recurrence every 6 hours (Eastern Standard Time), one run at a time |
| Windows | Per report: first day of the previous UTC month to the first day of the current month, and the first day of the current month to `utcNow()`. One page of at most 31 daily buckets each; `has_more` stops the run with `UNEXPECTED_PAGINATION` |

The Claude draft connector and flow (1.0.0.4), the OpenAI files and the demo flows are untouched.
The OpenAI usage feed is not ingested here; the web part keeps showing OpenAI rows if another
process writes them.

## Mapping to AI Usage Daily

| MetricType | Source | Columns written | CompositeKey (also Title) |
|---|---|---|---|
| `cost` | cost report bucket result | `Provider` anthropic, `BucketStartEpoch`, `BucketStart` (UTC ISO), `BucketEndEpoch`, `Amount` = `amount` (cents string) / 100 in USD, `Currency` (default USD) | `anthropic\|cost\|YYYY-MM-DD` |
| `completions` | usage report bucket result, grouped by model | `Provider`, the three bucket columns, `Model` (`unknown` when absent), `InputTokens` = uncached + cache creation 1h + cache creation 5m + cache read, `OutputTokens` | `anthropic\|completions\|YYYY-MM-DD\|<model>` |

`Requests`, `ProjectId`, `ApiKeyId` and `LineItem` are not written: Anthropic reports no request
counts. Rows are upserted: GET by `CompositeKey`, then POST (create) or POST with
`IF-MATCH: *` and `X-HTTP-Method: MERGE` (update). Rerunning the flow changes no row count.

## Spend alert (budget is a list value, never a constant)

1. `Get_budget_setting` reads AI CoE Configuration for `Title = ClaudeMonthlyBudgetUsd`. When the
   row is missing it is created with an empty `Value` and a description; the run does nothing else.
2. `mtd_spend` sums the current-month cost page (USD).
3. With a non-blank, positive budget: over budget opens a `Cost` incident (`Provider` anthropic,
   `Severity` High, `Status` Open, `DetectedAt` now, `Details` with the two amounts) or refreshes the
   details of the open one; under budget resolves the open incident (`Status` Resolved, `Resolution`
   with the two amounts). A blank value disables the alert; a non-numeric value fails the run visibly.

## Secure data by action

| Action | Secure |
|---|---|
| `Get_usage_previous`, `Get_usage_current`, `Get_cost_previous`, `Get_cost_current` (custom connector) | inputs + outputs |
| `Parse_usage_*`, `Parse_cost_*` (ParseJson) | inputs |
| SharePoint `HttpRequest` calls, Compose, If, Scope, Foreach, variables, Terminate, trigger | none (`SECURE_SHAREPOINT` in `flow.py` flips the SharePoint calls to inputs + outputs) |

## Verification (local only)

| Check | Result |
|---|---|
| `source/checks.py` (17 tests) | 16 passed, 1 skipped (flow ZIP pending the runtime API name) |
| PAC-style XML serializer | reproduces all four donor XML members byte-for-byte |
| Connector ZIP | deterministic rebuild, sha256 in `VERIFICATION.json` |
| Fixture flow build (`--allow-fixture --out` outside the delivery) | packages; deleted afterwards |
| pac pack/unpack | not run (pac not installed) |
| Hosted Save, live Admin API call, list rows, incident lifecycle | pending in the tenant (TESTING.md) |

## Rebuild

    py -3 source/build.py
    py -3 source/checks.py
    py -3 source/build.py --api-name shared_cwdd-5foss-20claude-20telemetry-5f<hex>

## 2026-09-28 - flow site moved to AI-CoE-Lab

The flow's SharePoint site (`telemetry.py` `SITE`, the `dataset` of every SharePoint action) is now
`https://osscontact.sharepoint.com/sites/AI-CoE-Lab`, the OSS rehearsal site. The connector ZIP is
byte-identical (its IDs come from the unchanged `SLUG`); the flow ZIP is still built only once the
connector's runtime API name is known, and a fixture build names no other site. The account behind
`cwdd_sharedsharepointonline` must be able to write to the lab site's AI Usage Daily, AI CoE
Configuration and AI CoE Incidents lists.
