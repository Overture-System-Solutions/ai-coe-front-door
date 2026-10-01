"""Native Power Automate definition for the executive case-analysis flow.

Shapes are copied from definitions that already passed hosted Save:
  * trigger, ParseJson, Response, If/Scope, Claude OpenApiConnection: OSS Claude Draft Integration 1.0.0.4
  * SharePoint "Send an HTTP request to SharePoint" (HttpRequest) and Select: OSS Dashboard Demo 1.0.0.7
    (AI CoE Weekly Portfolio Control, action Get_active_use_cases)
"""
import re
import integration as contract

# Existing custom connector (reused, not packaged): OSS Claude Intake Draft 1.0.0.1.
DEFAULT_CLAUDE_API_NAME = "shared_cwdd-5foss-20claude-20intake-20draft-5f55b0e9f278ac89c6"
CONNECTOR_LOGICAL_NAME = "cwdd_ossclaudeintakedraft"
OPERATION_ID = "GenerateIntakeDraft"
CLAUDE_CONNECTION_NAME = "claude_case_analysis"
CLAUDE_CONNECTION_REFERENCE = "cwdd_claudecaseanalysisconnection"
SHAREPOINT_API_NAME = "shared_sharepointonline"
SHAREPOINT_CONNECTION_NAME = "shared_sharepointonline"
SHAREPOINT_CONNECTION_REFERENCE = "cwdd_caseanalysissharepoint"
SHAREPOINT_HEADERS = {"Accept": "application/json;odata=nometadata", "Content-Type": "application/json;odata=nometadata"}
# The only dynamic part of the Claude request: question, asOf, caseCount, truncated and cases as one JSON string.
USER_CONTENT_EXPRESSION = "@string(outputs('Case_context'))"
# True: the Claude action carries anthropic-version (connectors 1.0.0.0-1.0.0.2 declare it as a parameter).
# False: the action omits it and the connector's Set HTTP header policy sends it (CloudWave connector 1.0.0.3).
SEND_API_VERSION = True

# Secure-data policy, fixed by what the flow service accepted or rejected at hosted Save of the
# reference package (see its CHANGES.md):
#   ParseJson          secure inputs accepted; secure outputs rejected (InvalidSecureDataConfiguration)
#   Response           secure outputs rejected and no designer setting to remove it -> none packaged
#   OpenApiConnection  secure inputs and outputs on the Claude call (prompt, cases and raw response)
#   SharePoint read, Select, Compose, trigger: none. Their data is the same case rows and question
#   that the Select/Compose/ParseJson outputs already show in run history, so securing them would
#   hide nothing while adding settings the reference package never proved at Save.
SECURE_DATA_POLICY = {"ParseJson": ["inputs"], "OpenApiConnection": ["inputs", "outputs"]}

API_NAME_PATTERN = r"shared_[A-Za-z0-9_-]+"
SITE_URL_PATTERN = r"https://[A-Za-z0-9-]+\.sharepoint\.com/(sites|teams)/[A-Za-z0-9._-]+"
EMAIL_PATTERN = r"[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+"


def check_api_name(api_name):
    # The runtime API name is environment-assigned. Do not derive it from a GUID or schema name.
    if not isinstance(api_name, str) or not re.fullmatch(API_NAME_PATTERN, api_name):
        raise ValueError("Supply the exact runtime API name of the existing Claude connector")


def check_site_url(site_url):
    if not isinstance(site_url, str) or not re.fullmatch(SITE_URL_PATTERN, site_url):
        raise ValueError("Supply an explicit https SharePoint site URL, e.g. https://<tenant>.sharepoint.com/sites/<site>")


MAX_ALLOWED_USERS = 10


def check_allowed_users(allowed_users):
    # Allowed users is one field holding email addresses separated by semicolons (the designer's own
    # format; the separator is confirmed by independent trigger references, Microsoft Learn documents
    # only "email addresses"). Confirm the stored value in Code view after the first Save.
    if not isinstance(allowed_users, str):
        raise ValueError("Supply the allowed users as email addresses separated by semicolons")
    users = allowed_users.split(";")
    if not 1 <= len(users) <= MAX_ALLOWED_USERS or any(not re.fullmatch(EMAIL_PATTERN, user) for user in users):
        raise ValueError("Supply one to %d allowed user email addresses separated by semicolons, with no spaces" % MAX_ALLOWED_USERS)
    if len({user.lower() for user in users}) != len(users):
        raise ValueError("Each allowed user may appear only once")


def secured(action, properties):
    action["runtimeConfiguration"] = {"secureData": {"properties": list(properties)}}
    return action


def parse_json(content, schema, after=None):
    return secured({"type": "ParseJson", "inputs": {"content": content, "schema": schema},
                    "runAfter": after or {}}, SECURE_DATA_POLICY["ParseJson"])


def response(status, body, after=None):
    return {"type": "Response", "kind": "Http", "inputs": {"statusCode": status,
            "headers": {"Content-Type": "application/json", "Cache-Control": "no-store",
                        "X-OSS-Flow-Run-ID": "@workflow()?['run']?['name']"}, "body": body},
            "runAfter": after or {}}


def failure(code, after=None):
    return response(contract.ERRORS[code][0], contract.error_body(code), after)


def envelope(model, response_id, case_count, truncated, analysis):
    return {"ok": True, "schemaVersion": contract.SCHEMA_VERSION, "requestId": "@body('Validate_request')?['requestId']",
            "draftOnly": True, "humanReviewRequired": True, "provider": "anthropic",
            "model": model, "responseId": response_id, "caseCount": case_count, "truncated": truncated,
            "asOf": "@outputs('Case_context')?['asOf']", "analysis": analysis}


def claude_request():
    """The request the flow sends: the canonical payload with the user turn bound to Case_context."""
    payload = contract.provider_request(contract.example_request(), contract.example_rows(), contract.EXAMPLE_AS_OF)
    payload["messages"][0]["content"] = USER_CONTENT_EXPRESSION
    return payload


def claude_action(api_name):
    # The designer projects the connector's fixed body object into one input per leaf
    # (body/model, body/thinking/type, ...); arrays and free-form objects stay whole values.
    # Static settings are literals with the swagger's own types; only the user turn is an expression.
    parameters = {"anthropic-version": contract.API_VERSION} if SEND_API_VERSION else {}
    parameters.update(contract.action_body_parameters(claude_request()))
    return secured({"type": "OpenApiConnection", "inputs": {
        "host": {"apiId": "/providers/Microsoft.PowerApps/apis/" + api_name,
                 "connectionName": CLAUDE_CONNECTION_NAME, "operationId": OPERATION_ID},
        "parameters": parameters, "retryPolicy": {"type": "none"}},
        "limit": {"timeout": "PT60S"}, "runAfter": {}}, SECURE_DATA_POLICY["OpenApiConnection"])


def sharepoint_read(site_url):
    return {"type": "OpenApiConnection", "inputs": {
        "host": {"apiId": "/providers/Microsoft.PowerApps/apis/" + SHAREPOINT_API_NAME,
                 "connectionName": SHAREPOINT_CONNECTION_NAME, "operationId": "HttpRequest"},
        "parameters": {"dataset": site_url, "parameters/method": "GET", "parameters/uri": contract.cases_query(),
                       "parameters/headers": dict(SHAREPOINT_HEADERS)},
        "retryPolicy": {"type": "none"}},
        "limit": {"timeout": "PT30S"}, "runAfter": {}}


def definition(api_name, site_url, allowed_users):
    check_api_name(api_name)
    check_site_url(site_url)
    check_allowed_users(allowed_users)
    rows = "body('Get_open_cases')?['value']"
    provider = "body('Validate_provider')"
    first_content = f"first({provider}?['content'])"
    read_cases = {
        "type": "Scope", "runAfter": {}, "actions": {
            "Get_open_cases": sharepoint_read(site_url),
            "Map_cases": {"type": "Select", "inputs": {
                "from": f"@take({rows},{contract.MAX_CASES})",
                "select": {target: f"@item()?['{source}']" for source, target in contract.CASE_FIELDS}},
                "runAfter": {"Get_open_cases": ["Succeeded"]}},
            "Case_context": {"type": "Compose", "inputs": {
                "question": "@body('Validate_request')?['question']",
                "asOf": "@utcNow()",
                "caseCount": "@length(body('Map_cases'))",
                "truncated": f"@greater(length({rows}),{contract.MAX_CASES})",
                "cases": "@body('Map_cases')"},
                "runAfter": {"Map_cases": ["Succeeded"]}},
        },
    }
    analysed = envelope("@body('Validate_provider')?['model']", "@body('Validate_provider')?['id']",
                        "@outputs('Case_context')?['caseCount']", "@outputs('Case_context')?['truncated']",
                        "@body('Validate_analysis')")
    valid_text = {
        "type": "If", "expression": f"@equals({first_content}?['type'],'text')", "runAfter": {},
        "actions": {
            "Validate_analysis": parse_json(f"@{first_content}?['text']", contract.analysis_schema()),
            "Analysis_response": response(200, analysed, after={"Validate_analysis": ["Succeeded"]}),
        },
        "else": {"actions": {"Refusal_response": failure("AI_ANALYSIS_UNAVAILABLE")}},
    }
    completed = {
        "type": "If", "expression": f"@and(equals({provider}?['stop_reason'],'end_turn'),empty({provider}?['stop_details']),empty({provider}?['error']))",
        "runAfter": {"Validate_provider": ["Succeeded"]},
        "actions": {"Check_text_content": valid_text},
        "else": {"actions": {"Incomplete_response": failure("AI_ANALYSIS_UNAVAILABLE")}},
    }
    generation = {
        "type": "Scope", "runAfter": {}, "actions": {
            # Every API setting is fixed inside the Claude action. Only Case_context becomes user input.
            "Claude_analysis": claude_action(api_name),
            "Validate_provider": parse_json("@body('Claude_analysis')", contract.provider_response_schema(),
                                            {"Claude_analysis": ["Succeeded"]}),
            "Check_provider_completed": completed,
        },
    }
    case_count = {
        "type": "If", "expression": "@equals(outputs('Case_context')?['caseCount'],0)",
        "runAfter": {"Read_cases": ["Succeeded"]},
        "actions": {"No_cases_response": response(200, envelope("", "", 0, False, None))},
        "else": {"actions": {
            "Generate_analysis": generation,
            "Generation_failure": failure("AI_ANALYSIS_UNAVAILABLE", after={"Generate_analysis": ["Failed", "TimedOut"]}),
        }},
    }
    question = {
        "type": "If", "expression": "@not(empty(trim(body('Validate_request')?['question'])))",
        "runAfter": {"Validate_request": ["Succeeded"]},
        "actions": {
            "Read_cases": read_cases,
            "Cases_unavailable_response": failure("CASES_UNAVAILABLE", after={"Read_cases": ["Failed", "TimedOut"]}),
            "Check_case_count": case_count,
        },
        "else": {"actions": {"Invalid_question_response": failure("INVALID_REQUEST")}},
    }
    check_size = {
        "type": "If", "expression": f"@lessOrEquals(length(string(triggerBody())),{contract.MAX_REQUEST_CHARACTERS})",
        "runAfter": {},
        "actions": {
            "Validate_request": parse_json("@triggerBody()", contract.request_schema()),
            "Invalid_request_response": failure("INVALID_REQUEST", after={"Validate_request": ["Failed", "TimedOut"]}),
            "Check_question": question,
        },
        "else": {"actions": {"Oversize_response": failure("INPUT_TOO_LARGE")}},
    }
    return {"properties": {
        "connectionReferences": {
            SHAREPOINT_CONNECTION_NAME: {
                "api": {"name": SHAREPOINT_API_NAME},
                "connection": {"connectionReferenceLogicalName": SHAREPOINT_CONNECTION_REFERENCE},
                "runtimeSource": "embedded"},
            CLAUDE_CONNECTION_NAME: {
                "api": {"name": api_name, "logicalName": CONNECTOR_LOGICAL_NAME},
                "connection": {"connectionReferenceLogicalName": CLAUDE_CONNECTION_REFERENCE},
                "runtimeSource": "embedded"},
        },
        "definition": {
            "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
            "contentVersion": "1.0.0.0", "parameters": {
                "$authentication": {"defaultValue": {}, "type": "SecureObject"},
                "$connections": {"defaultValue": {}, "type": "Object"}},
            "triggers": {"manual": {"type": "Request", "kind": "Http", "inputs": {
                "triggerAuthenticationType": "User", "triggerAllowedUsers": allowed_users,
                "method": "POST", "schema": contract.request_schema()},
                "runtimeConfiguration": {"concurrency": {"runs": 1}}}},
            "actions": {"Check_request_size": check_size}, "outputs": {},
        },
    }, "schemaVersion": "1.0.0.0"}
