// Record integrity is checked for the whole snapshot, not only records selected by an operation.
public partial class Script
{
    static void Boolean(JToken t) { Require(t!=null && t.Type==JTokenType.Boolean,"BOOLEAN_INVALID"); }
    static void Texts(JToken t) { foreach(var x in A(t)) Text(x); }
    static void EnvelopeShape(JObject e)
    {
        Keys(e,"envelopeVersion tenantScope workId artifactId kind schemaVersion revision supersedes parents payload payloadHash registerSnapshot sourcesUsed workflowVersion policyVersion providerProvenance evidenceGaps knowledge createdBy createdAt testRecord receiptRefs");
        Require(S(e["envelopeVersion"])=="1.0" && S(e["schemaVersion"])=="1.0" && Work(e["workId"]) && Id(e["artifactId"]) && I(e["revision"])>0 && Digest(e["payloadHash"]) && S(e["payloadHash"])==H(e["payload"]),"ENVELOPE_INTEGRITY");
        Text(e["tenantScope"],1000); Text(e["createdBy"],320); Date(e["createdAt"]); Boolean(e["testRecord"]); Require(!B(e["testRecord"]),"ENVELOPE_TEST_RECORD");
        Artifact(S(e["kind"]),Obj(e["payload"])); Require(S(e["payload"]["workId"])==S(e["workId"]),"ENVELOPE_WORK_MISMATCH");
        if(!Null(e["supersedes"]))Ref(e["supersedes"]);foreach(var r in A(e["parents"]))Ref(r);
        foreach(var s in A(e["sourcesUsed"])) { Keys(Obj(s),"sourceId versionOrETag locator");Text(s["sourceId"],256);Text(s["versionOrETag"],256);Text(s["locator"],2000); }
        var snapshot=Obj(e["registerSnapshot"]);Keys(snapshot,"registerId version snapshotHash snapshotRef");Text(snapshot["registerId"],256);Text(snapshot["version"],256);Text(snapshot["snapshotRef"],1000);Require(Digest(snapshot["snapshotHash"]),"SNAPSHOT_HASH_INVALID");
        var provenance=Obj(e["providerProvenance"]);Keys(provenance,"mode provider model requestId responseId qualificationReceiptRef");Require(new[]{"manual","qualified"}.Contains(S(provenance["mode"])),"PROVENANCE_INVALID");foreach(var k in new[]{"provider","model","requestId","responseId"})Text(provenance[k],256);
        foreach(var k in new[]{"workflowVersion","policyVersion"})Text(e[k],256);Texts(e["evidenceGaps"]);Texts(e["receiptRefs"]);var knowledge=Obj(e["knowledge"]);Keys(knowledge,"known assumed unknown");foreach(var k in new[]{"known","assumed","unknown"})Texts(knowledge[k]);
    }
    static void RecordShape(string key,JObject v)
    {
        string family=key.Split(':')[0];
        switch(family) {
        case "member":
            Keys(v,"actorId enabled roles workIds audience");Text(v["actorId"],320);Text(v["audience"],256);Boolean(v["enabled"]);Require(A(v["roles"],10).All(x=>new[]{"employee","marketingParticipant","marketingReviewer"}.Contains(S(x))) && A(v["workIds"],500).All(Work),"MEMBERSHIP_INVALID");break;
        case "authority":
            Keys(v,"bindingRef actorId scope expiresAt synthetic","tenantScope revoked label");Require(key=="authority:"+Text(v["bindingRef"],256),"AUTHORITY_KEY");Text(v["actorId"],320);Date(v["expiresAt"]);Boolean(v["synthetic"]);if(v["revoked"]!=null)Boolean(v["revoked"]);Require(A(v["scope"],10).All(x=>Reviews.Contains(S(x)) || S(x)=="sourceRegister"),"AUTHORITY_SCOPE");break;
        case "qualification":
            Require(new[]{"PASS","FAIL","INCONCLUSIVE","DENIED"}.Contains(S(v["result"])) && Digest(v["bindingHash"]),"QUALIFICATION_MALFORMED");Date(v["expiresAt"]);break;
        case "envelope":
            EnvelopeShape(v);Require(key=="envelope:"+S(v["artifactId"])+":"+I(v["revision"]),"ENVELOPE_KEY");break;
        case "source":
            Keys(v,"entry actors purposes audiences contentHash revoked");Require(key=="source:"+Text(v["entry"]["id"],256) && Digest(v["contentHash"]),"SOURCE_RECORD_INVALID");Texts(v["actors"]);Texts(v["audiences"]);Require(A(v["purposes"]).All(x=>Kinds.Contains(S(x))),"SOURCE_PURPOSE_INVALID");Boolean(v["revoked"]);break;
        case "command":
            Require(new[]{"pending","completed"}.Contains(S(v["status"])) && Digest(v["fingerprint"]),"COMMAND_RECORD_INVALID");Text(v["actorId"],320);Date(v["startedAt"]);ValidatePayload(Text(v["operation"],80),Obj(v["payload"]));if(S(v["status"])=="completed")Require(v.Property("result")!=null,"COMMAND_RESULT_MISSING");break;
        case "writer":
            Require(new[]{"idle","claimed"}.Contains(S(v["status"])),"WRITER_RECORD_INVALID");if(S(v["status"])=="claimed") {Require(UUID(v["requestId"]),"WRITER_REQUEST_INVALID");Text(v["token"],256);Date(v["claimedAt"]);}break;
        case "provider":
            Require(new[]{"pending","completed"}.Contains(S(v["status"])) && Digest(v["wireHash"]),"PROVIDER_RECORD_INVALID");if(S(v["status"])=="completed")Obj(v["response"]);break;
        case "native-plan":
            Require(new[]{"prepared","completed"}.Contains(S(v["status"])) && Digest(v["fingerprint"]),"PLAN_RECORD_INVALID");var plan=Obj(v["plan"]);Require(B(plan["Valid"]) && !B(plan["NeedProvider"]) && plan.Property("Result")!=null,"PLAN_INVALID");A(plan["Writes"]);break;
        case "receipt":
            Require(key=="receipt:"+Text(v["receiptId"],256) && Digest(v["payloadHash"]) && (Null(v["readbackHash"]) || Digest(v["readbackHash"])) && new[]{"PASS","FAIL","INCONCLUSIVE","DENIED"}.Contains(S(v["result"])),"RECEIPT_RECORD_INVALID");Text(v["operation"],80);Text(v["actorId"],320);Text(v["targetRef"],1000);if(v["observedAt"]!=null)Date(v["observedAt"]);break;
        case "intent":
            Require(key=="intent:"+Text(v["key"],512) && Digest(v["payloadDigest"]) && new[]{"pending","completed"}.Contains(S(v["status"])) && new[]{"saveRevision","requestReview","recordDecision"}.Contains(S(v["operation"])),"INTENT_RECORD_INVALID");Date(v["startedAt"]);if(S(v["status"])=="completed")Text(v["resultKey"],512);break;
        case "request":
            Require(key=="request:"+Text(v["requestId"],256) && Reviews.Contains(S(v["reviewKind"])),"REQUEST_RECORD_INVALID");Ref(v["target"]);Text(v["requestedBy"],320);Date(v["requestedAt"]);break;
        case "decision":
            Require(key=="decision:"+Text(v["reviewId"],256) && S(v["decisionVersion"])=="1.0" && Reviews.Contains(S(v["reviewKind"])) && new[]{"accept","reject","requestChanges"}.Contains(S(v["outcome"])) && Digest(v["contentHash"]) && S(v["contentHash"])==S(v["target"]["payloadHash"]),"DECISION_RECORD_INVALID");Ref(v["target"]);Text(v["actorId"],320);Date(v["decidedAt"]);Date(v["authorityExpiresAt"]);Boolean(v["readbackVerified"]);break;
        case "snapshot":Require(key=="snapshot:"+Text(v["registerId"],256)+":"+Text(v["version"],256),"SNAPSHOT_KEY");A(v["rows"],500);break;
        case "register":Obj(v["register"]);Obj(v["evidence"]);A(v["revoked"],500);Text(v["snapshotRef"],1000);break;
        default:throw new Denied("RECORD_UNSUPPORTED");
        }
    }
    static void ResultShape(string op,JToken v)
    {
        if(op=="ListMarketingWorkV1") {Require(A(v).All(Work),"RESULT_WORK_INVALID");return;}
        if(new[]{"ListArtifactsV1","ListAuthoritiesV1","ListReviewDecisionsV1","ListReviewRequestsV1"}.Contains(op)) {Require(A(v).All(x=>x is JObject),"RESULT_LIST_INVALID");return;}
        if(op=="GetArtifactV1" || op=="GetReviewV1") {if(Null(v))return;Obj(v);if(op=="GetArtifactV1") {EnvelopeShape(Obj(v["envelope"]));Require(Digest(v["storeVersion"]),"RESULT_READBACK_REQUIRED");}return;}
        var o=Obj(v);
        if(op=="ReadSourceRegisterV1") {Boolean(o["available"]);if(B(o["available"]))Obj(o["readback"]);return;}
        if(op=="ReadSourceExcerptV1") {Text(o["sourceId"],256);Text(o["versionOrETag"],256);Require(S(o["excerpt"])!=null,"RESULT_SOURCE_INVALID");return;}
        if(S(o["kind"])=="failed") {Text(o["failure"],256);Texts(o["reasons"]);return;}
        if(op=="RequestReviewV1" || op=="RecordReviewDecisionV1" || op=="RecoverMarketingIntentV1" && S(o["kind"])=="recorded") {Require(S(o["kind"])=="recorded" && (o["request"] is JObject || o["decision"] is JObject),"RESULT_REVIEW_INVALID");return;}
        Require(S(o["kind"])=="saved" && Digest(o["storeVersion"]),"RESULT_DRAFT_INVALID");EnvelopeShape(Obj(o["envelope"]));
    }
}
