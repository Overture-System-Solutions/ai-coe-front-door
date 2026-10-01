"""Native Power Automate definition of the Claude telemetry flow, bound only to a supplied real API name.

Every six hours the flow reads two Anthropic Admin API reports for two windows (the previous UTC
month and the current month to date), upserts one "AI Usage Daily" row per day (cost) and per day
and model (completions), then compares month-to-date spend with the ClaudeMonthlyBudgetUsd row of
"AI CoE Configuration" and opens, refreshes or resolves a Cost incident in "AI CoE Incidents".
A calendar month has at most 31 daily buckets, which is Anthropic's page limit, so no paging loop
is needed; if a report ever reports has_more the run stops with a visible error instead of
writing a partial month.
"""
import re
import telemetry as contract

CONNECTOR_LOGICAL_NAME = "cwdd_ossclaudetelemetry"
CONNECTION_REFERENCE = "cwdd_claudetelemetryconnection"
CONNECTION_NAME = "claude_telemetry"
SHAREPOINT_API_NAME = "shared_sharepointonline"
SHAREPOINT_CONNECTION_REFERENCE = "cwdd_sharedsharepointonline"
SHAREPOINT_CONNECTION_NAME = "shared_sharepointonline"
# Secure-data policy (what the flow service accepted at hosted Save for the draft flow):
#   custom-connector calls  inputs + outputs (the admin key never appears, the raw reports stay hidden)
#   ParseJson               inputs only (outputs rejected by the service)
#   everything else         none. SharePoint calls carry no secret and their visible bodies are what
#                           TESTING.md's row validation relies on; flip SECURE_SHAREPOINT to hide them.
SECURE_SHAREPOINT = False
MTD_VARIABLE = "mtd_spend"

SHAREPOINT_HEADERS = {"Accept": "application/json;odata=nometadata", "Content-Type": "application/json;odata=nometadata"}
MERGE_HEADERS = dict(SHAREPOINT_HEADERS, **{"IF-MATCH": "*", "X-HTTP-Method": "MERGE"})
ONE_AT_A_TIME = {"concurrency": {"repetitions": 1}}


def secured(action, properties=("inputs", "outputs")):
    action["runtimeConfiguration"] = {"secureData": {"properties": list(properties)}}
    return action


def parse_json(content, schema, after):
    return secured({"type": "ParseJson", "inputs": {"content": content, "schema": schema}, "runAfter": after}, ("inputs",))


def compose(inputs, after=None):
    return {"type": "Compose", "inputs": inputs, "runAfter": after or {}}


def sharepoint(method, uri, body=None, merge=False, after=None):
    parameters = {"dataset": contract.SITE, "parameters/method": method, "parameters/uri": uri,
                  "parameters/headers": dict(MERGE_HEADERS if merge else SHAREPOINT_HEADERS)}
    if body is not None:
        parameters["parameters/body"] = body
    action = {"type": "OpenApiConnection", "inputs": {
        "host": {"apiId": "/providers/Microsoft.PowerApps/apis/" + SHAREPOINT_API_NAME,
                 "connectionName": SHAREPOINT_CONNECTION_NAME, "operationId": "HttpRequest"},
        "parameters": parameters}, "runAfter": after or {}}
    return secured(action) if SECURE_SHAREPOINT else action


def anthropic(operation_id, parameters, api_name, after):
    # Default retry policy kept on purpose: the GETs are idempotent and 429/5xx retries are wanted.
    return secured({"type": "OpenApiConnection", "inputs": {
        "host": {"apiId": "/providers/Microsoft.PowerApps/apis/" + api_name,
                 "connectionName": CONNECTION_NAME, "operationId": operation_id},
        "parameters": parameters}, "limit": {"timeout": "PT2M"}, "runAfter": after})


def report_parameters(kind, starting_at, ending_at):
    parameters = {"anthropic-version": contract.API_VERSION, "starting_at": starting_at, "ending_at": ending_at,
                  "bucket_width": contract.BUCKET_WIDTH, "limit": contract.PAGE_LIMIT}
    if kind == "usage":
        parameters["group_by[]"] = contract.GROUP_BY
    return parameters


def foreach(source, actions, after=None):
    return {"type": "Foreach", "foreach": source, "runAfter": after or {}, "runtimeConfiguration": dict(ONE_AT_A_TIME), "actions": actions}


def condition(expression, actions, else_actions=None, after=None):
    action = {"type": "If", "expression": expression, "runAfter": after or {}, "actions": actions}
    if else_actions:
        action["else"] = {"actions": else_actions}
    return action


def epoch(expression):
    return f"@div(sub(ticks({expression}),{contract.UNIX_EPOCH_TICKS}),10000000)"


def iso(expression):
    return f"@formatDateTime({expression},'yyyy-MM-ddTHH:mm:ssZ')"


def items_uri(list_title):
    return f"_api/web/lists/getbytitle('{list_title}')/items"


def find_by_key_uri(list_title, key_expression):
    quoted = list_title.replace("'", "''")
    return (f"@concat('_api/web/lists/getbytitle(''{quoted}'')/items?$select=Id&$filter=CompositeKey%20eq%20%27',"
            f"encodeUriComponent(replace({key_expression},'''','''''')),'%27&$top=1')")


def item_uri(list_title, find_action):
    quoted = list_title.replace("'", "''")
    return f"@concat('_api/web/lists/getbytitle(''{quoted}'')/items(',string(first(body('{find_action}')?['value'])?['Id']),')')"


def upsert_scope(kind, key_expression, row):
    """Find the row by CompositeKey; MERGE it when present, otherwise create it."""
    prefix = kind.capitalize()
    key_name, row_name, find_name = f"{prefix}_key", f"{prefix}_row", f"Find_{kind}_row"
    return {"type": "Scope", "runAfter": {}, "actions": {
        key_name: compose(key_expression),
        row_name: compose(row, {key_name: ["Succeeded"]}),
        find_name: sharepoint("GET", find_by_key_uri(contract.USAGE_LIST, f"outputs('{key_name}')"), after={row_name: ["Succeeded"]}),
        f"If_{kind}_row_exists": condition(
            f"@greater(length(body('{find_name}')?['value']),0)",
            {f"Merge_{kind}_row": sharepoint("POST", item_uri(contract.USAGE_LIST, find_name), body=f"@outputs('{row_name}')", merge=True)},
            {f"Create_{kind}_row": sharepoint("POST", items_uri(contract.USAGE_LIST), body=f"@outputs('{row_name}')")},
            after={find_name: ["Succeeded"]}),
    }}


def bucket_fields(bucket_loop):
    start = f"items('{bucket_loop}')?['starting_at']"
    end = f"items('{bucket_loop}')?['ending_at']"
    return {"Provider": contract.PROVIDER, "BucketStartEpoch": epoch(start), "BucketStart": iso(start), "BucketEndEpoch": epoch(end)}


def usage_row():
    result = "items('For_each_usage_result')"
    tokens = [f"coalesce({result}?['uncached_input_tokens'],0)",
              f"coalesce({result}?['cache_creation']?['ephemeral_1h_input_tokens'],0)",
              f"coalesce({result}?['cache_creation']?['ephemeral_5m_input_tokens'],0)",
              f"coalesce({result}?['cache_read_input_tokens'],0)"]
    row = {"Title": "@outputs('Usage_key')"}
    row.update(bucket_fields("For_each_usage_bucket"))
    row.update({"MetricType": "completions", "Model": f"@coalesce({result}?['model'],'unknown')",
                "InputTokens": f"@add(add(add({tokens[0]},{tokens[1]}),{tokens[2]}),{tokens[3]})",
                "OutputTokens": f"@coalesce({result}?['output_tokens'],0)", "CompositeKey": "@outputs('Usage_key')"})
    return row


def cost_row():
    result = "items('For_each_cost_result')"
    row = {"Title": "@outputs('Cost_key')"}
    row.update(bucket_fields("For_each_cost_bucket"))
    row.update({"MetricType": "cost", "Amount": f"@div(float(coalesce({result}?['amount'],'0')),100)",
                "Currency": f"@coalesce({result}?['currency'],'USD')", "CompositeKey": "@outputs('Cost_key')"})
    return row


def usage_key():
    return ("@concat('anthropic|completions|',formatDateTime(items('For_each_usage_bucket')?['starting_at'],'yyyy-MM-dd'),'|',"
            "coalesce(items('For_each_usage_result')?['model'],'unknown'))")


def cost_key():
    return "@concat('anthropic|cost|',formatDateTime(items('For_each_cost_bucket')?['starting_at'],'yyyy-MM-dd'))"


def report_loops(kind, upsert, after):
    pages = f"@createArray(body('Parse_{kind}_previous')?['data'],body('Parse_{kind}_current')?['data'])"
    return foreach(pages, {
        f"For_each_{kind}_bucket": foreach(f"@items('For_each_{kind}_page')", {
            f"For_each_{kind}_result": foreach(f"@items('For_each_{kind}_bucket')?['results']", {f"Upsert_{kind}_row": upsert})})}, after)


def pagination_guard(kind, after):
    has_more = f"@or(equals(body('Parse_{kind}_previous')?['has_more'],true),equals(body('Parse_{kind}_current')?['has_more'],true))"
    stop = {"type": "Terminate", "inputs": {"runStatus": "Failed", "runError": {
        "code": "UNEXPECTED_PAGINATION",
        "message": f"Anthropic reported has_more for a single-month {kind} window; the flow only reads one page of 31 daily buckets per month. No rows were written."}},
        "runAfter": {}}
    return condition(has_more, {f"Stop_on_{kind}_pagination": stop}, after=after)


def money(expression):
    return f"formatNumber({expression},'0.00')"


def budget_check(after):
    budget_uri = (f"{items_uri(contract.CONFIGURATION_LIST)}?$select=Id,Title,Value&$filter=Title%20eq%20'{contract.BUDGET_SETTING}'&$top=1")
    incident_uri = (f"{items_uri(contract.INCIDENTS_LIST)}?$select=Id&$filter=Provider%20eq%20'{contract.PROVIDER}'%20and%20Category%20eq%20'"
                    f"{contract.INCIDENT_CATEGORY}'%20and%20Status%20eq%20'{contract.STATUS_OPEN}'&$orderby=Id%20desc&$top=1")
    spend, budget = money(f"variables('{MTD_VARIABLE}')"), money("float(outputs('Budget_text'))")
    stamp = "utcNow('yyyy-MM-ddTHH:mm:ssZ')"
    details = (f"@concat('Month-to-date Claude API spend $',{spend},' exceeds the {contract.BUDGET_SETTING} setting of $',{budget},"
               f"' ({contract.CONFIGURATION_LIST}). Evaluated ',{stamp},' by the Claude telemetry flow.')")
    resolution = (f"@concat('Month-to-date Claude API spend $',{spend},' is within the {contract.BUDGET_SETTING} setting of $',{budget},"
                  f"' as of ',{stamp},'.')")
    incident_open = "@greater(length(body('Find_open_cost_incident')?['value']),0)"
    new_incident = {"Title": contract.INCIDENT_TITLE, "Category": contract.INCIDENT_CATEGORY, "Severity": contract.INCIDENT_SEVERITY,
                    "Status": contract.STATUS_OPEN, "Provider": contract.PROVIDER, "DetectedAt": "@utcNow()", "Details": details}
    over_budget = condition(
        f"@and(greater(float(outputs('Budget_text')),0),greater(variables('{MTD_VARIABLE}'),float(outputs('Budget_text'))))",
        {"If_cost_incident_open": condition(
            incident_open,
            {"Merge_cost_incident_details": sharepoint("POST", item_uri(contract.INCIDENTS_LIST, "Find_open_cost_incident"), body={"Details": details}, merge=True)},
            {"Create_cost_incident": sharepoint("POST", items_uri(contract.INCIDENTS_LIST), body=new_incident)})},
        {"If_cost_incident_to_resolve": condition(
            incident_open,
            {"Resolve_cost_incident": sharepoint("POST", item_uri(contract.INCIDENTS_LIST, "Find_open_cost_incident"),
                                                 body={"Status": contract.STATUS_RESOLVED, "Resolution": resolution}, merge=True)})},
        after={"Find_open_cost_incident": ["Succeeded"]})
    budget_set = condition(
        "@not(empty(outputs('Budget_text')))",
        {"Find_open_cost_incident": sharepoint("GET", incident_uri), "If_over_budget": over_budget},
        after={"Budget_text": ["Succeeded"]})
    return {"type": "Scope", "runAfter": after, "actions": {
        "Get_budget_setting": sharepoint("GET", budget_uri),
        "If_budget_setting_missing": condition(
            "@equals(length(body('Get_budget_setting')?['value']),0)",
            # First run: create the setting row empty so the number is set in the list, never in the flow.
            {"Create_budget_setting": sharepoint("POST", items_uri(contract.CONFIGURATION_LIST), body={
                "Title": contract.BUDGET_SETTING, "Value": "", "Description": contract.BUDGET_SETTING_DESCRIPTION})},
            {"Budget_text": compose("@trim(coalesce(first(body('Get_budget_setting')?['value'])?['Value'],''))"),
             "If_budget_set": budget_set},
            after={"Get_budget_setting": ["Succeeded"]}),
    }}


def definition(api_name):
    # The runtime API name is environment-assigned. Do not derive it from a GUID or schema name.
    if not isinstance(api_name, str) or not re.fullmatch(r"shared_[A-Za-z0-9_-]+", api_name):
        raise ValueError("Supply the exact runtime API name from the imported connector page")
    window = {"previous_month_start": "@formatDateTime(addToTime(startOfMonth(utcNow()),-1,'Month'),'yyyy-MM-ddTHH:mm:ssZ')",
              "current_month_start": "@formatDateTime(startOfMonth(utcNow()),'yyyy-MM-ddTHH:mm:ssZ')",
              "now": "@utcNow('yyyy-MM-ddTHH:mm:ssZ')"}
    previous = ("@outputs('Window')?['previous_month_start']", "@outputs('Window')?['current_month_start']")
    current = ("@outputs('Window')?['current_month_start']", "@outputs('Window')?['now']")
    actions = {
        "Window": compose(window),
        "Init_mtd_spend": {"type": "InitializeVariable", "inputs": {"variables": [{"name": MTD_VARIABLE, "type": "float", "value": 0}]},
                           "runAfter": {"Window": ["Succeeded"]}},
    }
    previous_action = "Init_mtd_spend"
    for kind, schema in (("usage", contract.usage_result_schema()), ("cost", contract.cost_result_schema())):
        for label, (start, end) in (("previous", previous), ("current", current)):
            get_name, parse_name = f"Get_{kind}_{label}", f"Parse_{kind}_{label}"
            actions[get_name] = anthropic(contract.OPERATION_IDS[kind], report_parameters(kind, start, end), api_name, {previous_action: ["Succeeded"]})
            actions[parse_name] = parse_json(f"@body('{get_name}')", contract.jsonschema_from_swagger(contract.page_schema(schema)), {get_name: ["Succeeded"]})
            previous_action = parse_name
    actions["Check_usage_pagination"] = pagination_guard("usage", {previous_action: ["Succeeded"]})
    actions["Check_cost_pagination"] = pagination_guard("cost", {"Check_usage_pagination": ["Succeeded"]})
    actions["For_each_usage_page"] = report_loops("usage", upsert_scope("usage", usage_key(), usage_row()), {"Check_cost_pagination": ["Succeeded"]})
    actions["For_each_cost_page"] = report_loops("cost", upsert_scope("cost", cost_key(), cost_row()), {"For_each_usage_page": ["Succeeded"]})
    actions["For_each_month_cost_bucket"] = foreach("@body('Parse_cost_current')?['data']", {
        "For_each_month_cost_result": foreach("@items('For_each_month_cost_bucket')?['results']", {
            "Increment_mtd_spend": {"type": "IncrementVariable", "inputs": {
                "name": MTD_VARIABLE, "value": "@div(float(coalesce(items('For_each_month_cost_result')?['amount'],'0')),100)"}, "runAfter": {}}})},
        {"For_each_cost_page": ["Succeeded"]})
    actions["Budget_check"] = budget_check({"For_each_month_cost_bucket": ["Succeeded"]})
    return {"properties": {
        "connectionReferences": {
            CONNECTION_NAME: {"runtimeSource": "embedded", "connection": {"connectionReferenceLogicalName": CONNECTION_REFERENCE},
                              "api": {"name": api_name, "logicalName": CONNECTOR_LOGICAL_NAME}},
            SHAREPOINT_CONNECTION_NAME: {"runtimeSource": "embedded", "connection": {"connectionReferenceLogicalName": SHAREPOINT_CONNECTION_REFERENCE},
                                         "api": {"name": SHAREPOINT_API_NAME}}},
        "definition": {
            "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
            "contentVersion": "1.0.0.0", "parameters": {
                "$authentication": {"defaultValue": {}, "type": "SecureObject"},
                "$connections": {"defaultValue": {}, "type": "Object"}},
            "triggers": {"manual": {"type": "Recurrence",
                                    "recurrence": {"frequency": "Hour", "interval": 6, "timeZone": "Eastern Standard Time"},
                                    "runtimeConfiguration": {"concurrency": {"runs": 1}}}},
            "actions": actions, "outputs": {},
        },
    }, "schemaVersion": "1.0.0.0"}
