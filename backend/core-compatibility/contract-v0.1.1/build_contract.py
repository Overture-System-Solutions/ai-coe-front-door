#!/usr/bin/env python3
"""
Generate the UI <-> flow interface contract artefacts (candidate v0.1):
  contract/ui-flow-contract.schema.json   - request/response envelopes for the 5 operations (Draft 2020-12)
  contract/mock/<op>/<case>.json          - request+response pairs derived from the schema-validated UAT fixtures
  contract/mock_server.py                 - zero-dependency local mock (python3 -m ... or python3 mock_server.py)
Every response 'work' body is re-validated against the hash-pinned RC2 work-record.v2 schema; every pair is
validated against the envelope schema. Nothing here is a tenant object.
"""
import hashlib, json, sys
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

HERE = Path(__file__).resolve().parent
RC2 = HERE.parent / "rc2"
FIX = json.loads((HERE / "out" / "uat-fixtures.json").read_text())
OUT = HERE / "out" / "contract"
(OUT / "mock").mkdir(parents=True, exist_ok=True)

manifest = {e["path"]: e for e in json.loads((RC2 / "01_MACHINE_CANON" / "release-manifest.json").read_text())["members"]}
def pinned(name):
    raw = (RC2 / "02_SCHEMAS" / name).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == manifest[f"02_SCHEMAS/{name}"]["sha256"], name
    return json.loads(raw)
WR = pinned("work-record.v2.schema.json"); EP = pinned("evidence-packet.v2.schema.json"); AR = pinned("audit-receipt.v1.schema.json")
wr_v = Draft202012Validator(WR); ep_v = Draft202012Validator(EP)

EMPLOYEE_STATUS = {  # canonical State -> employee wording (CW-AICOE-EMPLOYEE-GUIDANCE... v1)
    "DRAFT": "Started", "CLARIFYING": "Need one answer", "READY_FOR_TRIAGE": "Working", "EVIDENCE_BUILDING": "Working",
    "AWAITING_SME": "With the right reviewer", "NOT_DECISION_READY": "Working", "DECISION_READY": "With the right reviewer",
    "READY_FOR_AI_COE": "With the right reviewer", "READY_FOR_ARB": "With the right reviewer", "READY_FOR_ELT": "With the right reviewer",
    "APPROVED": "Ready for you", "APPROVED_WITH_CONDITIONS": "Ready for you", "DEFERRED": "Ready for you", "REJECTED": "Done",
    "PROJECT_ACTIVATING": "Working", "IN_DELIVERY": "Working", "AT_RISK": "Working", "BLOCKED": "Working",
    "VALUE_REVIEW": "Ready for you", "OPERATING": "Done", "IMPROVEMENT_PROPOSED": "Ready for you", "REVALIDATION_REQUIRED": "Working", "RETIRED": "Done",
}
S1_FIELDS = ["Title", "ProblemStatement", "DesiredOutcome", "Requester", "Department", "Sponsor", "AccountableOwner", "SourceRefs", "DecisionRequested", "Risks"]

HEX64 = {"type": "string", "pattern": "^[a-f0-9]{64}$"}
RID = {"type": "string", "minLength": 1, "pattern": "^[A-Z][A-Z0-9_-]{2,127}$"}
WID = {"type": "string", "minLength": 1, "pattern": "^CW-[A-Z0-9_-]{2,124}$"}
ERR = {"type": "object", "additionalProperties": False, "required": ["Result", "ErrorClass", "Message", "ReceiptID", "RetryAllowed"],
       "properties": {"Result": {"enum": ["FAIL", "DENIED", "INCONCLUSIVE", "RECONCILIATION_REQUIRED"]},
                      "ErrorClass": {"type": "string", "minLength": 1}, "Message": {"type": "string"},
                      "ReceiptID": RID, "RetryAllowed": {"type": "boolean"}, "RetryAfterSeconds": {"type": "integer", "minimum": 0}}}
CTX = {"type": "object", "additionalProperties": False, "required": ["CorrelationID", "IdempotencyKey", "ClientVersion", "TenantLabel"],
       "properties": {"CorrelationID": RID, "IdempotencyKey": {"type": "string", "minLength": 8},
                      "ClientVersion": {"type": "string", "minLength": 1}, "TenantLabel": {"type": "string", "minLength": 1},
                      "TestRecord": {"type": "boolean"}}}
PROJ = {"type": "object", "additionalProperties": False,
        "required": ["WorkID", "Title", "Stage", "State", "EmployeeStatus", "Lane", "NextAction", "NextOwner", "NextDate", "Version", "LastValidatedAt"],
        "properties": {"WorkID": WID, "Title": {"type": "string"}, "Stage": WR["properties"]["Stage"], "State": WR["properties"]["State"],
                       "EmployeeStatus": {"enum": sorted(set(EMPLOYEE_STATUS.values()))},
                       "Lane": {"type": ["string", "null"]}, "NextAction": {"type": ["string", "null"]}, "NextOwner": {"type": ["string", "null"]},
                       "NextDate": {"type": ["string", "null"]}, "Version": {"type": "integer", "minimum": 1}, "LastValidatedAt": {"type": "string", "format": "date-time"},
                       "OpenEvidenceGaps": {"type": "array", "items": {"type": "string"}}, "DuplicateStatus": WR["properties"]["DuplicateStatus"],
                       "RelatedWorkIDs": WR["properties"]["RelatedWorkIDs"]}}
S1 = {"type": "object", "additionalProperties": False, "required": ["Title", "SourceChannel"],
      "properties": {**{k: WR["properties"][k] for k in S1_FIELDS}, "SourceChannel": {"type": "string", "minLength": 1},
                     "DataClassification": WR["properties"]["DataClassification"]}}
RESP_OK = lambda extra, work_required=True: {"type": "object", "additionalProperties": False, "required": ["Result", "ReceiptID"] + (["Work"] if work_required else []) + list(extra),
                         "properties": {"Result": {"const": "PASS"}, "ReceiptID": RID, "Work": PROJ, **extra}}
def op(req_props, req_required, ok_extra, work_required=True):
    return {"type": "object", "additionalProperties": False, "required": ["request", "response"],
            "properties": {"request": {"type": "object", "additionalProperties": False, "required": ["Context"] + req_required,
                                       "properties": {"Context": CTX, **req_props}},
                           "response": {"oneOf": [RESP_OK(ok_extra, work_required), ERR]}}}

CONTRACT = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "cw-aicoe/ui-flow-contract/v0.1.1",
    "title": "CloudWave AI CoE — UI <-> flow interface contract v0.1.1 (CANDIDATE; payloads bound to RC2 3.4.0-rc2 schemas; implemented by AICoECoreAutomation 3.0.0.0)",
    "$defs": {
        "CreateOrResumeWork": op({"S1": S1, "WorkID": {"anyOf": [WID, {"type": "null"}]}}, ["S1"],
                                 {"Created": {"type": "boolean"}, "ClarificationRequired": {"type": "array", "items": {"type": "string"}}}),
        "GetWorkStatus": op({"WorkID": WID}, ["WorkID"], {}),
        "ListMyWork": op({"Requester": {"type": "string", "minLength": 1}}, ["Requester"],
                         {"Items": {"type": "array", "items": PROJ}}, work_required=False),
        "SubmitEvidenceResponse": op({"WorkID": WID, "EvidencePacketID": RID, "Response": {"type": "string", "minLength": 1},
                                      "KnownAssumedUnknown": EP["properties"]["KnownAssumedUnknown"]},
                                     ["WorkID", "EvidencePacketID", "Response", "KnownAssumedUnknown"],
                                     {"PacketStatus": EP["properties"]["Status"]}),
        "RequestDecisionReadiness": op({"WorkID": WID, "PayloadHash": HEX64, "EvidenceSetHash": HEX64}, ["WorkID"],
                                       {"DecisionReadinessState": WR["properties"]["DecisionReadinessState"],
                                        "BlockingGates": {"type": "array", "items": {"type": "string"}},
                                        "DecisionPacketID": {"anyOf": [RID, {"type": "null"}]}}),
    },
    "oneOf": [{"$ref": f"#/$defs/{k}"} for k in ["CreateOrResumeWork", "GetWorkStatus", "ListMyWork", "SubmitEvidenceResponse", "RequestDecisionReadiness"]],
}
(OUT / "ui-flow-contract.schema.json").write_text(json.dumps(CONTRACT, indent=1) + "\n")
cv = {k: Draft202012Validator({**CONTRACT, "oneOf": [{"$ref": f"#/$defs/{k}"}]}, format_checker=FormatChecker()) for k in CONTRACT["$defs"]}

def project(wr):
    return {"WorkID": wr["WorkID"], "Title": wr["Title"], "Stage": wr["Stage"], "State": wr["State"], "EmployeeStatus": EMPLOYEE_STATUS[wr["State"]],
            "Lane": wr["Lane"], "NextAction": wr["NextAction"], "NextOwner": wr["NextOwner"], "NextDate": wr.get("NextDate"),
            "Version": wr["Version"], "LastValidatedAt": wr["LastValidatedAt"], "OpenEvidenceGaps": wr["OpenEvidenceGaps"],
            "DuplicateStatus": wr["DuplicateStatus"], "RelatedWorkIDs": wr["RelatedWorkIDs"]}
def ctx(wid, n, key):
    return {"CorrelationID": f"CORR-{wid.replace('CW-', '')}", "IdempotencyKey": key, "ClientVersion": "spfx-candidate-0.1", "TenantLabel": "CloudWave-PrivatePilot", "TestRecord": True}

pairs = []
for wid, p in FIX["paths"].items():
    wrs = p["records"]["work-record.v2"]; rcs = p["records"]["audit-receipt.v1"]; eps = p["records"]["evidence-packet.v2"]
    for w in wrs: assert not list(wr_v.iter_errors(w))
    v1, v2, final = wrs[0], wrs[1], wrs[-1]
    s1 = {k: v1[k] for k in S1_FIELDS if v1.get(k) is not None}; s1["SourceChannel"] = v1["SourceChannel"]; s1["DataClassification"] = v1["DataClassification"]
    pairs.append(("CreateOrResumeWork", f"{wid}-create-incomplete-s1", {
        "request": {"Context": ctx(wid, 1, f"{wid}:create:{hashlib.sha256(json.dumps(s1, sort_keys=True).encode()).hexdigest()[:16]}"), "S1": s1, "WorkID": None},
        "response": {"Result": "PASS", "ReceiptID": rcs[1]["ReceiptID"], "Work": project(v2), "Created": True, "ClarificationRequired": v1["OpenEvidenceGaps"]}}))
    pairs.append(("CreateOrResumeWork", f"{wid}-replay-same-idempotency-key", {
        "request": {"Context": ctx(wid, 1, f"{wid}:create:{hashlib.sha256(json.dumps(s1, sort_keys=True).encode()).hexdigest()[:16]}"), "S1": s1, "WorkID": None},
        "response": {"Result": "PASS", "ReceiptID": rcs[1]["ReceiptID"], "Work": project(v2), "Created": False, "ClarificationRequired": v1["OpenEvidenceGaps"]}}))
    pairs.append(("GetWorkStatus", f"{wid}-final", {"request": {"Context": ctx(wid, 9, f"{wid}:status:{final['Version']}"), "WorkID": wid},
                                                     "response": {"Result": "PASS", "ReceiptID": rcs[-1]["ReceiptID"], "Work": project(final)}}))
    s3 = [e for e in eps if e["EvidenceType"] == "S3_FINANCIAL"][-1]
    pairs.append(("SubmitEvidenceResponse", f"{wid}-s3-finance", {
        "request": {"Context": ctx(wid, 5, f"{wid}:evidence:{s3['EvidencePacketID']}:v2"), "WorkID": wid, "EvidencePacketID": s3["EvidencePacketID"],
                    "Response": s3["Response"], "KnownAssumedUnknown": "KNOWN"},
        "response": {"Result": "PASS", "ReceiptID": rcs[8]["ReceiptID"], "Work": project([w for w in wrs if w["State"] == "NOT_DECISION_READY"][0]), "PacketStatus": "RETURNED"}}))
    nr = [w for w in wrs if w["State"] == "NOT_DECISION_READY"][0]; dr = [w for w in wrs if w["State"] == "DECISION_READY"][0]
    pairs.append(("RequestDecisionReadiness", f"{wid}-not-ready", {"request": {"Context": ctx(wid, 6, f"{wid}:readiness:{nr['Version']}"), "WorkID": wid},
        "response": {"Result": "PASS", "ReceiptID": rcs[6]["ReceiptID"], "Work": project(nr), "DecisionReadinessState": "NOT_READY",
                     "BlockingGates": ["S2_S5_COMPLETE_OR_NA", "SME_VALIDATIONS_COMPLETE"], "DecisionPacketID": None}}))
    pairs.append(("RequestDecisionReadiness", f"{wid}-ready", {"request": {"Context": ctx(wid, 7, f"{wid}:readiness:{dr['Version']}"), "WorkID": wid},
        "response": {"Result": "PASS", "ReceiptID": rcs[9]["ReceiptID"], "Work": project(dr), "DecisionReadinessState": "READY", "BlockingGates": [],
                     "DecisionPacketID": p["records"]["decision-packet.v2"][0]["DecisionPacketID"]}}))
# list + error cases
finals = [project(p["records"]["work-record.v2"][-1]) for p in FIX["paths"].values()]
pairs.append(("ListMyWork", "uat-analyst-own-work", {"request": {"Context": ctx("CW-UAT-LIST", 1, "list:uat-analyst:1"), "Requester": "uat-analyst@example.invalid"},
    "response": {"Result": "PASS", "ReceiptID": "RCPT-UAT-LIST-001", "Items": [finals[0]]}}))
pairs.append(("GetWorkStatus", "negative-other-users-work", {"request": {"Context": ctx("CW-UAT-ARB-001", 1, "status:neg:1"), "WorkID": "CW-UAT-ARB-001"},
    "response": {"Result": "DENIED", "ErrorClass": "NOT_AUTHORIZED", "Message": "Signed-in identity is not requester, owner or authorized viewer of this Work ID.", "ReceiptID": "RCPT-UAT-NEG-001", "RetryAllowed": False}}))
pairs.append(("GetWorkStatus", "negative-unknown-work-id", {"request": {"Context": ctx("CW-UAT-NONE", 1, "status:neg:2"), "WorkID": "CW-UAT-NONE-999"},
    "response": {"Result": "FAIL", "ErrorClass": "NOT_FOUND", "Message": "No Work record with this ID.", "ReceiptID": "RCPT-UAT-NEG-002", "RetryAllowed": False}}))
pairs.append(("CreateOrResumeWork", "negative-missing-title", {"request": {"Context": ctx("CW-UAT-X", 1, "create:neg:1"), "S1": {"SourceChannel": "ASK_AI_COE_UAT", "Title": ""}, "WorkID": None},
    "response": {"Result": "FAIL", "ErrorClass": "VALIDATION_FAILED", "Message": "S1.Title is required (minLength 1). Nothing was written.", "ReceiptID": "RCPT-UAT-NEG-003", "RetryAllowed": True}}))
pairs.append(("SubmitEvidenceResponse", "negative-lease-conflict", {"request": {"Context": ctx("CW-UAT-FAST-001", 2, "evidence:neg:1"), "WorkID": "CW-UAT-FAST-001", "EvidencePacketID": "EVP-UAT-FAST-001-S3_FINANCIAL", "Response": "x", "KnownAssumedUnknown": "ASSUMED"},
    "response": {"Result": "RECONCILIATION_REQUIRED", "ErrorClass": "STALE_LEASE_OR_VERSION", "Message": "Record version changed since read; read back before retry with the same IdempotencyKey.", "ReceiptID": "RCPT-UAT-NEG-004", "RetryAllowed": True, "RetryAfterSeconds": 5}}))

bad = 0
index = {}
err_v = Draft202012Validator(ERR)
for opn, name, pair in pairs:
    if name == "negative-missing-title":  # request is INTENTIONALLY invalid; the contract must reject it and the recorded response must be a valid error envelope
        req_schema = CONTRACT["$defs"][opn]["properties"]["request"]
        req_ok = not list(Draft202012Validator({**req_schema, "$defs": CONTRACT["$defs"]}).iter_errors(pair["request"]))
        errs = ["request unexpectedly valid"] if req_ok else sorted(e.message for e in err_v.iter_errors(pair["response"]))
        pair["_note"] = "request intentionally violates S1.Title minLength; expected outcome is the recorded error envelope"
    else:
        errs = sorted(e.message for e in cv[opn].iter_errors(pair))
    if errs: bad += 1; print("INVALID", opn, name, errs[:2])
    d = OUT / "mock" / opn; d.mkdir(exist_ok=True)
    (d / f"{name}.json").write_text(json.dumps(pair, indent=1) + "\n")
    index.setdefault(opn, []).append(name)
(OUT / "mock" / "index.json").write_text(json.dumps({"pairs": index, "count": len(pairs), "fixtures_sha256": hashlib.sha256((HERE / "out" / "uat-fixtures.json").read_bytes()).hexdigest(),
                                                       "rc2_schema_sha256": {k: manifest[f"02_SCHEMAS/{k}"]["sha256"] for k in ["work-record.v2.schema.json", "evidence-packet.v2.schema.json", "audit-receipt.v1.schema.json"]}}, indent=1) + "\n")
print(f"{len(pairs)} mock pairs, {bad} invalid; contract sha256 {hashlib.sha256((OUT / 'ui-flow-contract.schema.json').read_bytes()).hexdigest()}")
sys.exit(1 if bad else 0)
