public partial class Script
{
    const string Limitation="This draft was validated for shape, provenance and copy policy. A citation proves the source exists at the cited version; it does not prove the source supports the claim. A person reviews it before anything is accepted.";
    static readonly string[] Avoided={"transform","unlock","revolutionize","revolutionise","best in class"};
    static readonly string[] Prohibited={"inventedRoi","inventedAdoption","unsupportedAvailability","unsupportedSecurity","unsupportedCapability"};
    sealed partial class Engine
    {
        int idCounter; bool finalizeRequired;
        string NewId(string prefix) {return prefix+"-"+Hash(S(row["Title"])+":"+prefix+":"+(++idCounter).ToString(Invariant)).Substring(0,24).ToUpperInvariant();}
        string Stamp() {var cmd=Get("command:"+S(row["Title"]));var d=cmd==null?Date(row["Created"]):Date(cmd["startedAt"]); return d.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'",Invariant);}
        JObject Failed(string code,string reason) {return O("kind","failed","failure",code,"reasons",new JArray(reason));}
        public JObject Run(string mode)
        {
            preflight=mode=="Preflight";Gather();
            if(preflight)return O("Valid",true,"Fingerprint",fingerprint,"SourceRequests",new JArray(sourceRequests.Values),"NeedProvider",op.StartsWith("Draft",StringComparison.Ordinal));
            var retained=Get("native-plan:"+S(row["Title"]));var command=Get("command:"+S(row["Title"]));
            if(retained!=null) return ReplayPlan(retained);
            if(command!=null && S(command["status"])=="completed") {var result=Clone(command["result"]);AuthorizeResult(result);return O("Valid",true,"NeedProvider",false,"Result",result,"Writes",writes,"FinalizeRequired",false);}
            var resultValue=Operation();if(resultValue is JObject && B(resultValue["NeedProvider"]))return (JObject)resultValue;
            return O("Valid",true,"NeedProvider",false,"Result",resultValue,"Writes",writes,"FinalizeRequired",finalizeRequired || writes.Count>0);
        }
        JToken Operation()
        {
            switch(op) {
            case "ListMarketingWorkV1":return new JArray(A(member["workIds"]).Select(S).Distinct().OrderBy(x=>x,StringComparer.Ordinal));
            case "SaveManualMarketingDraftV1":return Draft(true);
            case "DraftCampaignBriefV1":case "DraftContentPlanV1":case "DraftMeetingFollowThroughV1":return Draft(false);
            case "GetArtifactV1": {var e=body["revision"]==null?Latest(S(body["artifactId"])):Get("envelope:"+S(body["artifactId"])+":"+I(body["revision"]));return e==null?JValue.CreateNull():(JToken)ArtifactView(e);}
            case "ListArtifactsV1":return new JArray(Artifacts(S(body["workId"])).Where(e=>S(e["createdBy"])==actor || !B(body["own"]) && Contains(member["roles"],"marketingReviewer")).Select(ArtifactView));
            case "GetReviewV1":return (JToken)Get("decision:"+S(body["reviewId"]))??JValue.CreateNull();
            case "ListReviewDecisionsV1":return new JArray(ForArtifact("decision:",S(body["artifactId"])));
            case "ListReviewRequestsV1":return new JArray(ForArtifact("request:",S(body["artifactId"])));
            case "ListAuthoritiesV1":return new JArray(Values("authority:").Where(a=>S(a["actorId"])==actor && S(a["tenantScope"])==site && !B(a["synthetic"]) && !B(a["revoked"])));
            case "ReadSourceRegisterV1":Register();return O("available",true,"readback",readback);
            case "ReadSourceExcerptV1":return Source(S(body["reference"]["sourceId"]),S(body["reference"]["versionOrETag"]),"meetingFollowThrough");
            case "RequestReviewV1":return RequestReview();
            case "RecordReviewDecisionV1":return Decision();
            case "RecoverMarketingIntentV1":return Recovery();
            default:throw new Denied("OPERATION_UNSUPPORTED"); }
        }
        IEnumerable<JObject> ForArtifact(string prefix,string id) {return Values(prefix).Where(d=>S(d["target"]["artifactId"])==id);}
        string Version(JObject e) {string key="envelope:"+S(e["artifactId"])+":"+I(e["revision"]);Record record;Require(records.TryGetValue(key,out record),"ENVELOPE_READBACK_REQUIRED");return H(O("key",key,"revision",e["revision"],"payloadHash",e["payloadHash"],"version",record.Version));}
        JObject ArtifactView(JObject e) {EnvelopeSources(e);return O("envelope",e,"state",State(e),"storeVersion",Version(e));}
        string[] RequiredReviews(JObject e) {var kinds=new List<string>{S(e["kind"])=="campaignBrief"?"strategyVoice":S(e["kind"])=="contentPlan"?"copyChannel":"meetingDecisionsActions"}; if(S(e["kind"])=="meetingFollowThrough" && A(e["payload"]["communicationsDrafts"]).Count>0)kinds.Add("communicationsSend");if(e["payload"]["approvalRequirements"] is JArray)foreach(var a in A(e["payload"]["approvalRequirements"]))if(!kinds.Contains(S(a["reviewKind"])))kinds.Add(S(a["reviewKind"]));return kinds.ToArray();}
        bool Durable(JObject d) {var r=Get("receipt:"+S(d["receiptId"]));var intent=Get("intent:"+S(d["idempotencyKey"]));return r!=null && S(r["result"])=="PASS" && S(r["operation"])=="recordDecision" && S(r["targetRef"])=="decision:"+S(d["reviewId"]) && S(r["actorId"])==S(d["actorId"]) && S(r["readbackHash"])==S(d["contentHash"]) && intent!=null && S(intent["status"])=="completed" && S(intent["resultKey"])==S(r["targetRef"]) && S(intent["payloadDigest"])==S(r["payloadHash"]);}
        string State(JObject e,HashSet<string> visited=null)
        {
            if(visited==null)visited=new HashSet<string>();if(!visited.Add(S(e["artifactId"])))return "revalidationRequired";
            var latest=Latest(S(e["artifactId"]));if(latest!=null && I(latest["revision"])>I(e["revision"]))return "superseded"; Register();
            var ds=ForArtifact("decision:",S(e["artifactId"])).Where(d=>I(d["target"]["revision"])==I(e["revision"]) && S(d["contentHash"])==S(e["payloadHash"]) && B(d["readbackVerified"]) && Durable(d)).ToArray();
            var latestReviews=RequiredReviews(e).Select(kind=>ds.Where(d=>S(d["reviewKind"])==kind).OrderBy(d=>S(d["decidedAt"]),StringComparer.Ordinal).LastOrDefault()).ToArray();
            string state=latestReviews.Any(d=>d!=null && S(d["outcome"])=="reject")?"rejected":latestReviews.Any(d=>d!=null && S(d["outcome"])=="requestChanges")?"changesRequested":latestReviews.Any(d=>d!=null && (S(d["registerSnapshotHash"])!=snapshotHash || Date(d["authorityExpiresAt"])<=now))?"revalidationRequired":latestReviews.All(d=>d!=null && S(d["outcome"])=="accept")?"accepted":ForArtifact("request:",S(e["artifactId"])).Any(q=>I(q["target"]["revision"])==I(e["revision"]))?"reviewRequested":"draft";
            foreach(var d in ds.Where(d=>S(d["outcome"])=="accept")){var a=Get("authority:"+S(d["authorityBindingRef"]));if(a==null || S(a["actorId"])!=S(d["actorId"]) || !Authority(a,S(d["reviewKind"])))return "revalidationRequired";}
            if(S(e["registerSnapshot"]["snapshotHash"])!=snapshotHash)return "revalidationRequired";
            foreach(var reference in A(e["parents"])) {var parent=Latest(S(reference["artifactId"]));if(parent==null || S(parent["workId"])!=S(e["workId"]) || S(parent["tenantScope"])!=site || H(RefOf(parent))!=H(reference))return "revalidationRequired";if(S(reference["kind"])=="campaignBrief" && State(parent,new HashSet<string>(visited))!="accepted")return "revalidationRequired";}
            return state;
        }
        void Write(string key,JObject value,string expected=null) {ValidateRecord(key,value);writes.Add(O("Key",key,"Value",value,"ExpectedVersion",expected));}
        string DraftKind() {return op=="SaveManualMarketingDraftV1"?S(body["kind"]):op=="DraftCampaignBriefV1"?"campaignBrief":op=="DraftContentPlanV1"?"contentPlan":"meetingFollowThrough";}
        JObject Inputs(string kind,bool manual)
        {
            if(kind=="campaignBrief")return O("kind",kind,"objective",manual?"":S(body["objective"]),"audienceContext",manual?new JArray():body["audienceContext"]);
            var reference=manual?(kind=="contentPlan"?body["payload"]["acceptedBrief"]:body["payload"]["campaignPacket"]["brief"]):null;
            var brief=AuthorizeArtifact(manual?S(reference["artifactId"]):S(body["briefArtifactId"]));
            if(S(brief["workId"])!=S(body["workId"]) || S(brief["kind"])!="campaignBrief")return Failed("prerequisiteNotAccepted","No campaign brief of this work with that id was found.");
            if(manual || kind=="contentPlan") {var state=State(brief);if(state!="accepted")return Failed("prerequisiteNotAccepted","The brief's current revision "+I(brief["revision"])+" reads as "+state+", not accepted; a content plan starts only from an accepted brief.");}
            EnvelopeSources(brief);Artifact("campaignBrief",Obj(brief["payload"]));
            if(manual) {var r=Obj(Clone(reference));r.Remove("acceptanceReceiptId");if(H(r)!=H(RefOf(brief)))return Failed("prerequisiteNotAccepted","Manual content must bind the exact current accepted brief and current source-valid packet.");}
            if(kind=="contentPlan") {
                var acceptance=ForArtifact("decision:",S(brief["artifactId"])).Where(d=>I(d["target"]["revision"])==I(brief["revision"]) && S(d["contentHash"])==S(brief["payloadHash"]) && S(d["outcome"])=="accept" && B(d["readbackVerified"]) && Durable(d)).OrderBy(d=>S(d["decidedAt"]),StringComparer.Ordinal).LastOrDefault();Require(acceptance!=null,"ACCEPTANCE_MISSING");var accepted=RefOf(brief);accepted["acceptanceReceiptId"]=Clone(acceptance["receiptId"]);
                if(manual && H(accepted)!=H(reference))return Failed("prerequisiteNotAccepted","Manual content must bind the exact current accepted brief and current source-valid packet.");
                return O("kind",kind,"acceptedBrief",accepted,"acceptedBriefPayload",brief["payload"]);
            }
            JObject plan=null;
            if(manual) {var pr=body["payload"]["campaignPacket"]["contentPlan"];if(!Null(pr)){plan=AuthorizeArtifact(S(pr["artifactId"]));if(H(RefOf(plan))!=H(pr) || S(plan["workId"])!=S(body["workId"]) || new[]{"superseded","revalidationRequired"}.Contains(State(plan)))return Failed("prerequisiteNotAccepted","Manual content must bind the exact current accepted brief and current source-valid packet.");}}
            else plan=Artifacts(S(body["workId"]),"contentPlan").LastOrDefault();
            if(plan!=null) {AuthorizeArtifact(S(plan["artifactId"]));EnvelopeSources(plan);}
            var notes=new JArray();if(!manual)foreach(var n in A(body["notes"]))notes.Add(Source(S(n["sourceId"]),S(n["versionOrETag"]),kind,true));
            return O("kind",kind,"brief",RefOf(brief),"briefPayload",brief["payload"],"contentPlan",plan==null?null:RefOf(plan),"notes",notes);
        }
        JObject Draft(bool manual)
        {
            Require(Contains(member["roles"],"marketingParticipant"),"DRAFT_NOT_AUTHORIZED");Register();var kind=DraftKind();var permitted=new JArray();foreach(var id in A(body["sourceIds"]).Select(S).Distinct()){var entry=A(register["entries"]).Single(e=>S(e["id"])==id);permitted.Add(Source(id,S(entry["versionOrETag"]),kind,true));}
            var artifactId=S(body["artifactId"])??NewId(kind=="campaignBrief"?"BRIEF":kind=="contentPlan"?"PLAN":"FOLLOWUP");var previous=body["artifactId"]==null?null:Latest(artifactId);
            if(previous!=null && (S(previous["workId"])!=S(body["workId"]) || S(previous["kind"])!=kind || S(previous["createdBy"])!=actor))return Failed("prerequisiteNotAccepted","The artifact to redraft is not one of this work and kind.");
            if(manual && previous!=null && Version(previous)!=S(body["expectedStoreVersion"]))return Failed("staleVersion","The artifact changed. Reload its current revision before editing.");
            var inputs=Inputs(kind,manual);if(S(inputs["kind"])=="failed")return inputs;var created=Stamp();var request=O("requestId",NewId("REQ"),"operation",kind,"workId",body["workId"],"registerId",register["registerId"],"registerVersion",register["version"],"permittedSources",permitted,"inputs",inputs,"policy",O("avoidedWords",new JArray(Avoided),"prohibitedClaims",new JArray(Prohibited)),"artifactId",artifactId,"createdAt",created);
            JObject payload;string model,responseId,qualification=null;
            if(manual) {payload=Obj(Clone(body["payload"]));payload["schemaVersion"]="1.0";payload["workId"]=Clone(body["workId"]);payload["registerId"]=Clone(register["registerId"]);payload["registerVersion"]=Clone(register["version"]);payload["createdAt"]=created;payload[kind=="campaignBrief"?"briefId":kind=="contentPlan"?"planId":"followThroughId"]=artifactId;model="none";responseId=NewId("MANUAL");}
            else {var response=Provider(request);if(B(response["NeedProvider"]))return response;payload=Obj(response["payload"]);model=S(response["model"]);responseId=S(response["responseId"]);qualification=S(c["provider"]["qualificationReceiptRef"]);}
            Artifact(kind,payload);Require(S(payload["workId"])==S(body["workId"]) && S(payload["registerId"])==S(register["registerId"]) && S(payload["registerVersion"])==S(register["version"]) && S(payload["createdAt"])==created && S(payload[kind=="campaignBrief"?"briefId":kind=="contentPlan"?"planId":"followThroughId"])==artifactId,"PROVIDER_IDENTITY_CHANGED");
            var refs=Citations(payload).ToArray();var offers=permitted.Select(x=>x).Concat((inputs["notes"] as JArray??new JArray()).Select(x=>x)).ToArray();Require(refs.All(r=>offers.Any(o=>S(o["sourceId"])==S(r["sourceId"]) && S(o["versionOrETag"])==S(r["versionOrETag"]))),"CITATION_OUTSIDE_PERMITTED_SET");
            var parents=new JArray();if(kind=="contentPlan") {Require(H(payload["acceptedBrief"])==H(inputs["acceptedBrief"]),"PARENT_OUTPUT_CHANGED");var parent=Obj(Clone(inputs["acceptedBrief"]));parent.Remove("acceptanceReceiptId");parents.Add(parent);}if(kind=="meetingFollowThrough") {Require(H(payload["campaignPacket"]["brief"])==H(inputs["brief"]) && H(payload["campaignPacket"]["contentPlan"])==H(inputs["contentPlan"]),"PACKET_OUTPUT_CHANGED");parents.Add(Clone(inputs["brief"]));if(!Null(inputs["contentPlan"]))parents.Add(Clone(inputs["contentPlan"]));}
            var used=new JArray(permitted.Where(s=>refs.Any(r=>S(r["sourceId"])==S(s["sourceId"]))).Select(s=>O("sourceId",s["sourceId"],"versionOrETag",s["versionOrETag"],"locator",s["locator"])));if(inputs["notes"] is JArray)foreach(var note in A(inputs["notes"]))used.Add(O("sourceId",note["sourceId"],"versionOrETag",note["versionOrETag"],"locator",note["locator"]));
            var claims=Claims(kind,payload);var findings=CopyFindings(claims);var known=new JArray(claims.Where(x=>A(x["sources"]).Count>0).Select(x=>x["text"]));var unknown=new JArray(claims.Where(x=>A(x["sources"]).Count==0).Select(x=>S(x["text"])+" ("+(S(x["unknown"])??"UNKNOWN")+")"));
            var envelope=O("envelopeVersion","1.0","tenantScope",site,"workId",body["workId"],"artifactId",artifactId,"kind",kind,"schemaVersion","1.0","revision",previous==null?1:I(previous["revision"])+1,"supersedes",previous==null?null:RefOf(previous),"parents",parents,"payload",payload,"payloadHash",H(payload),"registerSnapshot",O("registerId",register["registerId"],"version",register["version"],"snapshotHash",snapshotHash,"snapshotRef",readback["snapshotRef"]),"sourcesUsed",used,"workflowVersion","marketing-first-activation-v1","policyVersion","copy-policy-local-baseline-v1","providerProvenance",O("mode",manual?"manual":"qualified","provider",manual?"human":"claude","model",model,"requestId",request["requestId"],"responseId",responseId,"qualificationReceiptRef",qualification),"evidenceGaps",payload["evidenceGaps"],"knowledge",O("known",known,"assumed",new JArray(),"unknown",unknown),"createdBy",actor,"createdAt",created,"testRecord",false,"receiptRefs",new JArray());
            var receiptId=NewId("RCPT");envelope["receiptRefs"]=new JArray(receiptId);var key="envelope:"+artifactId+":"+I(envelope["revision"]);var receipt=O("receiptId",receiptId,"operation","saveRevision","targetRef",key,"payloadHash",envelope["payloadHash"],"readbackHash",envelope["payloadHash"],"result","PASS","observedAt",created,"actorId",actor);
            var intentKey="saveRevision:"+artifactId+":"+I(envelope["revision"])+":"+S(envelope["payloadHash"]).Substring(0,16);var recovery=O("envelope",envelope,"receipt",receipt,"snapshotText",Json(Canonical(snapshot)),"copyFindings",findings,"sourceGaps",new JArray());if(body["expectedStoreVersion"]!=null)recovery["expectedStoreVersion"]=Clone(body["expectedStoreVersion"]);
            var intent=O("key",intentKey,"operation","saveRevision","payloadDigest",envelope["payloadHash"],"status","completed","startedAt",created,"resultKey",key,"draftRecovery",recovery);
            // The complete native-plan is the pending write-ahead intent. These are sequential flow-verified effects.
            Write("snapshot:"+S(register["registerId"])+":"+S(register["version"]),Obj(Canonical(snapshot)));Write(key,envelope);Write("receipt:"+receiptId,receipt);Write("intent:"+intentKey,intent);
            finalizeRequired=Get(key)==null;return O("kind","saved","envelope",envelope,"state",State(envelope),"storeVersion",finalizeRequired?null:Version(envelope),"copyFindings",findings,"sourceGaps",new JArray(),"limitation",Limitation);
        }
        List<JObject> Claims(string kind,JObject v) {var claims=new List<JObject>();if(kind=="campaignBrief")claims.AddRange(A(v["message"]).OfType<JObject>());else if(kind=="contentPlan")foreach(var variant in A(v["copyVariants"])) {claims.Add(Obj(variant["headline"]));claims.AddRange(A(variant["body"]).OfType<JObject>());}else {foreach(var draft in A(v["communicationsDrafts"])) {claims.Add(Obj(draft["subject"]));claims.AddRange(A(draft["body"]).OfType<JObject>());}claims.AddRange(A(v["decisions"]).Select(x=>Obj(x["statement"])));}return claims;}
        JArray CopyFindings(List<JObject> claims) {var findings=new JArray();foreach(var claim in claims){var text=S(claim["text"]);var spaced=" "+Regex.Replace(text.ToLowerInvariant(),"[^a-z0-9]+"," ").Trim()+" ";foreach(var word in Avoided)if(spaced.Contains(" "+word+" "))findings.Add("“"+word+"”: The message house avoids this wording. Say what the thing does instead.");if(A(claim["sources"]).Count==0)foreach(System.Text.RegularExpressions.Match m in Regex.Matches(text,@"(\d+(?:\.\d+)?\s*%)|([$£€]\s?\d[\d,]*(?:\.\d+)?)"))findings.Add("“"+m.Value.Trim()+"”: A figure needs an approved source, or the claim must be marked unknown.");}return findings;}
        void AuthorizeResult(JToken result) {foreach(var o in Objects(result).Where(x=>x["envelope"] is JObject)) {var e=Obj(o["envelope"]);AuthorizeWork(S(e["workId"]));Require(S(e["createdBy"])==actor || Contains(member["roles"],"marketingReviewer"),"RESULT_DENIED");EnvelopeSources(e);} AuthorizeRecordedReview(result); }
        JObject ReplayPlan(JObject retained)
        {
            Require(S(retained["fingerprint"])==fingerprint,"PLAN_FINGERPRINT");var plan=Obj(Clone(retained["plan"]));Require(B(plan["Valid"]) && !B(plan["NeedProvider"]),"PLAN_INVALID");AuthorizeResult(plan["Result"]);
            bool applied=true;var keys=new HashSet<string>(StringComparer.Ordinal);
            foreach(var token in A(plan["Writes"])) {
                var w=Obj(token);Keys(w,"Key Value ExpectedVersion");var key=Text(w["Key"],512);Require(keys.Add(key),"PLAN_DUPLICATE_WRITE");ValidateRecord(key,Obj(w["Value"]));Record held;
                if(!records.TryGetValue(key,out held)) {applied=false;continue;}
                if(S(held.Row["RecordJson"])!=Json(w["Value"])) {
                    // An unapplied CAS update can still be replayed only at its exact original ETag.
                    Require(!Null(w["ExpectedVersion"]) && held.Version==S(w["ExpectedVersion"]) && B(plan["FinalizeRequired"]),"PLAN_WRITE_CONFLICT");applied=false;
                }
            }
            if(!B(plan["FinalizeRequired"]))Require(applied,"PLAN_READBACK_REQUIRED");
            var result=plan["Result"] as JObject;
            if(result!=null && S(result["kind"])=="saved" && applied) {
                var e=Obj(result["envelope"]);var key="envelope:"+S(e["artifactId"])+":"+I(e["revision"]);Require(Get(key)!=null && Json(Get(key))==Json(e),"PLAN_ENVELOPE_MISMATCH");
                // Only an unchanged completed original intent may replay its historical state.
                // New mutation plans still refuse state changes before publication.
                var original=op=="RecoverMarketingIntentV1"?Get("command:"+S(body["intentKey"])):null;
                bool historical=original!=null && S(original["status"])=="completed" && S(original["actorId"])==actor && A(plan["Writes"]).Count==0 && H(original["result"])==H(result);
                Require(historical || S(result["state"])==State(e),"PLAN_STATE_CHANGED");
                var version=Version(e);
                if(B(plan["FinalizeRequired"])) {result["storeVersion"]=version;plan["FinalizeRequired"]=false;}
                else Require(S(result["storeVersion"])==version,"PLAN_VERSION_CHANGED");
            }
            // Review and repair plans also need verified effects, even without a new artifact token.
            if(applied)plan["FinalizeRequired"]=false;
            return plan;
        }
    }
}
