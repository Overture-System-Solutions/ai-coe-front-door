public partial class Script
{
    static JObject Storage(string mode,JObject p)
    {
        var c=Config(p["Config"]); var w=Obj(p["Write"]); Keys(w,"Key Value ExpectedVersion");var key=Text(w["Key"],512); var v=Obj(w["Value"]); ValidateRecord(key,v); var text=Json(v); var fields=O("Title",Hash(S(c["siteUrl"])+"\n"+key),"RecordKey",key,"TenantScope",c["siteUrl"],"RecordJson",text,"RecordHash",Hash(text));
        var rs=Records(p["Rows"],c); Require(rs.Count<=1 && rs.Keys.All(k=>k==key),"WRITE_READBACK_AMBIGUOUS"); Record r;rs.TryGetValue(key,out r);bool same=r!=null && S(r.Row["RecordJson"])==text;
        if(mode=="VerifyWrite") {Require(same,"WRITE_UNVERIFIED");return Good();}
        var expected=Null(w["ExpectedVersion"])?null:Text(w["ExpectedVersion"],256);Require(same || r==null && expected==null || r!=null && expected!=null && expected==r.Version,"WRITE_CONFLICT");
        return O("Valid",true,"AlreadyApplied",same,"ItemId",r==null?null:(object)I(r.Row["Id"]),"ExpectedETag",r==null?null:r.Version,"Fields",fields);
    }
    static string ETag(JObject r,bool required=true)
    {
        var values=new[]{r["@odata.etag"],r["odata.etag"],r["__metadata"] is JObject?r["__metadata"]["etag"]:null}.Where(x=>x!=null).ToArray();
        Require(!required || values.Length>0,"ETAG_REQUIRED");if(values.Length==0)return null;
        var tags=values.Select(x=>Text(x,256)).ToArray();Require(tags.Distinct(StringComparer.Ordinal).Count()==1 && tags.All(x=>x!="*" && !x.Any(Char.IsControl)),"ETAG_AMBIGUOUS");return tags[0];
    }
    static JObject Page(JObject p)
    {
        var c=Config(p["Config"]);var page=Obj(p["Page"]); Require(page["error"]==null,"REST_ERROR"); if(page["d"]!=null) page=Obj(page["d"]);Require(page["error"]==null,"REST_ERROR");
        var rows=A(Clone(page["results"]??page["value"]),10000); Require(rows.All(x=>x is JObject),"PAGE_INVALID");
        foreach(var row in rows) {var tag=ETag(Obj(row),false);if(tag!=null)row["@odata.etag"]=tag;}
        var links=new[]{page["__next"],page["@odata.nextLink"],page["odata.nextLink"]}.Where(x=>!Null(x)).ToArray();Require(links.All(x=>S(x)!=null) && links.Select(S).Distinct(StringComparer.Ordinal).Count()<=1,"CONTINUATION_INVALID");var next=links.Length==0?"":S(links[0]);
        if(!String.IsNullOrEmpty(next)) {
            Require(!Uri.UnescapeDataString(next.Split('?')[0]).Contains("..") && !next.Contains("\\"),"CONTINUATION_INVALID");
            var site=new Uri(S(c["siteUrl"])); Uri u; Require(Uri.TryCreate(new Uri(S(c["siteUrl"])+"/"),next,out u) && u.Scheme==site.Scheme && u.Authority==site.Authority && u.UserInfo=="" && u.Fragment=="","CONTINUATION_INVALID");
            var path=Uri.UnescapeDataString(u.AbsolutePath).Replace("lists(guid='","lists(guid'");
            Require(new[]{"requestListId","resultListId","canonicalListId"}.Any(k=>String.Equals(path,site.AbsolutePath+"/_api/web/lists(guid'"+S(c[k])+"')/items",StringComparison.OrdinalIgnoreCase)),"CONTINUATION_LIST_INVALID"); Require(!u.Query.Contains("#") && u.Query.Length<=4000,"CONTINUATION_INVALID"); next="_api/"+u.AbsoluteUri.Substring(u.AbsoluteUri.IndexOf("/_api/",StringComparison.OrdinalIgnoreCase)+6);
        }
        return O("Valid",true,"Rows",rows,"Next",next);
    }
    static void FinalResult(JToken result) { Require(result!=null,"RESULT_MISSING"); if(result is JObject && S(result["kind"])=="saved") Require(Digest(result["storeVersion"]),"RESULT_READBACK_REQUIRED"); }
    static JObject Projection(JObject p,bool verify)
    {
        var c=Config(p["Config"]);var r=Row(p["Row"],c); ValidatePayload(Text(r["Operation"],80),Parse(S(r["PayloadJson"]))); var original=verify?Obj(p["Projection"]):null; var value=verify?original["value"]:p["Result"];FinalResult(value); ResultShape(S(r["Operation"]),value);
        var projection=O("protocol","marketing.v1","requestId",r["Title"],"operation",r["Operation"],"tenantScope",c["siteUrl"],"actorId",r["Author"]["Email"],"value",value,"valueHash",H(value));
        var fields=O("Title",r["Title"],"RequestId",r["Title"],"ResultJson",Json(projection),"VerifiedAuthorId",r["AuthorId"]);
        if(!verify) return O("Valid",true,"Fields",fields,"Projection",projection);
        Require(H(original)==H(projection),"PROJECTION_IDENTITY_INVALID");var rows=A(p["Rows"],2);Require(rows.Count==1,"PROJECTION_READBACK_REQUIRED");var saved=Obj(rows[0]);Require(I(saved["Id"])>0 && I(saved["VerifiedAuthorId"])==I(r["AuthorId"]) && S(saved["Title"])==S(r["Title"]) && S(saved["RequestId"])==S(r["Title"]) && S(saved["ResultJson"])==Json(projection),"PROJECTION_MISMATCH");
        var acl=Obj(p["Permissions"]);if(acl["d"]!=null) acl=Obj(acl["d"]); Require(B(acl["HasUniqueRoleAssignments"]),"PROJECTION_INHERITS"); var a=acl["RoleAssignments"];if(a is JObject)a=a["results"];var assignments=A(a,2); bool participant=false,writer=false; var principals=new HashSet<int>();
        foreach(var item in assignments) {var id=I(item["PrincipalId"]);Require(principals.Add(id),"ACL_DUPLICATE");var defs=item["RoleDefinitionBindings"];if(defs is JObject)defs=defs["results"];var roles=A(defs,20);Require(roles.Count>0 && roles.All(x=>I(x["Id"])>0),"ACL_INVALID");if(id==I(r["AuthorId"])) {Require(roles.Count==1 && I(roles[0]["Id"])==1073741826,"ACL_AUTHOR_NOT_READ");participant=true;} else {Require(id==I(c["writerPrincipalId"]),"ACL_UNEXPECTED_PRINCIPAL");writer=true;} }
        Require(participant && writer,"ACL_REQUIRED_PRINCIPAL_MISSING");return Good();
    }
}
