using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

// Exact production script. No SendAsync/HTTP forwarding, filesystem, model, or external host.
public class Script : ScriptBase
{
    public override async Task<HttpResponseMessage> ExecuteAsync()
    {
        var text = await Context.Request.Content.ReadAsStringAsync().ConfigureAwait(false);
        var input = Parse(text, new JsonLoadSettings { DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error });
        var answer = Run((string)input["Mode"], Parse((string)input["Payload"], new JsonLoadSettings { DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error }));
        return new HttpResponseMessage(HttpStatusCode.OK) { Content = CreateJsonContent(answer.ToString(Formatting.None)) };
    }
    public static JObject Run(string mode, JObject p)
    {
        try {
            if (mode == "Validate") return Validate(p);
            if (mode == "Plan") return Plan(p);
            if (mode == "Digest") return new JObject {["Valid"]=true,["Hash"]=Hash(p["Value"])};
            if (mode == "InspectWrite" || mode == "VerifyRecord") return CheckRecord(p,mode=="VerifyRecord");
            if (mode == "Finalize") return FinalizePlan(p);
            if (mode == "LoadPlan") { var plan=Parse((string)p["Journal"]["PlanJson"]); string h=(string)plan["PlanHash"]; plan.Remove("PlanHash"); Need(Hash(plan)==h && h==(string)p["Journal"]["PlanHash"]); plan["PlanHash"]=h; Need((string)plan["RequestSource"]==((string)p["Row"]["_Source"]??"Requests") && (int)plan["RequestItemID"]==(int)p["Row"]["ID"] && (int)plan["AuthorID"]==(int)p["Row"]["AuthorId"] && (string)plan["RawRequestHash"]==Hash(p["Row"]["RequestJson"])); return new JObject {["Valid"]=true,["Plan"]=plan}; }
            if (mode == "InvalidPlan") return Seal(new JObject {["Valid"]=true,["Key"]=p["Row"]["Title"],["Actor"]=(string)p["Row"]["Author"]["EMail"]??"UNRESOLVED",["AuthorID"]=p["Row"]["AuthorId"],["Operation"]=p["Row"]["Operation"],["RequestHash"]=Hash(p["Row"]["RequestJson"]),["Writes"]=new JArray(),["Response"]=Error("VALIDATION_FAILED"),["Now"]=p["Now"],["TestRecord"]=p["Row"]["TestRecord"]},p);
            if (mode == "Pick") return Pick(p);
            if (mode == "Schedule") return Schedule(p);
            if (mode == "Project") return Project(p);
            if (mode == "ProjectionReadback") return ProjectionReadback(p);
            if (mode == "VerifyProjection") {Need(BytesHash(Text(p["Content"],0,100000))==(string)p["Proof"]["Hash"]);return new JObject {["Valid"]=true};}
            if (mode == "Health") return Health(p);
            if (mode == "Lease") { Need((string)p["Slot"]["ClaimToken"]==(string)p["Token"] && DateTimeOffset.Parse((string)p["Slot"]["LeaseUntil"])>DateTimeOffset.Parse((string)p["Now"])); return new JObject {["Valid"]=true}; }
            if (mode == "Recheck") { var plan=(JObject)p["Plan"]; Need((string)plan["AuthorityHash"]==Hash(p["Data"]["Authority"]) && (string)plan["ConfigurationHash"]==Hash(p["Config"])); string work=(string)plan["Response"]?["Work"]?["WorkID"]; if((string)plan["Operation"]=="ValidateEvidencePacket" || (string)plan["Operation"]=="RequestDecisionReadiness") foreach(var a in Rows(p,"Authority").Select(Record).Where(a=>(string)a["WorkID"]==work && (bool?)a["Active"]==true)) Need(DateTimeOffset.Parse((string)a["ExpiresAt"])>DateTimeOffset.Parse((string)p["Now"])); return new JObject {["Valid"]=true}; }
            if (mode == "Result") { var plan=(JObject)p["Plan"]; var fields=new JObject {["Title"]=plan["Key"],["RequestItemID"]=plan["RequestItemID"],["RequestAuthorID"]=plan["AuthorID"],["ContractVersion"]="v0.2.0",["Operation"]=plan["Operation"],["Result"]=p["Response"]["Result"],["ResponseJson"]=Canon(p["Response"]),["ReceiptID"]=plan["ReceiptID"],["CompletedAt"]=plan["Now"]}; return new JObject {["Valid"]=true,["Write"]=new JObject {["List"]="Results",["Key"]=plan["Key"],["ItemID"]=0,["Fields"]=fields}}; }
            if (mode == "VerifyGrant") { int author=Positive(p["AuthorID"]), service=Positive(p["ServicePrincipalID"]); bool found=false; foreach(JObject g in (JArray)p["Grants"]) { int member=Positive(g["Member"]["Id"]); Need(member==author || member==service); if(member==author) { Need(((JArray)g["RoleDefinitionBindings"]).Count==1 && (int)g["RoleDefinitionBindings"][0]["RoleTypeKind"]==2); found=true; } } Need(found); return new JObject {["Valid"]=true}; }
            if (mode == "Config") { var cfg=new JObject(); foreach(JObject r in (JArray)p["Rows"]) { string k=(string)r["Title"]; Need(cfg.Property(k)==null); using(var reader=new JsonTextReader(new StringReader((string)r["Value"])) {DateParseHandling=DateParseHandling.None}) cfg[k]=JToken.ReadFrom(reader); } cfg["SiteUrl"]=p["SiteUrl"]; return new JObject {["Valid"]=true,["Config"]=cfg}; }
            if (mode == "Page") { string next=(string)(p["Page"]["odata.nextLink"]??p["Page"]["@odata.nextLink"]??p["Page"]["__next"]); string site=((string)p["SiteUrl"]).TrimEnd('/')+"/"; if(!String.IsNullOrEmpty(next)) { Need(next.StartsWith(site+"_api/",StringComparison.OrdinalIgnoreCase)); next=next.Substring(site.Length); } return new JObject {["Valid"]=true,["Rows"]=p["Page"]["value"],["Next"]=next??""}; }
            throw new ArgumentException("Unsupported helper mode");
        } catch (Exception e) when (e is ArgumentException || e is JsonException || e is InvalidOperationException || e is FormatException || e is InvalidCastException || e is NullReferenceException || e is OverflowException) {
            return new JObject { ["Valid"] = false, ["ErrorClass"] = "VALIDATION_FAILED", ["Message"] = "Invalid request; no business write is authorized." };
        }
    }
    static readonly string[] Ops = {"CreateOrResumeWork","GetWorkStatus","ListMyWork","SubmitEvidenceResponse","RequestDecisionReadiness","ListEvidencePackets","ValidateEvidencePacket"};
    static readonly string[] S1Fields = {"Title","SourceChannel","ProblemStatement","DesiredOutcome","Requester","Department","Sponsor","AccountableOwner","SourceRefs","DecisionRequested","Risks","DataClassification"};
    static void Need(bool condition) { if (!condition) throw new ArgumentException("Validation failed"); }
    static string Text(JToken t, int min=0, int max=8000, string pattern=null)
    { Need(t!=null && t.Type==JTokenType.String); string s=(string)t; Need(s.Length>=min && s.Length<=max && (min==0 || !String.IsNullOrWhiteSpace(s))); if(pattern!=null) Need(Regex.IsMatch(s, pattern)); return s; }
    static bool Flag(JToken t) { Need(t!=null && t.Type==JTokenType.Boolean); return (bool)t; }
    static int Positive(JToken t) { Need(t!=null && t.Type==JTokenType.Integer && (long)t>0 && (long)t<=Int32.MaxValue); return (int)t; }
    static void Keys(JObject o, string[] required, string[] optional)
    { Need(o!=null); Need(required.All(k=>o.Property(k)!=null)); Need(o.Properties().All(v=>required.Contains(v.Name)||optional.Contains(v.Name))); }
    static string[] Strings(JToken t, string pattern=null) { Need(t is JArray && t.Count()<=100); var a=t.Select(x=>Text(x,1,2048,pattern)).ToArray(); Need(a.Distinct(StringComparer.Ordinal).Count()==a.Length); return a; }
    static string Id(JToken t) { return Text(t,1,160,"^[A-Za-z0-9][A-Za-z0-9_-]*$"); }
    static string Principal(JToken t) { return Text(t,3,254,"^[^\\s'<>]+@[^\\s'<>]+$").ToLowerInvariant(); }
    static JObject Validate(JObject p)
    {
        var row=(JObject)p["Row"]; var cfg=(JObject)p["Config"];
        if((string)row["_Source"]=="SystemRequests") { Need(Positive(row["AuthorId"])==Positive(cfg["ServicePrincipalID"]) && new[]{"MaintainEvidence","SuppressOutbox","RecordProjection"}.Contains((string)row["Operation"])); Parse((string)row["RequestJson"]); return new JObject {["Valid"]=true}; }
        var author=(JObject)row["Author"]; string actor=Principal(author["EMail"]); int aid=Positive(row["AuthorId"]); Need(aid==Positive(author["Id"]));
        string key=Text(row["Title"],8,200,"^[A-Za-z0-9_.:-]+$"); Need((string)row["ContractVersion"]=="v0.2.0"); string op=Text(row["Operation"],1,80); Need(Ops.Contains(op));
        string raw=Text(row["RequestJson"],2,50000); var req=Parse(raw,new JsonLoadSettings { DuplicatePropertyNameHandling=DuplicatePropertyNameHandling.Error });
        var ctx=(JObject)req["Context"]; Keys(ctx,new[]{"CorrelationID","IdempotencyKey","ClientVersion","TenantLabel"},new[]{"TestRecord"}); Id(ctx["CorrelationID"]); Need(Text(ctx["IdempotencyKey"],8,200)==key); Text(ctx["ClientVersion"],1,80); Need(Text(ctx["TenantLabel"],1,80)==(string)cfg["TenantLabel"]);
        bool test=ctx["TestRecord"]!=null && Flag(ctx["TestRecord"]); Need(test==Flag(row["TestRecord"]));
        if (test) { Need((string)cfg["RuntimeMode"]=="UAT" && (string)cfg["SiteUrl"]==(string)cfg["UatSiteUrl"] && ((JArray)cfg["UatPrincipals"]).Values<string>().Contains(actor)); }
        else Need((string)cfg["RuntimeMode"]=="BUSINESS");
        string work=(string)req["WorkID"];
        if (!String.IsNullOrEmpty(work)) Need(Regex.IsMatch(work,"^CW-[A-Za-z0-9_-]+$") && work.Length<=160);
        Need((string)row["WorkID"]==(work??""));
        if(op=="CreateOrResumeWork") {
            Keys(req,new[]{"Context","S1"},new[]{"WorkID","ExpectedVersion","LegacyRefs"}); var s1=(JObject)req["S1"]; Keys(s1,new string[0],S1Fields); Need(s1.Count>0);
            if(String.IsNullOrEmpty(work)) { Text(s1["Title"],1,255); Text(s1["SourceChannel"],1,80); Need(req["ExpectedVersion"]==null); }
            else { Positive(req["ExpectedVersion"]); Need(req["LegacyRefs"]==null); }
            foreach(var a in s1.Properties()) {
                if(a.Name=="SourceRefs" || a.Name=="Risks") Strings(a.Value,a.Name=="Risks"?"^[A-Za-z0-9][A-Za-z0-9_-]*$":null);
                else if(a.Name=="DataClassification") Need(new[]{"PUBLIC","INTERNAL","CONFIDENTIAL","RESTRICTED"}.Contains(Text(a.Value)));
                else if(a.Name=="Requester") Need(Principal(a.Value)==actor);
                else if(a.Value.Type!=JTokenType.Null) Text(a.Value,a.Name=="Title"||a.Name=="SourceChannel"?1:0,a.Name=="Title"?255:8000);
                else Need(a.Name!="Title" && a.Name!="SourceChannel");
            }
            if(req["LegacyRefs"]!=null) { var legacy=(JObject)req["LegacyRefs"]; Keys(legacy,new string[0],new[]{"IntakeId","CoEID"}); foreach(var a in legacy.Properties()) Text(a.Value,1,200,"^[A-Za-z0-9_-]+$"); }
        } else if(op=="ListMyWork") { Keys(req,new[]{"Context","Requester"},new string[0]); Need(Principal(req["Requester"])==actor); }
        else {
            Need(!String.IsNullOrEmpty(work));
            if(op=="GetWorkStatus" || op=="ListEvidencePackets") Keys(req,new[]{"Context","WorkID"},new string[0]);
            if(op=="RequestDecisionReadiness") { Keys(req,new[]{"Context","WorkID","ExpectedVersion"},new[]{"PayloadHash","EvidenceSetHash"}); Positive(req["ExpectedVersion"]); foreach(var k in new[]{"PayloadHash","EvidenceSetHash"}) if(req[k]!=null) Text(req[k],64,64,"^[a-f0-9]{64}$"); }
            if(op=="SubmitEvidenceResponse") { Keys(req,new[]{"Context","WorkID","EvidencePacketID","ExpectedVersion","Response","KnownAssumedUnknown"},new string[0]); Id(req["EvidencePacketID"]); Positive(req["ExpectedVersion"]); Text(req["Response"],1,12000); Need(new[]{"KNOWN","ASSUMED","UNKNOWN","MIXED"}.Contains(Text(req["KnownAssumedUnknown"]))); }
            if(op=="ValidateEvidencePacket") { Keys(req,new[]{"Context","WorkID","EvidencePacketID","ExpectedVersion","Disposition","Assertion","SourceRefs"},new string[0]); Id(req["EvidencePacketID"]); Positive(req["ExpectedVersion"]); Need(new[]{"VALIDATED","REJECTED","NOT_APPLICABLE"}.Contains(Text(req["Disposition"]))); Text(req["Assertion"],10,8000); Need(Strings(req["SourceRefs"]).Length>0); }
        }
        return new JObject { ["Valid"]=true,["Actor"]=actor,["AuthorID"]=aid,["Request"]=req,["Operation"]=op,["TestRecord"]=test,["Key"]=key };
    }
    static readonly string[] PacketTypes={"S2_CUSTOMER_MARKET","S3_FINANCIAL","S4_TECHNICAL","S5_RISK_COMPLIANCE"};
    static JObject Parse(string text, JsonLoadSettings settings=null) { using(var reader=new JsonTextReader(new StringReader(text)) {DateParseHandling=DateParseHandling.None,MaxDepth=64}) { var result=JObject.Load(reader,settings??new JsonLoadSettings {DuplicatePropertyNameHandling=DuplicatePropertyNameHandling.Error}); Need(!reader.Read()); return result; } }
    static JToken Sorted(JToken x) { if(x is JObject) return new JObject(((JObject)x).Properties().OrderBy(a=>a.Name,StringComparer.Ordinal).Select(a=>new JProperty(a.Name,Sorted(a.Value)))); if(x is JArray) return new JArray(x.Select(Sorted)); return x==null?JValue.CreateNull():x.DeepClone(); }
    static string Canon(JToken x) { return Sorted(x).ToString(Formatting.None); }
    static string Hash(JToken x) { using(var sha=SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Canon(x)))).Replace("-","").ToLowerInvariant(); }
    static JObject Record(JObject row) { return Parse((string)row["RecordJson"]); }
    static IEnumerable<JObject> Rows(JObject p,string list) { return ((JArray)p["Data"][list]).Cast<JObject>(); }
    static JObject Find(JObject p,string list,string key) { var a=Rows(p,list).Where(r=>(string)r["Title"]==key).ToArray(); Need(a.Length<=1); return a.SingleOrDefault(); }
    static JArray Gaps(JObject c) { return new JArray(new[]{"ProblemStatement","DesiredOutcome","Sponsor"}.Where(k=>String.IsNullOrWhiteSpace((string)c[k])).Select(k=>"S1_"+Regex.Replace(k,"([a-z])([A-Z])","$1_$2").ToUpperInvariant())); }
    static JObject Projection(JObject c) { var names=new[]{"WorkID","Title","Stage","State","EmployeeStatus","Lane","NextAction","NextOwner","NextDate","Version","LastValidatedAt","OpenEvidenceGaps","DuplicateStatus"}; return new JObject(names.Select(k=>new JProperty(k,c[k]))); }
    static JObject Fields(string list,string key,JObject r) {
        var f=new JObject { ["Title"]=key };
        foreach(var a in r.Properties()) {
            if((list=="Cases"&&a.Name=="WorkID") || a.Name=="EvidencePacketID" || a.Name=="DecisionPacketID" || a.Name=="ReceiptID" && list=="Receipts" || a.Name=="EventID" || a.Name=="OutboxID") continue;
            string k=list=="Cases"&&a.Name=="Title"?"WorkTitle":a.Name;
            f[k]=a.Value is JContainer ? new JValue(Canon(a.Value)) : a.Value.DeepClone();
        }
        f["RecordJson"]=Canon(r); return f;
    }
    static void Write(JArray writes,JObject p,string list,string key,JObject rec) {
        var old=Find(p,list,key); writes.Add(new JObject { ["List"]=list,["Key"]=key,["ItemID"]=old==null?0:(int)old["ID"],["ExpectedETag"]=old==null?null:(string)(old["@odata.etag"]??old["odata.etag"]),["Record"]=rec.DeepClone(),["Fields"]=Fields(list,key,rec),["Hash"]=Hash(rec) });
    }
    static bool Access(JObject c,string actor) { return new[]{"Requester","AccountableOwner","Sponsor"}.Any(k=>String.Equals((string)c[k],actor,StringComparison.OrdinalIgnoreCase)); }
    static bool Grant(JObject p,JObject c,string actor,string role,string packetType=null) {
        var now=DateTimeOffset.Parse((string)p["Now"]);
        return Rows(p,"Authority").Select(Record).Any(a=>(string)a["Principal"]==actor && (string)a["Role"]==role && (string)a["WorkID"]==(string)c["WorkID"] && (int?)a["CaseContentVersion"]==(int)c["ContentVersion"] && (bool?)a["Active"]==true && (bool?)a["Accepted"]==true && (bool?)a["TestRecord"]==(bool)c["TestRecord"] && a["SourceRefs"] is JArray && a["SourceRefs"].Any() && !String.IsNullOrWhiteSpace((string)a["ReceiptID"]) && DateTimeOffset.Parse((string)a["ExpiresAt"])>now && (packetType==null || (string)a["EvidenceType"]==packetType));
    }
    static void InvalidateDecisions(JObject p,JArray writes,JObject c) {
        foreach(var d in Rows(p,"Decisions").Select(Record).Where(r=>(string)r["WorkID"]==(string)c["WorkID"] && (string)r["Status"]!="INVALIDATED")) { d["Status"]="INVALIDATED"; d["ReadinessState"]="REVALIDATION_REQUIRED"; d["Version"]=(int)d["Version"]+1; Write(writes,p,"Decisions",(string)d["DecisionPacketID"],d); }
        c["DecisionReadinessState"]="REVALIDATION_REQUIRED"; c["ValidationState"]="IN_PROGRESS"; c["DecisionAuthority"]=null; c["Lane"]="PREPARATION"; c["State"]="REVALIDATION_REQUIRED"; c["EmployeeStatus"]="Working"; c["LastValidatedAt"]=null;
    }
    static void Issue(JObject p,JArray writes,JObject c,string now) {
        if(Gaps(c).Count>0) return;
        foreach(string t in PacketTypes) {
            string id="EVP-"+((string)c["WorkID"]).Substring(3)+"-V"+(int)c["ContentVersion"]+"-"+t;
            var r=new JObject {["EvidencePacketID"]=id,["WorkID"]=c["WorkID"],["RecordKind"]="EVIDENCE_PACKET",["EvidenceType"]=t,["CaseContentVersion"]=c["ContentVersion"],["ReasonRequired"]="Required S2-S5 decision evidence",["Questions"]=new JArray(t==PacketTypes[0]?"Who is affected and what evidence supports their need?":t==PacketTypes[1]?"What source supports the financial baseline and expected outcome?":t==PacketTypes[2]?"What is the approved bounded implementation and rollback path?":"What risks, data boundaries and exceptions apply?"),["AssignedRole"]=t,["AssignedPerson"]=c["Requester"],["SourceRefs"]=new JArray("case:"+(string)c["WorkID"]),["DueAt"]=DateTimeOffset.Parse(now).AddDays(5).ToString("o"),["Status"]="AWAITING_RESPONSE",["Applicability"]="REQUIRED",["Response"]=null,["ValidatorAssertion"]=null,["ValidationKind"]="NONE",["ValidatorPrincipal"]=null,["ValidationSourceRefs"]=new JArray(),["ValidatedAt"]=null,["ValidationExpiresAt"]=null,["Confidence"]="AWAITING_VALIDATION",["KnownAssumedUnknown"]="UNKNOWN",["FreshnessState"]="UNPROVED",["ReturnedAt"]=null,["LastReminderAt"]=null,["EscalationAt"]=null,["Version"]=1,["TestRecord"]=c["TestRecord"]};
            if(Find(p,"Evidence",id)==null) Write(writes,p,"Evidence",id,r);
            string oid="OUT-"+id; if(Find(p,"Outbox",oid)==null) Write(writes,p,"Outbox",oid,new JObject{["OutboxID"]=oid,["WorkID"]=c["WorkID"],["Recipient"]=c["Requester"],["Subject"]="Evidence requested",["Body"]="Open the protected work to review the current evidence questions.",["State"]="SUPPRESSED",["Attempts"]=0,["ReceiptID"]=null,["SuppressionReason"]="SEND_NOT_QUALIFIED",["TestRecord"]=c["TestRecord"],["Version"]=1});
        }
        c["Stage"]="EVIDENCE"; c["State"]="AWAITING_SME"; c["EmployeeStatus"]="With the right reviewer"; c["ValidationState"]="IN_PROGRESS"; c["OpenEvidenceGaps"]=new JArray(PacketTypes); c["NextAction"]="Return required S2-S5 evidence"; c["NextOwner"]=c["Requester"];
    }
    static JObject Error(string kind) { return new JObject { ["Result"]=kind=="NOT_AUTHORIZED"?"DENIED":"FAIL",["ErrorClass"]=kind,["Message"]="Operation not accepted.",["RetryAllowed"]=false }; }
    static JObject Plan(JObject p) {
        if((string)p["Row"]["_Source"]=="SystemRequests") return SystemPlan(p);
        var v=Validate(p); var req=(JObject)v["Request"]; var cfg=(JObject)p["Config"]; string op=(string)v["Operation"], actor=(string)v["Actor"], key=(string)v["Key"], now=Text(p["Now"],1,40);
        Need(Flag(p["Complete"])); Need((bool?)cfg["NativeQualified"]==true && (bool?)cfg["SecurityQualified"]==true && (bool?)cfg["SendEnabled"]==false);
        string wid=(string)req["WorkID"]; var row=String.IsNullOrEmpty(wid)?null:Find(p,"Cases",wid); var c=row==null?null:Record(row); var writes=new JArray(); JObject response;
        if(!String.IsNullOrEmpty(wid) && (c==null || !Access(c,actor) || (bool)c["TestRecord"]!=(bool)v["TestRecord"])) response=Error("NOT_AUTHORIZED");
        else if(op=="CreateOrResumeWork" && c==null) {
            wid="CW-"+Hash(new JArray(key,actor)).Substring(0,32).ToUpperInvariant(); c=new JObject {
                ["WorkID"]=wid,["WorkType"]="IDEA",["Stage"]="INTAKE",["State"]="CLARIFYING",["Title"]="",["ProblemStatement"]=null,["DesiredOutcome"]=null,["Requester"]=actor,["Department"]=null,["Sponsor"]=null,["AccountableOwner"]=null,["ResponsibleLead"]=null,["CreatedAt"]=now,["SourceChannel"]="",["SourceRefs"]=new JArray(),["RelatedWorkIDs"]=new JArray(),["DuplicateStatus"]="NOT_CHECKED",["Lane"]="PREPARATION",["ARBTier"]=null,["AgentRiskTier"]=null,["PScoreLegacy"]=null,["PScoreCandidate"]="AWAITING_SOURCE",["PScoreVersion"]=null,["PScoreConfidence"]="AWAITING_SOURCE",["Lift"]="AWAITING_SOURCE",["LiftVersion"]=null,["DecisionReadiness"]="AWAITING_VALIDATION",["ReadinessVersion"]=null,["DecisionReadinessState"]="NOT_READY",["DecisionRequested"]=null,["DecisionAuthority"]=null,["RequiredValidators"]=new JArray(PacketTypes),["ValidationState"]="NOT_STARTED",["OpenEvidenceGaps"]=new JArray(),["Dependencies"]=new JArray(),["Risks"]=new JArray(),["TaskSystem"]=null,["CollaborationSurface"]=null,["CurrentRelease"]="3.4.0-rc2",["LastValidatedAt"]=null,["NextAction"]="Complete S1",["NextOwner"]=actor,["NextDate"]=null,["ValueBaselineID"]=null,["ActualValueID"]=null,["RetentionClass"]=(string)cfg["RetentionClass_Default"]??"UNBOUND",["DataClassification"]="INTERNAL",["Version"]=1,["ContentVersion"]=1,["TestRecord"]=v["TestRecord"],["LegacyRefs"]=req["LegacyRefs"]??new JObject(),["EmployeeStatus"]="Need one answer" };
            foreach(var a in ((JObject)req["S1"]).Properties()) if(a.Name!="Requester") c[a.Name]=a.Value.DeepClone();
            var gaps=Gaps(c); c["OpenEvidenceGaps"]=gaps; if(gaps.Count==0) { c["State"]="READY_FOR_TRIAGE"; c["EmployeeStatus"]="Working"; c["NextAction"]="Build S2-S5 evidence"; }
            Issue(p,writes,c,now); Write(writes,p,"Cases",wid,c); response=new JObject { ["Result"]="PASS",["Created"]=true,["ClarificationRequired"]=gaps,["Work"]=Projection(c) };
        } else if(op=="CreateOrResumeWork") {
            if((int)req["ExpectedVersion"]!=(int)c["Version"]) response=Error("VERSION_CONFLICT");
            else {
                var before=Canon(c); foreach(var a in ((JObject)req["S1"]).Properties()) if(a.Name!="Requester") c[a.Name]=a.Value.DeepClone();
                if(Canon(c)!=before) {
                    InvalidateDecisions(p,writes,c); c["ContentVersion"]=(int)c["ContentVersion"]+1; c["Version"]=(int)c["Version"]+1;
                    foreach(var ep in Rows(p,"Evidence").Select(Record).Where(r=>(string)r["WorkID"]==wid && (string)r["Status"]!="EXPIRED")) { ep["Status"]="EXPIRED"; ep["FreshnessState"]="STALE"; ep["Version"]=(int)ep["Version"]+1; Write(writes,p,"Evidence",(string)ep["EvidencePacketID"],ep); }
                    var gaps=Gaps(c); c["OpenEvidenceGaps"]=gaps; c["State"]=gaps.Count>0?"CLARIFYING":"READY_FOR_TRIAGE"; c["Stage"]="INTAKE"; c["EmployeeStatus"]=gaps.Count>0?"Need one answer":"Working"; c["NextAction"]=gaps.Count>0?"Complete S1":"Build new evidence"; c["NextOwner"]=actor;
                    Issue(p,writes,c,now); Write(writes,p,"Cases",wid,c);
                }
                response=new JObject {["Result"]="PASS",["Created"]=false,["ClarificationRequired"]=Gaps(c),["Work"]=Projection(c)};
            }
        } else if(op=="GetWorkStatus") response=new JObject {["Result"]="PASS",["Work"]=Projection(c)};
        else if(op=="ListMyWork") response=new JObject {["Result"]="PASS",["Items"]=new JArray(Rows(p,"Cases").Select(Record).Where(r=>Access(r,actor) && (bool)r["TestRecord"]==(bool)v["TestRecord"]).OrderBy(r=>(string)r["WorkID"],StringComparer.Ordinal).Select(Projection))};
        else if(op=="ListEvidencePackets") {
            var names=new[]{"EvidencePacketID","WorkID","EvidenceType","Questions","AssignedRole","AssignedPerson","Status","Applicability","Version","CaseContentVersion","Response","KnownAssumedUnknown"};
            response=new JObject {["Result"]="PASS",["Work"]=Projection(c),["Packets"]=new JArray(Rows(p,"Evidence").Select(Record).Where(r=>(string)r["WorkID"]==wid && (int)r["CaseContentVersion"]==(int)c["ContentVersion"]).Select(r=>new JObject(names.Select(k=>new JProperty(k,r[k])))))};
        } else if(op=="SubmitEvidenceResponse" || op=="ValidateEvidencePacket") {
            var erow=Find(p,"Evidence",(string)req["EvidencePacketID"]); var ep=erow==null?null:Record(erow);
            if(ep==null || (string)ep["WorkID"]!=wid || (bool)ep["TestRecord"]!=(bool)c["TestRecord"]) response=Error("NOT_AUTHORIZED");
            else if((int)ep["Version"]!=(int)req["ExpectedVersion"] || (int)ep["CaseContentVersion"]!=(int)c["ContentVersion"]) response=Error("VERSION_CONFLICT");
            else if(op=="ValidateEvidencePacket" && !Grant(p,c,actor,(string)req["Disposition"]=="NOT_APPLICABLE"?"NA_APPROVER":"EVIDENCE_VALIDATOR",(string)ep["EvidenceType"])) response=Error("NOT_AUTHORIZED");
            else if(op=="SubmitEvidenceResponse" && !new[]{"OPEN","ASSIGNED","AWAITING_RESPONSE","RETURNED","REJECTED"}.Contains((string)ep["Status"])) response=Error("INVALID_STATE");
            else if(op=="ValidateEvidencePacket" && (string)req["Disposition"]!="NOT_APPLICABLE" && (string)ep["Status"]!="RETURNED") response=Error("INVALID_STATE");
            else {
                if(op=="SubmitEvidenceResponse") { ep["Response"]=req["Response"]; ep["KnownAssumedUnknown"]=req["KnownAssumedUnknown"]; ep["Status"]="RETURNED"; ep["ReturnedAt"]=now; ep["ValidationKind"]="NONE"; ep["ValidatorPrincipal"]=null; ep["ValidatorAssertion"]=null; ep["ValidationSourceRefs"]=new JArray(); ep["ValidatedAt"]=null; ep["ValidationExpiresAt"]=null; ep["FreshnessState"]="UNPROVED"; }
                else { ep["Status"]=req["Disposition"]; ep["Applicability"]=(string)req["Disposition"]=="NOT_APPLICABLE"?"NOT_APPLICABLE":"REQUIRED"; ep["ValidationKind"]="HUMAN"; ep["ValidatorPrincipal"]=actor; ep["ValidatorAssertion"]=req["Assertion"]; ep["ValidationSourceRefs"]=req["SourceRefs"]; ep["ValidatedAt"]=now; ep["ValidationExpiresAt"]=DateTimeOffset.Parse(now).AddDays(30).ToString("o"); ep["FreshnessState"]="CURRENT"; }
                ep["Version"]=(int)ep["Version"]+1; InvalidateDecisions(p,writes,c); c["Version"]=(int)c["Version"]+1; c["NextAction"]="Request current readiness evaluation"; c["NextOwner"]=c["AccountableOwner"];
                Write(writes,p,"Evidence",(string)ep["EvidencePacketID"],ep); Write(writes,p,"Cases",wid,c); response=new JObject {["Result"]="PASS",["Work"]=Projection(c),["PacketStatus"]=ep["Status"]};
            }
        } else if(op=="RequestDecisionReadiness") {
            if((int)req["ExpectedVersion"]!=(int)c["Version"]) response=Error("VERSION_CONFLICT");
            else { var block=new JArray(); if(Gaps(c).Count>0) block.Add("S1_COMPLETE");
                var packets=Rows(p,"Evidence").Select(Record).Where(r=>(string)r["WorkID"]==wid && (int?)r["CaseContentVersion"]==(int)c["ContentVersion"]).ToArray();
                bool coverage=packets.Length==4 && PacketTypes.All(t=>packets.Count(r=>(string)r["EvidenceType"]==t)==1);
                if(!coverage) block.Add("S2_S5_COMPLETE_OR_NA");
                bool human=coverage && packets.All(r=> (string)r["ValidationKind"]=="HUMAN" && new[]{"VALIDATED","NOT_APPLICABLE"}.Contains((string)r["Status"]) && ((string)r["ValidatorAssertion"]??"").Length>=10 && r["ValidationSourceRefs"] is JArray && r["ValidationSourceRefs"].Any() && Grant(p,c,(string)r["ValidatorPrincipal"],(string)r["Status"]=="NOT_APPLICABLE"?"NA_APPROVER":"EVIDENCE_VALIDATOR",(string)r["EvidenceType"]));
                if(!human) block.Add("SME_VALIDATIONS_COMPLETE");
                if(!coverage || packets.Any(r=>String.IsNullOrWhiteSpace((string)r["ValidationExpiresAt"]) || DateTimeOffset.Parse((string)r["ValidationExpiresAt"])<=DateTimeOffset.Parse(now) || (string)r["FreshnessState"]!="CURRENT")) block.Add("EVIDENCE_FRESHNESS");
                if(String.IsNullOrWhiteSpace((string)c["AccountableOwner"])) block.Add("ACCOUNTABLE_OWNER");
                if(String.IsNullOrWhiteSpace((string)c["DecisionRequested"])) block.Add("DECISION_REQUESTED");
                if(((JArray)c["Risks"]).Values<string>().Any(r=>r.StartsWith("CRITICAL_",StringComparison.Ordinal))) block.Add("NO_CRITICAL_UNRESOLVED_RISK");
                if(!coverage || packets.Any(r=>(string)r["Status"]!="NOT_APPLICABLE" && (String.IsNullOrWhiteSpace((string)r["Response"]) || !new[]{"KNOWN","ASSUMED","MIXED"}.Contains((string)r["KnownAssumedUnknown"])))) block.Add("ASSUMPTIONS_VISIBLE");
                if(!packets.Any(r=>(string)r["EvidenceType"]=="S4_TECHNICAL" && (string)r["Status"]=="VALIDATED" && (string)r["ValidationKind"]=="HUMAN")) block.Add("IMPLEMENTATION_PATH_UNDERSTOOD");
                if((bool)c["TestRecord"]) block.Add("BUSINESS_NOT_UAT");
                bool policy=(bool?)cfg["PolicyAccepted"]==true && (string)cfg["PolicySourceHash"]=="51210529f823b1571e737c40f21a97921e498c60f8e132374171634138ccf736" && !String.IsNullOrWhiteSpace((string)cfg["PolicyAcceptanceReceipt"]) && !String.IsNullOrWhiteSpace((string)cfg["PolicyBindingVersion"]);
                if(!policy) block.Add("POLICY_AND_AUTHORITY_BINDING");
                string lane="PREPARATION", authority=null, rule="ROUTE-999";
                var factsRows=Rows(p,"Authority").Select(Record).Where(a=>(string)a["Role"]=="ROUTING_FACTS" && (string)a["WorkID"]==wid && Grant(p,c,(string)a["Principal"],"ROUTING_FACTS")).ToArray();
                string[] elt={"strategic","material_multi_authority","financial_commitment","material_investment_threshold_met"}, arb={"new_vendor","new_tool","production_architecture_change","security_exception","regulated_process","risk_threshold_met","contract_commitment"}, fast={"capability_approved","workflow_bounded","risk_within_delegation","delegated_authority_bound"};
                if(factsRows.Length==1 && factsRows[0]["Facts"] is JObject) {
                    var facts=(JObject)factsRows[0]["Facts"];
                    if(elt.Concat(arb).Concat(fast).All(k=>facts[k]!=null && facts[k].Type==JTokenType.Boolean)) {
                        if(elt.Any(k=>(bool)facts[k])) {lane="ELT"; rule="ROUTE-100";}
                        else if(arb.Any(k=>(bool)facts[k])) {lane="ARB"; rule="ROUTE-200";}
                        else if(fast.All(k=>(bool)facts[k])) {lane="AI_COE_FAST_PATH"; rule="ROUTE-300";}
                    }
                }
                var authorities=Rows(p,"Authority").Select(Record).Where(a=>(string)a["Role"]=="AUTHORITY_"+lane && (string)a["WorkID"]==wid && Grant(p,c,(string)a["Principal"],"AUTHORITY_"+lane)).ToArray();
                if(lane=="PREPARATION" || authorities.Length!=1) block.Add("DECISION_AUTHORITY_KNOWN"); else authority=(string)authorities[0]["Principal"];
                string payloadHash=Hash(c), evidenceHash=Hash(new JArray(packets.OrderBy(r=>(string)r["EvidencePacketID"],StringComparer.Ordinal)));
                bool ready=block.Count==0; string did=ready?"DP-"+Hash(new JArray(key,actor)).Substring(0,32).ToUpperInvariant():null;
                if(req["PayloadHash"]!=null && (string)req["PayloadHash"]!=payloadHash || req["EvidenceSetHash"]!=null && (string)req["EvidenceSetHash"]!=evidenceHash) response=Error("HASH_MISMATCH");
                else {
                    InvalidateDecisions(p,writes,c); c["Version"]=(int)c["Version"]+1; c["DecisionReadinessState"]=ready?"READY":"NOT_READY"; c["Stage"]=ready?"DECISION":Gaps(c).Count>0?"INTAKE":"EVIDENCE"; c["State"]=ready?(lane=="AI_COE_FAST_PATH"?"READY_FOR_AI_COE":"READY_FOR_"+lane):"NOT_DECISION_READY"; c["EmployeeStatus"]=ready?"With the right reviewer":"Working"; c["Lane"]=ready?lane:"PREPARATION"; c["DecisionAuthority"]=ready?authority:null; c["ValidationState"]=ready?"COMPLETE":"IN_PROGRESS"; c["OpenEvidenceGaps"]=block; c["NextAction"]=ready?"Human decision required; this is not approval":"Close readiness gates"; c["NextOwner"]=ready?authority:(string)c["AccountableOwner"]; c["LastValidatedAt"]=now; c["ReadinessVersion"]="required-set-v2"; c["DecisionReadiness"]=ready?"ALL_GATES_PASSED":"AWAITING_VALIDATION";
                    if(ready) Write(writes,p,"Decisions",did,new JObject {["DecisionPacketID"]=did,["WorkID"]=wid,["RecordKind"]="DECISION_PACKET",["Status"]="READY_FOR_DECISION",["ReadinessState"]="READY",["ReadinessGates"]=new JArray("S1_COMPLETE","S2_S5_COMPLETE_OR_NA","SME_VALIDATIONS_COMPLETE","EVIDENCE_FRESHNESS","ACCOUNTABLE_OWNER","DECISION_REQUESTED","NO_CRITICAL_UNRESOLVED_RISK","ASSUMPTIONS_VISIBLE","IMPLEMENTATION_PATH_UNDERSTOOD","POLICY_AND_AUTHORITY_BINDING","DECISION_AUTHORITY_KNOWN","BUSINESS_NOT_UAT"),["BlockingGates"]=new JArray(),["Lane"]=lane,["RuleFired"]=rule,["PayloadHash"]=payloadHash,["EvidenceSetHash"]=evidenceHash,["HashProvenance"]="SERVER_SHA256",["BusinessCaseVersion"]=(string)c["Version"],["CaseContentVersion"]=c["ContentVersion"],["DecisionRequested"]=c["DecisionRequested"],["DecisionAuthority"]=authority,["DecisionAuthoritySource"]="Private current scoped authority",["ExpiresAt"]=packets.Min(r=>(string)r["ValidationExpiresAt"]),["ApprovalID"]=null,["Version"]=1,["PolicySourceHash"]=cfg["PolicySourceHash"],["PolicyBindingVersion"]=cfg["PolicyBindingVersion"],["TestRecord"]=false});
                    Write(writes,p,"Cases",wid,c); response=new JObject {["Result"]="PASS",["Work"]=Projection(c),["DecisionReadinessState"]=ready?"READY":"NOT_READY",["BlockingGates"]=block,["DecisionPacketID"]=did};
                }
            }
        } else response=Error("UNSUPPORTED_OPERATION");
        return Seal(new JObject {["Valid"]=true,["Key"]=key,["Actor"]=actor,["AuthorID"]=v["AuthorID"],["Operation"]=op,["RequestHash"]=Hash(req),["Writes"]=writes,["Response"]=response,["Now"]=now,["TestRecord"]=v["TestRecord"]},p);
    }
    static JObject Seal(JObject plan,JObject input) {
        plan["RequestSource"]=(string)input["Row"]["_Source"]??"Requests"; plan["RequestItemID"]=input["Row"]["ID"]; plan["RawRequestHash"]=Hash(input["Row"]["RequestJson"]); plan["AuthorityHash"]=Hash(input["Data"]["Authority"]); plan["ConfigurationHash"]=Hash(input["Config"]);
        plan["ReceiptID"]="RCPT-"+Hash(new JArray(plan["Key"],plan["AuthorID"])).Substring(0,32).ToUpperInvariant(); plan["Response"]["ReceiptID"]=plan["ReceiptID"];
        Need(Canon(plan).Length<=60000); plan["PlanHash"]=Hash(plan); return plan;
    }
    static bool Same(JToken a,JToken b) { if(a==null || a.Type==JTokenType.Null) return b==null || b.Type==JTokenType.Null; if(b==null) return false; if((a.Type==JTokenType.Integer||a.Type==JTokenType.Float)&&(b.Type==JTokenType.Integer||b.Type==JTokenType.Float)) return (decimal)a==(decimal)b; return JToken.DeepEquals(a,b); }
    static readonly string[] DateFields={"CreatedAt","DueAt","ReturnedAt","LastReminderAt","EscalationAt","ValidatedAt","ValidationExpiresAt","LastValidatedAt","ExpiresAt","OccurredAt","ObservedAt","CompletedAt"};
    static bool Match(JObject w,JObject row) { var fields=(JObject)w["Fields"]; return fields.Properties().All(a=>{DateTimeOffset x,y;return DateFields.Contains(a.Name)&&a.Value.Type==JTokenType.String&&row[a.Name]!=null&&row[a.Name].Type==JTokenType.String ? DateTimeOffset.TryParse((string)a.Value,out x)&&DateTimeOffset.TryParse((string)row[a.Name],out y)&&x==y : Same(a.Value,row[a.Name]);}); }
    static JObject CheckRecord(JObject p,bool verifyOnly) {
        var w=(JObject)p["Write"]; var rows=(JArray)p["Rows"]; Need(rows.Count<=1); var row=rows.Count==0?null:(JObject)rows[0];
        bool same=row!=null && Match(w,row); if(verifyOnly) Need(same && (w["Record"]==null || Hash(Record(row))==(string)w["Hash"]));
        else if(!same) { if(row==null) Need((int)w["ItemID"]==0); else Need((int)w["ItemID"]==(int)row["ID"] && !String.IsNullOrEmpty((string)w["ExpectedETag"]) && (string)w["ExpectedETag"]==(string)(row["@odata.etag"]??row["odata.etag"])); }
        return new JObject {["Valid"]=true,["AlreadyApplied"]=same,["ItemID"]=row==null?0:(int)row["ID"],["ETag"]=row==null?null:(string)(row["@odata.etag"]??row["odata.etag"])};
    }
    static JObject FinalizePlan(JObject p) {
        var plan=(JObject)p["Plan"]; var writes=(JArray)plan["Writes"]; var proofs=(JArray)p["Readbacks"]; Need(writes.Count==proofs.Count);
        var intended=new JArray(); var observed=new JArray();
        foreach(JObject w in writes) { var found=proofs.Where(r=>(string)r["List"]==(string)w["List"] && (string)r["Key"]==(string)w["Key"]).ToArray(); Need(found.Length==1); CheckRecord(new JObject {["Write"]=w,["Rows"]=found[0]["Rows"]},true); intended.Add(w["Record"]); observed.Add(Record((JObject)found[0]["Rows"][0])); }
        string payloadHash=Hash(intended), readbackHash=writes.Count==0?null:Hash(observed); Need(writes.Count==0 || payloadHash==readbackHash);
        string id=(string)plan["ReceiptID"]; var response=(JObject)plan["Response"].DeepClone();
        var receipt=new JObject {["ReceiptID"]=id,["OperationID"]="OP-"+id.Substring(5),["OperationClass"]=writes.Count==0?"READ_OR_REJECT":"WRITE_BUSINESS_RECORD",["ActorID"]=plan["Actor"],["TargetRef"]="command:"+(string)plan["Key"],["BeforeVersion"]=null,["AfterVersion"]=null,["PayloadHash"]=payloadHash,["ReadbackHash"]=readbackHash,["RequestHash"]=plan["RequestHash"],["ResponseHash"]=Hash(response),["Result"]=response["Result"],["ObservedAt"]=plan["Now"],["EvidenceRefs"]=new JArray(writes.Select(w=>new JObject {["List"]=w["List"],["Key"]=w["Key"],["Hash"]=w["Hash"]})),["ErrorClass"]=response["ErrorClass"],["TestRecord"]=plan["TestRecord"]};
        if((string)plan["Operation"]=="RecordProjection" && plan["ProjectionProof"] is JObject) { receipt["OperationClass"]="VERIFIED_PROJECTION";receipt["PayloadHash"]=plan["ProjectionProof"]["Hash"];receipt["ReadbackHash"]=plan["ProjectionProof"]["Hash"];receipt["EvidenceRefs"]=new JArray(plan["ProjectionProof"]); }
        var ev=new JObject {["EventID"]="EVT-"+id.Substring(5),["WorkID"]=(string)response["Work"]?["WorkID"]??"COMMAND",["EventType"]=(string)plan["Operation"],["OccurredAt"]=plan["Now"],["ActorType"]=(string)plan["RequestSource"]=="SystemRequests"?"SERVICE":"HUMAN",["ActorID"]=plan["Actor"],["CorrelationID"]=null,["IdempotencyKey"]=(string)plan["Key"],["AuthorityClass"]="SCOPED_COMMAND",["ReceiptID"]=id,["SourceVersion"]="v0.2.0",["Payload"]=new JObject {["RequestHash"]=plan["RequestHash"],["PlanHash"]=plan["PlanHash"],["Result"]=response["Result"]},["TestRecord"]=plan["TestRecord"]};
        return new JObject {["Valid"]=true,["Receipt"]=Immutable("Receipts",id,receipt),["Event"]=Immutable("Events",(string)ev["EventID"],ev),["Response"]=response};
    }
    static JObject Immutable(string list,string id,JObject record) { return new JObject {["List"]=list,["Key"]=id,["ItemID"]=0,["ExpectedETag"]=null,["Record"]=record,["Fields"]=Fields(list,id,record),["Hash"]=Hash(record)}; }
    static JObject SystemRequest(string op,string work,JObject payload,bool test) {
        string key="SYS-"+Hash(new JArray(op,work,payload));
        return new JObject {["List"]="SystemRequests",["Key"]=key,["ItemID"]=0,["Fields"]=new JObject {["Title"]=key,["Operation"]=op,["WorkID"]=work,["RequestJson"]=Canon(payload),["TestRecord"]=test}};
    }
    static JObject Schedule(JObject p) {
        var writes=new JArray(); string mode=Text(p["Mode"]); Need(mode=="Evidence"||mode=="Suppress");
        foreach(var row in Rows(p,mode=="Evidence"?"Cases":"Outbox")) {
            var r=Record(row); if(mode=="Suppress" && (string)r["State"]!="QUEUED") continue;
            string work=(string)r["WorkID"]; var payload=new JObject {["TargetKey"]=row["Title"],["ExpectedVersion"]=r["Version"],["Day"]=DateTimeOffset.Parse((string)p["Now"]).ToString("yyyy-MM-dd")};
            var w=SystemRequest(mode=="Evidence"?"MaintainEvidence":"SuppressOutbox",work,payload,(bool)r["TestRecord"]);
            if(Find(p,"SystemRequests",(string)w["Key"])==null) writes.Add(w);
        }
        return new JObject {["Valid"]=true,["Writes"]=writes};
    }
    static JObject SystemPlan(JObject p) {
        Validate(p);var cfg=(JObject)p["Config"];Need((bool?)cfg["NativeQualified"]==true&&(bool?)cfg["SecurityQualified"]==true&&(bool?)cfg["SendEnabled"]==false);
        var row=(JObject)p["Row"];string op=(string)row["Operation"],wid=(string)row["WorkID"],now=(string)p["Now"];var req=Parse((string)row["RequestJson"]);var writes=new JArray();var response=new JObject {["Result"]="PASS"};
        var crow=Find(p,"Cases",wid);var c=crow==null?null:Record(crow);Need(c!=null&&(bool)c["TestRecord"]==(bool)row["TestRecord"]);
        if(op=="MaintainEvidence" && (int)req["ExpectedVersion"]==(int)c["Version"]) {
            bool changed=false;
            if(Gaps(c).Count==0 && PacketTypes.Any(t=>!Rows(p,"Evidence").Select(Record).Any(e=>(string)e["WorkID"]==wid&&(int)e["CaseContentVersion"]==(int)c["ContentVersion"]&&(string)e["EvidenceType"]==t))) {Issue(p,writes,c,now);changed=writes.Count>0;}
            foreach(var ep in Rows(p,"Evidence").Select(Record).Where(e=>(string)e["WorkID"]==wid&&(int)e["CaseContentVersion"]==(int)c["ContentVersion"])) {
                bool dirty=false;
                if(new[]{"VALIDATED","NOT_APPLICABLE"}.Contains((string)ep["Status"]) && (String.IsNullOrEmpty((string)ep["ValidationExpiresAt"]) || DateTimeOffset.Parse((string)ep["ValidationExpiresAt"])<=DateTimeOffset.Parse(now))) {ep["Status"]="EXPIRED";ep["FreshnessState"]="STALE";dirty=true;}
                if(new[]{"OPEN","ASSIGNED","AWAITING_RESPONSE","REJECTED"}.Contains((string)ep["Status"])) {
                    double overdue=(DateTimeOffset.Parse(now)-DateTimeOffset.Parse((string)ep["DueAt"])).TotalDays;
                    foreach(var stage in new[]{"REMINDER","ESCALATION"}) {
                        string field=stage=="REMINDER"?"LastReminderAt":"EscalationAt";int days=stage=="REMINDER"?2:5;
                        if(overdue<days||!String.IsNullOrEmpty((string)ep[field])) continue;
                        string oid="OUT-"+(string)ep["EvidencePacketID"]+"-"+stage;
                        if(Find(p,"Outbox",oid)==null) Write(writes,p,"Outbox",oid,new JObject {["OutboxID"]=oid,["WorkID"]=wid,["Recipient"]=ep["AssignedPerson"],["Subject"]=stage,["Body"]="Protected evidence needs review.",["State"]="SUPPRESSED",["Attempts"]=0,["ReceiptID"]=null,["SuppressionReason"]="SEND_NOT_QUALIFIED",["Version"]=1,["TestRecord"]=c["TestRecord"]});
                        ep[field]=now;dirty=true;
                    }
                }
                if(dirty) {ep["Version"]=(int)ep["Version"]+1;Write(writes,p,"Evidence",(string)ep["EvidencePacketID"],ep);changed=true;}
            }
            if(changed) {InvalidateDecisions(p,writes,c);c["Version"]=(int)c["Version"]+1;c["NextAction"]="Review current evidence and request readiness";Write(writes,p,"Cases",wid,c);}
        } else if(op=="SuppressOutbox") {
            var o=Find(p,"Outbox",Text(req["TargetKey"])); if(o!=null) {var r=Record(o);Need((string)r["WorkID"]==wid);if((string)r["State"]=="QUEUED"&&(int)r["Version"]==(int)req["ExpectedVersion"]) {r["State"]="SUPPRESSED";r["SuppressionReason"]="SEND_NOT_QUALIFIED";r["Version"]=(int)r["Version"]+1;Write(writes,p,"Outbox",(string)o["Title"],r);}}
        } else if(op=="RecordProjection") {Text(req["Hash"],64,64,"^[a-f0-9]{64}$");Text(req["Path"],1,2048);}
        response["Work"]=Projection(c);
        var plan=new JObject {["Valid"]=true,["Key"]=row["Title"],["Actor"]=row["Author"]["EMail"],["AuthorID"]=row["AuthorId"],["Operation"]=op,["RequestHash"]=Hash(req),["Writes"]=writes,["Response"]=response,["Now"]=now,["TestRecord"]=row["TestRecord"]};
        if(op=="RecordProjection") plan["ProjectionProof"]=req;
        return Seal(plan,p);
    }
    static string BytesHash(string text) {using(var sha=SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(text))).Replace("-","").ToLowerInvariant();}
    static string Markdown(string text) {return String.Concat((text??"").Select(c=>Char.IsLetterOrDigit(c)||c==' '?c.ToString():"&#"+(int)c+";"));}
    static JObject Project(JObject p) {
        string root=Text(p["Root"],1,1024);Need(root.StartsWith("/")&&!root.Contains(".."));var files=new JArray();
        foreach(var c in Rows(p,"Cases").Select(Record)) {
            string wid=Id(c["WorkID"]),content="# "+Markdown((string)c["Title"])+"\n\nWork: "+wid+"\n\nState: "+Markdown((string)c["State"])+"\n\nNext: "+Markdown((string)c["NextAction"])+"\n\nVersion: "+(int)c["Version"]+"\n";
            string hash=BytesHash(content),name=wid+"-"+hash+".md";
            files.Add(new JObject {["Name"]=name,["Path"]=root.TrimEnd('/')+"/"+name,["Content"]=content,["Hash"]=hash,["WorkID"]=wid,["TestRecord"]=c["TestRecord"]});
        }
        return new JObject {["Valid"]=true,["Files"]=files};
    }
    static JObject ProjectionReadback(JObject p) {
        var file=(JObject)p["Projection"];Need(BytesHash(Text(p["Content"],0,100000))==(string)file["Hash"]);
        var payload=new JObject {["Path"]=file["Path"],["Hash"]=file["Hash"]};
        return new JObject {["Valid"]=true,["Write"]=SystemRequest("RecordProjection",(string)file["WorkID"],payload,(bool)file["TestRecord"])};
    }
    static JObject Health(JObject p) {
        var now=DateTimeOffset.Parse((string)p["Now"]);var enabled=(JObject)p["Config"]["FlowEnabled"];
        int overdue=Rows(p,"Evidence").Select(Record).Count(e=>new[]{"OPEN","ASSIGNED","AWAITING_RESPONSE","REJECTED"}.Contains((string)e["Status"]) && DateTimeOffset.Parse((string)e["DueAt"])<now);
        int stale=Rows(p,"Journal").Count(j=>(string)j["State"]=="ACTIVE"&&!String.IsNullOrEmpty((string)j["LeaseUntil"])&&DateTimeOffset.Parse((string)j["LeaseUntil"])<=now);
        int overdueCases=Rows(p,"Cases").Select(Record).Count(c=>!new[]{"RETIRED","REJECTED","OPERATING"}.Contains((string)c["State"])&&!String.IsNullOrEmpty((string)c["NextDate"])&&DateTimeOffset.Parse((string)c["NextDate"])<now);
        int silent=enabled.Properties().Count(a=>(bool)a.Value && !Rows(p,"Log").Any(l=>((string)l["Flow"]??"").StartsWith("AI CoE "+a.Name+" ")&&(string)l["Message"]=="HEARTBEAT"&&DateTimeOffset.Parse((string)l["LoggedAt"])>now.AddHours(-(int)p["Config"]["HealthMonitor_SilenceHours"])));
        int disabled=enabled.Properties().Count(a=>(bool)a.Value==false);
        return new JObject {["Valid"]=true,["Warning"]=overdue>0||stale>0||overdueCases>0||silent>0,["Counts"]=new JObject {["OverdueCases"]=overdueCases,["SilentEnabledFlows"]=silent,["OverdueEvidence"]=overdue,["StaleClaims"]=stale,["DisabledFlows"]=disabled,["SendEnabled"]=false}};
    }
    static JObject Pick(JObject p) {
        var slot=Find(p,"Journal","CORE_WRITER"); Need(slot!=null); string active=(string)slot["ActiveIntent"];
        if(!String.IsNullOrEmpty(active) && !String.IsNullOrEmpty((string)slot["LeaseUntil"]) && DateTimeOffset.Parse((string)slot["LeaseUntil"])>DateTimeOffset.Parse((string)p["Now"])) return new JObject {["Valid"]=true,["Selected"]=false};
        var candidates=new List<JObject>();
        foreach(string source in new[]{"Requests","SystemRequests"}) foreach(var r in Rows(p,source).OrderBy(r=>(int)r["ID"])) { var x=(JObject)r.DeepClone();x["_Source"]=source;candidates.Add(x); }
        Func<JObject,string> journalKey=r=>"CMD-"+Hash(new JArray(r["_Source"],r["Title"]));
        var row=String.IsNullOrEmpty(active)?candidates.FirstOrDefault(r=>{var j=Find(p,"Journal",journalKey(r));return j==null||(string)j["State"]!="COMPLETED";}):candidates.SingleOrDefault(r=>journalKey(r)==active);
        if(row==null) {Need(String.IsNullOrEmpty(active));return new JObject {["Valid"]=true,["Selected"]=false};}
        string jk=journalKey(row); var journal=Find(p,"Journal",jk);
        return new JObject {["Valid"]=true,["Selected"]=true,["Row"]=row,["Journal"]=journal,["JournalKey"]=jk,["Slot"]=slot,["SlotETag"]=slot["@odata.etag"]??slot["odata.etag"]};
    }
}
