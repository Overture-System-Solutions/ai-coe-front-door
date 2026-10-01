"""Build-time contract for the Claude telemetry connector and flow; never contains credentials.

The connector exposes two read-only Anthropic Admin API reports. The flow (flow.py) turns their
daily buckets into rows of the "AI Usage Daily" SharePoint list. This module is the single source
for the Swagger contract, the ParseJson schemas, the synthetic samples and a Python reference of
the row mapping, so checks.py can prove the decisions (units, sums, keys) without a tenant.
"""
import calendar
import copy
import datetime as dt

API_VERSION = "2023-06-01"
PROVIDER = "anthropic"
HOST = "api.anthropic.com"
BASE_PATH = "/v1"
USAGE_PATH = "/organizations/usage_report/messages"
COST_PATH = "/organizations/cost_report"
OPERATION_IDS = {"usage": "GetUsageReport", "cost": "GetCostReport"}  # frozen: renaming = connector version bump + flow rebind
BUCKET_WIDTH = "1d"
PAGE_LIMIT = 31  # Anthropic's maximum for daily buckets; one calendar month always fits in one page
GROUP_BY = "model"

SITE = "https://osscontact.sharepoint.com/sites/AI-CoE-Lab"
USAGE_LIST = "AI Usage Daily"
INCIDENTS_LIST = "AI CoE Incidents"
CONFIGURATION_LIST = "AI CoE Configuration"
BUDGET_SETTING = "ClaudeMonthlyBudgetUsd"
BUDGET_SETTING_DESCRIPTION = "Monthly Claude API budget in USD for the spend alert raised by the Claude telemetry flow. Leave blank to disable the alert."
INCIDENT_TITLE = "Claude API spend exceeded the monthly budget"
INCIDENT_CATEGORY = "Cost"
INCIDENT_SEVERITY = "High"
STATUS_OPEN = "Open"
STATUS_RESOLVED = "Resolved"

# ticks('1970-01-01T00:00:00Z'): 719162 days from 0001-01-01 x 86400 s x 10^7 ticks per second.
UNIX_EPOCH_TICKS = 621355968000000000
ISO_FORMAT = "%Y-%m-%dT%H:%M:%SZ"


def _nullable(schema):
    result = dict(schema)
    result["x-nullable"] = True
    return result


def usage_result_schema():
    integer = _nullable({"type": "integer"})
    return {"type": "object", "properties": {
        "model": _nullable({"type": "string"}),
        "uncached_input_tokens": integer,
        "cache_creation": _nullable({"type": "object", "properties": {
            "ephemeral_1h_input_tokens": integer, "ephemeral_5m_input_tokens": integer}}),
        "cache_read_input_tokens": integer,
        "output_tokens": integer,
        "server_tool_use": _nullable({"type": "object", "properties": {"web_search_requests": integer}}),
    }}


def cost_result_schema():
    text = _nullable({"type": "string"})
    return {"type": "object", "properties": {
        "amount": _nullable({"type": "string", "description": "Decimal string in cents, for example \"123.45\"."}),
        "currency": text, "description": text, "cost_type": text, "model": text, "workspace_id": text,
    }}


def page_schema(result_schema):
    """One report page. No additionalProperties:false anywhere: Anthropic adds fields over time."""
    return {"type": "object", "required": ["data", "has_more"], "properties": {
        "data": {"type": "array", "items": {"type": "object", "required": ["starting_at", "ending_at", "results"], "properties": {
            "starting_at": {"type": "string"}, "ending_at": {"type": "string"},
            "results": {"type": "array", "items": result_schema}}}},
        "has_more": {"type": "boolean"},
        "next_page": _nullable({"type": "string"}),
    }}


def jsonschema_from_swagger(schema):
    """The ParseJson form of a Swagger 2.0 schema: x-nullable becomes a union with null."""
    result = copy.deepcopy(schema)

    def convert(node):
        if isinstance(node, dict):
            if node.pop("x-nullable", False) and isinstance(node.get("type"), str):
                node["type"] = [node["type"], "null"]
            for value in node.values():
                convert(value)
        elif isinstance(node, list):
            for value in node:
                convert(value)
    convert(result)
    return result


def _common_parameters():
    return [
        {"name": "anthropic-version", "in": "header", "required": True, "type": "string", "default": API_VERSION,
         "enum": [API_VERSION], "x-ms-summary": "Anthropic version", "x-ms-visibility": "internal"},
        {"name": "starting_at", "in": "query", "required": True, "type": "string", "x-ms-summary": "Starting at (UTC)",
         "description": "RFC 3339 UTC timestamp, for example 2026-08-01T00:00:00Z. Buckets starting at or after this time."},
        {"name": "ending_at", "in": "query", "required": False, "type": "string", "x-ms-summary": "Ending at (UTC)",
         "description": "RFC 3339 UTC timestamp, exclusive. Omit for buckets up to now."},
        {"name": "bucket_width", "in": "query", "required": True, "type": "string", "default": BUCKET_WIDTH, "enum": [BUCKET_WIDTH],
         "x-ms-summary": "Bucket width"},
        {"name": "limit", "in": "query", "required": False, "type": "integer", "format": "int32", "minimum": 1, "maximum": PAGE_LIMIT,
         "default": PAGE_LIMIT, "x-ms-summary": "Limit", "description": "Buckets per page; at most 31 daily buckets."},
        {"name": "page", "in": "query", "required": False, "type": "string", "x-ms-summary": "Page token",
         "description": "next_page token from a previous response. Omit for the first page."},
    ]


def _operation(operation_id, summary, description, result_schema, extra_parameters=()):
    return {"summary": summary, "description": description, "operationId": operation_id,
            "parameters": _common_parameters() + list(extra_parameters),
            "responses": {"200": {"description": "One page of daily buckets.", "schema": page_schema(result_schema)},
                          "default": {"description": "Anthropic error", "schema": {"type": "object"}}}}


def connector_spec():
    """Swagger 2.0 for the Power Platform custom connector: two GETs, admin key in x-api-key."""
    group_by = {"name": "group_by[]", "in": "query", "required": False, "type": "string", "enum": [GROUP_BY], "default": GROUP_BY,
                "x-ms-summary": "Group by", "description": "One grouping dimension; this solution groups by model."}
    return {
        "swagger": "2.0",
        "info": {"title": "OSS Claude Telemetry", "version": "1.0.0",
                 "description": "Read-only Anthropic Admin API usage and cost reports using an Admin API key held in the connection. No Messages, no key or member administration."},
        "host": HOST, "basePath": BASE_PATH, "schemes": ["https"],
        "consumes": ["application/json"], "produces": ["application/json"],
        "paths": {
            USAGE_PATH: {"get": _operation(OPERATION_IDS["usage"], "Get usage report",
                                           "Daily token usage of the organization, grouped by model.", usage_result_schema(), [group_by])},
            COST_PATH: {"get": _operation(OPERATION_IDS["cost"], "Get cost report",
                                          "Daily cost of the organization in cents.", cost_result_schema())},
        },
        "securityDefinitions": {"api_key": {"type": "apiKey", "in": "header", "name": "x-api-key"}},
        "security": [{"api_key": []}],
    }


def connection_parameters():
    return {"api_key": {"type": "securestring", "uiDefinition": {
        "displayName": "Anthropic Admin API key",
        "description": "Paste the raw Admin API key (sk-ant-admin01-...) from Anthropic Console > Organization settings > Admin keys. Do not add Bearer.",
        "tooltip": "Admin keys read organization usage and cost only; they cannot call Messages. Keep the key in this connection, never in flow inputs, SharePoint or chat.",
        "constraints": {"clearText": False, "required": "true", "tabIndex": 2},
    }}}


def sample_usage_page():
    return {"data": [
        {"starting_at": "2026-08-01T00:00:00Z", "ending_at": "2026-08-02T00:00:00Z", "results": [
            {"model": "claude-sonnet-5", "uncached_input_tokens": 1000,
             "cache_creation": {"ephemeral_1h_input_tokens": 10, "ephemeral_5m_input_tokens": 20},
             "cache_read_input_tokens": 300, "output_tokens": 200, "server_tool_use": {"web_search_requests": 0}},
            {"model": "claude-opus-5", "uncached_input_tokens": 500, "cache_creation": None,
             "cache_read_input_tokens": None, "output_tokens": 100, "server_tool_use": None}]},
        {"starting_at": "2026-08-02T00:00:00Z", "ending_at": "2026-08-03T00:00:00Z", "results": []},
    ], "has_more": False, "next_page": None}


def sample_cost_page():
    return {"data": [
        {"starting_at": "2026-08-01T00:00:00Z", "ending_at": "2026-08-02T00:00:00Z",
         "results": [{"currency": "USD", "amount": "123.45", "description": None, "cost_type": None}]},
        {"starting_at": "2026-08-02T00:00:00Z", "ending_at": "2026-08-03T00:00:00Z",
         "results": [{"currency": "USD", "amount": "0.5"}]},
    ], "has_more": False, "next_page": None}


# --- Python reference of the flow's expressions -----------------------------------------------

def parse_iso(value):
    return dt.datetime.strptime(value, ISO_FORMAT).replace(tzinfo=dt.timezone.utc)


def unix_seconds(value):
    return calendar.timegm(parse_iso(value).timetuple())


def iso_utc(value):
    return parse_iso(value).strftime(ISO_FORMAT)


def window(now):
    """(first day of the previous UTC month, first day of the current UTC month, now) as RFC 3339."""
    current_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    previous_start = (current_start - dt.timedelta(days=1)).replace(day=1)
    return previous_start.strftime(ISO_FORMAT), current_start.strftime(ISO_FORMAT), now.strftime(ISO_FORMAT)


def composite_key(metric_type, day, model=None):
    key = f"{PROVIDER}|{metric_type}|{day}"
    return key if model is None else f"{key}|{model}"


def _bucket_fields(bucket):
    return {"Provider": PROVIDER, "BucketStartEpoch": unix_seconds(bucket["starting_at"]),
            "BucketStart": iso_utc(bucket["starting_at"]), "BucketEndEpoch": unix_seconds(bucket["ending_at"])}


def usage_rows(page):
    rows = []
    for bucket in page["data"]:
        for result in bucket["results"]:
            model = result.get("model") or "unknown"
            cache = result.get("cache_creation") or {}
            key = composite_key("completions", bucket["starting_at"][:10], model)
            row = {"Title": key}
            row.update(_bucket_fields(bucket))
            row.update({"MetricType": "completions", "Model": model,
                        "InputTokens": (result.get("uncached_input_tokens") or 0) + (cache.get("ephemeral_1h_input_tokens") or 0)
                        + (cache.get("ephemeral_5m_input_tokens") or 0) + (result.get("cache_read_input_tokens") or 0),
                        "OutputTokens": result.get("output_tokens") or 0, "CompositeKey": key})
            rows.append(row)
    return rows


def cost_rows(page):
    rows = []
    for bucket in page["data"]:
        for result in bucket["results"]:
            key = composite_key("cost", bucket["starting_at"][:10])
            row = {"Title": key}
            row.update(_bucket_fields(bucket))
            row.update({"MetricType": "cost", "Amount": float(result.get("amount") or "0") / 100,
                        "Currency": result.get("currency") or "USD", "CompositeKey": key})
            rows.append(row)
    return rows


def month_to_date_spend(page):
    """USD sum of every cost result on the current-month page; the flow's mtd_spend variable."""
    return sum(row["Amount"] for row in cost_rows(page))
