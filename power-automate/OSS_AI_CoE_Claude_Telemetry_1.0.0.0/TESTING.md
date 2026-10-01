# Testing the Claude telemetry solution in the tenant

Everything here runs in the tenant with your admin key; nothing in this folder does it for you.

## 1. Connector (stage 1)

1. Custom connectors > OSS Claude Telemetry > Test. Create the connection with the raw Admin API
   key (`sk-ant-admin01-...`, no `Bearer`).
2. `GetUsageReport`: `starting_at` = first day of the previous month, `YYYY-MM-01T00:00:00Z`;
   `ending_at` = first day of this month; `bucket_width` `1d`; `limit` `31`; `group_by[]` `model`.
   Expect HTTP 200 with `data[]` of daily buckets, each with `results[]` carrying `model`,
   `uncached_input_tokens`, `cache_creation`, `cache_read_input_tokens` and `output_tokens`, and
   `has_more` false.
3. `GetCostReport`: same window without `group_by[]`. Expect `results[]` with `amount` (a decimal
   string in cents) and `currency`. Note whether every bucket has at most one result; the flow
   upserts one cost row per day, so several results per bucket would overwrite each other.
4. In the Test tab's request details, confirm the query carries `group_by[]=model` (or the
   encoded `group_by%5B%5D=model`, which Anthropic accepts) and no `page` parameter.

| Status | Meaning |
|---|---|
| 401 | Not an Admin key, or `Bearer` was added |
| 403 | The key's organization role cannot read reports |
| 400 | Timestamp format; use `YYYY-MM-DDTHH:MM:SSZ` |
| 429 | Rate limit; wait and retry (the flow retries automatically) |

Then send the connector page URL.

## 2. Flow (stage 2)

1. Import the second ZIP, map both connections, open the flow and Save without changes.
2. Test > Manually. Expected run shape: `Window`, the four report calls (inputs and outputs
   hidden), the four `Parse_*` steps (outputs visible), both pagination checks skipped inside,
   `For_each_usage_page` and `For_each_cost_page` with `Create_*_row` on the first run and
   `Merge_*_row` afterwards, `For_each_month_cost_bucket`, then `Budget_check` with
   `Create_budget_setting` on the very first run.
3. Run once more: every upsert takes the `Merge_*_row` branch.

If a report call fails and the hidden body hides the reason, temporarily switch off Secure
outputs on that one `Get_*` action in the editor, rerun, read the Anthropic error, then restore.

## 3. List rows

Open in a browser while signed in to the site:

    https://osscontact.sharepoint.com/sites/AI-CoE-Lab/_api/web/lists/getbytitle('AI%20Usage%20Daily')/items?$select=Id,CompositeKey,MetricType,BucketStart,BucketStartEpoch,Model,InputTokens,OutputTokens,Amount,Currency&$filter=Provider%20eq%20'anthropic'&$orderby=BucketStartEpoch%20desc&$top=500

Expect:

- cost rows = days in the two windows, `Amount` = the Test tab's `amount` / 100, `Currency` USD;
- completions rows = days x models, `InputTokens` the four-field sum, `OutputTokens` as reported;
- `BucketStart` at `T00:00:00Z` (the list view shows it in the site's regional time);
- no duplicate `CompositeKey`; after the second run the item count is unchanged and `Modified` moved.

The front door web part (1.0.0.9, Usage metrics provider = Claude) shows month-to-date spend,
input + output tokens and output tokens equal to the sums of the current month's rows.

## 4. Spend alert

1. AI CoE Configuration > `ClaudeMonthlyBudgetUsd` > set `Value` below the current month's spend
   (for example `0.01`). Run the flow: AI CoE Incidents gains "Claude API spend exceeded the
   monthly budget" (`Category` Cost, `Provider` anthropic, `Status` Open) and the web part's alerts
   panel lists it.
2. Set `Value` above the spend. Run again: the incident's `Status` becomes Resolved with a
   `Resolution` text; the alerts panel clears.
3. Set the real budget, or leave `Value` blank to disable the alert.

## 5. Report back

Send the run URL of one successful run, the row count from step 3 after two runs, and whether
the cost report had one result per bucket. Never send the admin key.
