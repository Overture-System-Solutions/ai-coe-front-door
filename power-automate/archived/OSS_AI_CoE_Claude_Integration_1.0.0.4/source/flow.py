"""Native Power Automate idea-draft definition, bound only to a supplied real API name."""
import re
import integration as contract

CONNECTOR_LOGICAL_NAME = "cwdd_ossclaudeintakedraft"
CONNECTION_REFERENCE = "cwdd_claudeintakedraftconnection"
CONNECTION_NAME = "claude_intake"
OPERATION_ID = "GenerateIntakeDraft"
ALLOWED_USER = "samuel.conrad@osscontact.com"
# The only dynamic part of the Claude request: the validated, visible answers as one JSON string.
USER_CONTENT_EXPRESSION = "@string(outputs('Visible_answers'))"

# Secure-data policy, fixed by what the flow service accepted or rejected at hosted Save:
#   ParseJson          secure inputs accepted; secure outputs rejected (InvalidSecureDataConfiguration)
#   Response           secure outputs rejected, and the designer offers no Security settings for the
#                      action, so a rejected setting cannot be removed in the editor -> none packaged
#   OpenApiConnection  secure inputs and outputs (the connector-action case the setting exists for)
#   Compose / trigger  none packaged: their data is the same request payload that ParseJson outputs
#                      already expose in run history, so securing them hides nothing.


def secured(action, properties=("inputs", "outputs")):
    action["runtimeConfiguration"] = {"secureData": {"properties": list(properties)}}
    return action


def parse_json(content, schema, after=None):
    return secured({"type": "ParseJson", "inputs": {"content": content, "schema": schema},
                    "runAfter": after or {}}, ("inputs",))


def response(status, code=None, body=None, after=None):
    if body is None:
        body = {"ok": False, "error": {"code": code, "message": {
            "INVALID_REQUEST": "Check the submitted answers and synthetic-data confirmation.",
            "INPUT_TOO_LARGE": "The draft request is too large.",
            "AI_DRAFT_UNAVAILABLE": "A valid draft could not be produced. No submission or approval occurred.",
        }[code]}}
    return {"type": "Response", "kind": "Http", "inputs": {"statusCode": status,
            "headers": {"Content-Type": "application/json", "Cache-Control": "no-store",
                        "X-OSS-Flow-Run-ID": "@workflow()?['run']?['name']"}, "body": body},
            "runAfter": after or {}}


def provider_schema():
    return contract.provider_response_schema()


def claude_request():
    """The request the flow sends: the canonical payload with the user turn bound to the validated answers."""
    payload = contract.provider_request(contract.example_request())
    payload["messages"][0]["content"] = USER_CONTENT_EXPRESSION
    return payload


def claude_action(api_name):
    # The designer projects the connector's fixed body object into one input per leaf
    # (body/model, body/thinking/type, ...); arrays and free-form objects stay whole values.
    # Static settings are literals with the swagger's own types so the designer can validate
    # them at Save; only the user turn is an expression. Nothing is string-interpolated.
    parameters = {"anthropic-version": contract.API_VERSION}
    parameters.update(contract.action_body_parameters(claude_request()))
    return secured({"type": "OpenApiConnection", "inputs": {
        "host": {"apiId": "/providers/Microsoft.PowerApps/apis/" + api_name,
                 "connectionName": CONNECTION_NAME, "operationId": OPERATION_ID},
        "parameters": parameters, "retryPolicy": {"type": "none"}},
        "limit": {"timeout": "PT60S"}, "runAfter": {"Visible_answers": ["Succeeded"]}})


def definition(api_name):
    # The runtime API name is environment-assigned. Do not derive it from a GUID or schema name.
    if not isinstance(api_name, str) or not re.fullmatch(r"shared_[A-Za-z0-9_-]+", api_name):
        raise ValueError("Supply the exact runtime API name from the imported connector page")
    raw_answers = "body('Validate_request')?['answers']"
    visible_tool = f"if(equals({raw_answers}?['aiAlreadyUsed'],'yes'),{raw_answers},removeProperty({raw_answers},'aiToolName'))"
    visible = f"@if(equals({raw_answers}?['hasDeadlineSponsor'],'yes'),{visible_tool},removeProperty({visible_tool},'deadlineSponsorDetail'))"
    envelope = {"ok": True, "schemaVersion": "1.0", "requestId": "@body('Validate_request')?['requestId']",
                "draftOnly": True, "humanReviewRequired": True, "provider": "anthropic", "model": "@body('Validate_provider')?['model']",
                "responseId": "@body('Validate_provider')?['id']", "draft": "@body('Validate_draft')"}
    first_content = "first(body('Validate_provider')?['content'])"
    valid_text = {
        "type": "If", "expression": f"@equals({first_content}?['type'],'text')", "runAfter": {},
        "actions": {
            "Validate_draft": parse_json(f"@{first_content}?['text']", contract.draft_schema()),
            "Draft_response": response(200, body=envelope, after={"Validate_draft": ["Succeeded"]}),
        },
        "else": {"actions": {"Refusal_response": response(502, "AI_DRAFT_UNAVAILABLE")}},
    }
    completed = {
        "type": "If", "expression": "@and(equals(body('Validate_provider')?['stop_reason'],'end_turn'),empty(body('Validate_provider')?['stop_details']),empty(body('Validate_provider')?['error']))",
        "runAfter": {"Validate_provider": ["Succeeded"]},
        "actions": {"Check_text_content": valid_text},
        "else": {"actions": {"Incomplete_response": response(502, "AI_DRAFT_UNAVAILABLE")}},
    }
    generation = {
        "type": "Scope", "runAfter": {}, "actions": {
            # Every API setting is fixed inside the Claude action. Only validated visible answers become user input.
            "Visible_answers": {"type": "Compose", "inputs": visible, "runAfter": {}},
            "Claude_draft": claude_action(api_name),
            "Validate_provider": parse_json("@body('Claude_draft')", provider_schema(), {"Claude_draft": ["Succeeded"]}),
            "Check_provider_completed": completed,
        },
    }
    semantic_checks = "@and(" + ",".join([
        f"or(not(equals({raw_answers}?['aiAlreadyUsed'],'yes')),not(empty(trim(coalesce({raw_answers}?['aiToolName'],'')))))",
        f"or(not(equals({raw_answers}?['hasDeadlineSponsor'],'yes')),not(empty(trim(coalesce({raw_answers}?['deadlineSponsorDetail'],'')))))",
        f"or(not(contains({raw_answers}?['informationCategories'],'unsure')),equals(length({raw_answers}?['informationCategories']),1))",
    ]) + ")"
    checks = {
        "type": "If", "expression": semantic_checks, "runAfter": {"Validate_request": ["Succeeded"]},
        "actions": {"Generate_draft": generation,
                    "Generation_failure": response(502, "AI_DRAFT_UNAVAILABLE", after={"Generate_draft": ["Failed", "TimedOut"]})},
        "else": {"actions": {"Invalid_answers_response": response(400, "INVALID_REQUEST")}},
    }
    check_size = {"type": "If", "expression": f"@lessOrEquals(length(string(triggerBody())),{contract.MAX_REQUEST_CHARACTERS})", "runAfter": {},
        "actions": {
            "Validate_request": parse_json("@triggerBody()", contract.request_schema()),
            "Invalid_request_response": response(400, "INVALID_REQUEST", after={"Validate_request": ["Failed", "TimedOut"]}),
            "Check_answers": checks,
        },
        "else": {"actions": {"Oversize_response": response(413, "INPUT_TOO_LARGE")}},
    }
    return {"properties": {
        "connectionReferences": {CONNECTION_NAME: {
            "api": {"name": api_name, "logicalName": CONNECTOR_LOGICAL_NAME},
            "connection": {"connectionReferenceLogicalName": CONNECTION_REFERENCE}, "runtimeSource": "embedded"}},
        "definition": {
            "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
            "contentVersion": "1.0.0.0", "parameters": {
                "$authentication": {"defaultValue": {}, "type": "SecureObject"},
                "$connections": {"defaultValue": {}, "type": "Object"}},
            "triggers": {"manual": {"type": "Request", "kind": "Http", "inputs": {
                "triggerAuthenticationType": "User", "triggerAllowedUsers": ALLOWED_USER,
                "method": "POST", "schema": contract.request_schema()},
                "runtimeConfiguration": {"concurrency": {"runs": 1}}}},
            "actions": {"Check_request_size": check_size}, "outputs": {},
        },
    }, "schemaVersion": "1.0.0.0"}
