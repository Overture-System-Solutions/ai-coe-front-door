"""
The six MVP cloud flows of AICoECoreAutomation 3.0.0.0, built with wdl.Flow.
Every flow: reads AI CoE Definitions once (the only title-addressed list), addresses every other list by the GUID
flow 00 wrote back, wraps work in a scope with a failure handler that writes AI Automation Log, and ends by
stamping a heartbeat. No flow sends anything: the outbox flow ships OFF and suppresses while SendEnabled=false.
"""
from __future__ import annotations
import json
from xml.sax.saxutils import escape

import model as M
from wdl import Flow, recurrence, manual_button, choice, q, P, SITE_PARAM, MAIL_PARAM, LABEL_PARAM, new_id

DEFS_TITLE = M.LISTS["Definitions"][0]
LOOSE = {"type": "object"}  # ParseJson schema: accept any object; field-level validation is by expressions + RC2 schema on RecordJson


# ------------------------------------------------------------------------------------------------
# shared building blocks
# ------------------------------------------------------------------------------------------------
def cfg_prologue(f: Flow):
    f.add("Get_Definitions", f.get_items(DEFS_TITLE, top=500))
    f.add("Select_Cfg", f.select("@body('Get_Definitions')?['value']", "@concat('\"', item()?['Title'], '\":', item()?['Value'])"))
    f.add("Cfg", f.compose("@json(concat('{', join(body('Select_Cfg'), ','), '}'))"))
    f.add("RunStart", f.compose("@utcNow()"))


def cfg_failure(f: Flow):
    """If AI CoE Definitions cannot be read or a Value is not JSON, log by title (the one title-addressed list) and stop."""
    log_row(f, "Log_Cfg_Failure", "Error", "@concat('Configuration load failed (AI CoE Definitions unreadable or a Value is not a JSON literal): ', string(coalesce(actions('Cfg')?['error'], actions('Select_Cfg')?['error'], actions('Get_Definitions')?['error'], 'unknown')))",
            run_after={"Cfg": ["Failed", "Skipped"]}, table=M.LISTS["Log"][0])
    f.add("Terminate_Cfg", f.terminate("CONFIG_LOAD_FAILED", "AI CoE Definitions must contain valid JSON literals in Value."), run_after={"Log_Cfg_Failure": ["Succeeded"]})


def L(key: str) -> str:  # list GUID from config
    return f"@outputs('Cfg')?['ListId_{key}']"


def log_row(f: Flow, name: str, level: str, message: str, into=None, last=None, run_after=None, work_id: str = "", corr: str = "", table: str | None = None):
    return f.add(name, f.create_item(table or L("Log"), {"Title": f"@{new_id('LOG')}", "Flow": f.name, "RunId": "@workflow()?['run']?['name']",
                                                 "Level": choice(level), "Message": message, "CorrelationID": corr, "WorkID": work_id, "LoggedAt": "@utcNow()"}),
                 into=into, last=last, run_after=run_after)


def heartbeat(f: Flow, key: str):
    f.add("Find_Heartbeat", f.get_items(L("Definitions"), f"Title eq '{key}'", top=1))
    hb = {}
    f.add("Update_Heartbeat", f.update_item(L("Definitions"), "@first(body('Find_Heartbeat')?['value'])?['ID']", {"Value": "@concat('\"', utcNow(), '\"')"}), into=hb, last=[None], run_after={})
    f.add("If_Heartbeat_Exists", f.condition({"and": [{"greater": ["@length(body('Find_Heartbeat')?['value'])", 0]}]}, hb))


def failure_handler(f: Flow, scope_name: str, message: str):
    log_row(f, "Log_Flow_Failure", "Error", message, run_after={scope_name: ["Failed", "TimedOut"]})
    f.add("Terminate_Failed", f.terminate("FLOW_FAILURE", message))


def proj(src: str) -> dict:
    """UI-facing Work projection (contract v0.1.1) from a Cases list item expression `src` (e.g. body('X'))."""
    g = lambda fld: f"@{src}?['{fld}']"
    gv = lambda fld: f"@{src}?['{fld}']?['Value']"
    return {"WorkID": g("Title"), "Title": g("WorkTitle"), "Stage": gv("Stage"), "State": gv("State"), "EmployeeStatus": g("EmployeeStatus"),
            "Lane": gv("Lane"), "NextAction": g("NextAction"), "NextOwner": g("NextOwner"), "NextDate": g("NextDate"),
            "Version": f"@int(coalesce({src}?['Version'], 1))", "LastValidatedAt": g("LastValidatedAt"),
            "OpenEvidenceGaps": f"@json(coalesce({src}?['OpenEvidenceGaps'], '[]'))", "DuplicateStatus": gv("DuplicateStatus"),
            "RelatedWorkIDs": f"@json(coalesce({src}?['RelatedWorkIDs'], '[]'))"}


def emp_status(state_expr: str) -> str:
    return f"@outputs('Cfg')?['EmployeeStatusMap']?[{state_expr}]"


def receipt(f: Flow, blk, last, sfx: str, op_class: str, target: str, before: str, after: str, payload: str, result: str = "PASS", error: str | None = None):
    rid = f"Receipt_{sfx}"
    rec = {"ReceiptID": f"@{new_id('RCPT')}", "OperationID": f"@{new_id('OP')}", "OperationClass": op_class, "ActorID": "@outputs('Identity')", "Provider": None,
           "TargetRef": target, "BeforeVersion": before, "AfterVersion": after, "PayloadHash": "0000000000000000000000000000000000000000000000000000000000000000",
           "ReadbackHash": None, "Result": result, "ObservedAt": "@utcNow()", "EvidenceRefs": [f"@concat('cmd:', items('For_each_command')?['Title'])"],
           "RollbackResult": None, "ErrorClass": error}
    f.add(f"Rec_{sfx}", f.compose(rec), into=blk, last=last)
    f.add(rid, f.create_item(L("Receipts"), {"Title": f"@outputs('Rec_{sfx}')?['ReceiptID']", "OperationID": f"@outputs('Rec_{sfx}')?['OperationID']",
                                             "OperationClass": op_class, "ActorID": "@outputs('Identity')", "TargetRef": target, "BeforeVersion": before, "AfterVersion": after,
                                             "PayloadHash": "0000000000000000000000000000000000000000000000000000000000000000", "Result": choice(result), "ObservedAt": "@utcNow()",
                                             "EvidenceRefs": f"@string(outputs('Rec_{sfx}')?['EvidenceRefs'])", "ErrorClass": error, "RecordJson": f"@string(outputs('Rec_{sfx}'))",
                                             "TestRecord": "@coalesce(body('Req')?['Context']?['TestRecord'], false)"}), into=blk, last=last)
    return f"@outputs('Rec_{sfx}')?['ReceiptID']"


def event(f: Flow, blk, last, sfx: str, work_id: str, etype: str, payload: dict, receipt_id: str, auth_class: str, actor=("HUMAN", "@outputs('Identity')"), version="1"):
    ev = {"EventID": f"@{new_id('EVT')}", "WorkID": work_id, "EventType": etype, "OccurredAt": "@utcNow()", "ActorType": actor[0], "ActorID": actor[1], "Provider": None,
          "SourceRef": f"@concat('cmd:', items('For_each_command')?['Title'])", "SourceVersion": version, "CorrelationID": "@coalesce(body('Req')?['Context']?['CorrelationID'], 'CORR-NONE')",
          "CausationID": None, "IdempotencyKey": f"@concat({work_id[1:] if work_id.startswith('@') else q(work_id)}, ':', {etype[1:] if etype.startswith('@') else q(etype)}, ':', items('For_each_command')?['Title'])",
          "PayloadVersion": "1", "Payload": payload, "AuthorityClass": auth_class, "ReceiptID": receipt_id, "SchemaVersion": "2.0.0"}
    f.add(f"Evt_{sfx}", f.compose(ev), into=blk, last=last)
    f.add(f"Event_{sfx}", f.create_item(L("Events"), {"Title": f"@outputs('Evt_{sfx}')?['EventID']", "WorkID": work_id, "EventType": etype, "OccurredAt": "@utcNow()",
                                                       "ActorType": choice(actor[0]), "ActorID": actor[1], "CorrelationID": f"@outputs('Evt_{sfx}')?['CorrelationID']",
                                                       "IdempotencyKey": f"@outputs('Evt_{sfx}')?['IdempotencyKey']", "AuthorityClass": auth_class, "ReceiptID": receipt_id,
                                                       "SourceVersion": version, "Payload": f"@string(outputs('Evt_{sfx}'))", "TestRecord": "@coalesce(body('Req')?['Context']?['TestRecord'], false)"}),
          into=blk, last=last)


def respond(f: Flow, blk, last, sfx: str, response: dict, result: str, receipt_id: str, error_class: str | None = None):
    f.add(f"Resp_{sfx}", f.compose(response), into=blk, last=last)
    f.add(f"Complete_{sfx}", f.update_item(L("Command"), "@items('For_each_command')?['ID']",
                                            {"Result": choice(result), "ResponseJson": f"@string(outputs('Resp_{sfx}'))", "ReceiptID": receipt_id, "CompletedAt": "@utcNow()",
                                             "ErrorClass": error_class, "WorkID": "@coalesce(body('Req')?['WorkID'], outputs('Resp_{0}')?['Work']?['WorkID'], '')".format(sfx)}), into=blk, last=last)


def error_response(f: Flow, blk, last, sfx: str, result: str, error_class: str, message: str, retry: bool, op_class: str = "READ", target: str = "n/a"):
    rid = receipt(f, blk, last, sfx, op_class, target, "n/a", None, "{}", result=result, error=error_class)
    respond(f, blk, last, sfx, {"Result": result, "ErrorClass": error_class, "Message": message, "ReceiptID": rid, "RetryAllowed": retry}, result, rid, error_class)


def auth_expr(fc: str) -> str:
    ex = f"first(body('{fc}')?['value'])"
    return (f"@or(equals(toLower(coalesce({ex}?['Requester'],'')), toLower(outputs('Identity'))),"
            f" equals(toLower(coalesce({ex}?['AccountableOwner'],'')), toLower(outputs('Identity'))),"
            f" equals(toLower(coalesce({ex}?['Sponsor'],'')), toLower(outputs('Identity'))),"
            f" contains(outputs('Cfg')?['OperatorPrincipals'], toLower(outputs('Identity'))))")


def find_case_guard(f: Flow, blk, last, sfx: str, work_id_expr: str, then_block: dict):
    """Find case by WorkID (action Find_Case_<sfx>); NOT_FOUND / DENIED envelopes; run then_block when authorized."""
    fc = f"Find_Case_{sfx}"
    q3 = "'" * 3  # WDL single-quote escaping: 'Title eq ''' + value + ''''
    f.add(fc, f.get_items(L("Cases"), "@concat('Title eq " + q3 + ", " + work_id_expr[1:] + ", " + "'" * 4 + ")", top=1), into=blk, last=last)
    nf, den = {}, {}
    error_response(f, nf, [None], f"{sfx}_NotFound", "FAIL", "NOT_FOUND", "No Work record with this ID.", False)
    error_response(f, den, [None], f"{sfx}_Denied", "DENIED", "NOT_AUTHORIZED", "Signed-in identity is not requester, owner, sponsor or operator for this Work ID.", False)
    auth = f.condition({"and": [{"equals": [auth_expr(fc), True]}]}, then_block, den); auth["runAfter"] = {}
    f.add(f"If_Case_Exists_{sfx}", f.condition({"and": [{"greater": [f"@length(body('{fc}')?['value'])", 0]}]}, {f"If_Authorized_{sfx}": auth}, nf), into=blk, last=last)


# ------------------------------------------------------------------------------------------------
# 00 Provisioning
# ------------------------------------------------------------------------------------------------
RESERVED_DISPLAY = {"Version": "Record Version", "Level": "Log Level"}  # hidden built-in fields _UIVersionString / _Level own these display names


def field_xml(col) -> str:
    name, typ, o = col
    attrs = {"Name": name, "DisplayName": RESERVED_DISPLAY.get(name, name), "StaticName": name}
    inner = ""
    if typ == "Text": attrs.update(Type="Text", MaxLength="255")
    elif typ == "Note": attrs.update(Type="Note", NumLines="6", RichText="FALSE", AppendOnly="FALSE")
    elif typ == "Number": attrs.update(Type="Number", Decimals="0"); inner = f"<Default>{o['default']}</Default>" if "default" in o else ""
    elif typ == "DateTime": attrs.update(Type="DateTime", Format="DateTime")
    elif typ == "Boolean": attrs.update(Type="Boolean"); inner = f"<Default>{1 if o.get('default') else 0}</Default>"
    elif typ == "Choice":
        attrs.update(Type="Choice", Format="Dropdown", FillInChoice="FALSE")
        inner = (f"<Default>{escape(o['default'])}</Default>" if "default" in o else "") + "<CHOICES>" + "".join(f"<CHOICE>{escape(v)}</CHOICE>" for v in o["values"]) + "</CHOICES>"
    if o.get("required"): attrs["Required"] = "TRUE"
    if o.get("unique"): attrs["EnforceUniqueValues"] = "TRUE"; attrs["Indexed"] = "TRUE"
    elif o.get("indexed"): attrs["Indexed"] = "TRUE"
    a = " ".join(f'{k}="{escape(str(v))}"' for k, v in attrs.items())
    return f"<Field {a}>{inner}</Field>" if inner else f"<Field {a} />"


def provisioning_model() -> list[dict]:
    order = ["Log", "Definitions"] + [k for k in M.LISTS if k not in ("Log", "Definitions")]
    out = []
    for key in order:
        title, template, title_means, cols = M.LISTS[key]
        out.append({"Key": key, "Title": title, "BaseTemplate": template, "TitleMeans": title_means,
                    "Fields": [{"Name": c[0], "Type": c[1], "SchemaXml": field_xml(c)} for c in cols]})
    return out


def flow_00(literal=None) -> Flow:
    f = Flow("AI CoE 00 Provisioning", "Creates/verifies the AI CoE lists and columns (additive, idempotent), writes list GUIDs and create-only configuration seeds, and initializes the durable writer slot. Private ACL qualification is separate; list-level ownership shortcuts are not used. Manual trigger only.",
             manual_button(), literal=literal)
    f.add("Model", f.compose(provisioning_model()))
    f.add("Seed", f.compose([{"Key": k, "Value": v, "Category": c, "Provisional": p, "Note": n} for k, v, c, p, n in M.seed_config()] +
                            [{"Key": "EmployeeStatusMap", "Value": json.dumps(M.EMPLOYEE_STATUS, separators=(",", ":")), "Category": "Policy", "Provisional": False, "Note": "State -> employee wording"}]))
    f.add("SiteRel", f.compose("@uriPath(" + (q(f.literal["site"]) if literal else f"parameters('{SITE_PARAM}')") + ")"))
    f.add("Warnings", f.init_var("Warnings", "integer", 0))
    f.add("ListsEnsured", f.init_var("ListsEnsured", "integer", 0))
    f.add("FieldsEnsured", f.init_var("FieldsEnsured", "integer", 0))

    # Establish every list before any configuration lookup or error-log write.
    boot, bl, missing = {}, [None], {}
    f.add("Get_List", f.sp_http("GET", "@concat('_api/web/lists?$filter=Title eq ''', replace(items('Bootstrap_each_list')?['Title'], '''', ''''''), '''&$select=Id,Title,BaseTemplate')"), into=boot, last=bl)
    f.add("Create_List", f.sp_http("POST", "_api/web/lists", "@setProperty(setProperty(json('{\"__metadata\":{\"type\":\"SP.List\"},\"EnableVersioning\":true}'), 'Title', items('Bootstrap_each_list')?['Title']), 'BaseTemplate', items('Bootstrap_each_list')?['BaseTemplate'])"), into=missing, run_after={})
    f.add("If_Confirmed_Absent", f.condition({"equals": ["@length(body('Get_List')?['value'])", 0]}, missing), into=boot, last=bl)
    f.add("Bootstrap_Lists", f.scope({"Bootstrap_each_list": dict(f.foreach("@outputs('Model')", boot), runAfter={})}))
    lst, ll = {}, [None]
    f.add("Read_List", f.sp_http("GET", "@concat('_api/web/lists/getbytitle(''', replace(items('For_each_list')?['Title'], '''', ''''''), ''')?$select=Id,Title,BaseTemplate')"), into=lst, last=ll)
    f.add("ListId", f.compose("@body('Read_List')?['Id']"), into=lst, last=ll)
    f.add("Count_List", f.incr_var("ListsEnsured"), into=lst, last=ll)
    # Title column: unique + indexed (primary key) for lists (not the library)
    ttl = {}
    f.add("Title_Unique", f.sp_http("POST", "@concat('_api/web/lists(guid''', outputs('ListId'), ''')/fields/getbyinternalnameortitle(''Title'')')", '{"__metadata":{"type":"SP.Field"},"Indexed":true,"EnforceUniqueValues":true}',
                                     headers={"Accept": "application/json;odata=nometadata", "Content-Type": "application/json;odata=verbose", "IF-MATCH": "*", "X-HTTP-Method": "MERGE"}), into=ttl, last=[None], run_after={})
    f.add("If_List_Not_Library", f.condition({"and": [{"equals": ["@items('For_each_list')?['BaseTemplate']", 100]}]}, ttl), into=lst, last=ll)
    # fields
    fld, fl = {}, [None]
    f.add("Get_Field", f.sp_http("GET", "@concat('_api/web/lists(guid''', outputs('ListId'), ''')/fields?$filter=InternalName eq ''', items('For_each_field')?['Name'], '''&$select=InternalName,TypeAsString')"), into=fld, last=fl)
    mkf, drift = {}, {}
    f.add("Create_Field", f.sp_http("POST", "@concat('_api/web/lists(guid''', outputs('ListId'), ''')/fields/createfieldasxml')",
                                     "@concat('{\"parameters\":{\"__metadata\":{\"type\":\"SP.XmlSchemaFieldCreationInformation\"},\"SchemaXml\":', substring(string(createArray(items('For_each_field')?['SchemaXml'])), 1, sub(length(string(createArray(items('For_each_field')?['SchemaXml']))), 2)), ',\"Options\":12}}')"),
          into=mkf, last=[None], run_after={})
    drift_inner = {}
    log_row(f, "Log_Type_Drift", "Warning", "@concat('Field type drift: list ', items('For_each_list')?['Title'], ' column ', items('For_each_field')?['Name'], ' exists as ', first(body('Get_Field')?['value'])?['TypeAsString'], ' but model says ', items('For_each_field')?['Type'], '. Not converted in place.')", into=drift_inner, last=[None], run_after={}, table=M.LISTS["Log"][0])
    f.add("Count_Drift", f.incr_var("Warnings"), into=drift_inner, last=[None], run_after={"Log_Type_Drift": ["Succeeded"]})
    f.add("If_Type_Drift", f.condition({"and": [{"not": {"equals": ["@first(body('Get_Field')?['value'])?['TypeAsString']", "@items('For_each_field')?['Type']"]}}]}, drift_inner), into=drift, last=[None], run_after={})
    f.add("If_Field_Missing", f.condition({"and": [{"equals": ["@empty(body('Get_Field')?['value'])", True]}]}, mkf, drift), into=fld, last=fl)
    f.add("Count_Field", f.incr_var("FieldsEnsured"), into=fld, last=fl)
    f.add("For_each_field", f.foreach("@items('For_each_list')?['Fields']", fld, concurrency=1), into=lst, last=ll)
    # Unique keys coexist with ACL isolation, NOT read-own list settings.
    sec = {}
    f.add("Set_Item_Security", f.sp_http("POST", "@concat('_api/web/lists(guid''', outputs('ListId'), ''')')", '{"__metadata":{"type":"SP.List"},"ReadSecurity":1,"WriteSecurity":1}',
                                          headers={"Accept": "application/json;odata=nometadata", "Content-Type": "application/json;odata=verbose", "IF-MATCH": "*", "X-HTTP-Method": "MERGE"}), into=sec, last=[None], run_after={})
    f.add("If_Command_List", f.condition({"equals": ["@items('For_each_list')?['BaseTemplate']", 100]}, sec), into=lst, last=ll)
    # write ListId_<Key> into Definitions (by title; Definitions is first in Model so it exists)
    f.add("Find_ListId_Row", f.get_items(DEFS_TITLE, "@concat('Title eq ''ListId_', items('For_each_list')?['Key'], '''')", top=1), into=lst, last=ll)
    cr, up = {}, {}
    f.add("Create_ListId_Row", f.create_item(DEFS_TITLE, {"Title": "@concat('ListId_', items('For_each_list')?['Key'])", "Value": "@concat('\"', outputs('ListId'), '\"')", "Category": "Binding", "Version": M.SOLUTION_VERSION, "Provisional": False, "Note": "@concat('GUID of list ', items('For_each_list')?['Title'], ' read back after provisioning')"}), into=cr, last=[None], run_after={})
    f.add("Update_ListId_Row", f.update_item(DEFS_TITLE, "@first(body('Find_ListId_Row')?['value'])?['ID']", {"Value": "@concat('\"', outputs('ListId'), '\"')"}), into=up, last=[None], run_after={})
    f.add("If_ListId_Row_Missing", f.condition({"and": [{"equals": ["@length(body('Find_ListId_Row')?['value'])", 0]}]}, cr, up), into=lst, last=ll)
    # Bind only after Definitions' columns exist; bootstrap alone is not enough.
    bind_names = ['Find_ListId_Row', 'Create_ListId_Row', 'Update_ListId_Row', 'If_ListId_Row_Missing']
    bind = {n: lst.pop(n) for n in ('Find_ListId_Row', 'If_ListId_Row_Missing')}
    bind['Find_ListId_Row']['runAfter'] = {'Binding_Read_List': ['Succeeded']}
    bind = {'Binding_Read_List': dict(f.sp_http('GET', "@concat('_api/web/lists/getbytitle(''', replace(items('For_each_binding')?['Title'], '''', ''''''), ''')?$select=Id')"), runAfter={}), **bind}
    bind = json.loads(json.dumps(bind).replace("items('For_each_list')", "items('For_each_binding')").replace("outputs('ListId')", "body('Binding_Read_List')?['Id']"))
    f.add("Scope_Lists", f.scope({"For_each_list": dict(f.foreach("@outputs('Model')", lst, concurrency=1), runAfter={})}))
    f.add("For_each_binding", f.foreach("@outputs('Model')", bind))

    # seed config: create only if absent (never overwrite operator-set values)
    sd, sl = {}, [None]
    f.add("Find_Seed_Row", f.get_items(DEFS_TITLE, "@concat('Title eq ''', items('For_each_seed')?['Key'], '''')", top=1), into=sd, last=sl)
    cs = {}
    f.add("Create_Seed_Row", f.create_item(DEFS_TITLE, {"Title": "@items('For_each_seed')?['Key']", "Value": "@items('For_each_seed')?['Value']", "Category": "@items('For_each_seed')?['Category']",
                                                        "Version": M.SOLUTION_VERSION, "Provisional": "@items('For_each_seed')?['Provisional']", "Note": "@items('For_each_seed')?['Note']"}), into=cs, last=[None], run_after={})
    f.add("If_Seed_Missing", f.condition({"and": [{"equals": ["@length(body('Find_Seed_Row')?['value'])", 0]}]}, cs), into=sd, last=sl)
    f.add("For_each_seed", f.foreach("@outputs('Seed')", sd, concurrency=1))
    # Create-only durable singleton, after all Journal fields exist. Never reset an active claim.
    f.add("Find_Writer_Slot", f.get_items(M.LISTS['Journal'][0], "Title eq 'CORE_WRITER'", top=2))
    slot={}
    f.add("Create_Writer_Slot",f.create_item(M.LISTS['Journal'][0],{'Title':'CORE_WRITER','State':'IDLE'}),into=slot,run_after={})
    f.add("If_Writer_Slot_Missing",f.condition({'equals':["@length(body('Find_Writer_Slot')?['value'])",0]},slot))
    # final log (Log list is by title here since Cfg is not loaded in this flow)
    f.add("Log_Provisioning_Result", f.create_item(M.LISTS["Log"][0], {"Title": f"@{new_id('LOG')}", "Flow": f.name, "RunId": "@workflow()?['run']?['name']", "Level": choice("Succeeded"),
                                                                      "Message": "@concat('Provisioning complete: ', string(variables('ListsEnsured')), ' lists ensured, ', string(variables('FieldsEnsured')), ' fields ensured, ', string(variables('Warnings')), ' type-drift warnings. List GUIDs written to AI CoE Definitions as ListId_*.')",
                                                                      "LoggedAt": "@utcNow()"}))
    f.add("Log_Provisioning_Failure", f.create_item(M.LISTS["Log"][0], {"Title": f"@{new_id('LOG')}", "Flow": f.name, "RunId": "@workflow()?['run']?['name']", "Level": choice("Error"),
                                                                       "Message": "@concat('Provisioning failed inside Scope_Lists: ', string(result('Scope_Lists')), '. Re-run after fixing; the flow is additive and idempotent.')", "LoggedAt": "@utcNow()"}),
          run_after={"Scope_Lists": ["Failed", "TimedOut"]})
    f.add("Terminate_Provisioning", f.terminate("PROVISIONING_FAILED", "See AI Automation Log."))
    return f


# ------------------------------------------------------------------------------------------------
# 01 Case Command
# ------------------------------------------------------------------------------------------------
def gaps_expr(s1: str) -> str:
    def miss(fld, gap): return f"if(empty(coalesce({s1}?['{fld}'], '')), createArray('{gap}'), createArray())"
    return f"@union({miss('ProblemStatement', 'S1_PROBLEM_STATEMENT')}, {miss('DesiredOutcome', 'S1_DESIRED_OUTCOME')}, {miss('Sponsor', 'S1_SPONSOR')})"


def case_item(rec: str) -> dict:
    """Map a work-record.v2 compose output `rec` (expression prefix) to Cases list columns."""
    g = lambda fld: f"@{rec}?['{fld}']"
    js = lambda fld: f"@string(coalesce({rec}?['{fld}'], createArray()))"
    return {"Title": g("WorkID"), "WorkTitle": g("Title"), "WorkType": choice(g("WorkType")), "Stage": choice(g("Stage")), "State": choice(g("State")),
            "EmployeeStatus": emp_status(f"{rec}?['State']"), "ProblemStatement": g("ProblemStatement"), "DesiredOutcome": g("DesiredOutcome"), "Requester": g("Requester"),
            "Department": g("Department"), "Sponsor": g("Sponsor"), "AccountableOwner": g("AccountableOwner"), "ResponsibleLead": g("ResponsibleLead"), "CreatedAt": g("CreatedAt"),
            "SourceChannel": g("SourceChannel"), "SourceRefs": js("SourceRefs"), "RelatedWorkIDs": js("RelatedWorkIDs"), "DuplicateStatus": choice(g("DuplicateStatus")),
            "Lane": choice(g("Lane")), "ARBTier": g("ARBTier"), "AgentRiskTier": g("AgentRiskTier"), "PScoreLegacy": f"@string(coalesce({rec}?['PScoreLegacy'], ''))",
            "PScoreCandidate": f"@string(coalesce({rec}?['PScoreCandidate'], ''))", "PScoreVersion": g("PScoreVersion"), "PScoreConfidence": f"@string(coalesce({rec}?['PScoreConfidence'], ''))",
            "Lift": f"@string(coalesce({rec}?['Lift'], ''))", "LiftVersion": g("LiftVersion"), "DecisionReadiness": f"@string(coalesce({rec}?['DecisionReadiness'], ''))", "ReadinessVersion": g("ReadinessVersion"),
            "DecisionReadinessState": choice(g("DecisionReadinessState")), "DecisionRequested": g("DecisionRequested"), "DecisionAuthority": g("DecisionAuthority"),
            "RequiredValidators": js("RequiredValidators"), "ValidationState": choice(g("ValidationState")), "OpenEvidenceGaps": js("OpenEvidenceGaps"), "Dependencies": js("Dependencies"),
            "Risks": js("Risks"), "TaskSystem": g("TaskSystem"), "CollaborationSurface": g("CollaborationSurface"), "CurrentRelease": g("CurrentRelease"), "LastValidatedAt": g("LastValidatedAt"),
            "NextAction": g("NextAction"), "NextOwner": g("NextOwner"), "NextDate": g("NextDate"), "ValueBaselineID": g("ValueBaselineID"), "ActualValueID": g("ActualValueID"),
            "RetentionClass": g("RetentionClass"), "DataClassification": choice(g("DataClassification")), "Version": f"@int({rec}?['Version'])", "RecordJson": f"@string({rec})",
            "TestRecord": "@coalesce(body('Req')?['Context']?['TestRecord'], false)"}


def new_record(s1: str, work_id: str, gaps: str, dup: str, related: str) -> dict:
    """work-record.v2 for a freshly created idea."""
    return {"WorkID": work_id, "WorkType": "IDEA", "Stage": "INTAKE", "State": f"@if(empty({gaps}), 'READY_FOR_TRIAGE', 'CLARIFYING')", "Title": f"@{s1}?['Title']",
            "ProblemStatement": f"@{s1}?['ProblemStatement']", "DesiredOutcome": f"@{s1}?['DesiredOutcome']", "Requester": f"@coalesce({s1}?['Requester'], outputs('Identity'))",
            "Department": f"@{s1}?['Department']", "Sponsor": f"@{s1}?['Sponsor']", "AccountableOwner": f"@{s1}?['AccountableOwner']", "ResponsibleLead": None,
            "CreatedAt": "@utcNow()", "SourceChannel": f"@coalesce({s1}?['SourceChannel'], 'ASK_AI_COE')", "SourceRefs": f"@coalesce({s1}?['SourceRefs'], createArray())",
            "RelatedWorkIDs": related, "DuplicateStatus": dup, "Lane": "PREPARATION", "ARBTier": None, "AgentRiskTier": None, "PScoreLegacy": None,
            "PScoreCandidate": "AWAITING_SOURCE", "PScoreVersion": None, "PScoreConfidence": "AWAITING_SOURCE", "Lift": "AWAITING_SOURCE", "LiftVersion": None,
            "DecisionReadiness": "AWAITING_SOURCE", "ReadinessVersion": None, "DecisionReadinessState": "NOT_READY", "DecisionRequested": f"@{s1}?['DecisionRequested']", "DecisionAuthority": None,
            "RequiredValidators": [], "ValidationState": "NOT_STARTED", "OpenEvidenceGaps": f"@{gaps}", "Dependencies": [], "Risks": f"@coalesce({s1}?['Risks'], createArray())",
            "TaskSystem": None, "CollaborationSurface": None, "CurrentRelease": "@outputs('Cfg')?['CurrentRelease']", "LastValidatedAt": "@utcNow()",
            "NextAction": f"@if(empty({gaps}), 'Deduplicate and derive S2-S5 packets', 'RETURN_TO_REQUESTER_CLARIFY: answer one grouped clarification')",
            "NextOwner": f"@if(empty({gaps}), 'ai-coe-operator', coalesce({s1}?['Requester'], outputs('Identity')))", "NextDate": None, "ValueBaselineID": None, "ActualValueID": None,
            "RetentionClass": "@outputs('Cfg')?['RetentionClass_Default']", "DataClassification": f"@coalesce({s1}?['DataClassification'], 'INTERNAL')", "Version": 1}


def op_create_or_resume(f: Flow) -> dict:
    blk, last = {}, [None]
    f.add("S1", f.compose("@body('Req')?['S1']"), into=blk, last=last)
    # ---- create ----
    cr, cl = {}, [None]
    f.add("Gaps", f.compose(gaps_expr("outputs('S1')")), into=cr, last=cl)
    f.add("NewWorkID", f.compose(f"@{new_id('CW')}"), into=cr, last=cl)
    f.add("Dedup", f.get_items(L("Cases"), "@concat('WorkTitle eq ''', replace(string(outputs('S1')?['Title']), '''', ''''''), '''')", top=5), into=cr, last=cl)
    f.add("Related", f.select("@body('Dedup')?['value']", "@item()?['Title']"), into=cr, last=cl)
    f.add("Record", f.compose(new_record("outputs('S1')", "@outputs('NewWorkID')", "outputs('Gaps')", "@if(empty(body('Dedup')?['value']), 'UNIQUE', 'POSSIBLE_DUPLICATE')", "@body('Related')")), into=cr, last=cl)
    f.add("Create_Case", f.create_item(L("Cases"), case_item("outputs('Record')")), into=cr, last=cl)
    f.add("Readback_Create", f.get_item(L("Cases"), "@body('Create_Case')?['ID']"), into=cr, last=cl)
    rid = receipt(f, cr, cl, "Create", "WRITE_BUSINESS_RECORD", "@concat('work-record:', outputs('NewWorkID'))", "0", "1", "@outputs('Record')")
    event(f, cr, cl, "Created", "@outputs('NewWorkID')", "WORK_CREATED", {"Record": "@outputs('Record')"}, rid, "WRITE_BUSINESS_RECORD")
    clar = {}
    event(f, clar, [None], "Clarify", "@outputs('NewWorkID')", "CLARIFICATION_REQUESTED", {"Gaps": "@outputs('Gaps')"}, rid, "WRITE_BUSINESS_RECORD", actor=("SERVICE", "AI CoE 01 Case Command"))
    f.add("If_Gaps", f.condition({"and": [{"greater": ["@length(outputs('Gaps'))", 0]}]}, clar), into=cr, last=cl)
    respond(f, cr, cl, "Create", {"Result": "PASS", "ReceiptID": rid, "Work": proj("body('Readback_Create')"), "Created": True, "ClarificationRequired": "@outputs('Gaps')"}, "PASS", rid)
    # ---- resume ----
    rs, rl = {}, [None]
    upd = {}
    ul = [None]
    ex = "first(body('Find_Case_Resume')?['value'])"
    f.add("Merged", f.compose({"Title": f"@coalesce(outputs('S1')?['Title'], {ex}?['WorkTitle'])", "ProblemStatement": f"@coalesce(outputs('S1')?['ProblemStatement'], {ex}?['ProblemStatement'])",
                              "DesiredOutcome": f"@coalesce(outputs('S1')?['DesiredOutcome'], {ex}?['DesiredOutcome'])", "Sponsor": f"@coalesce(outputs('S1')?['Sponsor'], {ex}?['Sponsor'])",
                              "AccountableOwner": f"@coalesce(outputs('S1')?['AccountableOwner'], {ex}?['AccountableOwner'])", "Department": f"@coalesce(outputs('S1')?['Department'], {ex}?['Department'])",
                              "DecisionRequested": f"@coalesce(outputs('S1')?['DecisionRequested'], {ex}?['DecisionRequested'])",
                              "Risks": f"@union(json(coalesce({ex}?['Risks'], '[]')), coalesce(outputs('S1')?['Risks'], createArray()))"}), into=upd, last=ul)
    f.add("Gaps_R", f.compose(gaps_expr("outputs('Merged')")), into=upd, last=ul)
    f.add("State_R", f.compose(f"@if(greater(length(outputs('Gaps_R')), 0), 'CLARIFYING', if(or(equals({ex}?['State']?['Value'], 'DRAFT'), equals({ex}?['State']?['Value'], 'CLARIFYING')), 'READY_FOR_TRIAGE', {ex}?['State']?['Value']))"), into=upd, last=ul)
    f.add("Record_R", f.compose(f"@setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(json({ex}?['RecordJson']), 'Title', outputs('Merged')?['Title']), 'ProblemStatement', outputs('Merged')?['ProblemStatement']), 'DesiredOutcome', outputs('Merged')?['DesiredOutcome']), 'Sponsor', outputs('Merged')?['Sponsor']), 'AccountableOwner', outputs('Merged')?['AccountableOwner']), 'Department', outputs('Merged')?['Department']), 'DecisionRequested', outputs('Merged')?['DecisionRequested']), 'Risks', outputs('Merged')?['Risks']), 'OpenEvidenceGaps', outputs('Gaps_R')), 'State', outputs('State_R'))"), into=upd, last=ul)
    f.add("Record_R2", f.compose(f"@setProperty(setProperty(setProperty(setProperty(outputs('Record_R'), 'Version', add(int(coalesce({ex}?['Version'], 1)), 1)), 'LastValidatedAt', utcNow()), 'NextAction', if(empty(outputs('Gaps_R')), 'Deduplicate and derive S2-S5 packets', 'RETURN_TO_REQUESTER_CLARIFY: answer one grouped clarification')), 'NextOwner', if(empty(outputs('Gaps_R')), 'ai-coe-operator', {ex}?['Requester']))"), into=upd, last=ul)
    f.add("Update_Case_R", f.update_item(L("Cases"), f"@{ex}?['ID']", {"WorkTitle": "@outputs('Merged')?['Title']", "ProblemStatement": "@outputs('Merged')?['ProblemStatement']", "DesiredOutcome": "@outputs('Merged')?['DesiredOutcome']",
                                                                        "Sponsor": "@outputs('Merged')?['Sponsor']", "AccountableOwner": "@outputs('Merged')?['AccountableOwner']", "Department": "@outputs('Merged')?['Department']",
                                                                        "DecisionRequested": "@outputs('Merged')?['DecisionRequested']", "Risks": "@string(outputs('Merged')?['Risks'])", "OpenEvidenceGaps": "@string(outputs('Gaps_R'))",
                                                                        "State": choice("@outputs('State_R')"), "EmployeeStatus": emp_status("outputs('State_R')"), "Version": "@outputs('Record_R2')?['Version']", "LastValidatedAt": "@utcNow()",
                                                                        "NextAction": "@outputs('Record_R2')?['NextAction']", "NextOwner": "@outputs('Record_R2')?['NextOwner']", "RecordJson": "@string(outputs('Record_R2'))"}), into=upd, last=ul)
    f.add("Readback_Resume", f.get_item(L("Cases"), f"@{ex}?['ID']"), into=upd, last=ul)
    rid2 = receipt(f, upd, ul, "Resume", "WRITE_BUSINESS_RECORD", "@concat('work-record:', body('Req')?['WorkID'])", f"@string({ex}?['Version'])", "@string(outputs('Record_R2')?['Version'])", "@outputs('Record_R2')")
    event(f, upd, ul, "Resumed", "@body('Req')?['WorkID']", "@if(empty(outputs('Gaps_R')), 'S1_COMPLETED', 'S1_UPDATED')", {"Merged": "@outputs('Merged')", "Gaps": "@outputs('Gaps_R')"}, rid2, "WRITE_BUSINESS_RECORD", version=f"@string({ex}?['Version'])")
    respond(f, upd, ul, "Resume", {"Result": "PASS", "ReceiptID": rid2, "Work": proj("body('Readback_Resume')"), "Created": False, "ClarificationRequired": "@outputs('Gaps_R')"}, "PASS", rid2)
    find_case_guard(f, rs, rl, "Resume", "@body('Req')?['WorkID']", upd)
    f.add("If_Create", f.condition({"and": [{"equals": ["@empty(coalesce(body('Req')?['WorkID'], ''))", True]}]}, cr, rs), into=blk, last=last)
    return blk


def op_get_status(f: Flow) -> dict:
    blk, last = {}, [None]
    ok, ol = {}, [None]
    rid = receipt(f, ok, ol, "Status", "READ", "@concat('work-record:', body('Req')?['WorkID'])", "@string(first(body('Find_Case_Status')?['value'])?['Version'])", None, "{}")
    respond(f, ok, ol, "Status", {"Result": "PASS", "ReceiptID": rid, "Work": proj("first(body('Find_Case_Status')?['value'])")}, "PASS", rid)
    find_case_guard(f, blk, last, "Status", "@body('Req')?['WorkID']", ok)
    return blk


def op_list_my_work(f: Flow) -> dict:
    blk, last = {}, [None]
    ok, ol = {}, [None]
    f.add("My_Cases", f.get_items(L("Cases"), "@concat('Requester eq ''', outputs('Identity'), ''' or AccountableOwner eq ''', outputs('Identity'), ''' or Sponsor eq ''', outputs('Identity'), '''')", top=200, orderby="Modified desc"), into=ok, last=ol)
    f.add("Items", f.select("@body('My_Cases')?['value']", proj("item()")), into=ok, last=ol)
    rid = receipt(f, ok, ol, "List", "READ", "@concat('work-record:list:', outputs('Identity'))", "n/a", None, "{}")
    respond(f, ok, ol, "List", {"Result": "PASS", "ReceiptID": rid, "Items": "@body('Items')"}, "PASS", rid)
    den = {}
    error_response(f, den, [None], "List_Denied", "DENIED", "NOT_AUTHORIZED", "ListMyWork may only list the signed-in identity's own work.", False)
    f.add("If_Own_List", f.condition({"and": [{"equals": ["@toLower(coalesce(body('Req')?['Requester'], ''))", "@toLower(outputs('Identity'))"]}]}, ok, den), into=blk, last=last)
    return blk


def op_submit_evidence(f: Flow) -> dict:
    blk, last = {}, [None]
    f.add("Find_Packet", f.get_items(L("Evidence"), "@concat('Title eq ''', body('Req')?['EvidencePacketID'], ''' and WorkID eq ''', body('Req')?['WorkID'], '''')", top=1), into=blk, last=last)
    pk = "first(body('Find_Packet')?['value'])"
    ok, ol = {}, [None]
    f.add("Packet_R", f.compose(f"@setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(json({pk}?['RecordJson']), 'Status', 'RETURNED'), 'Response', body('Req')?['Response']), 'KnownAssumedUnknown', body('Req')?['KnownAssumedUnknown']), 'ReturnedAt', utcNow()), 'FreshnessState', 'CURRENT'), 'Version', add(int(coalesce({pk}?['Version'], 1)), 1))"), into=ok, last=ol)
    f.add("Update_Packet", f.update_item(L("Evidence"), f"@{pk}?['ID']", {"Status": choice("RETURNED"), "Response": "@body('Req')?['Response']", "KnownAssumedUnknown": choice("@body('Req')?['KnownAssumedUnknown']"),
                                                                          "ReturnedAt": "@utcNow()", "FreshnessState": choice("CURRENT"), "Version": "@outputs('Packet_R')?['Version']", "RecordJson": "@string(outputs('Packet_R'))"}), into=ok, last=ol)
    f.add("Find_Case_Evidence", f.get_items(L("Cases"), "@concat('Title eq ''', body('Req')?['WorkID'], '''')", top=1), into=ok, last=ol)
    rid = receipt(f, ok, ol, "Evidence", "WRITE_BUSINESS_RECORD", "@concat('evidence-packet:', body('Req')?['EvidencePacketID'])", f"@string({pk}?['Version'])", "@string(outputs('Packet_R')?['Version'])", "@outputs('Packet_R')")
    event(f, ok, ol, "Evidence", "@body('Req')?['WorkID']", "EVIDENCE_RETURNED", {"EvidencePacketID": "@body('Req')?['EvidencePacketID']", "KnownAssumedUnknown": "@body('Req')?['KnownAssumedUnknown']"}, rid, "WRITE_BUSINESS_RECORD")
    respond(f, ok, ol, "Evidence", {"Result": "PASS", "ReceiptID": rid, "Work": proj("first(body('Find_Case_Evidence')?['value'])"), "PacketStatus": "RETURNED"}, "PASS", rid)
    bad_state, den, nf = {}, {}, {}
    error_response(f, bad_state, [None], "Evidence_State", "FAIL", "INVALID_STATE", "Packet is not open for a response (Status must be OPEN, ASSIGNED, AWAITING_RESPONSE or RETURNED).", False)
    error_response(f, den, [None], "Evidence_Denied", "DENIED", "NOT_AUTHORIZED", "Signed-in identity is not the assigned person, an evidence validator or an operator.", False)
    error_response(f, nf, [None], "Evidence_NotFound", "FAIL", "NOT_FOUND", "No evidence packet with this ID for this Work ID.", False)
    state_ok = f.condition({"and": [{"equals": [f"@contains(createArray('OPEN','ASSIGNED','AWAITING_RESPONSE','RETURNED'), {pk}?['Status']?['Value'])", True]}]}, ok, bad_state)
    auth = f.condition({"and": [{"equals": [f"@or(equals(toLower(coalesce({pk}?['AssignedPerson'], '')), toLower(outputs('Identity'))), contains(outputs('Cfg')?['EvidenceValidators'], toLower(outputs('Identity'))), contains(outputs('Cfg')?['OperatorPrincipals'], toLower(outputs('Identity'))))", True]}]},
                       {"If_Packet_State_OK": dict(state_ok, runAfter={})}, den)
    f.add("If_Packet_Exists", f.condition({"and": [{"greater": ["@length(body('Find_Packet')?['value'])", 0]}]}, {"If_Evidence_Authorized": dict(auth, runAfter={})}, nf), into=blk, last=last)
    return blk


def op_request_readiness(f: Flow) -> dict:
    blk, last = {}, [None]
    ok, ol = {}, [None]
    cs = "first(body('Find_Case_Readiness')?['value'])"
    f.add("Get_Packets", f.get_items(L("Evidence"), "@concat('WorkID eq ''', body('Req')?['WorkID'], ''' and RecordKind eq ''EVIDENCE_PACKET''')", top=50), into=ok, last=ol)
    f.add("Required", f.filter("@body('Get_Packets')?['value']", "@equals(item()?['Applicability']?['Value'], 'REQUIRED')"), into=ok, last=ol)
    f.add("Closed", f.filter("@body('Required')", "@or(equals(item()?['Status']?['Value'], 'VALIDATED'), equals(item()?['Status']?['Value'], 'NOT_APPLICABLE'))"), into=ok, last=ol)
    f.add("Validated", f.filter("@body('Get_Packets')?['value']", "@equals(item()?['Status']?['Value'], 'VALIDATED')"), into=ok, last=ol)
    f.add("Stale", f.filter("@body('Validated')", "@less(ticks(coalesce(item()?['ReturnedAt'], '1970-01-01T00:00:00Z')), ticks(addDays(utcNow(), mul(-1, int(outputs('Cfg')?['FreshnessDays'])))))"), into=ok, last=ol)
    f.add("S4", f.filter("@body('Validated')", "@equals(item()?['EvidenceType'], 'S4_TECHNICAL')"), into=ok, last=ol)
    f.add("Risks", f.compose(f"@json(coalesce({cs}?['Risks'], '[]'))"), into=ok, last=ol)
    f.add("Critical", f.filter("@outputs('Risks')", "@startsWith(string(item()), 'CRITICAL_')"), into=ok, last=ol)
    f.add("TriggerRisks", f.filter("@outputs('Risks')", "@startsWith(string(item()), 'TRIGGER_')"), into=ok, last=ol)
    f.add("Triggers", f.select("@body('TriggerRisks')", "@toLower(substring(string(item()), 8))"), into=ok, last=ol)
    f.add("Lane", f.compose("@if(greater(length(intersection(body('Triggers'), outputs('Cfg')?['ELT_TRIGGERS'])), 0), 'ELT', if(greater(length(intersection(body('Triggers'), outputs('Cfg')?['ARB_TRIGGERS'])), 0), 'ARB', if(and(equals(outputs('Cfg')?['DelegatedFastPathEnabled'], true), equals(length(body('Triggers')), 0)), 'AI_COE_FAST_PATH', 'PREPARATION')))"), into=ok, last=ol)
    f.add("RuleFired", f.compose("@if(equals(outputs('Lane'), 'ELT'), concat('ELT_PRECEDENCE:', join(intersection(body('Triggers'), outputs('Cfg')?['ELT_TRIGGERS']), ',')), if(equals(outputs('Lane'), 'ARB'), concat('ARB_TRIGGER:', join(intersection(body('Triggers'), outputs('Cfg')?['ARB_TRIGGERS']), ',')), if(equals(outputs('Lane'), 'AI_COE_FAST_PATH'), 'DELEGATED_BOUNDED_LOW_RISK', 'NO_DELEGATION_OR_RISK_UNKNOWN')))"), into=ok, last=ol)
    f.add("Authority", f.compose("@coalesce(outputs('Cfg')?[concat('Authority_', outputs('Lane'))], '')"), into=ok, last=ol)
    packets_exist = "greater(length(body('Get_Packets')?['value']), 0)"
    s2s5 = f"if(not({packets_exist}), 'AWAITING_SOURCE', if(equals(length(body('Closed')), length(body('Required'))), 'PASS', 'AWAITING_VALIDATION'))"
    gates = [
        ("ACCOUNTABLE_OWNER", f"if(empty(coalesce({cs}?['AccountableOwner'], '')), 'FAIL', 'PASS')", "case.AccountableOwner"),
        ("DECISION_REQUESTED", f"if(empty(coalesce({cs}?['DecisionRequested'], '')), 'FAIL', 'PASS')", "case.DecisionRequested"),
        ("S2_S5_COMPLETE_OR_NA", s2s5, "evidence packets REQUIRED -> VALIDATED|NOT_APPLICABLE"),
        ("SME_VALIDATIONS_COMPLETE", s2s5, "evidence packets: none awaiting"),
        ("NO_CRITICAL_UNRESOLVED_RISK", "if(greater(length(body('Critical')), 0), 'FAIL', 'PASS')", "case.Risks[] with CRITICAL_ prefix"),
        ("ASSUMPTIONS_VISIBLE", s2s5, "assumptions are carried in validated packet responses (basis: readiness-gates-v1)"),
        ("DECISION_AUTHORITY_KNOWN", "if(or(equals(outputs('Lane'), 'PREPARATION'), empty(outputs('Authority'))), 'AWAITING_SOURCE', 'PASS')", "AI CoE Definitions Authority_<Lane>"),
        ("IMPLEMENTATION_PATH_UNDERSTOOD", "if(greater(length(body('S4')), 0), 'PASS', 'AWAITING_VALIDATION')", "S4_TECHNICAL VALIDATED"),
        ("EVIDENCE_FRESHNESS", "if(equals(length(body('Validated')), 0), 'AWAITING_VALIDATION', if(greater(length(body('Stale')), 0), 'FAIL', 'PASS'))", "validated packets within FreshnessDays"),
    ]
    f.add("Gates", f.compose([{"GateID": g, "Applicable": True, "State": f"@{e}", "EvidenceRefs": [f"basis:{b}"]} for g, e, b in gates]), into=ok, last=ol)
    f.add("Blocking", f.filter("@outputs('Gates')", "@not(equals(item()?['State'], 'PASS'))"), into=ok, last=ol)
    f.add("BlockingIds", f.select("@body('Blocking')", "@item()?['GateID']"), into=ok, last=ol)
    f.add("Score", f.compose(f"@div(mul(100, sub({len(gates)}, length(body('Blocking')))), {len(gates)})"), into=ok, last=ol)
    f.add("ReadyState", f.compose("@if(empty(body('Blocking')), 'READY', 'NOT_READY')"), into=ok, last=ol)
    f.add("NewVersion", f.compose(f"@add(int(coalesce({cs}?['Version'], 1)), 1)"), into=ok, last=ol)
    # READY branch: decision packet + case to READY_FOR_<lane>
    rd, rl = {}, [None]
    f.add("DPID", f.compose(f"@{new_id('DP')}"), into=rd, last=rl)
    f.add("TargetState", f.compose("@if(equals(outputs('Lane'), 'PREPARATION'), 'DECISION_READY', if(equals(outputs('Lane'), 'AI_COE_FAST_PATH'), 'READY_FOR_AI_COE', concat('READY_FOR_', outputs('Lane'))))"), into=rd, last=rl)
    f.add("Packet", f.compose({"DecisionPacketID": "@outputs('DPID')", "WorkID": "@body('Req')?['WorkID']", "DecisionRequested": f"@{cs}?['DecisionRequested']", "DecisionAuthority": "@outputs('Authority')",
                              "DecisionAuthoritySource": "AI CoE Definitions", "DecisionParticipantsRequired": [], "DelegatedAuthorityClass": "@if(equals(outputs('Lane'), 'AI_COE_FAST_PATH'), 'WRITE_LOW_RISK', null)",
                              "DecisionDeadline": "@addDays(utcNow(), 7)", "PScore": "AWAITING_VALIDATION", "PScoreVersion": "@outputs('Cfg')?['PolicyVersion']", "PScoreConfidence": "AWAITING_VALIDATION",
                              "Lift": "AWAITING_VALIDATION", "LiftVersion": "@outputs('Cfg')?['PolicyVersion']", "DecisionReadiness": "@outputs('Score')", "ReadinessVersion": "@outputs('Cfg')?['GatesVersion']",
                              "ReadinessState": "READY", "ReadinessGates": "@outputs('Gates')", "Options": ["approve", "approve_with_conditions", "defer", "reject"], "Recommendation": None, "RecommendationBasis": None,
                              "KnownFacts": [], "Assumptions": [], "Unknowns": [], "Risks": "@outputs('Risks')", "Dependencies": f"@json(coalesce({cs}?['Dependencies'], '[]'))",
                              "EvidenceRefs": "@body('EvidenceRefs')", "Conditions": [],
                              "PayloadHash": "@coalesce(body('Req')?['PayloadHash'], '0000000000000000000000000000000000000000000000000000000000000000')",
                              "EvidenceSetHash": "@coalesce(body('Req')?['EvidenceSetHash'], '0000000000000000000000000000000000000000000000000000000000000000')",
                              "BusinessCaseVersion": "@string(outputs('NewVersion'))", "Status": "READY_FOR_DECISION", "ExpiresAt": "@addDays(utcNow(), 30)", "Version": 1}), into=rd, last=rl)
    f.add("Create_Decision", f.create_item(L("Decisions"), {"Title": "@outputs('DPID')", "WorkID": "@body('Req')?['WorkID']", "RecordKind": choice("DECISION_PACKET"), "Status": choice("READY_FOR_DECISION"),
                                                            "ReadinessState": choice("READY"), "ReadinessGates": "@string(outputs('Gates'))", "BlockingGates": "[]", "Lane": "@outputs('Lane')", "RuleFired": "@outputs('RuleFired')",
                                                            "PayloadHash": "@outputs('Packet')?['PayloadHash']", "EvidenceSetHash": "@outputs('Packet')?['EvidenceSetHash']",
                                                            "HashProvenance": choice("@if(empty(coalesce(body('Req')?['PayloadHash'], '')), 'NOT_PROVIDED', 'CLIENT_COMPUTED')"),
                                                            "BusinessCaseVersion": "@string(outputs('NewVersion'))", "DecisionRequested": f"@{cs}?['DecisionRequested']", "DecisionAuthority": "@outputs('Authority')",
                                                            "DecisionAuthoritySource": "AI CoE Definitions", "ExpiresAt": "@addDays(utcNow(), 30)", "Version": 1, "RecordJson": "@string(outputs('Packet'))",
                                                            "TestRecord": "@coalesce(body('Req')?['Context']?['TestRecord'], false)"}), into=rd, last=rl)
    f.add("Update_Case_Ready", f.update_item(L("Cases"), f"@{cs}?['ID']", {"Stage": choice("DECISION"), "State": choice("@outputs('TargetState')"), "EmployeeStatus": emp_status("outputs('TargetState')"), "Lane": choice("@outputs('Lane')"),
                                                                           "DecisionReadiness": "@string(outputs('Score'))", "ReadinessVersion": "@outputs('Cfg')?['GatesVersion']", "DecisionReadinessState": choice("READY"),
                                                                           "DecisionAuthority": "@outputs('Authority')", "ValidationState": choice("COMPLETE"), "OpenEvidenceGaps": "[]", "Version": "@outputs('NewVersion')", "LastValidatedAt": "@utcNow()",
                                                                           "NextAction": "@concat('Decision by ', outputs('Authority'), ' on packet ', outputs('DPID'))", "NextOwner": "@outputs('Authority')",
                                                                           "RecordJson": f"@string(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(json({cs}?['RecordJson']), 'Stage', 'DECISION'), 'State', outputs('TargetState')), 'Lane', outputs('Lane')), 'DecisionReadiness', outputs('Score')), 'ReadinessVersion', outputs('Cfg')?['GatesVersion']), 'DecisionReadinessState', 'READY'), 'DecisionAuthority', outputs('Authority')), 'ValidationState', 'COMPLETE'), 'Version', outputs('NewVersion')))"}), into=rd, last=rl)
    # NOT_READY branch
    nr, nl = {}, [None]
    f.add("Update_Case_NotReady", f.update_item(L("Cases"), f"@{cs}?['ID']", {"Stage": choice("DECISION"), "State": choice("NOT_DECISION_READY"), "EmployeeStatus": emp_status("'NOT_DECISION_READY'"), "Lane": choice("PREPARATION"),
                                                                              "DecisionReadiness": "@string(outputs('Score'))", "ReadinessVersion": "@outputs('Cfg')?['GatesVersion']", "DecisionReadinessState": choice("NOT_READY"),
                                                                              "OpenEvidenceGaps": "@string(body('BlockingIds'))", "Version": "@outputs('NewVersion')", "LastValidatedAt": "@utcNow()",
                                                                              "NextAction": "@concat('Close gates: ', join(body('BlockingIds'), ', '))", "NextOwner": "ai-coe-operator",
                                                                              "RecordJson": f"@string(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(json({cs}?['RecordJson']), 'Stage', 'DECISION'), 'State', 'NOT_DECISION_READY'), 'Lane', 'PREPARATION'), 'DecisionReadiness', outputs('Score')), 'ReadinessVersion', outputs('Cfg')?['GatesVersion']), 'DecisionReadinessState', 'NOT_READY'), 'Version', outputs('NewVersion')))"}), into=nr, last=nl)
    f.add("EvidenceRefs", f.select("@body('Get_Packets')?['value']", "@concat(item()?['Title'], '@v', string(coalesce(item()?['Version'], 1)))"), into=ok, last=ol)
    f.add("If_Ready", f.condition({"and": [{"equals": ["@outputs('ReadyState')", "READY"]}]}, rd, nr), into=ok, last=ol)
    f.add("Readback_Readiness", f.get_item(L("Cases"), f"@{cs}?['ID']"), into=ok, last=ol)
    rid = receipt(f, ok, ol, "Readiness", "WRITE_BUSINESS_RECORD", "@concat('work-record:', body('Req')?['WorkID'])", f"@string({cs}?['Version'])", "@string(outputs('NewVersion'))", "@outputs('Gates')")
    event(f, ok, ol, "Readiness", "@body('Req')?['WorkID']", "READINESS_EVALUATED", {"ReadinessState": "@outputs('ReadyState')", "Score": "@outputs('Score')", "Blocking": "@body('BlockingIds')", "GatesVersion": "@outputs('Cfg')?['GatesVersion']"}, rid, "WRITE_BUSINESS_RECORD", actor=("SERVICE", "AI CoE 01 Case Command"))
    rt = {}
    event(f, rt, [None], "Route", "@body('Req')?['WorkID']", "ROUTE_DETERMINED", {"Lane": "@outputs('Lane')", "RuleFired": "@outputs('RuleFired')", "PolicyVersion": "@outputs('Cfg')?['PolicyVersion']", "PolicySource": "TRANSCRIBED_FROM_v3.4_s11_NOT_YAML"}, rid, "READ", actor=("SERVICE", "routing-policy"))
    f.add("If_Route_Event", f.condition({"and": [{"equals": ["@outputs('ReadyState')", "READY"]}]}, rt), into=ok, last=ol)
    respond(f, ok, ol, "Readiness", {"Result": "PASS", "ReceiptID": rid, "Work": proj("body('Readback_Readiness')"), "DecisionReadinessState": "@outputs('ReadyState')", "BlockingGates": "@body('BlockingIds')",
                                     "DecisionPacketID": "@if(equals(outputs('ReadyState'), 'READY'), outputs('DPID'), null)"}, "PASS", rid)
    find_case_guard(f, blk, last, "Readiness", "@body('Req')?['WorkID']", ok)
    return blk


def flow_01(literal=None) -> Flow:
    f = Flow("AI CoE 01 Case Command", "Claims PENDING rows from AI CoE Case Command (UI<->flow contract v0.1.1, binding A), executes the five operations against the canonical lists, writes receipt + event rows, and returns the response JSON to the command row. Identity = the row's Author. Polls every 5 minutes.",
             recurrence("Minute", 5), literal=literal)
    cfg_prologue(f)
    f.add("Get_Commands", f.get_items(L("Command"), "Claimed eq 0 and Result eq 'PENDING'", top="@int(outputs('Cfg')?['CommandBatchSize'])", orderby="Created asc"))
    fe, fl = {}, [None]
    f.add("ClaimToken", f.compose("@guid()"), into=fe, last=fl)
    f.add("Claim", f.update_item(L("Command"), "@items('For_each_command')?['ID']", {"Claimed": True, "ClaimToken": "@outputs('ClaimToken')", "ClaimedAt": "@utcNow()"}), into=fe, last=fl)
    f.add("Readback_Claim", f.get_item(L("Command"), "@items('For_each_command')?['ID']"), into=fe, last=fl)
    won, wl = {}, [None]
    unsupported = {}
    f.add("Fail_Unsupported", f.update_item(L("Command"), "@items('For_each_command')?['ID']", {"Result": choice("FAIL"), "ErrorClass": "UNSUPPORTED_OPERATION", "CompletedAt": "@utcNow()",
                                                                                                "ResponseJson": "@string(json(concat('{\"Result\":\"FAIL\",\"ErrorClass\":\"UNSUPPORTED_OPERATION\",\"Message\":\"Operation is not one of the five contract operations. Nothing was written.\",\"ReceiptID\":\"RCPT-NONE\",\"RetryAllowed\":false}')))"}), into=unsupported, last=[None], run_after={})
    ops = f.switch("@items('For_each_command')?['Operation']?['Value']", {
        "CreateOrResumeWork": op_create_or_resume(f), "GetWorkStatus": op_get_status(f), "ListMyWork": op_list_my_work(f),
        "SubmitEvidenceResponse": op_submit_evidence(f), "RequestDecisionReadiness": op_request_readiness(f)},
        default=unsupported)
    inner, il = {}, [None]
    f.add("Validate_Ingress", {"type":"OpenApiConnection","inputs":{"host":{"connectionName":"core_integrity","operationId":"Evaluate","apiId":""},"parameters":{"body/Mode":"Validate","body/Payload":"@string(setProperty(setProperty(json('{}'), 'Row', items('For_each_command')), 'Config', outputs('Cfg')))",},"authentication":"@parameters('$authentication')"}}, into=inner, last=il)
    valid, vl = {}, [None]
    f.add("Req", f.parse("@items('For_each_command')?['RequestJson']", LOOSE), into=valid, last=vl)
    f.add("Identity", f.compose("@body('Validate_Ingress')?['Actor']"), into=valid, last=vl)
    f.add("Switch_Operation", ops, into=valid, last=vl)
    invalid = {}; error_response(f, invalid, [None], 'Validation', 'FAIL', 'VALIDATION_FAILED', 'Invalid request; business writes blocked.', False)
    f.add('If_Valid_Ingress', f.condition({'equals':["@body('Validate_Ingress')?['Valid']",True]}, valid, invalid), into=inner, last=il)
    f.add("Scope_Operation", f.scope(inner), into=won, last=wl)
    fail = {}
    f.add("Fail_Command", f.update_item(L("Command"), "@items('For_each_command')?['ID']", {"Result": choice("FAIL"), "ErrorClass": "FLOW_FAILURE", "CompletedAt": "@utcNow()",
                                                                                            "ResponseJson": "@string(json(concat('{\"Result\":\"FAIL\",\"ErrorClass\":\"FLOW_FAILURE\",\"Message\":\"The command flow failed before completing this operation; nothing further was written. See AI Automation Log.\",\"ReceiptID\":\"RCPT-NONE\",\"RetryAllowed\":true}')))"}), into=fail, last=[None], run_after={})
    log_row(f, "Log_Command_Failure", "Error", "@concat('Case Command failed on row ', items('For_each_command')?['Title'], ' operation ', items('For_each_command')?['Operation']?['Value'], ': ', string(result('Scope_Operation')))", into=fail, last=[None], run_after={"Fail_Command": ["Succeeded"]}, work_id="@coalesce(items('For_each_command')?['WorkID'], '')")
    f.add("Scope_Failed", f.scope(fail), into=won, last=wl, run_after={"Scope_Operation": ["Failed", "TimedOut"]})
    lost = {}
    log_row(f, "Log_Claim_Lost", "Warning", "@concat('Claim lost on command row ', items('For_each_command')?['Title'], ' (another instance won). Skipped.')", into=lost, last=[None], run_after={})
    f.add("If_Claim_Won", f.condition({"and": [{"equals": ["@body('Readback_Claim')?['ClaimToken']", "@outputs('ClaimToken')"]}]}, won, lost), into=fe, last=fl)
    f.add("Scope_Commands", f.scope({"For_each_command": dict(f.foreach("@body('Get_Commands')?['value']", fe, concurrency=1), runAfter={})}))
    heartbeat(f, "Heartbeat_01_CaseCommand")
    failure_handler(f, "Scope_Commands", "AI CoE 01 Case Command: batch scope failed; unclaimed rows remain PENDING and will be retried next cycle.")
    cfg_failure(f)
    return f


# ------------------------------------------------------------------------------------------------
# 02 Evidence & Readiness
# ------------------------------------------------------------------------------------------------
def svc_event(f: Flow, blk, last, sfx: str, work_id: str, etype: str, payload: dict, key_suffix: str):
    ev = {"EventID": f"@{new_id('EVT')}", "WorkID": work_id, "EventType": etype, "OccurredAt": "@utcNow()", "ActorType": "SERVICE", "ActorID": f.name, "Provider": None,
          "SourceRef": f"svc:{f.name}", "SourceVersion": "1", "CorrelationID": f"@concat('CORR-', replace({work_id[1:]}, 'CW-', ''))", "CausationID": None,
          "IdempotencyKey": f"@concat({work_id[1:]}, ':{etype}:', {key_suffix})", "PayloadVersion": "1", "Payload": payload, "AuthorityClass": "WRITE_BUSINESS_RECORD",
          "ReceiptID": f"@{new_id('RCPT')}", "SchemaVersion": "2.0.0"}
    f.add(f"Evt_{sfx}", f.compose(ev), into=blk, last=last)
    f.add(f"Event_{sfx}", f.create_item(L("Events"), {"Title": f"@outputs('Evt_{sfx}')?['EventID']", "WorkID": work_id, "EventType": etype, "OccurredAt": "@utcNow()", "ActorType": choice("SERVICE"),
                                                       "ActorID": f.name, "CorrelationID": f"@outputs('Evt_{sfx}')?['CorrelationID']", "IdempotencyKey": f"@outputs('Evt_{sfx}')?['IdempotencyKey']",
                                                       "AuthorityClass": "WRITE_BUSINESS_RECORD", "ReceiptID": f"@outputs('Evt_{sfx}')?['ReceiptID']", "SourceVersion": "1", "Payload": f"@string(outputs('Evt_{sfx}'))",
                                                       "TestRecord": "@coalesce(items('For_each_case')?['TestRecord'], false)"}), into=blk, last=last)


def flow_02(literal=None) -> Flow:
    f = Flow("AI CoE 02 Evidence and Readiness", "Issues S2-S5 evidence packets for READY_FOR_TRIAGE cases, (UAT only) auto-validates RETURNED packets when AutoValidateReturnedPackets=true, keeps OpenEvidenceGaps current, and writes reminder/escalation outbox rows for overdue packets. Sends nothing. Polls every 15 minutes.",
             recurrence("Minute", 15), literal=literal)
    cfg_prologue(f)
    f.add("PacketTypes", f.compose(M.PACKET_TYPES))
    # A. triage -> packets
    f.add("Get_Triage", f.get_items(L("Cases"), "(State eq 'READY_FOR_TRIAGE' or (State eq 'NOT_DECISION_READY' and ValidationState eq 'NOT_STARTED')) and DuplicateStatus ne 'CONFIRMED_DUPLICATE'", top=50))
    cb, cl = {}, [None]
    wid = "@items('For_each_case')?['Title']"
    f.add("Existing_Packets", f.get_items(L("Evidence"), "@concat('WorkID eq ''', items('For_each_case')?['Title'], ''' and RecordKind eq ''EVIDENCE_PACKET''')", top=50), into=cb, last=cl)
    f.add("Existing_Types", f.select("@body('Existing_Packets')?['value']", "@item()?['EvidenceType']"), into=cb, last=cl)
    pb, pl = {}, [None]
    mk = {}
    f.add("Tmpl", f.compose("@outputs('Cfg')?['PacketDefaults']?[items('For_each_type')]"), into=mk, last=[None], run_after={})
    f.add("PacketRec", f.compose({"EvidencePacketID": "@concat('EVP-', replace(items('For_each_case')?['Title'], 'CW-', ''), '-', items('For_each_type'))", "WorkID": wid, "EvidenceType": "@items('For_each_type')",
                                 "ReasonRequired": "Decision readiness hard gate S2_S5_COMPLETE_OR_NA", "Questions": ["@outputs('Tmpl')?['q']"], "AssignedRole": "@outputs('Tmpl')?['role']", "AssignedPerson": None,
                                 "SourceRefs": ["@concat('case:', items('For_each_case')?['Title'])"], "DueAt": "@addDays(utcNow(), int(outputs('Cfg')?['PacketDueDays']))", "Status": "AWAITING_RESPONSE",
                                 "Applicability": "REQUIRED", "Response": None, "ValidatorAssertion": None, "Confidence": None, "KnownAssumedUnknown": "UNKNOWN", "FreshnessState": "UNPROVED", "Version": 1}),
          into=mk, last=[None], run_after={"Tmpl": ["Succeeded"]})
    f.add("Create_Packet", f.create_item(L("Evidence"), {"Title": "@outputs('PacketRec')?['EvidencePacketID']", "WorkID": wid, "RecordKind": choice("EVIDENCE_PACKET"), "EvidenceType": "@items('For_each_type')",
                                                          "ReasonRequired": "@outputs('PacketRec')?['ReasonRequired']", "Questions": "@string(outputs('PacketRec')?['Questions'])", "AssignedRole": "@outputs('Tmpl')?['role']",
                                                          "SourceRefs": "@string(outputs('PacketRec')?['SourceRefs'])", "DueAt": "@outputs('PacketRec')?['DueAt']", "Status": choice("AWAITING_RESPONSE"), "Applicability": choice("REQUIRED"),
                                                          "KnownAssumedUnknown": choice("UNKNOWN"), "FreshnessState": choice("UNPROVED"), "Version": 1, "RecordJson": "@string(outputs('PacketRec'))",
                                                          "TestRecord": "@coalesce(items('For_each_case')?['TestRecord'], false)"}), into=mk, last=[None], run_after={"PacketRec": ["Succeeded"]})
    f.add("Queue_Request", f.create_item(L("Outbox"), {"Title": f"@{new_id('OUT')}", "WorkID": wid, "Recipient": f"@coalesce(outputs('PacketRec')?['AssignedPerson'], {q(literal['mail']) if literal else 'parameters(' + q(MAIL_PARAM) + ')'})",
                                                        "Subject": "@concat('[', " + (q(literal['label']) if literal else 'parameters(' + q(LABEL_PARAM) + ')') + ", '] Evidence requested: ', items('For_each_type'), ' for ', items('For_each_case')?['Title'])",
                                                        "Body": "@concat('Packet ', outputs('PacketRec')?['EvidencePacketID'], ' — ', outputs('Tmpl')?['q'], ' Due ', outputs('PacketRec')?['DueAt'], '. Reply through Ask AI CoE (SubmitEvidenceResponse).')",
                                                        "State": choice("QUEUED"), "Attempts": 0, "TestRecord": "@coalesce(items('For_each_case')?['TestRecord'], false)"}), into=mk, last=[None], run_after={"Create_Packet": ["Succeeded"]})
    f.add("If_Packet_Missing", f.condition({"and": [{"equals": ["@contains(body('Existing_Types'), items('For_each_type'))", False]}]}, mk), into=pb, last=pl)
    f.add("For_each_type", f.foreach("@outputs('PacketTypes')", pb, concurrency=1), into=cb, last=cl)
    f.add("Update_Case_Triaged", f.update_item(L("Cases"), "@items('For_each_case')?['ID']", {"Stage": choice("EVIDENCE"), "State": choice("AWAITING_SME"), "EmployeeStatus": emp_status("'AWAITING_SME'"),
                                                                                            "RequiredValidators": "@string(outputs('PacketTypes'))", "OpenEvidenceGaps": "@string(outputs('PacketTypes'))", "ValidationState": choice("IN_PROGRESS"),
                                                                                            "Version": "@add(int(coalesce(items('For_each_case')?['Version'], 1)), 1)", "LastValidatedAt": "@utcNow()",
                                                                                            "NextAction": "Validators return S2-S5 packets", "NextOwner": "validators",
                                                                                            "RecordJson": "@string(setProperty(setProperty(setProperty(setProperty(setProperty(setProperty(json(items('For_each_case')?['RecordJson']), 'Stage', 'EVIDENCE'), 'State', 'AWAITING_SME'), 'RequiredValidators', outputs('PacketTypes')), 'OpenEvidenceGaps', outputs('PacketTypes')), 'ValidationState', 'IN_PROGRESS'), 'Version', add(int(coalesce(items('For_each_case')?['Version'], 1)), 1)))"}), into=cb, last=cl)
    svc_event(f, cb, cl, "Issued", wid, "EVIDENCE_PACKETS_ISSUED", {"Types": "@outputs('PacketTypes')"}, "string(add(int(coalesce(items('For_each_case')?['Version'], 1)), 1))")
    f.add("For_each_case", f.foreach("@body('Get_Triage')?['value']", cb, concurrency=1))

    # B. UAT auto-validation of RETURNED packets
    f.add("Get_Returned", f.get_items(L("Evidence"), "Status eq 'RETURNED' and RecordKind eq 'EVIDENCE_PACKET'", top=100))
    av, al = {}, [None]
    f.add("Validate_Packet", f.update_item(L("Evidence"), "@items('For_each_returned')?['ID']", {"Status": choice("VALIDATED"), "ValidatorAssertion": "AUTO_VALIDATED_UAT (provisional; AutoValidateReturnedPackets=true) — not a human validation",
                                                                                                 "FreshnessState": choice("CURRENT"), "Confidence": "AWAITING_VALIDATION", "Version": "@add(int(coalesce(items('For_each_returned')?['Version'], 1)), 1)",
                                                                                                 "RecordJson": "@string(setProperty(setProperty(setProperty(json(items('For_each_returned')?['RecordJson']), 'Status', 'VALIDATED'), 'ValidatorAssertion', 'AUTO_VALIDATED_UAT (provisional)'), 'Version', add(int(coalesce(items('For_each_returned')?['Version'], 1)), 1)))"}), into=av, last=al)
    f.add("Log_AutoValidate", f.create_item(L("Log"), {"Title": f"@{new_id('LOG')}", "Flow": f.name, "RunId": "@workflow()?['run']?['name']", "Level": choice("Warning"),
                                                       "Message": "@concat('UAT auto-validated packet ', items('For_each_returned')?['Title'], ' (AutoValidateReturnedPackets=true). Not a human validation.')", "WorkID": "@items('For_each_returned')?['WorkID']", "LoggedAt": "@utcNow()"}), into=av, last=al)
    auto = {}
    f.add("For_each_returned", f.foreach("@body('Get_Returned')?['value']", av, concurrency=1), into=auto, last=[None], run_after={})
    f.add("If_AutoValidate", f.condition({"and": [{"equals": ["@outputs('Cfg')?['AutoValidateReturnedPackets']", True]}]}, auto))

    # C. keep OpenEvidenceGaps current for AWAITING_SME cases
    f.add("Get_AwaitingSME", f.get_items(L("Cases"), "State eq 'AWAITING_SME'", top=100))
    gb, gl = {}, [None]
    f.add("Case_Packets", f.get_items(L("Evidence"), "@concat('WorkID eq ''', items('For_each_sme')?['Title'], ''' and RecordKind eq ''EVIDENCE_PACKET''')", top=50), into=gb, last=gl)
    f.add("Open_Packets", f.filter("@body('Case_Packets')?['value']", "@and(equals(item()?['Applicability']?['Value'], 'REQUIRED'), not(or(equals(item()?['Status']?['Value'], 'VALIDATED'), equals(item()?['Status']?['Value'], 'NOT_APPLICABLE'))))"), into=gb, last=gl)
    f.add("Open_Types", f.select("@body('Open_Packets')", "@item()?['EvidenceType']"), into=gb, last=gl)
    chg = {}
    f.add("Update_Gaps", f.update_item(L("Cases"), "@items('For_each_sme')?['ID']", {"OpenEvidenceGaps": "@string(body('Open_Types'))", "State": choice("@if(empty(body('Open_Types')), 'EVIDENCE_BUILDING', 'AWAITING_SME')"),
                                                                                    "EmployeeStatus": emp_status("if(empty(body('Open_Types')), 'EVIDENCE_BUILDING', 'AWAITING_SME')"),
                                                                                    "ValidationState": choice("@if(empty(body('Open_Types')), 'COMPLETE', 'IN_PROGRESS')"), "Version": "@add(int(coalesce(items('For_each_sme')?['Version'], 1)), 1)", "LastValidatedAt": "@utcNow()",
                                                                                    "NextAction": "@if(empty(body('Open_Types')), 'Request decision readiness (RequestDecisionReadiness)', concat('Validators return: ', join(body('Open_Types'), ', ')))",
                                                                                    "NextOwner": "@if(empty(body('Open_Types')), 'ai-coe-operator', 'validators')",
                                                                                    "RecordJson": "@string(setProperty(setProperty(setProperty(setProperty(json(items('For_each_sme')?['RecordJson']), 'OpenEvidenceGaps', body('Open_Types')), 'State', if(empty(body('Open_Types')), 'EVIDENCE_BUILDING', 'AWAITING_SME')), 'ValidationState', if(empty(body('Open_Types')), 'COMPLETE', 'IN_PROGRESS')), 'Version', add(int(coalesce(items('For_each_sme')?['Version'], 1)), 1)))"}), into=chg, last=[None], run_after={})
    f.add("If_Gaps_Changed", f.condition({"and": [{"not": {"equals": ["@string(body('Open_Types'))", "@coalesce(items('For_each_sme')?['OpenEvidenceGaps'], '')"]}}]}, chg), into=gb, last=gl)
    f.add("For_each_sme", f.foreach("@body('Get_AwaitingSME')?['value']", gb, concurrency=1))

    # D. overdue packets -> reminder / escalation
    f.add("Get_Overdue", f.get_items(L("Evidence"), "@concat('Status eq ''AWAITING_RESPONSE'' and DueAt lt ''', utcNow(), '''')", top=100))
    ob, ol_ = {}, [None]
    rem = {}
    f.add("Queue_Reminder", f.create_item(L("Outbox"), {"Title": f"@{new_id('OUT')}", "WorkID": "@items('For_each_overdue')?['WorkID']", "Recipient": f"@coalesce(items('For_each_overdue')?['AssignedPerson'], {q(literal['mail']) if literal else 'parameters(' + q(MAIL_PARAM) + ')'})",
                                                         "Subject": "@concat('Reminder: evidence overdue ', items('For_each_overdue')?['Title'])", "Body": "@concat('Packet ', items('For_each_overdue')?['Title'], ' was due ', items('For_each_overdue')?['DueAt'], '.')",
                                                         "State": choice("QUEUED"), "Attempts": 0, "TestRecord": "@coalesce(items('For_each_overdue')?['TestRecord'], false)"}), into=rem, last=[None], run_after={})
    f.add("Stamp_Reminder", f.update_item(L("Evidence"), "@items('For_each_overdue')?['ID']", {"LastReminderAt": "@utcNow()"}), into=rem, last=[None], run_after={"Queue_Reminder": ["Succeeded"]})
    f.add("If_Reminder_Due", f.condition({"and": [{"less": ["@ticks(coalesce(items('For_each_overdue')?['LastReminderAt'], '1970-01-01T00:00:00Z'))", "@ticks(addDays(utcNow(), mul(-1, int(outputs('Cfg')?['ReminderAfterDays']))))"]}]}, rem), into=ob, last=ol_)
    esc = {}
    f.add("Evt_Escalate", f.compose({"EventID": f"@{new_id('EVT')}", "WorkID": "@items('For_each_overdue')?['WorkID']", "EventType": "ESCALATION_REQUIRED", "OccurredAt": "@utcNow()", "ActorType": "SERVICE", "ActorID": f.name, "Provider": None,
                                    "SourceRef": "@concat('evidence-packet:', items('For_each_overdue')?['Title'])", "SourceVersion": "@string(coalesce(items('For_each_overdue')?['Version'], 1))", "CorrelationID": "@concat('CORR-', replace(items('For_each_overdue')?['WorkID'], 'CW-', ''))",
                                    "CausationID": None, "IdempotencyKey": "@concat(items('For_each_overdue')?['WorkID'], ':ESCALATION_REQUIRED:', items('For_each_overdue')?['Title'])", "PayloadVersion": "1",
                                    "Payload": {"EvidencePacketID": "@items('For_each_overdue')?['Title']", "DueAt": "@items('For_each_overdue')?['DueAt']"}, "AuthorityClass": "NOTIFY", "ReceiptID": f"@{new_id('RCPT')}", "SchemaVersion": "2.0.0"}), into=esc, last=[None], run_after={})
    f.add("Event_Escalate", f.create_item(L("Events"), {"Title": "@outputs('Evt_Escalate')?['EventID']", "WorkID": "@items('For_each_overdue')?['WorkID']", "EventType": "ESCALATION_REQUIRED", "OccurredAt": "@utcNow()", "ActorType": choice("SERVICE"), "ActorID": f.name,
                                                         "CorrelationID": "@outputs('Evt_Escalate')?['CorrelationID']", "IdempotencyKey": "@outputs('Evt_Escalate')?['IdempotencyKey']", "AuthorityClass": "NOTIFY", "ReceiptID": "@outputs('Evt_Escalate')?['ReceiptID']",
                                                         "SourceVersion": "1", "Payload": "@string(outputs('Evt_Escalate'))", "TestRecord": "@coalesce(items('For_each_overdue')?['TestRecord'], false)"}), into=esc, last=[None], run_after={"Evt_Escalate": ["Succeeded"]})
    f.add("Stamp_Escalation", f.update_item(L("Evidence"), "@items('For_each_overdue')?['ID']", {"EscalationAt": "@utcNow()"}), into=esc, last=[None], run_after={"Event_Escalate": ["Succeeded"]})
    f.add("If_Escalate", f.condition({"and": [{"equals": ["@empty(coalesce(items('For_each_overdue')?['EscalationAt'], ''))", True]}, {"less": ["@ticks(items('For_each_overdue')?['DueAt'])", "@ticks(addDays(utcNow(), mul(-1, int(outputs('Cfg')?['EscalationAfterDays']))))"]}]}, esc), into=ob, last=ol_)
    f.add("For_each_overdue", f.foreach("@body('Get_Overdue')?['value']", ob, concurrency=1))
    f.wrap_after("PacketTypes", "Scope_Evidence")
    heartbeat(f, "Heartbeat_02_Evidence")
    failure_handler(f, "Scope_Evidence", "AI CoE 02 Evidence and Readiness: scope failed; no partial state is lost, next cycle resumes from list state.")
    cfg_failure(f)
    return f


# ------------------------------------------------------------------------------------------------
# 03 Markdown Projector
# ------------------------------------------------------------------------------------------------
def flow_03(literal=None) -> Flow:
    f = Flow("AI CoE 03 Markdown Projector", "Regenerates the versioned Markdown companion <WorkID>.md in AI CoE Work Packets for every case modified since the last run (FL-06). Records a MARKDOWN_PROJECTED event. Polls every 15 minutes.",
             recurrence("Minute", 15), literal=literal)
    cfg_prologue(f)
    f.add("SiteRel", f.compose("@uriPath(" + (q(literal["site"]) if literal else f"parameters('{SITE_PARAM}')") + ")"))
    f.add("Get_Changed", f.get_items(L("Cases"), "@concat('Modified gt ''', outputs('Cfg')?['Projector_LastRun'], '''')", top=200, orderby="Modified asc"))
    cb, cl = {}, [None]
    wid = "@items('For_each_case')?['Title']"
    f.add("Case_Packets", f.get_items(L("Evidence"), "@concat('WorkID eq ''', items('For_each_case')?['Title'], '''')", top=50), into=cb, last=cl)
    f.add("Case_Decisions", f.get_items(L("Decisions"), "@concat('WorkID eq ''', items('For_each_case')?['Title'], '''')", top=20, orderby="Created desc"), into=cb, last=cl)
    f.add("Packet_Lines", f.select("@body('Case_Packets')?['value']", "@concat('| ', item()?['Title'], ' | ', item()?['EvidenceType'], ' | ', item()?['Status']?['Value'], ' | ', coalesce(item()?['AssignedRole'], ''), ' | ', coalesce(item()?['FreshnessState']?['Value'], ''), ' |')"), into=cb, last=cl)
    f.add("Decision_Lines", f.select("@body('Case_Decisions')?['value']", "@concat('| ', item()?['Title'], ' | ', item()?['Status']?['Value'], ' | ', coalesce(item()?['Lane'], ''), ' | ', coalesce(item()?['PayloadHash'], ''), ' | ', coalesce(item()?['HashProvenance']?['Value'], ''), ' |')"), into=cb, last=cl)
    c = "items('For_each_case')"
    md = ("@concat('# ', " + c + "?['Title'], ' — ', " + c + "?['WorkTitle'], '\n\n', "
          "'**Canonical record:** AI CoE Cases · version ', string(coalesce(" + c + "?['Version'], 1)), ' · release ', coalesce(" + c + "?['CurrentRelease'], ''), ' · projected ', utcNow(), '\n\n', "
          "'**This file is a projection. The list row and its RecordJson are the source of truth; do not edit this file.**\n\n', "
          "'| Field | Value |\n|---|---|\n', "
          "'| Stage / State | ', " + c + "?['Stage']?['Value'], ' / ', " + c + "?['State']?['Value'], ' |\n', "
          "'| Employee status | ', coalesce(" + c + "?['EmployeeStatus'], ''), ' |\n', "
          "'| Lane | ', coalesce(" + c + "?['Lane']?['Value'], ''), ' |\n', "
          "'| Requester / Sponsor / Accountable | ', coalesce(" + c + "?['Requester'], ''), ' / ', coalesce(" + c + "?['Sponsor'], ''), ' / ', coalesce(" + c + "?['AccountableOwner'], ''), ' |\n', "
          "'| Decision requested | ', coalesce(" + c + "?['DecisionRequested'], ''), ' |\n', "
          "'| Decision readiness | ', coalesce(" + c + "?['DecisionReadiness'], ''), ' (', coalesce(" + c + "?['DecisionReadinessState']?['Value'], ''), ', ', coalesce(" + c + "?['ReadinessVersion'], ''), ') |\n', "
          "'| P-Score / Lift | ', coalesce(" + c + "?['PScoreCandidate'], ''), ' / ', coalesce(" + c + "?['Lift'], ''), ' |\n', "
          "'| Open evidence gaps | ', coalesce(" + c + "?['OpenEvidenceGaps'], '[]'), ' |\n', "
          "'| Next action | ', coalesce(" + c + "?['NextAction'], ''), ' — ', coalesce(" + c + "?['NextOwner'], ''), ' |\n\n', "
          "'## Problem\n\n', coalesce(" + c + "?['ProblemStatement'], '_not yet provided_'), '\n\n## Desired outcome\n\n', coalesce(" + c + "?['DesiredOutcome'], '_not yet provided_'), '\n\n', "
          "'## Evidence packets\n\n| Packet | Type | Status | Role | Freshness |\n|---|---|---|---|---|\n', join(body('Packet_Lines'), '\n'), '\n\n', "
          "'## Decision packets\n\n| Packet | Status | Lane | PayloadHash | Hash provenance |\n|---|---|---|---|---|\n', join(body('Decision_Lines'), '\n'), '\n\n', "
          "'## Canonical record (work-record.v2)\n\n```json\n', coalesce(" + c + "?['RecordJson'], '{}'), '\n```\n')")
    f.add("Markdown", f.compose(md), into=cb, last=cl)
    f.add("Write_File", f.sp_http("POST", "@concat('_api/web/GetFolderByServerRelativeUrl(''', outputs('SiteRel'), '/AI CoE Work Packets'')/Files/add(url=''', items('For_each_case')?['Title'], '.md'',overwrite=true)')",
                                  "@outputs('Markdown')", headers={"Accept": "application/json;odata=nometadata", "Content-Type": "text/plain"}), into=cb, last=cl)
    stamp = {}
    f.add("Stamp_Surface", f.update_item(L("Cases"), "@items('For_each_case')?['ID']", {"CollaborationSurface": "@concat(outputs('SiteRel'), '/AI CoE Work Packets/', items('For_each_case')?['Title'], '.md')"}), into=stamp, last=[None], run_after={})
    f.add("If_Surface_Unset", f.condition({"and": [{"not": {"equals": ["@coalesce(items('For_each_case')?['CollaborationSurface'], '')", "@concat(outputs('SiteRel'), '/AI CoE Work Packets/', items('For_each_case')?['Title'], '.md')"]}}]}, stamp), into=cb, last=cl)
    f.add("Find_Projected_Event", f.get_items(L("Events"), "@concat('IdempotencyKey eq ''', items('For_each_case')?['Title'], ':MARKDOWN_PROJECTED:', string(coalesce(items('For_each_case')?['Version'], 1)), '''')", top=1), into=cb, last=cl)
    evb = {}
    svc_event(f, evb, [None], "Projected", wid, "MARKDOWN_PROJECTED", {"File": "@concat(outputs('SiteRel'), '/AI CoE Work Packets/', items('For_each_case')?['Title'], '.md')", "CaseVersion": "@string(coalesce(items('For_each_case')?['Version'], 1))"},
              "string(coalesce(items('For_each_case')?['Version'], 1))")
    f.add("If_Not_Yet_Projected", f.condition({"and": [{"equals": ["@empty(body('Find_Projected_Event')?['value'])", True]}]}, evb), into=cb, last=cl)
    f.add("Scope_Project", f.scope({"For_each_case": dict(f.foreach("@body('Get_Changed')?['value']", cb, concurrency=1), runAfter={})}))
    f.add("Find_Watermark", f.get_items(L("Definitions"), "Title eq 'Projector_LastRun'", top=1))
    wm = {}
    f.add("Update_Watermark", f.update_item(L("Definitions"), "@first(body('Find_Watermark')?['value'])?['ID']", {"Value": "@concat('\"', if(equals(length(body('Get_Changed')?['value']), 200), addSeconds(last(body('Get_Changed')?['value'])?['Modified'], -1), outputs('RunStart')), '\"')"}), into=wm, last=[None], run_after={})
    f.add("If_Watermark", f.condition({"and": [{"greater": ["@length(body('Find_Watermark')?['value'])", 0]}]}, wm))
    heartbeat(f, "Heartbeat_03_Projector")
    failure_handler(f, "Scope_Project", "AI CoE 03 Markdown Projector: projection scope failed; watermark not advanced, cases will be re-projected next cycle.")
    cfg_failure(f)
    return f


# ------------------------------------------------------------------------------------------------
# 04 Notification Outbox (ships OFF)
# ------------------------------------------------------------------------------------------------
def flow_04(literal=None) -> Flow:
    f = Flow("AI CoE 04 Notification Outbox", "Processes QUEUED outbox rows. While SendEnabled=false (default) every row is marked SUPPRESSED and nothing is sent. Ships OFF. Polls every 15 minutes when enabled.",
             recurrence("Minute", 15), uses_mail=True, literal=literal)
    cfg_prologue(f)
    f.add("Get_Queued", f.get_items(L("Outbox"), "State eq 'QUEUED'", top=50, orderby="Created asc"))
    ob, ol = {}, [None]
    sup, snd = {}, {}
    f.add("Suppress", f.update_item(L("Outbox"), "@items('For_each_queued')?['ID']", {"State": choice("SUPPRESSED"), "SuppressionReason": "SendEnabled=false", "Attempts": "@add(int(coalesce(items('For_each_queued')?['Attempts'], 0)), 1)"}), into=sup, last=[None], run_after={})
    f.add("Send", f.send_mail("@items('For_each_queued')?['Recipient']", "@items('For_each_queued')?['Subject']", "@replace(items('For_each_queued')?['Body'], decodeUriComponent('%0A'), '<br>')"), into=snd, last=[None], run_after={})
    f.add("Mark_Sent", f.update_item(L("Outbox"), "@items('For_each_queued')?['ID']", {"State": choice("SENT"), "Attempts": "@add(int(coalesce(items('For_each_queued')?['Attempts'], 0)), 1)", "ReceiptID": f"@{new_id('RCPT')}"}), into=snd, last=[None], run_after={"Send": ["Succeeded"]})
    f.add("Mark_Failed", f.update_item(L("Outbox"), "@items('For_each_queued')?['ID']", {"State": choice("FAILED"), "Attempts": "@add(int(coalesce(items('For_each_queued')?['Attempts'], 0)), 1)"}), into=snd, last=[None], run_after={"Send": ["Failed", "TimedOut"]})
    f.add("If_Send_Enabled", f.condition({"and": [{"equals": ["@outputs('Cfg')?['SendEnabled']", True]}]}, snd, sup), into=ob, last=ol)
    f.add("Scope_Outbox", f.scope({"For_each_queued": dict(f.foreach("@body('Get_Queued')?['value']", ob, concurrency=1), runAfter={})}))
    heartbeat(f, "Heartbeat_04_Outbox")
    failure_handler(f, "Scope_Outbox", "AI CoE 04 Notification Outbox: scope failed; rows stay QUEUED.")
    cfg_failure(f)
    return f


# ------------------------------------------------------------------------------------------------
# 05 Health Monitor
# ------------------------------------------------------------------------------------------------
def flow_05(literal=None) -> Flow:
    f = Flow("AI CoE 05 Health Monitor", "Daily: reports stale PENDING command rows, silent flows (heartbeat older than HealthMonitor_SilenceHours), and overdue cases to AI Automation Log; queues (never sends) an alert row. Turn on last.",
             recurrence("Day", 1, hours=[9], minutes=[0]), literal=literal)
    cfg_prologue(f)
    f.add("Get_Stale_Pending", f.get_items(L("Command"), "@concat('Result eq ''PENDING'' and Created lt ''', addMinutes(utcNow(), mul(-1, int(outputs('Cfg')?['HealthMonitor_StalePendingMinutes']))), '''')", top=100))
    f.add("Get_Heartbeats", f.get_items(L("Definitions"), "startswith(Title, 'Heartbeat_')", top=20))
    f.add("Silent", f.filter("@body('Get_Heartbeats')?['value']", "@if(equals(item()?['Value'], '\"never\"'), true, less(ticks(replace(item()?['Value'], '\"', '')), ticks(addHours(utcNow(), mul(-1, int(outputs('Cfg')?['HealthMonitor_SilenceHours']))))))"))
    f.add("Silent_Names", f.select("@body('Silent')", "@item()?['Title']"))
    f.add("Get_Overdue_Cases", f.get_items(L("Cases"), "@concat('NextDate ne null and NextDate lt ''', utcNow(), ''' and State ne ''RETIRED'' and State ne ''REJECTED'' and State ne ''OPERATING''')", top=100))
    log_row(f, "Log_Health", "@if(or(greater(length(body('Get_Stale_Pending')?['value']), 0), greater(length(body('Silent')), 0)), 'Warning', 'Succeeded')",
            "@concat('Health: ', string(length(body('Get_Stale_Pending')?['value'])), ' stale PENDING commands; silent flows: ', if(empty(body('Silent_Names')), 'none', join(body('Silent_Names'), ', ')), '; overdue cases: ', string(length(body('Get_Overdue_Cases')?['value'])), '.')")
    al = {}
    f.add("Queue_Alert", f.create_item(L("Outbox"), {"Title": f"@{new_id('OUT')}", "Recipient": (q(literal['mail'])[1:-1] if literal else P(MAIL_PARAM)), "Subject": "@concat('[', " + (q(literal['label']) if literal else 'parameters(' + q(LABEL_PARAM) + ')') + ", '] AI CoE automation health warning')",
                                                     "Body": "@concat('Stale PENDING commands: ', string(length(body('Get_Stale_Pending')?['value'])), '. Silent flows: ', join(body('Silent_Names'), ', '), '.')", "State": choice("QUEUED"), "Attempts": 0, "TestRecord": False}), into=al, last=[None], run_after={})
    f.add("If_Alert", f.condition({"and": [{"equals": ["@or(greater(length(body('Get_Stale_Pending')?['value']), 0), greater(length(body('Silent')), 0))", True]}]}, al))
    f.wrap_after("RunStart", "Scope_Health")
    failure_handler(f, "Scope_Health", "AI CoE 05 Health Monitor: health scope failed.")
    cfg_failure(f)
    return f


# The source-pinned 3.0.0.0 routines above are retained for audit lineage only.
# Runtime generation uses the corrected single-writer graph, preserving flow names/GUIDs.
from native_runtime import flow_01, flow_02, flow_03, flow_04, flow_05
ALL_FLOWS = [flow_00, flow_01, flow_02, flow_03, flow_04, flow_05]
