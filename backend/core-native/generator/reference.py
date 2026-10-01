"""
Reference implementation of the flow logic (flows 01 + 02) in Python, run against the UI<->flow contract mock
pairs. Purpose: a golden answer for the post-import test, and proof that the records the flows are specified to
write validate against the hash-pinned RC2 schemas. It mirrors the WDL expressions rule-for-rule; where WDL and
Python could diverge (string quoting, date handling) the runbook's post-import checks compare list rows to this.
"""
from __future__ import annotations
import hashlib, json, os, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker

import model as M

HERE = Path(__file__).resolve().parent
RC2 = Path(os.environ.get("RC2_ROOT", HERE.parent / "rc2"))
CONTRACT = Path(os.environ.get("CONTRACT_DIR", HERE.parent / "uat-pack" / "out" / "contract"))
NOW = datetime(2026, 9, 22, 14, 0, 0, tzinfo=timezone.utc)

manifest = {e["path"]: e for e in json.loads((RC2 / "01_MACHINE_CANON" / "release-manifest.json").read_text())["members"]}
def pinned(name):
    raw = (RC2 / "02_SCHEMAS" / name).read_bytes(); assert hashlib.sha256(raw).hexdigest() == manifest[f"02_SCHEMAS/{name}"]["sha256"]
    return Draft202012Validator(json.loads(raw), format_checker=FormatChecker())
V = {k: pinned(f"{k}.schema.json") for k in ["work-record.v2", "evidence-packet.v2", "decision-packet.v2", "event.v2", "audit-receipt.v1"]}
ZERO = "0" * 64
def ts(dt): return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
def cfg_defaults():
    c = {k: json.loads(v) for k, v, *_ in M.seed_config()}; c["EmployeeStatusMap"] = M.EMPLOYEE_STATUS; return c


class Store:
    def __init__(self, cfg):
        self.cfg = cfg; self.cases = {}; self.packets = {}; self.decisions = {}; self.events = []; self.receipts = []; self.outbox = []; self.log = []; self.n = 0
    def uid(self, p): self.n += 1; return f"{p}-{ts(NOW).replace('-', '').replace(':', '').replace('T', '')[:14]}-{self.n:06d}"
    def validate(self, kind, rec):
        e = sorted(x.message for x in V[kind].iter_errors(rec))
        if e: raise AssertionError(f"{kind} invalid: {e[:3]}\n{json.dumps(rec)[:400]}")
        return rec
    def receipt(self, cls, target, before, after, identity, result="PASS", err=None):
        r = {"ReceiptID": self.uid("RCPT"), "OperationID": self.uid("OP"), "OperationClass": cls, "ActorID": identity, "Provider": None, "TargetRef": target,
             "BeforeVersion": before, "AfterVersion": after, "PayloadHash": ZERO, "ReadbackHash": None, "Result": result, "ObservedAt": ts(NOW), "EvidenceRefs": ["cmd:x"], "RollbackResult": None, "ErrorClass": err}
        self.receipts.append(self.validate("audit-receipt.v1", r)); return r["ReceiptID"]
    def event(self, wid, etype, payload, rid, cls, actor=("HUMAN", "x"), key="k", version="1"):
        e = {"EventID": self.uid("EVT"), "WorkID": wid, "EventType": etype, "OccurredAt": ts(NOW), "ActorType": actor[0], "ActorID": actor[1], "Provider": None, "SourceRef": "cmd:x",
             "SourceVersion": version, "CorrelationID": "CORR-X", "CausationID": None, "IdempotencyKey": f"{wid}:{etype}:{key}", "PayloadVersion": "1", "Payload": payload, "AuthorityClass": cls, "ReceiptID": rid, "SchemaVersion": "2.0.0"}
        assert all(x["IdempotencyKey"] != e["IdempotencyKey"] for x in self.events), "duplicate event key"
        self.events.append(self.validate("event.v2", e))


def proj(c, cfg):
    return {"WorkID": c["WorkID"], "Title": c["Title"], "Stage": c["Stage"], "State": c["State"], "EmployeeStatus": cfg["EmployeeStatusMap"][c["State"]], "Lane": c["Lane"], "NextAction": c["NextAction"],
            "NextOwner": c["NextOwner"], "NextDate": c["NextDate"], "Version": c["Version"], "LastValidatedAt": c["LastValidatedAt"], "OpenEvidenceGaps": c["OpenEvidenceGaps"], "DuplicateStatus": c["DuplicateStatus"], "RelatedWorkIDs": c["RelatedWorkIDs"]}


def gaps(s1):
    g = []
    if not (s1.get("ProblemStatement") or ""): g.append("S1_PROBLEM_STATEMENT")
    if not (s1.get("DesiredOutcome") or ""): g.append("S1_DESIRED_OUTCOME")
    if not (s1.get("Sponsor") or ""): g.append("S1_SPONSOR")
    return g


def authorized(c, identity, cfg):
    i = identity.lower()
    return i in {(c.get("Requester") or "").lower(), (c.get("AccountableOwner") or "").lower(), (c.get("Sponsor") or "").lower()} or i in [p.lower() for p in cfg["OperatorPrincipals"]]


# ---------------------------------------------------------------- flow 01 operations
def create_or_resume(st: Store, req, identity, key):
    s1 = req["S1"]; cfg = st.cfg
    if not req.get("WorkID"):
        g = gaps(s1); wid = st.uid("CW")
        dup = [c["WorkID"] for c in st.cases.values() if c["Title"] == s1["Title"]]
        rec = {"WorkID": wid, "WorkType": "IDEA", "Stage": "INTAKE", "State": "READY_FOR_TRIAGE" if not g else "CLARIFYING", "Title": s1["Title"], "ProblemStatement": s1.get("ProblemStatement"),
               "DesiredOutcome": s1.get("DesiredOutcome"), "Requester": s1.get("Requester") or identity, "Department": s1.get("Department"), "Sponsor": s1.get("Sponsor"), "AccountableOwner": s1.get("AccountableOwner"),
               "ResponsibleLead": None, "CreatedAt": ts(NOW), "SourceChannel": s1.get("SourceChannel", "ASK_AI_COE"), "SourceRefs": s1.get("SourceRefs", []), "RelatedWorkIDs": dup,
               "DuplicateStatus": "UNIQUE" if not dup else "POSSIBLE_DUPLICATE", "Lane": "PREPARATION", "ARBTier": None, "AgentRiskTier": None, "PScoreLegacy": None, "PScoreCandidate": "AWAITING_SOURCE",
               "PScoreVersion": None, "PScoreConfidence": "AWAITING_SOURCE", "Lift": "AWAITING_SOURCE", "LiftVersion": None, "DecisionReadiness": "AWAITING_SOURCE", "ReadinessVersion": None,
               "DecisionReadinessState": "NOT_READY", "DecisionRequested": s1.get("DecisionRequested"), "DecisionAuthority": None, "RequiredValidators": [], "ValidationState": "NOT_STARTED",
               "OpenEvidenceGaps": g, "Dependencies": [], "Risks": s1.get("Risks", []), "TaskSystem": None, "CollaborationSurface": None, "CurrentRelease": cfg["CurrentRelease"], "LastValidatedAt": ts(NOW),
               "NextAction": "Deduplicate and derive S2-S5 packets" if not g else "RETURN_TO_REQUESTER_CLARIFY: answer one grouped clarification", "NextOwner": "ai-coe-operator" if not g else (s1.get("Requester") or identity),
               "NextDate": None, "ValueBaselineID": None, "ActualValueID": None, "RetentionClass": cfg["RetentionClass_Default"], "DataClassification": s1.get("DataClassification", "INTERNAL"), "Version": 1}
        st.cases[wid] = st.validate("work-record.v2", rec)
        rid = st.receipt("WRITE_BUSINESS_RECORD", f"work-record:{wid}", "0", "1", identity)
        st.event(wid, "WORK_CREATED", {"Record": rec}, rid, "WRITE_BUSINESS_RECORD", key=key)
        if g: st.event(wid, "CLARIFICATION_REQUESTED", {"Gaps": g}, rid, "WRITE_BUSINESS_RECORD", actor=("SERVICE", "AI CoE 01 Case Command"), key=key)
        return {"Result": "PASS", "ReceiptID": rid, "Work": proj(rec, cfg), "Created": True, "ClarificationRequired": g}
    c = st.cases.get(req["WorkID"])
    if not c: return {"Result": "FAIL", "ErrorClass": "NOT_FOUND", "Message": "No Work record with this ID.", "ReceiptID": st.receipt("READ", "n/a", "n/a", None, identity, "FAIL", "NOT_FOUND"), "RetryAllowed": False}
    if not authorized(c, identity, cfg): return {"Result": "DENIED", "ErrorClass": "NOT_AUTHORIZED", "Message": "not authorized", "ReceiptID": st.receipt("READ", "n/a", "n/a", None, identity, "DENIED", "NOT_AUTHORIZED"), "RetryAllowed": False}
    before = c["Version"]; merged = dict(c)
    for k in ["Title", "ProblemStatement", "DesiredOutcome", "Sponsor", "AccountableOwner", "Department", "DecisionRequested"]:
        if s1.get(k) is not None: merged[k] = s1[k]
    merged["Risks"] = sorted(set(c["Risks"]) | set(s1.get("Risks", [])))
    g = gaps(merged); merged["OpenEvidenceGaps"] = g
    merged["State"] = "CLARIFYING" if g else ("READY_FOR_TRIAGE" if c["State"] in ("DRAFT", "CLARIFYING") else c["State"])
    merged["Version"] = before + 1; merged["LastValidatedAt"] = ts(NOW)
    merged["NextAction"] = "Deduplicate and derive S2-S5 packets" if not g else "RETURN_TO_REQUESTER_CLARIFY: answer one grouped clarification"; merged["NextOwner"] = "ai-coe-operator" if not g else c["Requester"]
    st.cases[c["WorkID"]] = st.validate("work-record.v2", merged)
    rid = st.receipt("WRITE_BUSINESS_RECORD", f"work-record:{c['WorkID']}", str(before), str(before + 1), identity)
    st.event(c["WorkID"], "S1_COMPLETED" if not g else "S1_UPDATED", {"Gaps": g}, rid, "WRITE_BUSINESS_RECORD", key=key, version=str(before))
    return {"Result": "PASS", "ReceiptID": rid, "Work": proj(merged, cfg), "Created": False, "ClarificationRequired": g}


def get_status(st, req, identity):
    c = st.cases.get(req["WorkID"])
    if not c: return {"Result": "FAIL", "ErrorClass": "NOT_FOUND", "Message": "No Work record with this ID.", "ReceiptID": st.receipt("READ", "n/a", "n/a", None, identity, "FAIL", "NOT_FOUND"), "RetryAllowed": False}
    if not authorized(c, identity, st.cfg): return {"Result": "DENIED", "ErrorClass": "NOT_AUTHORIZED", "Message": "not authorized", "ReceiptID": st.receipt("READ", "n/a", "n/a", None, identity, "DENIED", "NOT_AUTHORIZED"), "RetryAllowed": False}
    return {"Result": "PASS", "ReceiptID": st.receipt("READ", f"work-record:{c['WorkID']}", str(c["Version"]), None, identity), "Work": proj(c, st.cfg)}


def list_my_work(st, req, identity):
    if (req.get("Requester") or "").lower() != identity.lower():
        return {"Result": "DENIED", "ErrorClass": "NOT_AUTHORIZED", "Message": "own work only", "ReceiptID": st.receipt("READ", "n/a", "n/a", None, identity, "DENIED", "NOT_AUTHORIZED"), "RetryAllowed": False}
    items = [proj(c, st.cfg) for c in st.cases.values() if identity.lower() in {(c.get("Requester") or "").lower(), (c.get("AccountableOwner") or "").lower(), (c.get("Sponsor") or "").lower()}]
    return {"Result": "PASS", "ReceiptID": st.receipt("READ", f"work-record:list:{identity}", "n/a", None, identity), "Items": items}


def submit_evidence(st, req, identity, key):
    p = st.packets.get(req["EvidencePacketID"])
    if not p or p["WorkID"] != req["WorkID"]: return {"Result": "FAIL", "ErrorClass": "NOT_FOUND", "Message": "no packet", "ReceiptID": st.receipt("READ", "n/a", "n/a", None, identity, "FAIL", "NOT_FOUND"), "RetryAllowed": False}
    ok = identity.lower() in {(p.get("AssignedPerson") or "").lower()} | {x.lower() for x in st.cfg["EvidenceValidators"]} | {x.lower() for x in st.cfg["OperatorPrincipals"]}
    if not ok: return {"Result": "DENIED", "ErrorClass": "NOT_AUTHORIZED", "Message": "not validator", "ReceiptID": st.receipt("READ", "n/a", "n/a", None, identity, "DENIED", "NOT_AUTHORIZED"), "RetryAllowed": False}
    if p["Status"] not in ("OPEN", "ASSIGNED", "AWAITING_RESPONSE", "RETURNED"): return {"Result": "FAIL", "ErrorClass": "INVALID_STATE", "Message": "closed", "ReceiptID": st.receipt("READ", "n/a", "n/a", None, identity, "FAIL", "INVALID_STATE"), "RetryAllowed": False}
    before = p["Version"]; p = dict(p); p.update({"Status": "RETURNED", "Response": req["Response"], "KnownAssumedUnknown": req["KnownAssumedUnknown"], "ReturnedAt": ts(NOW), "FreshnessState": "CURRENT", "Version": before + 1})
    st.packets[p["EvidencePacketID"]] = st.validate("evidence-packet.v2", p)
    rid = st.receipt("WRITE_BUSINESS_RECORD", f"evidence-packet:{p['EvidencePacketID']}", str(before), str(before + 1), identity)
    st.event(req["WorkID"], "EVIDENCE_RETURNED", {"EvidencePacketID": p["EvidencePacketID"]}, rid, "WRITE_BUSINESS_RECORD", key=key)
    return {"Result": "PASS", "ReceiptID": rid, "Work": proj(st.cases[req["WorkID"]], st.cfg), "PacketStatus": "RETURNED"}


def request_readiness(st, req, identity, key):
    cfg = st.cfg; c = st.cases.get(req["WorkID"])
    if not c: return {"Result": "FAIL", "ErrorClass": "NOT_FOUND", "Message": "no case", "ReceiptID": st.receipt("READ", "n/a", "n/a", None, identity, "FAIL", "NOT_FOUND"), "RetryAllowed": False}
    if not authorized(c, identity, cfg): return {"Result": "DENIED", "ErrorClass": "NOT_AUTHORIZED", "Message": "not authorized", "ReceiptID": st.receipt("READ", "n/a", "n/a", None, identity, "DENIED", "NOT_AUTHORIZED"), "RetryAllowed": False}
    pk = [p for p in st.packets.values() if p["WorkID"] == c["WorkID"]]
    req_p = [p for p in pk if p["Applicability"] == "REQUIRED"]; closed = [p for p in req_p if p["Status"] in ("VALIDATED", "NOT_APPLICABLE")]; val = [p for p in pk if p["Status"] == "VALIDATED"]
    stale = [p for p in val if datetime.fromisoformat(p["ReturnedAt"].replace("Z", "+00:00")) < NOW - timedelta(days=cfg["FreshnessDays"])]
    s4 = [p for p in val if p["EvidenceType"] == "S4_TECHNICAL"]
    critical = [r for r in c["Risks"] if r.startswith("CRITICAL_")]; triggers = [r[8:].lower() for r in c["Risks"] if r.startswith("TRIGGER_")]
    lane = "ELT" if set(triggers) & set(cfg["ELT_TRIGGERS"]) else "ARB" if set(triggers) & set(cfg["ARB_TRIGGERS"]) else "AI_COE_FAST_PATH" if (cfg["DelegatedFastPathEnabled"] and not triggers) else "PREPARATION"
    rule = ("ELT_PRECEDENCE:" + ",".join(sorted(set(triggers) & set(cfg["ELT_TRIGGERS"])))) if lane == "ELT" else ("ARB_TRIGGER:" + ",".join(sorted(set(triggers) & set(cfg["ARB_TRIGGERS"])))) if lane == "ARB" else "DELEGATED_BOUNDED_LOW_RISK" if lane == "AI_COE_FAST_PATH" else "NO_DELEGATION_OR_RISK_UNKNOWN"
    authority = cfg.get(f"Authority_{lane}", "")
    s2s5 = "AWAITING_SOURCE" if not pk else ("PASS" if len(closed) == len(req_p) else "AWAITING_VALIDATION")
    gates = {"ACCOUNTABLE_OWNER": "FAIL" if not c["AccountableOwner"] else "PASS", "DECISION_REQUESTED": "FAIL" if not c["DecisionRequested"] else "PASS", "S2_S5_COMPLETE_OR_NA": s2s5, "SME_VALIDATIONS_COMPLETE": s2s5,
             "NO_CRITICAL_UNRESOLVED_RISK": "FAIL" if critical else "PASS", "ASSUMPTIONS_VISIBLE": s2s5, "DECISION_AUTHORITY_KNOWN": "AWAITING_SOURCE" if (lane == "PREPARATION" or not authority) else "PASS",
             "IMPLEMENTATION_PATH_UNDERSTOOD": "PASS" if s4 else "AWAITING_VALIDATION", "EVIDENCE_FRESHNESS": "AWAITING_VALIDATION" if not val else ("FAIL" if stale else "PASS")}
    rows = [{"GateID": g, "Applicable": True, "State": s, "EvidenceRefs": [f"basis:{g}"]} for g, s in gates.items()]
    blocking = [g for g, s in gates.items() if s != "PASS"]; score = (100 * (9 - len(blocking))) // 9; ready = not blocking
    before = c["Version"]; c = dict(c); c.update({"Stage": "DECISION", "DecisionReadiness": score, "ReadinessVersion": cfg["GatesVersion"], "DecisionReadinessState": "READY" if ready else "NOT_READY", "Version": before + 1, "LastValidatedAt": ts(NOW)})
    dpid = None
    if ready:
        dpid = st.uid("DP"); target = "DECISION_READY" if lane == "PREPARATION" else "READY_FOR_AI_COE" if lane == "AI_COE_FAST_PATH" else f"READY_FOR_{lane}"
        dp = {"DecisionPacketID": dpid, "WorkID": c["WorkID"], "DecisionRequested": c["DecisionRequested"], "DecisionAuthority": authority, "DecisionAuthoritySource": "AI CoE Definitions", "DecisionParticipantsRequired": [],
              "DelegatedAuthorityClass": "WRITE_LOW_RISK" if lane == "AI_COE_FAST_PATH" else None, "DecisionDeadline": ts(NOW + timedelta(days=7)), "PScore": "AWAITING_VALIDATION", "PScoreVersion": cfg["PolicyVersion"], "PScoreConfidence": "AWAITING_VALIDATION",
              "Lift": "AWAITING_VALIDATION", "LiftVersion": cfg["PolicyVersion"], "DecisionReadiness": score, "ReadinessVersion": cfg["GatesVersion"], "ReadinessState": "READY", "ReadinessGates": rows, "Options": ["approve", "approve_with_conditions", "defer", "reject"],
              "Recommendation": None, "RecommendationBasis": None, "KnownFacts": [], "Assumptions": [], "Unknowns": [], "Risks": c["Risks"], "Dependencies": c["Dependencies"], "EvidenceRefs": sorted(f"{p['EvidencePacketID']}@v{p['Version']}" for p in pk), "Conditions": [],
              "PayloadHash": req.get("PayloadHash") or ZERO, "EvidenceSetHash": req.get("EvidenceSetHash") or ZERO, "BusinessCaseVersion": str(before + 1), "Status": "READY_FOR_DECISION", "ExpiresAt": ts(NOW + timedelta(days=30)), "Version": 1}
        st.decisions[dpid] = st.validate("decision-packet.v2", dp)
        c.update({"State": target, "Lane": lane, "DecisionAuthority": authority, "ValidationState": "COMPLETE", "OpenEvidenceGaps": [], "NextAction": f"Decision by {authority} on packet {dpid}", "NextOwner": authority})
    else:
        c.update({"State": "NOT_DECISION_READY", "Lane": "PREPARATION", "OpenEvidenceGaps": blocking, "NextAction": "Close gates: " + ", ".join(blocking), "NextOwner": "ai-coe-operator"})
    st.cases[c["WorkID"]] = st.validate("work-record.v2", c)
    rid = st.receipt("WRITE_BUSINESS_RECORD", f"work-record:{c['WorkID']}", str(before), str(before + 1), identity)
    st.event(c["WorkID"], "READINESS_EVALUATED", {"ReadinessState": c["DecisionReadinessState"], "Score": score, "Blocking": blocking}, rid, "WRITE_BUSINESS_RECORD", actor=("SERVICE", "AI CoE 01 Case Command"), key=key)
    if ready: st.event(c["WorkID"], "ROUTE_DETERMINED", {"Lane": lane, "RuleFired": rule}, rid, "READ", actor=("SERVICE", "routing-policy"), key=key)
    return {"Result": "PASS", "ReceiptID": rid, "Work": proj(c, cfg), "DecisionReadinessState": c["DecisionReadinessState"], "BlockingGates": blocking, "DecisionPacketID": dpid}


# ---------------------------------------------------------------- flow 02
def flow02_cycle(st: Store):
    cfg = st.cfg
    for c in list(st.cases.values()):
        if (c["State"] == "READY_FOR_TRIAGE" or (c["State"] == "NOT_DECISION_READY" and c["ValidationState"] == "NOT_STARTED")) and c["DuplicateStatus"] != "CONFIRMED_DUPLICATE":
            have = {p["EvidenceType"] for p in st.packets.values() if p["WorkID"] == c["WorkID"]}
            for t in M.PACKET_TYPES:
                if t in have: continue
                d = cfg["PacketDefaults"][t]
                p = {"EvidencePacketID": f"EVP-{c['WorkID'][3:]}-{t}", "WorkID": c["WorkID"], "EvidenceType": t, "ReasonRequired": "Decision readiness hard gate S2_S5_COMPLETE_OR_NA", "Questions": [d["q"]], "AssignedRole": d["role"],
                     "AssignedPerson": None, "SourceRefs": [f"case:{c['WorkID']}"], "DueAt": ts(NOW + timedelta(days=cfg["PacketDueDays"])), "Status": "AWAITING_RESPONSE", "Applicability": "REQUIRED", "Response": None, "ValidatorAssertion": None,
                     "Confidence": None, "KnownAssumedUnknown": "UNKNOWN", "FreshnessState": "UNPROVED", "Version": 1}
                st.packets[p["EvidencePacketID"]] = st.validate("evidence-packet.v2", p); st.outbox.append({"WorkID": c["WorkID"], "State": "QUEUED"})
            c = dict(c); c.update({"Stage": "EVIDENCE", "State": "AWAITING_SME", "RequiredValidators": list(M.PACKET_TYPES), "OpenEvidenceGaps": list(M.PACKET_TYPES), "ValidationState": "IN_PROGRESS", "Version": c["Version"] + 1, "LastValidatedAt": ts(NOW), "NextAction": "Validators return S2-S5 packets", "NextOwner": "validators"})
            st.cases[c["WorkID"]] = st.validate("work-record.v2", c)
            st.event(c["WorkID"], "EVIDENCE_PACKETS_ISSUED", {"Types": M.PACKET_TYPES}, st.uid("RCPT"), "WRITE_BUSINESS_RECORD", actor=("SERVICE", "AI CoE 02"), key=str(c["Version"]))
    if cfg["AutoValidateReturnedPackets"]:
        for p in list(st.packets.values()):
            if p["Status"] == "RETURNED":
                p = dict(p); p.update({"Status": "VALIDATED", "ValidatorAssertion": "AUTO_VALIDATED_UAT (provisional)", "FreshnessState": "CURRENT", "Confidence": "AWAITING_VALIDATION" if False else None, "Version": p["Version"] + 1})
                st.packets[p["EvidencePacketID"]] = st.validate("evidence-packet.v2", p); st.log.append(("Warning", f"UAT auto-validated {p['EvidencePacketID']}"))
    for c in list(st.cases.values()):
        if c["State"] == "AWAITING_SME":
            open_t = [p["EvidenceType"] for p in st.packets.values() if p["WorkID"] == c["WorkID"] and p["Applicability"] == "REQUIRED" and p["Status"] not in ("VALIDATED", "NOT_APPLICABLE")]
            if open_t != c["OpenEvidenceGaps"]:
                c = dict(c); c.update({"OpenEvidenceGaps": open_t, "State": "EVIDENCE_BUILDING" if not open_t else "AWAITING_SME", "ValidationState": "COMPLETE" if not open_t else "IN_PROGRESS", "Version": c["Version"] + 1, "LastValidatedAt": ts(NOW),
                                       "NextAction": "Request decision readiness (RequestDecisionReadiness)" if not open_t else "Validators return: " + ", ".join(open_t), "NextOwner": "ai-coe-operator" if not open_t else "validators"})
                st.cases[c["WorkID"]] = st.validate("work-record.v2", c)


# ---------------------------------------------------------------- golden scenario
def run():
    cfg = cfg_defaults(); cfg["EvidenceValidators"] = ["finance.validator@example.invalid"]; cfg["OperatorPrincipals"] = ["ai-coe-operator@example.invalid"]
    st = Store(cfg); golden = []
    def G(cid, cond, detail): golden.append({"case": cid, "result": "PASS" if cond else "FAIL", "detail": detail}); assert cond, f"{cid}: {detail}"
    A = "uat-analyst@example.invalid"; B = "uat-other@example.invalid"; OP = "ai-coe-operator@example.invalid"; FIN = "finance.validator@example.invalid"
    # T1 create with incomplete S1
    r = create_or_resume(st, {"S1": {"Title": "UAT: automate weekly reporting inside approved tool", "SourceChannel": "ASK_AI_COE_UAT", "DesiredOutcome": "Reduce manual effort"}, "WorkID": None}, A, "k1")
    wid = r["Work"]["WorkID"]
    G("T1", r["Result"] == "PASS" and r["Work"]["State"] == "CLARIFYING" and r["Work"]["EmployeeStatus"] == "Need one answer" and r["ClarificationRequired"] == ["S1_PROBLEM_STATEMENT", "S1_SPONSOR"], f"create -> {r['Work']['State']} gaps {r['ClarificationRequired']}")
    # T2 other user denied
    r2 = get_status(st, {"WorkID": wid}, B); G("T2", r2["Result"] == "DENIED" and r2["ErrorClass"] == "NOT_AUTHORIZED", "other user's status is DENIED")
    r3 = get_status(st, {"WorkID": "CW-NONE-999"}, A); G("T3", r3["Result"] == "FAIL" and r3["ErrorClass"] == "NOT_FOUND", "unknown id NOT_FOUND")
    # T4 resume completes S1 (+ sponsor, owner, decision requested, one ARB trigger)
    r4 = create_or_resume(st, {"WorkID": wid, "S1": {"ProblemStatement": "Weekly report takes 6h", "Sponsor": "sponsor@example.invalid", "AccountableOwner": "owner@example.invalid", "DecisionRequested": "Approve bounded pilot", "Risks": ["TRIGGER_NEW_VENDOR"]}}, A, "k2")
    G("T4", r4["Result"] == "PASS" and r4["Work"]["State"] == "READY_FOR_TRIAGE" and r4["Created"] is False and r4["Work"]["Version"] == 2, f"resume -> {r4['Work']['State']} v{r4['Work']['Version']}")
    # T5 readiness before evidence -> NOT_READY, no packets => AWAITING_SOURCE gates; no board route
    r5 = request_readiness(st, {"WorkID": wid}, OP, "k3")
    G("T5", r5["DecisionReadinessState"] == "NOT_READY" and "S2_S5_COMPLETE_OR_NA" in r5["BlockingGates"] and r5["DecisionPacketID"] is None and st.cases[wid]["Lane"] == "PREPARATION", f"blocking {r5['BlockingGates']}")
    # T5a: a case evaluated before triage is NOT stranded — flow 02 also triages NOT_DECISION_READY + ValidationState NOT_STARTED (finding F-013)
    # T6 flow 02 issues 4 packets
    flow02_cycle(st); pk = [p for p in st.packets.values() if p["WorkID"] == wid]
    G("T6", len(pk) == 4 and st.cases[wid]["State"] == "AWAITING_SME" and st.cases[wid]["OpenEvidenceGaps"] == M.PACKET_TYPES and len(st.outbox) == 4, f"{len(pk)} packets, case {st.cases[wid]['State']}, {len(st.outbox)} outbox rows (QUEUED, not sent)")
    # T7 non-validator denied; validator returns S3
    r7 = submit_evidence(st, {"WorkID": wid, "EvidencePacketID": f"EVP-{wid[3:]}-S3_FINANCIAL", "Response": "Baseline 6h/week", "KnownAssumedUnknown": "KNOWN"}, B, "k4")
    G("T7", r7["Result"] == "DENIED", "non-validator DENIED")
    for t in M.PACKET_TYPES:
        r8 = submit_evidence(st, {"WorkID": wid, "EvidencePacketID": f"EVP-{wid[3:]}-{t}", "Response": "UAT response", "KnownAssumedUnknown": "KNOWN"}, FIN, f"k5{t}")
        G(f"T8-{t}", r8["Result"] == "PASS" and r8["PacketStatus"] == "RETURNED", f"{t} RETURNED")
    # T9 flow 02 auto-validates (UAT) and closes gaps
    flow02_cycle(st)
    G("T9", all(p["Status"] == "VALIDATED" for p in st.packets.values() if p["WorkID"] == wid) and st.cases[wid]["OpenEvidenceGaps"] == [] and st.cases[wid]["State"] == "EVIDENCE_BUILDING" and st.cases[wid]["ValidationState"] == "COMPLETE", f"case {st.cases[wid]['State']} gaps {st.cases[wid]['OpenEvidenceGaps']}")
    # T10 readiness with ARB trigger but no ARB authority bound -> NOT_READY on DECISION_AUTHORITY_KNOWN only
    r10 = request_readiness(st, {"WorkID": wid}, OP, "k6")
    G("T10", r10["DecisionReadinessState"] == "NOT_READY" and r10["BlockingGates"] == ["DECISION_AUTHORITY_KNOWN"] and r10["Work"]["State"] == "NOT_DECISION_READY", f"blocking {r10['BlockingGates']} (Authority_ARB blank => cannot cite ARB)")
    # T11 bind ARB authority -> READY_FOR_ARB, packet created, no approval
    st.cfg["Authority_ARB"] = "arb-owner@example.invalid"
    r11 = request_readiness(st, {"WorkID": wid, "PayloadHash": "a" * 64, "EvidenceSetHash": "b" * 64}, OP, "k7")
    dp = st.decisions[r11["DecisionPacketID"]]
    G("T11", r11["DecisionReadinessState"] == "READY" and r11["Work"]["State"] == "READY_FOR_ARB" and r11["Work"]["Lane"] == "ARB" and dp["Status"] == "READY_FOR_DECISION" and dp["PayloadHash"] == "a" * 64 and r11["Work"]["EmployeeStatus"] == "With the right reviewer",
      f"{r11['Work']['State']} packet {dp['DecisionPacketID']} status {dp['Status']} hash provenance CLIENT_COMPUTED; no approval object")
    # T12 ListMyWork own only; other user's list denied when asking for someone else
    r12 = list_my_work(st, {"Requester": A}, A); G("T12", r12["Result"] == "PASS" and len(r12["Items"]) == 1, "own work listed")
    r13 = list_my_work(st, {"Requester": A}, B); G("T13", r13["Result"] == "DENIED", "listing someone else's work DENIED")
    # T14 second idea with ELT trigger and fast path off -> after evidence, ELT precedence
    r14 = create_or_resume(st, {"S1": {"Title": "UAT: enterprise model routing platform", "SourceChannel": "ASK_AI_COE_UAT", "ProblemStatement": "p", "DesiredOutcome": "o", "Sponsor": "s@example.invalid", "AccountableOwner": "o@example.invalid", "DecisionRequested": "Approve", "Risks": ["TRIGGER_NEW_TOOL", "TRIGGER_MATERIAL_INVESTMENT"]}, "WorkID": None}, A, "k8")
    w2 = r14["Work"]["WorkID"]; G("T14", r14["Work"]["State"] == "READY_FOR_TRIAGE" and r14["ClarificationRequired"] == [], "complete S1 goes straight to READY_FOR_TRIAGE")
    flow02_cycle(st)
    for t in M.PACKET_TYPES: submit_evidence(st, {"WorkID": w2, "EvidencePacketID": f"EVP-{w2[3:]}-{t}", "Response": "r", "KnownAssumedUnknown": "KNOWN"}, FIN, f"k9{t}")
    flow02_cycle(st); st.cfg["Authority_ELT"] = "elt@example.invalid"
    r15 = request_readiness(st, {"WorkID": w2}, OP, "k10")
    G("T15", r15["Work"]["State"] == "READY_FOR_ELT" and r15["Work"]["Lane"] == "ELT", f"ELT precedence over ARB trigger: {r15['Work']['Lane']}")
    # T16 duplicate title -> POSSIBLE_DUPLICATE with related id
    r16 = create_or_resume(st, {"S1": {"Title": "UAT: automate weekly reporting inside approved tool", "SourceChannel": "ASK_AI_COE_UAT"}, "WorkID": None}, A, "k11")
    G("T16", r16["Work"]["DuplicateStatus"] == "POSSIBLE_DUPLICATE" and wid in r16["Work"]["RelatedWorkIDs"], "exact-title duplicate flagged, related id linked")
    # T17 all records schema-valid (already asserted on write); counts
    G("T17", len(st.events) >= 12 and len(st.receipts) >= 12 and len({e["IdempotencyKey"] for e in st.events}) == len(st.events), f"{len(st.events)} events with distinct idempotency keys, {len(st.receipts)} receipts, all RC2-valid")
    return st, golden


if __name__ == "__main__":
    st, golden = run()
    out = Path(os.environ.get("OUT", HERE / "out")); out.mkdir(exist_ok=True)
    (out / "golden-assertions.json").write_text(json.dumps({"scenario_clock": ts(NOW), "cases": golden, "records": {"cases": len(st.cases), "packets": len(st.packets), "decisions": len(st.decisions), "events": len(st.events), "receipts": len(st.receipts), "outbox_queued_not_sent": len(st.outbox)},
                                                              "rc2_schema_sha256": {k: manifest[f"02_SCHEMAS/{k}.schema.json"]["sha256"] for k in V}}, indent=1) + "\n")
    (out / "golden-state.json").write_text(json.dumps({"cases": st.cases, "packets": st.packets, "decisions": st.decisions, "events": st.events, "receipts": st.receipts}, indent=1) + "\n")
    for g in golden: print(f"  {g['result']}  {g['case']}: {g['detail']}")
    print(f"records: {len(st.cases)} cases, {len(st.packets)} packets, {len(st.decisions)} decision packets, {len(st.events)} events, {len(st.receipts)} receipts — all validated against RC2 schemas")
