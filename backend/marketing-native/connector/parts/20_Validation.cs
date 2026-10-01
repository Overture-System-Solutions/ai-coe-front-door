public partial class Script
{
    static readonly string[] Kinds={"campaignBrief","contentPlan","meetingFollowThrough"};
    static readonly string[] Reviews={"strategyVoice","copyChannel","meetingDecisionsActions","communicationsSend"};
    static readonly string[] Sentinels={"UNKNOWN","NOT_APPLICABLE","AWAITING_SOURCE","AWAITING_VALIDATION","NOT_AUTHORIZED","NOT_TESTED"};
    static readonly string[] Forbidden={"email","mail","upn","userid","loginname","assignedto","assignee","assigneeid","taskid","recipient","recipients","to","cc","bcc","send","publish","publishat","sendat","schedule","calendarevent","webhook","callback","__proto__","constructor","prototype"};
    static string SchemaName(string kind) {Require(Kinds.Contains(kind),"KIND_INVALID");return kind=="campaignBrief"?"campaign-brief.v1.json":kind=="contentPlan"?"content-plan.v1.json":"meeting-follow-through.v1.json";}
    static void Ref(JToken t,string kind=null) {var v=Obj(t);Keys(v,"kind artifactId revision payloadHash", "acceptanceReceiptId");Require(Kinds.Contains(S(v["kind"])) && (kind==null || S(v["kind"])==kind) && Id(v["artifactId"]) && I(v["revision"])>0 && Digest(v["payloadHash"]),"ARTIFACT_REF_INVALID");if(v["acceptanceReceiptId"]!=null)Require(Id(v["acceptanceReceiptId"]),"RECEIPT_REF_INVALID");}
    static JObject RefOf(JObject e) {return O("kind",e["kind"],"artifactId",e["artifactId"],"revision",e["revision"],"payloadHash",e["payloadHash"]);}
    static void SourceRef(JToken t) {var v=Obj(t);Keys(v,"sourceId versionOrETag");Text(v["sourceId"],256);Text(v["versionOrETag"],256);}
    static IEnumerable<JObject> Objects(JToken t) { if(t is JObject) {yield return (JObject)t;foreach(var prop in ((JObject)t).Properties())foreach(var child in Objects(prop.Value)) yield return child;}else if(t is JArray)foreach(var item in (JArray)t) foreach(var child in Objects(item))yield return child; }
    static IEnumerable<JObject> Citations(JToken t) {return Objects(t).Where(x=>x.Count==2 && x["sourceId"]!=null && x["versionOrETag"]!=null);}
    static void DeepSafety(JToken t,bool manual=false)
    {
        foreach(var o in Objects(t)) foreach(var prop in o.Properties()) {var n=prop.Name.ToLowerInvariant();Require(!Forbidden.Contains(n),"FORBIDDEN_FIELD"); if(manual) Require(!new[]{"state","createdby","actorid","tenantscope","roles","permissions","envelope","providerprovenance","provenance","receipt","receiptrefs"}.Contains(n) && !(n=="authoritybindingref" && !Null(prop.Value)) && !(n=="status" && S(prop.Value)=="accepted") && !(n=="acceptance" && !Null(prop.Value)),"CALLER_AUTHORITY"); }
    }
    static void ValidatePayload(string op,JObject b)
    {
        string req="",opt="";
        switch(op) {
        case "ListMarketingWorkV1":case "ListAuthoritiesV1":case "ReadSourceRegisterV1":break;
        case "SaveManualMarketingDraftV1":req="workId kind payload sourceIds";opt="artifactId expectedStoreVersion";break;
        case "DraftCampaignBriefV1":req="workId objective audienceContext sourceIds";opt="artifactId";break;
        case "DraftContentPlanV1":req="workId briefArtifactId sourceIds";opt="artifactId";break;
        case "DraftMeetingFollowThroughV1":req="workId briefArtifactId sourceIds notes";opt="artifactId";break;
        case "RequestReviewV1":req="target reviewKind";break;
        case "RecordReviewDecisionV1":req="target reviewKind outcome comments expectedStoreVersion idempotencyKey";break;
        case "RecoverMarketingIntentV1":req="intentKey kind";break;
        case "GetArtifactV1":req="artifactId";opt="revision";break;
        case "ListArtifactsV1":req="workId";opt="own";break;
        case "GetReviewV1":req="reviewId";break;
        case "ListReviewDecisionsV1":case "ListReviewRequestsV1":req="artifactId";break;
        case "ReadSourceExcerptV1":req="reference";break;
        default:throw new Denied("OPERATION_UNSUPPORTED"); }
        Keys(b,req,opt);if(b["workId"]!=null) Require(Work(b["workId"]),"WORK_INVALID");foreach(var k in new[]{"artifactId","briefArtifactId","reviewId"})if(b[k]!=null)Require(Id(b[k]),"IDENTITY_INVALID");
        if(b["revision"]!=null)Require(I(b["revision"])>0,"REVISION_INVALID");if(b["own"]!=null)Require(b["own"].Type==JTokenType.Boolean,"OWN_INVALID");
        if(b["sourceIds"]!=null)foreach(var t in A(b["sourceIds"],50))Text(t,256);
        if(b["target"]!=null) {Ref(b["target"]);Require(Reviews.Contains(S(b["reviewKind"])),"REVIEW_KIND_INVALID");}
        if(op=="RecordReviewDecisionV1") {Require(new[]{"accept","requestChanges","reject"}.Contains(S(b["outcome"])) && S(b["comments"])!=null && S(b["comments"]).Length<=8000,"DECISION_INVALID"); Text(b["expectedStoreVersion"],128);Require(Text(b["idempotencyKey"],255).Length>=8,"INTENT_INVALID");}
        if(op=="RecoverMarketingIntentV1") {Text(b["intentKey"],255);Require(new[]{"draft","review"}.Contains(S(b["kind"])),"RECOVERY_KIND_INVALID");}
        if(op=="ReadSourceExcerptV1") SourceRef(b["reference"]);
        if(op=="SaveManualMarketingDraftV1") {Require(Kinds.Contains(S(b["kind"])),"KIND_INVALID");var v=Obj(b["payload"]);Require(new[]{"schemaVersion","workId","briefId","planId","followThroughId","registerId","registerVersion","createdAt"}.All(k=>v[k]==null),"MANUAL_SERVER_FIELD");DeepSafety(v,true);Require((b["artifactId"]==null)==(b["expectedStoreVersion"]==null),"MANUAL_VERSION_REQUIRED");if(b["artifactId"]!=null)Text(b["expectedStoreVersion"],128);}
        if(op=="DraftCampaignBriefV1") {Text(b["objective"]);foreach(var t in A(b["audienceContext"],200)) {Require(S(t)!=null && S(t).Length<=2000,"AUDIENCE_INVALID");}}
        if(op=="DraftMeetingFollowThroughV1") {var notes=A(b["notes"],30);Require(notes.Count>0,"NOTES_REQUIRED");foreach(var t in notes){var n=Obj(t);Keys(n,"sourceId versionOrETag","locator");Text(n["sourceId"],256);Text(n["versionOrETag"],256);if(n["locator"]!=null)Text(n["locator"],2000);}}
    }
    // Restricted, in-process interpreter for the source-controlled schema vocabulary; no schema package or resolver.
    static void Schema(JToken v,JObject s,JObject root,int depth=0)
    {
        Require(depth<=60,"SCHEMA_DEPTH"); if(s["$ref"]!=null) {var reference=Text(s["$ref"],256);Require(reference.StartsWith("#/$defs/"),"SCHEMA_REFERENCE_UNSUPPORTED");Schema(v,Obj(root["$defs"][reference.Substring(8)]),root,depth+1);return;}
        if(s["anyOf"]!=null || s["oneOf"]!=null) {int count=0;foreach(var branch in A(s["anyOf"]??s["oneOf"]))try {Schema(v,Obj(branch),root,depth+1);count++;}catch(Denied) {}Require(count>0 && (s["oneOf"]==null || count==1),"SCHEMA_UNION");}
        if(s["const"]!=null)Require(JToken.DeepEquals(s["const"],v),"SCHEMA_CONST");if(s["enum"]!=null)Require(A(s["enum"]).Any(x=>JToken.DeepEquals(x,v)),"SCHEMA_ENUM");
        if(s["type"]!=null) {var types=s["type"] is JArray?A(s["type"]).Select(S).ToArray():new[]{S(s["type"])};var type=Null(v)?"null":v is JObject?"object":v is JArray?"array":v.Type==JTokenType.String?"string":v.Type==JTokenType.Boolean?"boolean":v.Type==JTokenType.Integer?"integer":"number";Require(types.Contains(type) || type=="integer" && types.Contains("number"),"SCHEMA_TYPE");}
        if(v is JObject && s["properties"] is JObject) {var o=(JObject)v;var props=Obj(s["properties"]);if(s["required"]!=null)Require(A(s["required"]).All(x=>o.Property(S(x))!=null),"SCHEMA_REQUIRED");foreach(var prop in o.Properties()){if(props[prop.Name]!=null)Schema(prop.Value,Obj(props[prop.Name]),root,depth+1);else Require(s["additionalProperties"]==null || B(s["additionalProperties"]),"SCHEMA_EXTRA");}}
        if(v is JArray) {var a=A(v,200);Require(s["minItems"]==null || a.Count>=I(s["minItems"]),"SCHEMA_MIN_ITEMS");if(B(s["uniqueItems"]))Require(a.Select(H).Distinct().Count()==a.Count,"SCHEMA_UNIQUE");if(s["items"] is JObject)foreach(var t in a)Schema(t,Obj(s["items"]),root,depth+1);}
        if(v!=null && v.Type==JTokenType.String) {var str=S(v);Require(str.Length<=8000 && (s["minLength"]==null || str.Trim().Length>=I(s["minLength"])) && (s["maxLength"]==null || str.Length<=I(s["maxLength"])) && (s["pattern"]==null || Match(str,S(s["pattern"]))),"SCHEMA_TEXT");}
        if(v!=null && v.Type==JTokenType.Integer && s["minimum"]!=null)Require((long)v>=(long)s["minimum"],"SCHEMA_MINIMUM");
    }
    static void Artifact(string kind,JObject v)
    {
        var schema=Obj(Schemas[SchemaName(kind)]);Schema(v,schema,schema);DeepSafety(v);Require(Work(v["workId"]) && Id(v[kind=="campaignBrief"?"briefId":kind=="contentPlan"?"planId":"followThroughId"]),"ARTIFACT_ID_INVALID");Date(v["createdAt"]);Text(v["registerId"],256);Text(v["registerVersion"],256);Require(A(v["reviewNeeds"],200).Count>0,"REVIEW_NEEDS_REQUIRED");
        foreach(var o in Objects(v)) {
            if(o["artifactId"]!=null && o["revision"]!=null)Ref(o);
            if(o["unknown"]!=null)Require(Sentinels.Contains(S(o["unknown"])),"UNKNOWN_SENTINEL_INVALID");
            if(o["sources"] is JArray) {var refs=A(o["sources"]);foreach(var t in refs)SourceRef(t);Require(refs.Select(H).Distinct().Count()==refs.Count && (refs.Count>0)==(o["unknown"]==null),"CITATION_OR_SENTINEL");}
            if(o["sourceRefs"] is JArray){var refs=A(o["sourceRefs"]);foreach(var t in refs)SourceRef(t);Require(refs.Select(H).Distinct().Count()==refs.Count,"CITATION_DUPLICATE");}
            foreach(var prop in o.Properties()) {
                var name=prop.Name; if(name.EndsWith("Id",StringComparison.Ordinal) && name!="sourceId" && name!="registerId" && name!="destinationId" && name!="ctaId") Require(Id(prop.Value),"CONTENT_ID_INVALID");
                if(name=="role")Require(Text(prop.Value,200).IndexOf('@')<0,"PERSON_NOT_ROLE");
                if(name=="status" && S(prop.Value)=="accepted" || name=="acceptance" && !Null(prop.Value))throw new Denied("DRAFT_CANNOT_ACCEPT");
                if(name=="authorityBindingRef")Require(Null(prop.Value),"DRAFT_CANNOT_BIND_AUTHORITY");
                if(name=="proposedAudience")Require(A(prop.Value).All(x=>Text(x).IndexOf('@')<0),"RECIPIENT_FORBIDDEN");
                if(name=="href" && !Null(prop.Value)) {Uri u;Require(Uri.TryCreate(S(prop.Value),UriKind.Absolute,out u) && u.Scheme=="https" && u.UserInfo=="" && !S(prop.Value).Contains("@"),"URL_UNSAFE");}
            }
        }
        if(kind=="campaignBrief") {foreach(var k in new[]{"audience","painPoints","message","channelPlan"})Require(A(v[k]).Count>0,"BRIEF_REQUIRED_GROUP"); if(v["claimMap"]!=null)foreach(var item in A(v["claimMap"])) {var path=S(item["path"]);Require(Match(path,"^(objective|(audience|painPoints|channelPlan|evidenceGaps)\\[([0-9]+)\\])$"),"CLAIM_PATH_INVALID");if(path!="objective") {var m=Regex.Match(path,"^([A-Za-z]+)\\[([0-9]+)\\]$");int index;Require(int.TryParse(m.Groups[2].Value,out index) && index<A(v[m.Groups[1].Value]).Count,"CLAIM_PATH_MISSING");}}}
        else CrossReferences(kind,v);
    }
    static HashSet<string> Unique(JToken a,string field) {var items=A(a);var ids=new HashSet<string>(items.Select(x=>Text(x[field],128)),StringComparer.Ordinal);Require(ids.Count==items.Count,"DUPLICATE_ID");return ids;}
    static void Scope(JToken group,HashSet<string> ids) {foreach(var x in A(group))Require(A(x["scopeRefs"]).All(t=>ids.Contains(S(t))),"SCOPE_REF_INVALID");}
    static void CrossReferences(string kind,JObject v)
    {
        var requirements=A(v["approvalRequirements"]);var reqs=Unique(requirements,"requirementId");var scopes=new HashSet<string>(StringComparer.Ordinal);
        if(kind=="contentPlan") {
            Ref(v["acceptedBrief"],"campaignBrief");Require(Id(v["acceptedBrief"]["acceptanceReceiptId"]),"ACCEPTANCE_REQUIRED");
            var assets=Unique(v["assetRegister"],"assetId");var variants=Unique(v["copyVariants"],"variantId");var deps=Unique(v["dependencies"],"dependencyId");Unique(v["contentCalendar"],"entryId");Require(assets.Count>0 && variants.Count>0,"PLAN_REQUIRED_GROUP");
            scopes.UnionWith(assets);scopes.UnionWith(variants);scopes.Add(S(v["planId"]));scopes.Add("primary");Scope(v["proposedOwners"],scopes);Scope(requirements,scopes);var depScope=new HashSet<string>(scopes);depScope.UnionWith(deps);Scope(v["dependencies"],depScope);
            if(Null(v["primaryDestination"]["href"]))Require(Sentinels.Contains(S(v["primaryDestination"]["unknown"])),"DESTINATION_UNKNOWN_REQUIRED");
            foreach(var variant in A(v["copyVariants"]))Require(assets.Contains(S(variant["assetId"])) && A(variant["body"]).Count>0 && A(variant["audience"]).Count>0,"VARIANT_REF_INVALID");
            foreach(var asset in A(v["assetRegister"]))Require(A(asset["audience"]).Count>0 && A(asset["accessibilityRequirements"]).Count>0 && A(asset["reviewRequirementIds"]).All(x=>reqs.Contains(S(x))) && requirements.Any(r=>Contains(asset["reviewRequirementIds"],S(r["requirementId"])) && S(r["reviewKind"])=="copyChannel" && Contains(r["scopeRefs"],S(asset["assetId"]))) && A(v["copyVariants"]).Any(x=>S(x["assetId"])==S(asset["assetId"])),"ASSET_REVIEW_COVERAGE");
            foreach(var entry in A(v["contentCalendar"]))Require(A(entry["assetIds"]).Count>0 && A(entry["assetIds"]).All(x=>assets.Contains(S(x))) && A(entry["dependencyIds"]).All(x=>deps.Contains(S(x))),"CALENDAR_REF_INVALID");
            foreach(var d in A(v["dependencies"]))if(!Null(d["relatedArtifact"]) && S(d["relatedArtifact"]["kind"])=="campaignBrief")Require(S(d["relatedArtifact"]["artifactId"])==S(v["acceptedBrief"]["artifactId"]),"DEPENDENCY_BRIEF_MISMATCH");
        } else {
            Ref(v["campaignPacket"]["brief"],"campaignBrief");if(!Null(v["campaignPacket"]["contentPlan"]))Ref(v["campaignPacket"]["contentPlan"],"contentPlan");Require(A(v["meetingSources"]).Count>0,"MEETING_SOURCE_REQUIRED");
            var decisions=Unique(v["decisions"],"decisionProposalId");var actions=Unique(v["actionProposals"],"actionProposalId");scopes.UnionWith(decisions);scopes.UnionWith(actions);scopes.UnionWith(Unique(v["briefChanges"],"changeProposalId"));scopes.UnionWith(Unique(v["communicationsDrafts"],"communicationDraftId"));Unique(v["unresolvedQuestions"],"questionId");scopes.Add(S(v["followThroughId"]));Scope(requirements,scopes);
            foreach(var group in new[]{"decisions","actionProposals","briefChanges"})foreach(var x in A(v[group])) {
                Require(A(x["evidence"]).Count>0 && A(x["evidence"]).All(e=>A(v["meetingSources"]).Any(s=>H(e["source"])==H(s["source"]))),"EVIDENCE_OUTSIDE_MEETING");
                Require(requirements.Any(r=>S(r["requirementId"])==S(x["reviewRequirementId"]) && (S(r["reviewKind"])=="meetingDecisionsActions" || group=="briefChanges" && S(r["reviewKind"])=="strategyVoice")),"PROPOSAL_REVIEW_MISSING");
                if(group=="actionProposals")Require(A(x["dependencyIds"]).All(y=>actions.Contains(S(y)) || decisions.Contains(S(y))),"ACTION_DEPENDENCY_INVALID");
                if(group=="briefChanges") {Require(H(x["targetBrief"])==H(v["campaignPacket"]["brief"]),"BRIEF_CHANGE_TARGET");var field=Text(x["field"],40);var briefSchema=Obj(Schemas["campaign-brief.v1.json"]);Require(briefSchema["properties"][field] is JObject && !new[]{"briefId","schemaVersion","workId","registerId","registerVersion","createdAt","claimMap"}.Contains(field),"BRIEF_CHANGE_FIELD");Schema(x["proposedValue"],Obj(briefSchema["properties"][field]),briefSchema);}
            }
            foreach(var d in A(v["communicationsDrafts"]))Require(A(d["body"]).Count>0 && A(d["proposedAudience"]).Count>0 && A(d["reviewRequirementIds"]).All(x=>reqs.Contains(S(x))) && requirements.Any(r=>Contains(d["reviewRequirementIds"],S(r["requirementId"])) && S(r["reviewKind"])=="communicationsSend"),"SENDER_REVIEW_MISSING");
            Require(A(v["nextGate"]["requiredReviewIds"]).All(x=>reqs.Contains(S(x))),"NEXT_GATE_REF");
        }
    }
}
