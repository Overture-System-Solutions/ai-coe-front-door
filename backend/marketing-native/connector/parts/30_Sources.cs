public partial class Script
{
    static bool Instruction(string text) {return Match(text,@"(?i)(^|\b)(ignore (all|any|previous|prior) (instructions|rules)|you are now|system prompt|assistant:|</?script|send (this|it|the) (to|now)|approve (this|it) (now|automatically))\b");}
    sealed partial class Engine
    {
        JObject register,readback,snapshot; string snapshotHash; readonly Dictionary<string,JObject> sourceRequests=new Dictionary<string,JObject>(StringComparer.Ordinal); bool preflight;
        void Register()
        {
            if(register!=null)return;
            readback=Get("register:active");Require(readback!=null,"REGISTER_UNAVAILABLE"); var reg=Obj(readback["register"]);var evidence=Obj(readback["evidence"]);Keys(evidence,"receiptId registerId registerVersion snapshotHash approvedByBindingRef approvedAt expiresAt source");
            Require(S(reg["approval"])=="approved" && S(evidence["source"])=="authenticatedReadback" && Date(evidence["approvedAt"])<=now && Date(evidence["expiresAt"])>now && S(evidence["registerId"])==S(reg["registerId"]) && S(evidence["registerVersion"])==S(reg["version"]),"REGISTER_APPROVAL_INVALID");
            Fresh(reg["asOf"]);var entries=A(reg["entries"],500);Require(entries.Select(x=>S(x["id"])).Distinct().Count()==entries.Count && !Match(S(reg["registerId"]),"(^|[^A-Z0-9])FIXTURE([^A-Z0-9]|$)") && !Match(S(reg["version"]),"(?i)fixture"),"REGISTER_FIXTURE_OR_DUPLICATE");
            foreach(var e in entries) {foreach(var name in new[]{"id","location","versionOrETag","owner","classification"})Text(e[name],2000); Require(!Match(S(e["id"]),"(^|[^A-Z0-9])FIXTURE([^A-Z0-9]|$)") && !Match(S(e["versionOrETag"]),"(?i)fixture"),"SOURCE_FIXTURE");Uri u;Require(Uri.TryCreate(S(e["location"]),UriKind.Absolute,out u) && u.Scheme=="https" && u.UserInfo=="","SOURCE_LOCATION");}
            snapshot=O("registerId",reg["registerId"],"version",reg["version"],"rows",new JArray(entries.OrderBy(x=>S(x["id"]),StringComparer.Ordinal)));snapshotHash=H(snapshot);Require(S(evidence["snapshotHash"])==snapshotHash,"REGISTER_SNAPSHOT_CHANGED");
            var receipt=Get("receipt:"+S(evidence["receiptId"]));var authority=Get("authority:"+S(evidence["approvedByBindingRef"]));Require(receipt!=null && S(receipt["receiptId"])==S(evidence["receiptId"]) && S(receipt["operation"])=="approveSourceRegister" && S(receipt["result"])=="PASS" && S(receipt["readbackHash"])==snapshotHash && S(receipt["payloadHash"])==snapshotHash && S(receipt["targetRef"])==S(readback["snapshotRef"]) && authority!=null && S(authority["actorId"])==S(receipt["actorId"]) && Authority(authority,"sourceRegister"),"REGISTER_OWNER_OR_RECEIPT_INVALID");A(readback["revoked"],500);register=reg;
        }
        void Fresh(JToken token) {DateTimeOffset d;Require(Match(S(token),"^\\d{4}-\\d{2}-\\d{2}$") && DateTimeOffset.TryParse(S(token)+"T00:00:00Z",Invariant,0,out d),"ASOF_INVALID"); d=DateTimeOffset.Parse(S(token)+"T00:00:00Z",Invariant);Require(now-d<=TimeSpan.FromDays(180) && d<=now,"SOURCE_STALE");}
        bool Authority(JObject a,string kind) {return a!=null && a["synthetic"]!=null && a["synthetic"].Type==JTokenType.Boolean && !B(a["synthetic"]) && !B(a["revoked"]) && S(a["tenantScope"])==site && Contains(a["scope"],kind) && Date(a["expiresAt"])>now;}
        JObject Source(string id,string version,string purpose,bool scan=false)
        {
            Register();var entry=A(register["entries"]).OfType<JObject>().SingleOrDefault(x=>S(x["id"])==id);Require(entry!=null && S(entry["versionOrETag"])==version && !Contains(readback["revoked"],id),"SOURCE_VERSION_OR_REVOCATION");Fresh(entry["asOf"]);
            var aud=(S(entry["audience"])??"").Trim().ToLowerInvariant();var target=S(member["audience"]).Trim().ToLowerInvariant(); Require(new[]{"","all staff","everyone","internal"}.Contains(aud) || aud.Split(';',',').Any(x=>x.Trim()==target),"SOURCE_AUDIENCE");Require(purpose=="meetingFollowThrough" || !Match(S(entry["classification"]),"(?i)restricted|confidential"),"SOURCE_CLASSIFICATION");
            var src=Get("source:"+id);Require(src!=null && H(src["entry"])==H(entry) && src["revoked"]!=null && src["revoked"].Type==JTokenType.Boolean && !B(src["revoked"]) && Contains(src["actors"],actor) && Contains(src["purposes"],purpose) && Contains(src["audiences"],S(member["audience"])) && Digest(src["contentHash"]),"SOURCE_AUTHORIZATION");
            var u=new Uri(S(entry["location"]));var siteUri=new Uri(site);var decoded=Uri.UnescapeDataString(u.AbsolutePath);Require(u.Scheme==siteUri.Scheme && u.Authority==siteUri.Authority && u.UserInfo=="" && u.Query=="" && u.Fragment=="" && decoded.StartsWith(siteUri.AbsolutePath+"/",StringComparison.Ordinal) && !decoded.Contains("..") && !decoded.Contains("\\") && Match(decoded,"(?i)\\.(txt|md|csv|json)$"),"SOURCE_NOT_SAME_SITE_PLAIN_TEXT");
            var file="_api/web/GetFileByServerRelativePath(decodedurl='"+Uri.EscapeDataString(decoded.Replace("'","''"))+"')";var request=O("sourceId",id,"versionOrETag",version,"PermissionUri",file+"/ListItemAllFields/getUserEffectivePermissions(@u)?@u='"+Uri.EscapeDataString(S(row["Author"]["LoginName"]).Replace("'","''"))+"'","MetadataUri",file+"?$select=ETag","ContentUri",file+"/$value");var key=id+"\n"+version;sourceRequests[key]=request;
            if(preflight)return O("sourceId",id,"versionOrETag",version,"locator",entry["location"]);
            var offered=A(p["Sources"],500).Where(x=>S(x["sourceId"])==id && S(x["versionOrETag"])==version).ToArray();Require(offered.Length==1,"SOURCE_OBSERVATION_REQUIRED");var obs=offered[0];var content=S(obs["content"]);Require(content!=null && content.Length<=200000 && !content.Contains("\0") && S(obs["contentETag"])==version && S(obs["metadataETagBefore"])==version && S(obs["metadataETagAfter"])==version && Hash(content)==S(src["contentHash"]),"SOURCE_READBACK_CHANGED");
            foreach(var name in new[]{"permissionLowBefore","permissionLowAfter"}) {ulong low;Require(Match(S(obs[name]),"^[0-9]+$") && UInt64.TryParse(S(obs[name]),out low),"SOURCE_PERMISSION_INVALID");low=UInt64.Parse(S(obs[name]),Invariant);Require((low&33UL)==33UL,"SOURCE_PERMISSION_DENIED");}
            Require(!scan || !Instruction(content),"SOURCE_INSTRUCTION");return O("sourceId",id,"versionOrETag",version,"locator",entry["location"],"excerpt",content,"mayNotProve",entry["mayNotProve"]??new JValue("Provenance is not proof of the claim."));
        }
        void AuthorizeWork(string work) {Require(Contains(member["workIds"],work),"WORK_DENIED");}
        JObject Latest(string id) {return Values("envelope:").Where(e=>S(e["artifactId"])==id).OrderBy(e=>I(e["revision"])).LastOrDefault();}
        IEnumerable<JObject> Values(string prefix) {return records.Values.Where(r=>r.Key.StartsWith(prefix,StringComparison.Ordinal)).OrderBy(r=>r.Key,StringComparer.Ordinal).Select(r=>r.Value);}
        JObject AuthorizeArtifact(string id) {var e=Latest(id);Require(e!=null && S(e["tenantScope"])==site,"ARTIFACT_NOT_FOUND");AuthorizeWork(S(e["workId"]));Require(S(e["createdBy"])==actor || Contains(member["roles"],"marketingReviewer"),"ARTIFACT_DENIED");return e;}
        void AuthorizeBody(JObject b) {if(b["workId"]!=null)AuthorizeWork(S(b["workId"]));foreach(var key in new[]{"artifactId","briefArtifactId"})if(b[key]!=null)AuthorizeArtifact(S(b[key]));if(b["target"]!=null)AuthorizeArtifact(S(b["target"]["artifactId"]));if(b["reviewId"]!=null){var d=Get("decision:"+S(b["reviewId"]));if(d!=null)AuthorizeArtifact(S(d["target"]["artifactId"]));}if(b["payload"]!=null)foreach(var item in Objects(b["payload"]).Where(x=>x["artifactId"]!=null))AuthorizeArtifact(S(item["artifactId"]));}
        void EnvelopeSources(JObject e,HashSet<string> visited=null)
        {
            if(visited==null)visited=new HashSet<string>();Require(visited.Add(S(e["artifactId"])),"PARENT_CYCLE");Register();Require(S(e["registerSnapshot"]["snapshotHash"])==snapshotHash,"ENVELOPE_REGISTER_CHANGED");foreach(var source in A(e["sourcesUsed"],200))Source(S(source["sourceId"]),S(source["versionOrETag"]),S(e["kind"]));
            foreach(var parent in A(e["parents"])) {var pe=Get("envelope:"+S(parent["artifactId"])+":"+I(parent["revision"]));Require(pe!=null && H(RefOf(pe))==H(parent),"PARENT_MISSING");AuthorizeArtifact(S(pe["artifactId"]));EnvelopeSources(pe,new HashSet<string>(visited));}
        }
        void Gather()
        {
            AuthorizeBody(body);
            if(op=="ListMarketingWorkV1" || op=="ListAuthoritiesV1")return;
            if(op=="RecoverMarketingIntentV1") {GatherRecovery();return;}
            if(op=="ReadSourceRegisterV1") {Register();foreach(var e in A(register["entries"]))Source(S(e["id"]),S(e["versionOrETag"]),"meetingFollowThrough");return;}
            if(op=="ReadSourceExcerptV1") {Source(S(body["reference"]["sourceId"]),S(body["reference"]["versionOrETag"]),"meetingFollowThrough");return;}
            var envs=new List<JObject>();if(op=="ListArtifactsV1")envs.AddRange(Artifacts(S(body["workId"])).Where(e=>S(e["createdBy"])==actor || !B(body["own"]) && Contains(member["roles"],"marketingReviewer")));
            foreach(var name in new[]{"artifactId","briefArtifactId"})if(body[name]!=null)envs.Add(AuthorizeArtifact(S(body[name])));
            if(body["target"]!=null)envs.Add(AuthorizeArtifact(S(body["target"]["artifactId"])));
            if(body["reviewId"]!=null){var d=Get("decision:"+S(body["reviewId"]));if(d!=null)envs.Add(AuthorizeArtifact(S(d["target"]["artifactId"])));}
            if(body["payload"]!=null)foreach(var item in Objects(body["payload"]).Where(x=>x["artifactId"]!=null))envs.Add(AuthorizeArtifact(S(item["artifactId"])));
            foreach(var e in envs)EnvelopeSources(e);
            if(body["sourceIds"]!=null) {Register();var kind=DraftKind();foreach(var id in A(body["sourceIds"]).Select(S).Distinct()){var e=A(register["entries"]).SingleOrDefault(x=>S(x["id"])==id);Require(e!=null,"SOURCE_NOT_REGISTERED");Source(id,S(e["versionOrETag"]),kind,true);} if(body["notes"]!=null)foreach(var n in A(body["notes"]))Source(S(n["sourceId"]),S(n["versionOrETag"]),kind,true);}
        }
        IEnumerable<JObject> Artifacts(string work,string kind=null) {return Values("envelope:").Where(e=>S(e["workId"])==work && (kind==null || S(e["kind"])==kind)).GroupBy(e=>S(e["artifactId"])).Select(g=>g.OrderBy(e=>I(e["revision"])).Last()).OrderBy(e=>S(e["artifactId"]),StringComparer.Ordinal);}
    }
}
