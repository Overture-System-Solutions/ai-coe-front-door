"""Local checks for the Claude telemetry solution. Run with: py -3 checks.py

Proves the connector contract, the flow's expressions and references, the row mapping decisions,
the secure-data policy, the SharePoint conventions, the identities and the packaged members. It
cannot prove a hosted Save, a live Admin API call or list rows; those steps are in TESTING.md.
"""
from pathlib import Path
import calendar
import datetime as dt
import json
import re
import sys
import unittest
import xml.etree.ElementTree as ET
import zipfile
from jsonschema import Draft4Validator, ValidationError
import build
import flow
import telemetry as contract

EXPECTED_TESTS = 17
FIXTURE = build.FIXTURE_API_NAME
DELIVERY = build.DELIVERY
REFERENCE = re.compile(r"(?:outputs|body|items|actions)\('([^']+)'\)")
VARIABLE = re.compile(r"variables\('([^']+)'\)")


def check_expression(text):
    """Balanced brackets outside quotes; '' is an escaped quote (verify_final.py of the demo solution)."""
    stack, quote, index = [], False, 0
    while index < len(text):
        char = text[index]
        if char == "'":
            if quote and index + 1 < len(text) and text[index + 1] == "'":
                index += 2
                continue
            quote = not quote
        elif not quote:
            if char in "([":
                stack.append(char)
            if char in ")]":
                assert stack and stack.pop() == {")": "(", "]": "["}[char], text
        index += 1
    assert not quote and not stack, text


def iter_actions(actions, parents=()):
    for name, action in actions.items():
        yield name, action, parents
        for nested in (action.get("actions"), action.get("else", {}).get("actions")):
            if nested:
                yield from iter_actions(nested, parents + ((name, action),))


def strings_in(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings_in(item)
    elif isinstance(value, list):
        for item in value:
            yield from strings_in(item)


def own_strings(action):
    """The action's own strings, without the nested actions of a Scope, loop or condition."""
    return strings_in({key: value for key, value in action.items() if key not in ("actions", "else")})


def document():
    return flow.definition(FIXTURE)


def actions_by_name(doc):
    return {name: action for name, action, _ in iter_actions(doc["properties"]["definition"]["actions"])}


def sharepoint_actions(doc):
    return {name: action for name, action in actions_by_name(doc).items()
            if action.get("type") == "OpenApiConnection" and action["inputs"]["host"]["apiId"].endswith("/shared_sharepointonline")}


def uri_of(action):
    return action["inputs"]["parameters"]["parameters/uri"]


class ConnectorContract(unittest.TestCase):
    def test_connector_spec_two_read_only_admin_gets(self):
        spec = contract.connector_spec()
        self.assertEqual((spec["swagger"], spec["host"], spec["basePath"], spec["schemes"]), ("2.0", "api.anthropic.com", "/v1", ["https"]))
        self.assertEqual(sorted(spec["paths"]), sorted([contract.USAGE_PATH, contract.COST_PATH]))
        for path, item in spec["paths"].items():
            self.assertEqual(list(item), ["get"], path)
        usage, cost = spec["paths"][contract.USAGE_PATH]["get"], spec["paths"][contract.COST_PATH]["get"]
        self.assertEqual((usage["operationId"], cost["operationId"]), ("GetUsageReport", "GetCostReport"))
        self.assertEqual(spec["securityDefinitions"], {"api_key": {"type": "apiKey", "in": "header", "name": "x-api-key"}})
        self.assertEqual(spec["security"], [{"api_key": []}])
        by_name = {parameter["name"]: parameter for parameter in usage["parameters"]}
        self.assertEqual(by_name["anthropic-version"]["default"], "2023-06-01")
        self.assertEqual(by_name["anthropic-version"]["x-ms-visibility"], "internal")
        self.assertTrue(by_name["starting_at"]["required"])
        self.assertEqual(by_name["bucket_width"]["enum"], ["1d"])
        self.assertEqual((by_name["limit"]["maximum"], by_name["limit"]["default"]), (31, 31))
        self.assertNotIn("default", by_name["page"])
        self.assertEqual((by_name["group_by[]"]["in"], by_name["group_by[]"]["type"], by_name["group_by[]"]["enum"]), ("query", "string", ["model"]))
        self.assertNotIn("group_by[]", {parameter["name"] for parameter in cost["parameters"]})
        self.assertNotIn("post", json.dumps(spec["paths"]))
        for operation in (usage, cost):
            self.assertEqual(operation["responses"]["200"]["schema"]["required"], ["data", "has_more"])
            for parameter in operation["parameters"]:
                self.assertNotEqual(parameter["in"], "body")

    def test_connection_parameter_is_admin_key_securestring(self):
        parameters = contract.connection_parameters()
        self.assertEqual(list(parameters), ["api_key"])
        key = parameters["api_key"]
        self.assertEqual(key["type"], "securestring")
        self.assertIs(key["uiDefinition"]["constraints"]["clearText"], False)
        self.assertEqual(key["uiDefinition"]["constraints"]["required"], "true")
        self.assertIn("sk-ant-admin", key["uiDefinition"]["description"])
        self.assertIn("Do not add Bearer", key["uiDefinition"]["description"])
        self.assertNotIn("defaultValue", json.dumps(parameters))

    def test_sample_pages_validate_against_connector_and_parsejson_schemas(self):
        doc = document()
        actions = actions_by_name(doc)
        for kind, sample, result_schema in (("usage", contract.sample_usage_page(), contract.usage_result_schema()),
                                            ("cost", contract.sample_cost_page(), contract.cost_result_schema())):
            schema = contract.jsonschema_from_swagger(contract.page_schema(result_schema))
            Draft4Validator.check_schema(schema)
            Draft4Validator(schema).validate(sample)
            for label in ("previous", "current"):
                self.assertEqual(actions[f"Parse_{kind}_{label}"]["inputs"]["schema"], schema)
            with self.assertRaises(ValidationError):
                Draft4Validator(schema).validate({"has_more": False})
            self.assertNotIn("additionalProperties", json.dumps(schema))
            self.assertNotIn("x-nullable", json.dumps(schema))
        self.assertIn("x-nullable", json.dumps(contract.connector_spec()))


class MappingReference(unittest.TestCase):
    def test_reference_rows_match_decisions(self):
        cost = contract.cost_rows(contract.sample_cost_page())
        self.assertEqual([row["Amount"] for row in cost], [1.2345, 0.005])
        self.assertEqual({row["Currency"] for row in cost}, {"USD"})
        self.assertEqual([row["CompositeKey"] for row in cost], ["anthropic|cost|2026-08-01", "anthropic|cost|2026-08-02"])
        self.assertAlmostEqual(contract.month_to_date_spend(contract.sample_cost_page()), 1.2395)
        usage = contract.usage_rows(contract.sample_usage_page())
        self.assertEqual([row["CompositeKey"] for row in usage],
                         ["anthropic|completions|2026-08-01|claude-sonnet-5", "anthropic|completions|2026-08-01|claude-opus-5"])
        self.assertEqual([row["InputTokens"] for row in usage], [1000 + 10 + 20 + 300, 500])
        self.assertEqual([row["OutputTokens"] for row in usage], [200, 100])
        for row in cost + usage:
            self.assertEqual(row["Title"], row["CompositeKey"])
            self.assertEqual(row["Provider"], "anthropic")
            self.assertNotIn("Requests", row)
            self.assertEqual(row["BucketStartEpoch"], calendar.timegm(dt.datetime.strptime(row["BucketStart"], "%Y-%m-%dT%H:%M:%SZ").timetuple()))
            self.assertEqual(row["BucketEndEpoch"] - row["BucketStartEpoch"], 86400)
            self.assertRegex(row["BucketStart"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
        self.assertRegex(cost[0]["CompositeKey"], r"^anthropic\|cost\|\d{4}-\d{2}-\d{2}$")
        self.assertRegex(usage[0]["CompositeKey"], r"^anthropic\|completions\|\d{4}-\d{2}-\d{2}\|[^|]+$")
        expected = DELIVERY / "expected-list-rows.json"
        if expected.exists():
            recorded = json.loads(expected.read_text(encoding="utf-8"))
            self.assertEqual(recorded["usage"], usage)
            self.assertEqual(recorded["cost"], cost)

    def test_epoch_constant_and_window_rule(self):
        self.assertEqual(contract.UNIX_EPOCH_TICKS, (dt.datetime(1970, 1, 1) - dt.datetime(1, 1, 1)).days * 86400 * 10 ** 7)
        self.assertEqual(contract.window(dt.datetime(2026, 9, 11, 12, 30, 5)), ("2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z", "2026-09-11T12:30:05Z"))
        self.assertEqual(contract.window(dt.datetime(2027, 1, 3))[:2], ("2026-12-01T00:00:00Z", "2027-01-01T00:00:00Z"))
        window = actions_by_name(document())["Window"]["inputs"]
        self.assertEqual(window["previous_month_start"], "@formatDateTime(addToTime(startOfMonth(utcNow()),-1,'Month'),'yyyy-MM-ddTHH:mm:ssZ')")
        self.assertEqual(window["current_month_start"], "@formatDateTime(startOfMonth(utcNow()),'yyyy-MM-ddTHH:mm:ssZ')")
        self.assertEqual(window["now"], "@utcNow('yyyy-MM-ddTHH:mm:ssZ')")
        actions = actions_by_name(document())
        for kind in ("usage", "cost"):
            previous, current = actions[f"Get_{kind}_previous"]["inputs"]["parameters"], actions[f"Get_{kind}_current"]["inputs"]["parameters"]
            self.assertEqual((previous["starting_at"], previous["ending_at"]), ("@outputs('Window')?['previous_month_start']", "@outputs('Window')?['current_month_start']"))
            self.assertEqual((current["starting_at"], current["ending_at"]), ("@outputs('Window')?['current_month_start']", "@outputs('Window')?['now']"))
            self.assertEqual((previous["limit"], previous["bucket_width"], previous["anthropic-version"]), (31, "1d", "2023-06-01"))
            self.assertNotIn("page", previous)
        self.assertEqual(actions["Get_usage_current"]["inputs"]["parameters"]["group_by[]"], "model")
        self.assertNotIn("group_by[]", actions["Get_cost_current"]["inputs"]["parameters"])


class FlowDefinition(unittest.TestCase):
    def test_every_reference_resolves(self):
        doc = document()
        definition = doc["properties"]["definition"]
        seen = []
        variables = set()
        for name, action, parents in iter_actions(definition["actions"]):
            seen.append(name)
            siblings = parents[-1][1]["actions"] if parents else definition["actions"]
            if parents and name not in siblings:
                siblings = parents[-1][1]["else"]["actions"]
            for dependency in action.get("runAfter", {}):
                self.assertIn(dependency, siblings, f"{name} runs after non-sibling {dependency}")
            if action["type"] == "InitializeVariable":
                self.assertFalse(parents, f"{name} must be at the root")
                variables.update(variable["name"] for variable in action["inputs"]["variables"])
        self.assertEqual(len(seen), len(set(seen)), "action names must be unique")
        names = set(seen)
        for name, action, parents in iter_actions(definition["actions"]):
            loops = {parent_name for parent_name, parent in parents if parent["type"] == "Foreach"}
            for text in own_strings(action):
                if not text.startswith("@"):
                    continue
                for referenced in REFERENCE.findall(text):
                    self.assertIn(referenced, names, f"{name} references unknown action {referenced}")
                for loop in re.findall(r"items\('([^']+)'\)", text):
                    self.assertIn(loop, loops, f"{name} uses items() of {loop}, which is not an enclosing loop")
                for variable in VARIABLE.findall(text):
                    self.assertIn(variable, variables, f"{name} reads uninitialised variable {variable}")
        for reference in doc["properties"]["connectionReferences"].values():
            self.assertEqual(reference["runtimeSource"], "embedded")
        connection_names = {action["inputs"]["host"]["connectionName"] for action in actions_by_name(doc).values() if action["type"] == "OpenApiConnection"}
        self.assertEqual(connection_names, set(doc["properties"]["connectionReferences"]))

    def test_expressions_balanced_and_not_interpolated(self):
        doc = document()
        count = 0
        for text in strings_in(doc["properties"]["definition"]):
            if text.startswith("@"):
                check_expression(text[1:])
                count += 1
        self.assertGreater(count, 40)
        self.assertNotIn("@{", json.dumps(doc))

    def test_concurrency_schedule_and_pagination_guards(self):
        doc = document()
        trigger = doc["properties"]["definition"]["triggers"]["manual"]
        self.assertEqual(trigger["type"], "Recurrence")
        self.assertEqual(trigger["recurrence"], {"frequency": "Hour", "interval": 6, "timeZone": "Eastern Standard Time"})
        self.assertEqual(trigger["runtimeConfiguration"], {"concurrency": {"runs": 1}})
        actions = actions_by_name(doc)
        loops = [name for name, action in actions.items() if action["type"] == "Foreach"]
        self.assertEqual(len(loops), 8)
        for name in loops:
            self.assertEqual(actions[name]["runtimeConfiguration"]["concurrency"]["repetitions"], 1, name)
        self.assertNotIn("Until", {action["type"] for action in actions.values()})
        order = ["Window", "Init_mtd_spend", "Get_usage_previous", "Parse_usage_previous", "Get_usage_current", "Parse_usage_current",
                 "Get_cost_previous", "Parse_cost_previous", "Get_cost_current", "Parse_cost_current", "Check_usage_pagination",
                 "Check_cost_pagination", "For_each_usage_page", "For_each_cost_page", "For_each_month_cost_bucket", "Budget_check"]
        self.assertEqual(list(doc["properties"]["definition"]["actions"]), order)
        for previous, current in zip(order, order[1:]):
            self.assertEqual(actions[current]["runAfter"], {previous: ["Succeeded"]}, current)
        for kind in ("usage", "cost"):
            guard = actions[f"Check_{kind}_pagination"]
            self.assertEqual(guard["expression"], f"@or(equals(body('Parse_{kind}_previous')?['has_more'],true),equals(body('Parse_{kind}_current')?['has_more'],true))")
            stop = guard["actions"][f"Stop_on_{kind}_pagination"]
            self.assertEqual((stop["type"], stop["inputs"]["runStatus"], stop["inputs"]["runError"]["code"]), ("Terminate", "Failed", "UNEXPECTED_PAGINATION"))
            self.assertEqual(actions[f"For_each_{kind}_page"]["foreach"], f"@createArray(body('Parse_{kind}_previous')?['data'],body('Parse_{kind}_current')?['data'])")
            self.assertEqual(actions[f"For_each_{kind}_bucket"]["foreach"], f"@items('For_each_{kind}_page')")
            self.assertEqual(actions[f"For_each_{kind}_result"]["foreach"], f"@items('For_each_{kind}_bucket')?['results']")
        for name in ("Get_usage_previous", "Get_cost_current"):
            self.assertEqual(actions[name]["limit"], {"timeout": "PT2M"})
            self.assertNotIn("retryPolicy", actions[name]["inputs"])
        increment = actions["Increment_mtd_spend"]
        self.assertEqual(increment["type"], "IncrementVariable")
        self.assertEqual(increment["inputs"], {"name": "mtd_spend", "value": "@div(float(coalesce(items('For_each_month_cost_result')?['amount'],'0')),100)"})
        self.assertEqual(actions["For_each_month_cost_bucket"]["foreach"], "@body('Parse_cost_current')?['data']")
        self.assertEqual(actions["Init_mtd_spend"]["inputs"], {"variables": [{"name": "mtd_spend", "type": "float", "value": 0}]})

    def test_upsert_guard_order(self):
        actions = actions_by_name(document())
        for kind in ("usage", "cost"):
            prefix = kind.capitalize()
            scope = actions[f"Upsert_{kind}_row"]
            self.assertEqual(scope["type"], "Scope")
            self.assertEqual(list(scope["actions"]), [f"{prefix}_key", f"{prefix}_row", f"Find_{kind}_row", f"If_{kind}_row_exists"])
            find, branch = actions[f"Find_{kind}_row"], actions[f"If_{kind}_row_exists"]
            self.assertEqual(actions[f"{prefix}_row"]["runAfter"], {f"{prefix}_key": ["Succeeded"]})
            self.assertEqual(find["runAfter"], {f"{prefix}_row": ["Succeeded"]})
            self.assertEqual(branch["runAfter"], {f"Find_{kind}_row": ["Succeeded"]})
            self.assertEqual(branch["expression"], f"@greater(length(body('Find_{kind}_row')?['value']),0)")
            uri = uri_of(find)
            # replace(key, ' , '') with WDL's doubled-quote escapes: '''' is one apostrophe, '''''' is two.
            for part in ("$select=Id", "$filter=CompositeKey%20eq%20%27", "$top=1", f"encodeUriComponent(replace(outputs('{prefix}_key'),'''',''''''))", "getbytitle(''AI Usage Daily'')"):
                self.assertIn(part, uri)
            self.assertEqual(find["inputs"]["parameters"]["parameters/method"], "GET")
            merge, create = actions[f"Merge_{kind}_row"], actions[f"Create_{kind}_row"]
            self.assertEqual(list(branch["actions"]), [f"Merge_{kind}_row"])
            self.assertEqual(list(branch["else"]["actions"]), [f"Create_{kind}_row"])
            self.assertEqual(uri_of(merge), f"@concat('_api/web/lists/getbytitle(''AI Usage Daily'')/items(',string(first(body('Find_{kind}_row')?['value'])?['Id']),')')")
            self.assertEqual(merge["inputs"]["parameters"]["parameters/headers"]["IF-MATCH"], "*")
            self.assertEqual(merge["inputs"]["parameters"]["parameters/headers"]["X-HTTP-Method"], "MERGE")
            self.assertEqual(uri_of(create), "_api/web/lists/getbytitle('AI Usage Daily')/items")
            self.assertNotIn("IF-MATCH", create["inputs"]["parameters"]["parameters/headers"])
            for action in (merge, create):
                self.assertEqual(action["inputs"]["parameters"]["parameters/method"], "POST")
                self.assertEqual(action["inputs"]["parameters"]["parameters/body"], f"@outputs('{prefix}_row')")
            row = actions[f"{prefix}_row"]["inputs"]
            self.assertEqual(row["Title"], f"@outputs('{prefix}_key')")
            self.assertEqual(row["CompositeKey"], f"@outputs('{prefix}_key')")

    def test_composite_key_and_amount_expressions(self):
        actions = actions_by_name(document())
        self.assertEqual(actions["Cost_key"]["inputs"], "@concat('anthropic|cost|',formatDateTime(items('For_each_cost_bucket')?['starting_at'],'yyyy-MM-dd'))")
        self.assertEqual(actions["Usage_key"]["inputs"],
                         "@concat('anthropic|completions|',formatDateTime(items('For_each_usage_bucket')?['starting_at'],'yyyy-MM-dd'),'|',coalesce(items('For_each_usage_result')?['model'],'unknown'))")
        cost, usage = actions["Cost_row"]["inputs"], actions["Usage_row"]["inputs"]
        self.assertEqual(cost["Amount"], "@div(float(coalesce(items('For_each_cost_result')?['amount'],'0')),100)")
        self.assertEqual(cost["Currency"], "@coalesce(items('For_each_cost_result')?['currency'],'USD')")
        self.assertEqual((cost["MetricType"], cost["Provider"]), ("cost", "anthropic"))
        self.assertEqual((usage["MetricType"], usage["Provider"]), ("completions", "anthropic"))
        for field in ("uncached_input_tokens", "cache_creation']?['ephemeral_1h_input_tokens", "cache_creation']?['ephemeral_5m_input_tokens", "cache_read_input_tokens"):
            self.assertIn(f"coalesce(items('For_each_usage_result')?['{field}'],0)", usage["InputTokens"])
        self.assertEqual(usage["OutputTokens"], "@coalesce(items('For_each_usage_result')?['output_tokens'],0)")
        self.assertEqual(usage["Model"], "@coalesce(items('For_each_usage_result')?['model'],'unknown')")
        for row, loop in ((cost, "For_each_cost_bucket"), (usage, "For_each_usage_bucket")):
            self.assertEqual(row["BucketStartEpoch"], f"@div(sub(ticks(items('{loop}')?['starting_at']),621355968000000000),10000000)")
            self.assertEqual(row["BucketEndEpoch"], f"@div(sub(ticks(items('{loop}')?['ending_at']),621355968000000000),10000000)")
            self.assertEqual(row["BucketStart"], f"@formatDateTime(items('{loop}')?['starting_at'],'yyyy-MM-ddTHH:mm:ssZ')")
            for absent in ("Requests", "ProjectId", "ApiKeyId", "LineItem"):
                self.assertNotIn(absent, row)
        self.assertNotIn("Amount", usage)
        self.assertNotIn("InputTokens", cost)

    def test_secure_data_policy(self):
        doc = document()
        policy = build.secure_data_map(doc)
        for name, action in actions_by_name(doc).items():
            kind = action["type"]
            if kind == "OpenApiConnection" and not action["inputs"]["host"]["apiId"].endswith("/shared_sharepointonline"):
                self.assertEqual(policy.get(name), ["inputs", "outputs"], name)
            elif kind == "ParseJson":
                self.assertEqual(policy.get(name), ["inputs"], name)
            elif kind == "OpenApiConnection":
                self.assertEqual(policy.get(name), ["inputs", "outputs"] if flow.SECURE_SHAREPOINT else None, name)
            else:
                self.assertNotIn("secureData", action.get("runtimeConfiguration", {}), name)
        self.assertNotIn("secureData", json.dumps(doc["properties"]["definition"]["triggers"]))
        if not flow.SECURE_SHAREPOINT:
            self.assertEqual(sorted(policy), sorted(["Get_usage_previous", "Get_usage_current", "Get_cost_previous", "Get_cost_current",
                                                     "Parse_usage_previous", "Parse_usage_current", "Parse_cost_previous", "Parse_cost_current"]))

    def test_sharepoint_calls_follow_conventions(self):
        doc = document()
        calls = sharepoint_actions(doc)
        self.assertEqual(len(calls), 12)
        lists = set()
        for name, action in calls.items():
            host, parameters = action["inputs"]["host"], action["inputs"]["parameters"]
            self.assertEqual((host["operationId"], host["connectionName"]), ("HttpRequest", "shared_sharepointonline"), name)
            self.assertEqual(parameters["dataset"], "https://osscontact.sharepoint.com/sites/AI-CoE-Lab", name)
            headers = parameters["parameters/headers"]
            self.assertEqual((headers["Accept"], headers["Content-Type"]), ("application/json;odata=nometadata", "application/json;odata=nometadata"), name)
            self.assertIn(parameters["parameters/method"], ("GET", "POST"))
            if parameters["parameters/method"] == "GET":
                self.assertNotIn("parameters/body", parameters)
            lists.update(re.findall(r"getbytitle\('((?:[^']|'')+)'\)", uri_of(action)))
        self.assertEqual({title.replace("''", "'") for title in lists}, {"AI Usage Daily", "AI CoE Incidents", "AI CoE Configuration"})
        text = json.dumps(doc)
        for forbidden in ("shared_office365", "shared_approvals", "/messages", "GenerateIntakeDraft", "sk-ant-", "Bearer "):
            self.assertNotIn(forbidden, text)
        self.assertEqual(sorted(doc["properties"]["connectionReferences"]), ["claude_telemetry", "shared_sharepointonline"])
        self.assertEqual(doc["properties"]["connectionReferences"]["shared_sharepointonline"]["connection"]["connectionReferenceLogicalName"], "cwdd_sharedsharepointonline")

    def test_budget_setting_row_and_incident_lifecycle(self):
        actions = actions_by_name(document())
        scope = actions["Budget_check"]
        self.assertEqual(list(scope["actions"]), ["Get_budget_setting", "If_budget_setting_missing"])
        self.assertEqual(uri_of(actions["Get_budget_setting"]),
                         "_api/web/lists/getbytitle('AI CoE Configuration')/items?$select=Id,Title,Value&$filter=Title%20eq%20'ClaudeMonthlyBudgetUsd'&$top=1")
        missing = actions["If_budget_setting_missing"]
        self.assertEqual(missing["expression"], "@equals(length(body('Get_budget_setting')?['value']),0)")
        self.assertEqual(list(missing["actions"]), ["Create_budget_setting"])
        created = actions["Create_budget_setting"]["inputs"]["parameters"]
        self.assertEqual(uri_of(actions["Create_budget_setting"]), "_api/web/lists/getbytitle('AI CoE Configuration')/items")
        self.assertEqual(created["parameters/body"]["Title"], "ClaudeMonthlyBudgetUsd")
        self.assertEqual(created["parameters/body"]["Value"], "")
        self.assertIn("Leave blank", created["parameters/body"]["Description"])
        self.assertEqual(list(missing["else"]["actions"]), ["Budget_text", "If_budget_set"])
        self.assertEqual(actions["Budget_text"]["inputs"], "@trim(coalesce(first(body('Get_budget_setting')?['value'])?['Value'],''))")
        self.assertEqual(actions["If_budget_set"]["expression"], "@not(empty(outputs('Budget_text')))")
        self.assertNotIn("else", actions["If_budget_set"])
        find = actions["Find_open_cost_incident"]
        for part in ("getbytitle('AI CoE Incidents')", "Provider%20eq%20'anthropic'", "Category%20eq%20'Cost'", "Status%20eq%20'Open'", "$top=1"):
            self.assertIn(part, uri_of(find))
        over = actions["If_over_budget"]
        self.assertEqual(over["expression"], "@and(greater(float(outputs('Budget_text')),0),greater(variables('mtd_spend'),float(outputs('Budget_text'))))")
        self.assertEqual(over["runAfter"], {"Find_open_cost_incident": ["Succeeded"]})
        self.assertEqual(list(over["actions"]), ["If_cost_incident_open"])
        self.assertEqual(list(over["else"]["actions"]), ["If_cost_incident_to_resolve"])
        for name in ("If_cost_incident_open", "If_cost_incident_to_resolve"):
            self.assertEqual(actions[name]["expression"], "@greater(length(body('Find_open_cost_incident')?['value']),0)")
        create = actions["Create_cost_incident"]["inputs"]["parameters"]
        self.assertEqual(uri_of(actions["Create_cost_incident"]), "_api/web/lists/getbytitle('AI CoE Incidents')/items")
        body = create["parameters/body"]
        self.assertEqual((body["Title"], body["Category"], body["Severity"], body["Status"], body["Provider"], body["DetectedAt"]),
                         ("Claude API spend exceeded the monthly budget", "Cost", "High", "Open", "anthropic", "@utcNow()"))
        self.assertIn("formatNumber(variables('mtd_spend'),'0.00')", body["Details"])
        self.assertIn("formatNumber(float(outputs('Budget_text')),'0.00')", body["Details"])
        self.assertEqual(actions["Merge_cost_incident_details"]["inputs"]["parameters"]["parameters/body"], {"Details": body["Details"]})
        resolve = actions["Resolve_cost_incident"]["inputs"]["parameters"]
        self.assertEqual(resolve["parameters/body"]["Status"], "Resolved")
        self.assertIn("is within the ClaudeMonthlyBudgetUsd setting", resolve["parameters/body"]["Resolution"])
        for name in ("Merge_cost_incident_details", "Resolve_cost_incident"):
            self.assertEqual(actions[name]["inputs"]["parameters"]["parameters/headers"]["X-HTTP-Method"], "MERGE")
            self.assertEqual(uri_of(actions[name]), "@concat('_api/web/lists/getbytitle(''AI CoE Incidents'')/items(',string(first(body('Find_open_cost_incident')?['value'])?['Id']),')')")
        self.assertIsNone(re.search(r"budget[^\"]*\b\d+(\.\d+)?\s*(USD|\$)", json.dumps(scope), re.IGNORECASE), "no hard-coded budget amount")


class Packaging(unittest.TestCase):
    def test_identities_are_new_and_deterministic(self):
        self.assertEqual(build.CONNECTOR_ID, "a3299c63-ca70-50e5-b836-e86788be5250")
        self.assertEqual(build.FLOW_ID, "0024bbee-d19d-50c5-a199-a5755c0c4044")
        self.assertEqual(build.FLOW_FILE, "ClaudeTelemetry-0024BBEE-D19D-50C5-A199-A5755C0C4044.json")
        earlier = set()
        for donor in (build.DONOR_CONNECTOR, build.DONOR_FLOW):
            _, members = build.read_members(donor)
            earlier.update(re.findall(r'id="\{([0-9a-f-]+)\}"', members["solution.xml"].decode("utf-8-sig")))
        self.assertEqual(len(earlier), 2)
        self.assertFalse({build.CONNECTOR_ID, build.FLOW_ID} & earlier)
        self.assertEqual((build.CONNECTOR_NAME, build.CONNECTOR_DISPLAY), ("cwdd_ossclaudetelemetry", "OSS Claude Telemetry"))
        self.assertEqual((build.CONNECTOR_SOLUTION, build.FLOW_SOLUTION, build.VERSION), ("OSSCloudWaveClaudeTelemetryConnector", "OSSCloudWaveClaudeTelemetry", "1.0.0.0"))
        self.assertEqual((flow.CONNECTION_REFERENCE, flow.SHAREPOINT_CONNECTION_REFERENCE), ("cwdd_claudetelemetryconnection", "cwdd_sharedsharepointonline"))
        self.assertEqual(build.FLOW_NAME, "OSS Demo - Claude Telemetry")
        with self.assertRaises(ValueError):
            flow.definition("not-an-api-name")

    def test_pac_style_serializer_reproduces_donor_xml(self):
        for donor in (build.DONOR_CONNECTOR, build.DONOR_FLOW):
            _, members = build.read_members(donor)
            for name in ("solution.xml", "customizations.xml"):
                data = members[name]
                self.assertEqual(build.serialize_like_pac(build.parse_xml(data), data), data, f"{donor.name}:{name}")

    def test_connector_zip_members_and_identity_fields(self):
        self.assertTrue(build.CONNECTOR_ZIP.exists(), "run py -3 build.py first")
        _, donor = build.read_members(build.DONOR_CONNECTOR)
        with zipfile.ZipFile(build.CONNECTOR_ZIP) as archive:
            self.assertIsNone(archive.testzip())
            infos = archive.infolist()
            members = {info.filename: archive.read(info) for info in infos}
        prefix = "Connector/cwdd_ossclaudetelemetry_"
        self.assertEqual([info.filename for info in infos], ["customizations.xml", "solution.xml", prefix + "iconblob.Png", prefix + "policytemplateinstances.json",
                                                              prefix + "connectionparameters.json", prefix + "openapidefinition.json", "[Content_Types].xml"])
        for info in infos:
            self.assertEqual((info.date_time, info.compress_type, info.external_attr, info.create_system), (build.ZIP_DATE_TIME, zipfile.ZIP_DEFLATED, build.ZIP_EXTERNAL_ATTR, 0), info.filename)
        self.assertEqual(members["[Content_Types].xml"], donor["[Content_Types].xml"])
        self.assertEqual(members[prefix + "iconblob.Png"], donor["Connector/cwdd_ossclaudeintakedraft_iconblob.Png"])
        self.assertEqual(json.loads(members[prefix + "policytemplateinstances.json"]), [])
        self.assertEqual(json.loads(members[prefix + "openapidefinition.json"]), contract.connector_spec())
        self.assertEqual(json.loads(members[prefix + "connectionparameters.json"]), contract.connection_parameters())
        for name in ("solution.xml", "customizations.xml"):
            self.assertTrue(members[name].startswith(build.BOM + build.DECLARATION + b"\n"), name)
        solution = build.parse_xml(members["solution.xml"]).find("SolutionManifest")
        self.assertEqual((solution.find("UniqueName").text, solution.find("Version").text, solution.find("Managed").text), ("OSSCloudWaveClaudeTelemetryConnector", "1.0.0.0", "0"))
        self.assertEqual(solution.find("Publisher/UniqueName").text, "OSSCloudWaveDemoPublisher")
        self.assertEqual(solution.find("Publisher/CustomizationPrefix").text, "cwdd")
        components = solution.findall("RootComponents/RootComponent")
        self.assertEqual(len(components), 1)
        self.assertEqual(components[0].attrib, {"type": "372", "id": "{" + build.CONNECTOR_ID + "}", "schemaName": "cwdd_ossclaudetelemetry", "behavior": "0"})
        connector = build.parse_xml(members["customizations.xml"]).find("Connectors/Connector")
        self.assertEqual((connector.find("connectorid").text, connector.find("name").text, connector.find("displayname").text, connector.find("connectortype").text),
                         (build.CONNECTOR_ID, "cwdd_ossclaudetelemetry", "OSS Claude Telemetry", "1"))
        for tag, suffix in (("openapidefinition", "openapidefinition.json"), ("connectionparameters", "connectionparameters.json"),
                            ("policytemplateinstances", "policytemplateinstances.json"), ("iconblob", "iconblob.Png")):
            self.assertEqual(connector.find(tag).text, "/Connector/cwdd_ossclaudetelemetry_" + suffix)
        self.assertNotIn(b"cwdd_ossclaudeintakedraft", members["customizations.xml"] + members["solution.xml"])
        self.assertNotIn(b"9d027c49", members["customizations.xml"] + members["solution.xml"])
        rebuilt = build.write_zip(Path(build.DELIVERY) / "source" / "rebuild-check.zip", build.connector_members())
        try:
            self.assertEqual(rebuilt["sha256"], build.sha256(build.CONNECTOR_ZIP), "the connector build must be deterministic")
        finally:
            (Path(build.DELIVERY) / "source" / "rebuild-check.zip").unlink()
        if build.VERIFICATION.exists():
            record = json.loads(build.VERIFICATION.read_text(encoding="utf-8"))
            self.assertEqual(record["connector_zip_sha256"], build.sha256(build.CONNECTOR_ZIP))
            self.assertEqual(record["connector_id"], build.CONNECTOR_ID)
            self.assertIs(record["key_collected"], False)
            self.assertIs(record["tenant_writes_performed"], False)

    def test_flow_zip_bound_or_pending(self):
        if not build.FLOW_ZIP.exists():
            self.skipTest("flow ZIP not built: the connector's runtime API name is pending")
        record = json.loads(build.VERIFICATION.read_text(encoding="utf-8"))
        api_name = record["runtime_api_name"]
        self.assertRegex(api_name, r"^shared_[A-Za-z0-9_-]+$")
        with zipfile.ZipFile(build.FLOW_ZIP) as archive:
            self.assertIsNone(archive.testzip())
            infos = archive.infolist()
            members = {info.filename: archive.read(info) for info in infos}
        self.assertEqual([info.filename for info in infos], ["customizations.xml", "solution.xml", "Workflows/" + build.FLOW_FILE, "[Content_Types].xml"])
        for info in infos:
            self.assertEqual((info.date_time, info.compress_type, info.external_attr, info.create_system), (build.ZIP_DATE_TIME, zipfile.ZIP_DEFLATED, build.ZIP_EXTERNAL_ATTR, 0), info.filename)
        workflow_json = members["Workflows/" + build.FLOW_FILE].decode("utf-8")
        self.assertEqual(json.loads(workflow_json), flow.definition(api_name))
        for forbidden in ("sk-ant-", "fixture", "placeholder", "sig=", "Bearer "):
            self.assertNotIn(forbidden, workflow_json)
        root = build.parse_xml(members["customizations.xml"])
        workflow = root.find("Workflows/Workflow")
        self.assertEqual((workflow.get("WorkflowId"), workflow.get("Name")), ("{" + build.FLOW_ID + "}", "OSS Demo - Claude Telemetry"))
        self.assertEqual((workflow.find("StateCode").text, workflow.find("StatusCode").text, workflow.find("IntroducedVersion").text), ("0", "1", "1.0.0.0"))
        self.assertEqual(workflow.find("JsonFileName").text, "/Workflows/" + build.FLOW_FILE)
        references = root.findall("connectionreferences/connectionreference")
        self.assertEqual([reference.get("connectionreferencelogicalname") for reference in references], ["cwdd_claudetelemetryconnection", "cwdd_sharedsharepointonline"])
        self.assertEqual(references[0].find("connectorid").text, "/providers/Microsoft.PowerApps/apis/" + api_name)
        self.assertEqual(references[0].find("customconnectorid/connectorid").text, build.CONNECTOR_ID)
        self.assertEqual(references[1].find("connectorid").text, "/providers/Microsoft.PowerApps/apis/shared_sharepointonline")
        self.assertIsNone(references[1].find("customconnectorid"))
        solution = build.parse_xml(members["solution.xml"]).find("SolutionManifest")
        self.assertEqual((solution.find("UniqueName").text, solution.find("Version").text), ("OSSCloudWaveClaudeTelemetry", "1.0.0.0"))
        components = solution.findall("RootComponents/RootComponent")
        self.assertEqual([(component.get("type"), component.get("id")) for component in components], [("29", "{" + build.FLOW_ID + "}")])
        settings = json.loads((DELIVERY / "CONNECTION_SETTINGS.json").read_text(encoding="utf-8"))
        self.assertEqual(settings["ConnectionReferences"][0]["ConnectorId"], "/providers/Microsoft.PowerApps/apis/" + api_name)
        self.assertEqual(record["flow_zip_sha256"], build.sha256(build.FLOW_ZIP))


def record_results(result):
    """Keep VERIFICATION.json's checks_py entry in step with the last run."""
    if not build.VERIFICATION.exists():
        return
    record = json.loads(build.VERIFICATION.read_text(encoding="utf-8"))
    skipped = [reason for _, reason in result.skipped]
    record["checks_py"] = {"tests": result.testsRun, "passed": result.testsRun - len(result.failures) - len(result.errors) - len(skipped),
                           "failed": len(result.failures) + len(result.errors), "skipped": len(skipped), "skipped_reason": skipped[0] if skipped else None}
    build.VERIFICATION.write_bytes(build.json_bytes(record))


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    assert suite.countTestCases() == EXPECTED_TESTS, suite.countTestCases()
    outcome = unittest.TextTestRunner(verbosity=2).run(suite)
    record_results(outcome)
    sys.exit(0 if outcome.wasSuccessful() else 1)
