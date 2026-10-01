"""
AICoECoreAutomation 3.0.0.0 — data model (SharePoint lists) and configuration seed.

List names: v3.2 physical map (CW-AICOE-PRODUCTION-IMPLEMENTATION-ROUTE-AND-PHYSICAL-MAP-v1, the active pointer),
plus 'AI CoE Case Command' (UI<->flow contract binding A) and 'AI Automation Log' (2.1 lineage).
Column internal names: RC2 3.4.0-rc2 schema field names verbatim, except the SharePoint 'Title' column which
carries each list's primary key (WorkID / EvidencePacketID / ...); RC2 work-record 'Title' maps to 'WorkTitle'.
Scores are Text columns because RC2 allows a number OR a state word (never zero-fill). The full canonical record
is always stored verbatim in 'RecordJson' so schema validation can run over exactly what the flow wrote.
"""
from __future__ import annotations

SOLUTION_UNIQUE = "AICoECoreAutomation"
SOLUTION_VERSION = "3.0.0.0"
SOLUTION_DISPLAY = "AI CoE Core Automation"
PUBLISHER_UNIQUE = "aicoe"
PUBLISHER_PREFIX = "aicoe"
PUBLISHER_DISPLAY = "AI CoE"
RELEASE = "3.4.0-rc2"
POLICY_VERSION = "uat-transcribed-v3.4-s10"  # transcribed from v3.4 design s9-11; YAML unreadable over connector
GATES_VERSION = "readiness-gates-v1"           # gate-count model, NOT the v3.4 weighted readiness model
DEFAULT_SITE = "https://parkplace.sharepoint.com/sites/AICoE-PrivatePilot"

ENV_VARS = [  # definitions with defaults, NO value records (2.1 decision)
    ("aicoe_SiteUrl", DEFAULT_SITE, "SharePoint site that hosts the AI CoE lists. Set per environment."),
    ("aicoe_NotificationEmail", "REPLACE-BEFORE-ENABLING.invalid", "Alert address. Invalid on purpose until set."),
    ("aicoe_EnvironmentLabel", "Pilot", "Appears in log rows and outbox subjects."),
]

WORK_STATES = ["DRAFT", "CLARIFYING", "READY_FOR_TRIAGE", "EVIDENCE_BUILDING", "AWAITING_SME", "NOT_DECISION_READY", "DECISION_READY",
               "READY_FOR_AI_COE", "READY_FOR_ARB", "READY_FOR_ELT", "APPROVED", "APPROVED_WITH_CONDITIONS", "DEFERRED", "REJECTED",
               "PROJECT_ACTIVATING", "IN_DELIVERY", "AT_RISK", "BLOCKED", "VALUE_REVIEW", "OPERATING", "IMPROVEMENT_PROPOSED",
               "REVALIDATION_REQUIRED", "RETIRED"]
STAGES = ["INTAKE", "EVIDENCE", "DECISION", "DELIVERY", "VALUE", "IMPROVEMENT", "CLOSED"]
LANES = ["PREPARATION", "AI_COE_FAST_PATH", "ARB", "ELT"]
EMPLOYEE_STATUS = {
    "DRAFT": "Started", "CLARIFYING": "Need one answer", "READY_FOR_TRIAGE": "Working", "EVIDENCE_BUILDING": "Working",
    "AWAITING_SME": "With the right reviewer", "NOT_DECISION_READY": "Working", "DECISION_READY": "With the right reviewer",
    "READY_FOR_AI_COE": "With the right reviewer", "READY_FOR_ARB": "With the right reviewer", "READY_FOR_ELT": "With the right reviewer",
    "APPROVED": "Ready for you", "APPROVED_WITH_CONDITIONS": "Ready for you", "DEFERRED": "Ready for you", "REJECTED": "Done",
    "PROJECT_ACTIVATING": "Working", "IN_DELIVERY": "Working", "AT_RISK": "Working", "BLOCKED": "Working",
    "VALUE_REVIEW": "Ready for you", "OPERATING": "Done", "IMPROVEMENT_PROPOSED": "Ready for you", "REVALIDATION_REQUIRED": "Working", "RETIRED": "Done",
}
HARD_GATES = ["ACCOUNTABLE_OWNER", "DECISION_REQUESTED", "S2_S5_COMPLETE_OR_NA", "SME_VALIDATIONS_COMPLETE", "NO_CRITICAL_UNRESOLVED_RISK",
              "ASSUMPTIONS_VISIBLE", "DECISION_AUTHORITY_KNOWN", "IMPLEMENTATION_PATH_UNDERSTOOD", "EVIDENCE_FRESHNESS"]
PACKET_TYPES = ["S2_CUSTOMER_MARKET", "S3_FINANCIAL", "S4_TECHNICAL", "S5_RISK_COMPLIANCE"]

# column spec: (internal name, type, options) ; types: Text, Note, Number, DateTime, Boolean, Choice(values), Counter
def T(n, **o): return (n, "Text", o)
def N(n, **o): return (n, "Note", o)
def Num(n, **o): return (n, "Number", o)
def DT(n, **o): return (n, "DateTime", o)
def B(n, **o): return (n, "Boolean", o)
def C(n, values, **o): return (n, "Choice", {"values": values, **o})

RESULTS = ["PENDING", "PASS", "FAIL", "DENIED", "INCONCLUSIVE", "RECONCILIATION_REQUIRED"]

LISTS = {
    # key: (title, template, title_means, columns)
    "Command": ("AI CoE Case Command", 100, "IdempotencyKey (unique, required)", [
        C("Operation", ["CreateOrResumeWork", "GetWorkStatus", "ListMyWork", "SubmitEvidenceResponse", "RequestDecisionReadiness"], required=True),
        T("WorkID", indexed=True), N("RequestJson", required=True), N("ResponseJson"), C("Result", RESULTS, default="PENDING", indexed=True),
        T("ReceiptID"), T("CorrelationID"), B("Claimed", default=False, indexed=True), T("ClaimToken"), DT("ClaimedAt"), DT("CompletedAt"),
        T("ErrorClass"), B("TestRecord", default=False),
    ]),
    "Cases": ("AI CoE Cases", 100, "WorkID (unique, required)", [
        T("WorkTitle", required=True), C("WorkType", ["IDEA", "CASE", "DECISION", "PROJECT", "IMPROVEMENT", "ADMIN_WORK", "STRATEGIC_CASE"]),
        C("Stage", STAGES, indexed=True), C("State", WORK_STATES, indexed=True), T("EmployeeStatus"),
        N("ProblemStatement"), N("DesiredOutcome"), T("Requester", indexed=True), T("Department"), T("Sponsor"), T("AccountableOwner", indexed=True), T("ResponsibleLead"),
        DT("CreatedAt"), T("SourceChannel"), N("SourceRefs"), N("RelatedWorkIDs"),
        C("DuplicateStatus", ["NOT_CHECKED", "UNIQUE", "POSSIBLE_DUPLICATE", "CONFIRMED_DUPLICATE", "RELATED_NOT_DUPLICATE"]),
        C("Lane", LANES), T("ARBTier"), T("AgentRiskTier"), T("PScoreLegacy"), T("PScoreCandidate"), T("PScoreVersion"), T("PScoreConfidence"),
        T("Lift"), T("LiftVersion"), T("DecisionReadiness"), T("ReadinessVersion"),
        C("DecisionReadinessState", ["NOT_READY", "READY", "REVALIDATION_REQUIRED", "NOT_APPLICABLE"]),
        N("DecisionRequested"), T("DecisionAuthority"), N("RequiredValidators"),
        C("ValidationState", ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "FAILED", "NOT_APPLICABLE"]),
        N("OpenEvidenceGaps"), N("Dependencies"), N("Risks"), T("TaskSystem"), T("CollaborationSurface"), T("CurrentRelease"),
        DT("LastValidatedAt"), N("NextAction"), T("NextOwner"), T("NextDate"), T("ValueBaselineID"), T("ActualValueID"), T("RetentionClass"),
        C("DataClassification", ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]), Num("Version"), N("RecordJson"), B("TestRecord", default=False),
    ]),
    "Evidence": ("AI CoE Evidence Value", 100, "EvidencePacketID / ValueRecordID (unique, required)", [
        T("WorkID", indexed=True, required=True), C("RecordKind", ["EVIDENCE_PACKET", "VALUE_RECORD"]), T("EvidenceType", indexed=True), N("ReasonRequired"),
        N("Questions"), T("AssignedRole"), T("AssignedPerson", indexed=True), N("SourceRefs"), DT("DueAt"),
        C("Status", ["OPEN", "ASSIGNED", "AWAITING_RESPONSE", "RETURNED", "VALIDATED", "REJECTED", "EXPIRED", "NOT_APPLICABLE"], indexed=True),
        C("Applicability", ["REQUIRED", "CONDITIONAL", "NOT_APPLICABLE"]), N("Response"), N("ValidatorAssertion"), T("Confidence"),
        C("KnownAssumedUnknown", ["KNOWN", "ASSUMED", "UNKNOWN", "MIXED"]), C("FreshnessState", ["CURRENT", "STALE", "UNPROVED", "NOT_APPLICABLE"]),
        DT("ReturnedAt"), DT("LastReminderAt"), DT("EscalationAt"), Num("Version"), N("RecordJson"), B("TestRecord", default=False),
    ]),
    "Decisions": ("AI CoE Decisions Changes", 100, "DecisionPacketID / ApprovalID (unique, required)", [
        T("WorkID", indexed=True, required=True), C("RecordKind", ["DECISION_PACKET", "APPROVAL", "CHANGE"]),
        C("Status", ["DRAFT", "READY_FOR_DECISION", "APPROVED", "APPROVED_WITH_CONDITIONS", "DEFERRED", "REJECTED", "INVALIDATED"], indexed=True),
        C("ReadinessState", ["READY", "NOT_READY", "REVALIDATION_REQUIRED"]), N("ReadinessGates"), N("BlockingGates"), T("Lane"), T("RuleFired"),
        T("PayloadHash"), T("EvidenceSetHash"), C("HashProvenance", ["CLIENT_COMPUTED", "NOT_PROVIDED"]), T("BusinessCaseVersion"),
        N("DecisionRequested"), T("DecisionAuthority"), T("DecisionAuthoritySource"), DT("ExpiresAt"), T("ApprovalID"), Num("Version"), N("RecordJson"), B("TestRecord", default=False),
    ]),
    "Events": ("AI CoE Lifecycle Events", 100, "EventID (unique, required) — append-only", [
        T("WorkID", indexed=True, required=True), T("EventType", indexed=True), DT("OccurredAt"), C("ActorType", ["HUMAN", "AI", "SERVICE", "SYSTEM"]), T("ActorID"),
        T("CorrelationID"), T("IdempotencyKey", unique=True, required=True), T("AuthorityClass"), T("ReceiptID"), T("SourceVersion"), N("Payload"), B("TestRecord", default=False),
    ]),
    "Receipts": ("AI CoE Audit Receipts", 100, "ReceiptID (unique, required) — never overwritten", [
        T("OperationID", required=True), T("OperationClass"), T("ActorID"), T("TargetRef", indexed=True), T("BeforeVersion"), T("AfterVersion"),
        T("PayloadHash"), T("ReadbackHash"), C("Result", ["PASS", "FAIL", "INCONCLUSIVE", "DENIED", "RECONCILIATION_REQUIRED"]), DT("ObservedAt"),
        N("EvidenceRefs"), T("ErrorClass"), N("RecordJson"), B("TestRecord", default=False),
    ]),
    "Outbox": ("AI CoE Notification Outbox", 100, "OutboxID (unique, required)", [
        T("WorkID", indexed=True), T("Recipient"), T("Subject"), N("Body"), C("State", ["QUEUED", "SUPPRESSED", "SENT", "FAILED"], default="QUEUED", indexed=True),
        Num("Attempts", default=0), T("ReceiptID"), T("SuppressionReason"), B("TestRecord", default=False),
    ]),
    "Definitions": ("AI CoE Definitions", 100, "Key (unique, required) — bootstrap list, the ONLY list addressed by title", [
        N("Value", required=True), T("Category", indexed=True), T("Version"), B("Provisional", default=False), N("Note"),
    ]),
    "Log": ("AI Automation Log", 100, "LogID (unique, required)", [
        T("Flow", indexed=True), T("RunId"), C("Level", ["Info", "Warning", "Error", "Succeeded", "Skipped"], indexed=True), N("Message"), T("CorrelationID"), T("WorkID"), DT("LoggedAt"),
    ]),
    "Packets": ("AI CoE Work Packets", 101, "document library — <WorkID>.md Markdown companions", []),
}

# Definitions seed. Values are JSON literals (strings quoted) so flows can build one config object with json(concat(...)).
def seed_config(site_url_placeholder="@SITE@"):
    return [
        # policy (transcribed; provisional)
        ("PolicyVersion", f'"{POLICY_VERSION}"', "Policy", True, "Transcribed from v3.4 design s9-11; reconcile against 04_POLICIES_AND_DECISION_RIGHTS YAML."),
        ("GatesVersion", f'"{GATES_VERSION}"', "Policy", True, "Readiness = passing applicable gates / applicable gates * 100. Not the weighted model."),
        ("ARB_TRIGGERS", '["new_vendor","new_tool","incremental_cost","contract_commitment","sensitive_data","customer_impact","external_action","production_architecture_change","security_exception","regulated_process"]', "Policy", True, "v3.4 s11"),
        ("ELT_TRIGGERS", '["multi_department_impact","material_investment"]', "Policy", True, "v3.4 s11; ELT precedence over ARB"),
        ("DelegatedFastPathEnabled", "false", "Policy", True, "false until a delegated AI CoE authority is bound; no trigger + false => PREPARATION lane"),
        ("Authority_AI_COE_FAST_PATH", '""', "Authority", True, "Named delegated approver principal. Blank => DECISION_AUTHORITY_KNOWN gate cannot pass."),
        ("Authority_ARB", '""', "Authority", True, "ARB owner principal (Kelli/Clay path). Blank => gate cannot pass. ARB integration is NOT in MVP."),
        ("Authority_ELT", '""', "Authority", True, "ELT decision body. Blank => gate cannot pass."),
        ("ThresholdsRatified", "false", "Policy", True, "Set true only by ELT decision 2."),
        ("FreshnessDays", "30", "Policy", True, "EVIDENCE_FRESHNESS gate: validated packets older than this fail."),
        ("PacketDueDays", "5", "Operations", False, "DueAt offset for S2-S5 packets."),
        ("ReminderAfterDays", "2", "Operations", False, "Overdue days before a reminder outbox row is written."),
        ("EscalationAfterDays", "5", "Operations", False, "Overdue days before ESCALATION_REQUIRED event."),
        ("AutoValidateReturnedPackets", "true", "UAT", True, "UAT only: RETURNED packets become VALIDATED with a provisional assertion. Set false before any real use."),
        ("SendEnabled", "false", "Operations", False, "Outbox: false => every QUEUED row is SUPPRESSED. Nothing is sent in UAT."),
        ("EvidenceValidators", "[]", "Authority", True, "UPNs allowed to SubmitEvidenceResponse for any packet (in addition to AssignedPerson)."),
        ("OperatorPrincipals", "[]", "Authority", True, "UPNs allowed to RequestDecisionReadiness / read any case (AI CoE operators). Empty => requester/owner/sponsor only."),
        ("CommandBatchSize", "20", "Operations", False, "Rows claimed per Case Command cycle."),
        ("HealthMonitor_SilenceHours", "26", "Operations", False, "A flow with no heartbeat inside this window is reported silent."),
        ("HealthMonitor_StalePendingMinutes", "30", "Operations", False, "PENDING command rows older than this are reported."),
        ("PacketDefaults", '{"S2_CUSTOMER_MARKET":{"role":"Product/Customer owner","q":"Which customers or internal users are affected and how?"},"S3_FINANCIAL":{"role":"Finance","q":"What is the validated baseline cost and expected saving?"},"S4_TECHNICAL":{"role":"Architecture/IT","q":"Does this stay inside an approved tool and data boundary?"},"S5_RISK_COMPLIANCE":{"role":"Security/Compliance","q":"Does any sensitive or regulated data enter the workflow?"}}', "Policy", True, "S2-S5 packet templates (v3.4 s9.2)."),
        ("CurrentRelease", f'"{RELEASE}"', "Package", False, "RC2 release the records are bound to."),
        ("RetentionClass_Default", '"PILOT_STANDARD"', "Policy", True, "RetentionClass written on new records."),
        ("Projector_LastRun", '"1970-01-01T00:00:00Z"', "State", False, "Markdown projector watermark (flow-maintained)."),
        ("Heartbeat_01_CaseCommand", '"never"', "State", False, "flow-maintained"),
        ("Heartbeat_02_Evidence", '"never"', "State", False, "flow-maintained"),
        ("Heartbeat_03_Projector", '"never"', "State", False, "flow-maintained"),
        ("Heartbeat_04_Outbox", '"never"', "State", False, "flow-maintained"),
    ]

LIST_ID_KEYS = {k: f"ListId_{k}" for k in LISTS}  # Definitions rows written by flow 00 after readback
