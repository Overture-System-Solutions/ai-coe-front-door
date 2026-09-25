public partial class Script
{
    sealed partial class Engine
    {
        void AuthorizeRecordedReview(JToken value)
        {
            var result=value as JObject;
            if(result==null || S(result["kind"])!="recorded" || !new[]{"RequestReviewV1","RecordReviewDecisionV1","RecoverMarketingIntentV1"}.Contains(op))return;
            var decision=result["decision"] as JObject;var request=result["request"] as JObject;
            var review=decision??request;Require(review!=null,"REVIEW_RESULT_MISSING");
            var envelope=AuthorizeArtifact(S(review["target"]["artifactId"]));EnvelopeSources(envelope);
            Require(H(RefOf(envelope))==H(review["target"]) && RequiredReviews(envelope).Contains(S(review["reviewKind"])),"REVIEW_REPLAY_STALE");
            if(decision!=null) {
                var binding=Get("authority:"+S(decision["authorityBindingRef"]));
                Require(S(decision["actorId"])==actor && actor!=S(envelope["createdBy"]) && Contains(member["roles"],"marketingReviewer") && binding!=null && S(binding["actorId"])==actor && Authority(binding,S(decision["reviewKind"])) && S(decision["registerSnapshotHash"])==snapshotHash && S(decision["expectedStoreVersion"])==Version(envelope),"REVIEW_REPLAY_AUTHORITY");
            } else Require(S(request["requestedBy"])==actor && S(envelope["createdBy"])==actor && Contains(member["roles"],"marketingParticipant"),"REVIEW_REQUEST_REPLAY_AUTHORITY");
            Require(!new[]{"superseded","revalidationRequired"}.Contains(State(envelope)),"REVIEW_REPLAY_REVALIDATION");
        }
        JObject RequestReview()
        {
            var target=body["target"];var e=Get("envelope:"+S(target["artifactId"])+":"+I(target["revision"]));if(e==null || S(e["payloadHash"])!=S(target["payloadHash"]))return Failed("notFound","No artifact revision with that id, revision and content exists.");
            if(!RequiredReviews(e).Contains(S(body["reviewKind"])))return Failed("unauthorizedReviewer","This review kind cannot accept this artifact.");
            if(S(e["createdBy"])!=actor || !Contains(member["roles"],"marketingParticipant"))return Failed("notAuthorized","Only the person who saved a revision may send it for review.");
            var state=State(e);if(!new[]{"draft","changesRequested","reviewRequested"}.Contains(state))return Failed("staleVersion","The revision reads as "+state+"; only a draft can be sent for review.");
            var request=O("requestId",NewId("RVQ"),"target",target,"reviewKind",body["reviewKind"],"requestedBy",actor,"requestedAt",Stamp());Write("request:"+S(request["requestId"]),request);return O("kind","recorded","request",request,"state",state=="draft"?"reviewRequested":state);
        }
        JObject Decision()
        {
            Require(Contains(member["roles"],"marketingReviewer"),"REVIEWER_ROLE_REQUIRED");var reviewKind=S(body["reviewKind"]);var binding=Values("authority:").FirstOrDefault(a=>S(a["actorId"])==actor && S(a["tenantScope"])==site && !B(a["synthetic"]) && !B(a["revoked"]) && Contains(a["scope"],reviewKind));
            if(binding==null)return Failed("unauthorizedReviewer","No reviewer authority is bound to this session; the real Marketing owner and copy/channel approver remain unbound.");
            if(Date(binding["expiresAt"])<=now)return Failed("authorityExpired","The reviewer's authority has expired.");
            var target=body["target"];var e=Get("envelope:"+S(target["artifactId"])+":"+I(target["revision"]));if(e==null)return Failed("notFound","No artifact revision with that id and revision exists.");
            if(!RequiredReviews(e).Contains(reviewKind))return Failed("unauthorizedReviewer","This review kind cannot accept this artifact.");
            if(H(RefOf(e))!=H(target))return Failed("staleVersion","The content hash differs from the stored revision; re-read before deciding.");
            if(Version(e)!=S(body["expectedStoreVersion"]))return Failed("staleVersion","The record changed since it was read (store version mismatch); re-read before deciding.");
            var latest=Latest(S(e["artifactId"]));if(I(latest["revision"])!=I(e["revision"]))return Failed("staleVersion","Revision "+I(e["revision"])+" is superseded by revision "+I(latest["revision"])+"; a late review cannot accept an older revision.");
            if(S(e["createdBy"])==actor)return Failed("selfReview","The person who saved a revision may not decide its review.");
            if(!ForArtifact("request:",S(e["artifactId"])).Any(request=>I(request["target"]["revision"])==I(e["revision"]) && S(request["reviewKind"])==reviewKind))return Failed("noRequest","No review of this kind was requested for this revision.");
            EnvelopeSources(e);if(new[]{"superseded","revalidationRequired"}.Contains(State(e)))return Failed("staleVersion","Authority, sources or parent revisions changed before verification.");
            var digest=H(O("target",target,"reviewKind",reviewKind,"outcome",body["outcome"],"comments",body["comments"],"actor",actor));var intentKey="review:"+Hash(site+"\n"+actor+"\n"+S(body["idempotencyKey"]));var intent=Get("intent:"+intentKey);
            if(intent!=null) {if(S(intent["payloadDigest"])!=digest)return Failed("keyReuse","This idempotency key was already used for a different decision; a new intent needs a new key.");var prior=Get(S(intent["resultKey"]));if(prior==null)return Uncertain(intentKey,"An earlier attempt with this key is pending and could not be reconciled; do not retry blind.");return ReconcileDecision(prior,intent,true);}
            var reviewId=NewId("RVW");var receiptId=NewId("RCPT");var stamp=Stamp();var d=O("decisionVersion","1.0","reviewId",reviewId,"workId",e["workId"],"target",target,"reviewKind",reviewKind,"outcome",body["outcome"],"comments",body["comments"],"expectedArtifactRevision",target["revision"],"expectedStoreVersion",body["expectedStoreVersion"],"registerSnapshotHash",snapshotHash,"contentHash",target["payloadHash"],"policyVersion","copy-policy-local-baseline-v1","authorityBindingRef",binding["bindingRef"],"authorityScope",binding["scope"],"authorityExpiresAt",binding["expiresAt"],"actorId",actor,"decidedAt",stamp,"idempotencyKey",intentKey,"receiptId",receiptId,"readbackVerified",true);
            var r=O("receiptId",receiptId,"operation","recordDecision","targetRef","decision:"+reviewId,"payloadHash",digest,"readbackHash",target["payloadHash"],"result","PASS","observedAt",stamp,"actorId",actor);var i=O("key",intentKey,"operation","recordDecision","payloadDigest",digest,"status","completed","resultKey","decision:"+reviewId,"startedAt",stamp);
            Write("receipt:"+receiptId,r);Write("intent:"+intentKey,i);Write("decision:"+reviewId,d);
            return O("kind","recorded","decision",d,"receipt",r,"state",ProjectedState(e),"replayed",false);
        }
        string ProjectedState(JObject e) {var originals=new Dictionary<string,Record>();foreach(var write in writes){var key=S(write["Key"]);Record held;records.TryGetValue(key,out held);originals[key]=held;records[key]=new Record {Key=key,Value=Obj(write["Value"]),Version=null};}try{return State(e);}finally {foreach(var original in originals){if(original.Value==null)records.Remove(original.Key);else records[original.Key]=original.Value;}}}
        JObject Uncertain(string key,string reason) {var failed=Failed("uncertain",reason);failed["intentKey"]=key;return failed;}
        JObject ReconcileDecision(JObject decision,JObject intent,bool replayed)
        {
            var e=AuthorizeArtifact(S(decision["target"]["artifactId"]));EnvelopeSources(e);Require(S(decision["actorId"])==actor && H(RefOf(e))==H(decision["target"]) && S(decision["registerSnapshotHash"])==snapshotHash,"REVIEW_RECOVERY_STALE");var binding=Get("authority:"+S(decision["authorityBindingRef"]));Require(binding!=null && S(binding["actorId"])==actor && Authority(binding,S(decision["reviewKind"])) && actor!=S(e["createdBy"]) && Contains(member["roles"],"marketingReviewer"),"REVIEW_RECOVERY_AUTHORITY");
            var digest=H(O("target",decision["target"],"reviewKind",decision["reviewKind"],"outcome",decision["outcome"],"comments",decision["comments"],"actor",actor));Require(digest==S(intent["payloadDigest"]),"REVIEW_RECOVERY_DIGEST");
            var receipt=Get("receipt:"+S(decision["receiptId"]));if(Durable(decision) && B(decision["readbackVerified"]))return O("kind","recorded","decision",decision,"receipt",receipt,"state",State(e),"replayed",replayed);
            receipt=O("receiptId",decision["receiptId"],"operation","recordDecision","targetRef","decision:"+S(decision["reviewId"]),"payloadHash",digest,"readbackHash",decision["contentHash"],"result","PASS","observedAt",Stamp(),"actorId",actor);var oldReceipt=Get("receipt:"+S(decision["receiptId"]));if(oldReceipt!=null){var cmp=Obj(Clone(oldReceipt));cmp["observedAt"]=Clone(receipt["observedAt"]);Require(H(cmp)==H(receipt),"RECOVERY_RECEIPT_CONFLICT");receipt=oldReceipt;}else Write("receipt:"+S(decision["receiptId"]),receipt);
            var completed=Obj(Clone(intent));completed["status"]="completed";if(S(intent["status"])!="completed")Write("intent:"+S(intent["key"]),completed,records["intent:"+S(intent["key"])].Version);var verified=Obj(Clone(decision));verified["readbackVerified"]=true;if(!B(decision["readbackVerified"]))Write("decision:"+S(decision["reviewId"]),verified,records["decision:"+S(decision["reviewId"])].Version);
            return O("kind","recorded","decision",verified,"receipt",receipt,"state",ProjectedState(e),"replayed",false);
        }
    }
}
