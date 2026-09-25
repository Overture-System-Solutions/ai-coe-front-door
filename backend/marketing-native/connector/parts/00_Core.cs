using System;
using System.Linq;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

// Pure calculation only. The flow owns every read, write, provider call and permission change.
public partial class Script : ScriptBase
{
    static readonly IFormatProvider Invariant = new JsonSerializer().Culture;
    sealed class Denied : Exception { public Denied(string code) : base(code) {} }
    static void Require(bool condition, string code) { if (!condition) throw new Denied(code); }
    static string S(JToken t) { return t != null && t.Type == JTokenType.String ? (string)t : null; }
    static bool B(JToken t) { return t != null && t.Type == JTokenType.Boolean && (bool)t; }
    static int I(JToken t) { return t != null && t.Type == JTokenType.Integer && (long)t <= int.MaxValue && (long)t >= int.MinValue ? (int)t : -1; }
    static bool Null(JToken t) { return t == null || t.Type == JTokenType.Null; }
    static JToken Clone(JToken t) { return t == null ? JValue.CreateNull() : t.DeepClone(); }
    static JObject O(params object[] pairs) { var v = new JObject(); for(int i=0;i<pairs.Length;i+=2) v[(string)pairs[i]]=pairs[i+1] == null ? JValue.CreateNull() : pairs[i+1] is JToken ? Clone((JToken)pairs[i+1]) : JToken.FromObject(pairs[i+1]); return v; }
    static JArray A(JToken t, int max=20000) { Require(t is JArray && ((JArray)t).Count <= max, "ARRAY_INVALID"); return (JArray)t; }
    static JObject Obj(JToken t) { Require(t is JObject,"OBJECT_INVALID"); return (JObject)t; }
    static string Text(JToken t, int max=8000) { var s=S(t); Require(!String.IsNullOrWhiteSpace(s) && s.Length<=max,"TEXT_INVALID"); return s; }
    static bool Match(string text,string pattern) { return text!=null && Regex.IsMatch(text,pattern,RegexOptions.CultureInvariant,TimeSpan.FromSeconds(1)); }
    static bool Id(JToken t) { return Match(S(t),"^[A-Z][A-Z0-9_-]{2,127}$"); }
    static bool Work(JToken t) { return Match(S(t),"^CW-[A-Z0-9][A-Z0-9_-]{2,79}$"); }
    static bool UUID(JToken t) { return Match(S(t),"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"); }
    static bool Digest(JToken t) { return Match(S(t),"^[0-9a-f]{64}$") && S(t)!=new string('0',64); }
    static DateTimeOffset Date(JToken t) { DateTimeOffset d; Require(Match(S(t),"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,7})?Z$") && DateTimeOffset.TryParse(S(t),Invariant,0,out d),"DATE_INVALID"); return DateTimeOffset.Parse(S(t),Invariant); }
    static bool Contains(JToken a,string s) { return a is JArray && ((JArray)a).Any(x=>S(x)==s); }
    static JObject Parse(string text) { Require(text!=null && text.Length<=4000000,"JSON_BOUND"); using(var r=new JsonTextReader(new System.IO.StringReader(text)) { DateParseHandling=DateParseHandling.None, MaxDepth=64 }) { var o=JObject.Load(r,new JsonLoadSettings { DuplicatePropertyNameHandling=DuplicatePropertyNameHandling.Error }); Require(!r.Read(),"JSON_TRAILING"); return o; } }
    static string Json(JToken t) {
        if(Null(t))return "null";
        if(t is JObject) {var props=((JObject)t).Properties().ToList();var indexes=props.Where(p=>IndexKey(p.Name)).OrderBy(p=>UInt32.Parse(p.Name,Invariant));return "{"+String.Join(",",indexes.Concat(props.Where(p=>!IndexKey(p.Name))).Select(p=>Quote(p.Name)+":"+Json(p.Value)))+"}";}
        if(t is JArray)return "["+String.Join(",",((JArray)t).Select(Json))+"]";
        if(t.Type==JTokenType.String)return Quote(S(t));if(t.Type==JTokenType.Boolean)return B(t)?"true":"false";
        if(t.Type==JTokenType.Integer){var n=(long)t;Require(n>=-9007199254740991L && n<=9007199254740991L,"NUMBER_UNSAFE");return n.ToString(Invariant);}
        if(t.Type==JTokenType.Float){double d=(double)t;Require(!Double.IsNaN(d) && !Double.IsInfinity(d),"NUMBER_INVALID");if(d==0)return "0";var raw=d.ToString("R",Invariant).ToLowerInvariant();if(!raw.Contains("e"))return raw;var parts=raw.Split('e');int exponent=Int32.Parse(parts[1],Invariant);if(Math.Abs(d)<1e-6 || Math.Abs(d)>=1e21)return parts[0]+"e"+(exponent>=0?"+":"")+exponent.ToString(Invariant);var sign=parts[0].StartsWith("-")?"-":"";var mantissa=parts[0].TrimStart('-');int point=(mantissa.Contains(".")?mantissa.IndexOf('.'):mantissa.Length)+exponent;var digits=mantissa.Replace(".","");return sign+(point<=0?"0."+new string('0',-point)+digits:point>=digits.Length?digits+new string('0',point-digits.Length):digits.Insert(point,"."));}
        throw new Denied("JSON_TYPE_UNSUPPORTED");
    }
    static bool IndexKey(string s){uint n;return Match(s,"^(0|[1-9][0-9]{0,9})$") && UInt32.TryParse(s,out n) && n<UInt32.MaxValue;}
    static string Quote(string value){var b=new StringBuilder("\"");for(int i=0;i<value.Length;i++){char ch=value[i];switch(ch){case '"':b.Append("\\\"");break;case '\\':b.Append("\\\\");break;case '\b':b.Append("\\b");break;case '\f':b.Append("\\f");break;case '\n':b.Append("\\n");break;case '\r':b.Append("\\r");break;case '\t':b.Append("\\t");break;default:if(ch<32 || Char.IsSurrogate(ch) && !(Char.IsHighSurrogate(ch) && i+1<value.Length && Char.IsLowSurrogate(value[i+1])) && !(Char.IsLowSurrogate(ch) && i>0 && Char.IsHighSurrogate(value[i-1])))b.Append("\\u"+((int)ch).ToString("x4",Invariant));else b.Append(ch);break;}}b.Append('"');return b.ToString();}
    static JToken Canonical(JToken t) { if(t is JObject) { var o=new JObject(); foreach(var p in ((JObject)t).Properties().OrderBy(p=>p.Name,StringComparer.Ordinal)) o[p.Name]=Canonical(p.Value); return o; } if(t is JArray) return new JArray(((JArray)t).Select(Canonical)); return Clone(t); }
    static string Hash(string text) { using(var sha=SHA256.Create()) return String.Concat(sha.ComputeHash(Encoding.UTF8.GetBytes(text)).Select(b=>b.ToString("x2",Invariant))); }
    static string H(JToken t) { return Hash(Json(Canonical(t))); }
    static void Keys(JObject o,string required,string optional="") { var req=required.Split(new[]{' '},StringSplitOptions.RemoveEmptyEntries); var allow=req.Concat(optional.Split(new[]{' '},StringSplitOptions.RemoveEmptyEntries)).ToArray(); Require(req.All(k=>o.Property(k)!=null) && o.Properties().All(p=>allow.Contains(p.Name)),"SCHEMA_FIELDS"); }
    static JObject Good() { return O("Valid",true); }
    public override async Task<HttpResponseMessage> ExecuteAsync()
    {
        JObject result;
        try { Require(Context.OperationId=="Evaluate","OPERATION_INVALID"); var b=Parse(await Context.Request.Content.ReadAsStringAsync().ConfigureAwait(false)); Keys(b,"Mode Payload"); result=Evaluate(Text(b["Mode"],40),Parse(Text(b["Payload"],16000000))); }
        catch(Denied e) { result=O("Valid",false,"Error",e.Message); }
        catch { result=O("Valid",false,"Error","INPUT_INVALID"); }
        return new HttpResponseMessage(HttpStatusCode.OK) { Content=CreateJsonContent(Json(result)) };
    }
    public static JObject Evaluate(string mode,JObject payload)
    {
        try { Require(payload!=null,"INPUT_INVALID"); return Dispatch(mode,payload); }
        catch(Denied e) { return O("Valid",false,"Error",e.Message); }
        catch { return O("Valid",false,"Error","INPUT_INVALID"); }
    }
    static JObject Dispatch(string mode,JObject p)
    {
        if(mode=="Plan" || mode=="Preflight") return new Engine(p).Run(mode);
        if(mode=="InspectWrite" || mode=="VerifyWrite")return Storage(mode,p);
        if(mode=="Page")return Page(p);
        if(mode=="Projection" || mode=="VerifyProjection")return Projection(p,mode=="VerifyProjection");
        throw new Denied("MODE_UNSUPPORTED");
    }
    static JObject Config(JToken token)
    {
        var c=Obj(token); Require(B(c["enabled"]) && B(c["controllerQualified"]) && B(c["securityQualified"]),"NOT_QUALIFIED");
        var site=Text(c["siteUrl"],1000); Uri u; Require(Uri.TryCreate(site,UriKind.Absolute,out u) && u.Scheme=="https" && u.UserInfo=="" && u.Query=="" && u.Fragment=="" && !site.EndsWith("/") && u.AbsolutePath!="/","SITE_INVALID");
        Require(UUID(c["requestListId"]) && UUID(c["resultListId"]) && UUID(c["canonicalListId"]) && new[]{S(c["requestListId"]),S(c["resultListId"]),S(c["canonicalListId"])}.Distinct().Count()==3,"LIST_INVALID");
        Require(I(c["writerPrincipalId"])>0 && I(c["readRoleDefinitionId"])==1073741826,"PRINCIPAL_INVALID"); Text(c["qualificationReceiptRef"],256); return c;
    }
    static JObject Row(JToken token,JObject c)
    {
        var r=Obj(token); var a=Obj(r["Author"]); Require(I(r["Id"])>0 && UUID(r["Title"]) && S(r["ProtocolVersion"])=="marketing.v1" && I(r["AuthorId"])>0 && I(a["Id"])==I(r["AuthorId"]) && I(r["EditorId"])==I(r["AuthorId"]) && S(r["Created"])==S(r["Modified"]) && I(c["writerPrincipalId"])!=I(r["AuthorId"]),"IMMUTABLE_AUTHOR_INVALID"); Date(r["Created"]); Text(a["Email"],320); Text(a["LoginName"],512); Text(r["PayloadJson"],100000); return r;
    }
    sealed class Record { public JObject Row; public JObject Value; public string Key; public string Version; }
    static Dictionary<string,Record> Records(JToken token,JObject c)
    {
        var rows=A(token,10000); Require(Json(rows).Length<=12000000,"SNAPSHOT_BOUND"); var records=new Dictionary<string,Record>(StringComparer.Ordinal); var ids=new HashSet<int>();
        foreach(var t in rows) { var r=Obj(t); var key=Text(r["RecordKey"],512); var text=Text(r["RecordJson"],4000000); var etag=ETag(r); Require(I(r["Id"])>0 && ids.Add(I(r["Id"])) && !records.ContainsKey(key) && S(r["TenantScope"])==S(c["siteUrl"]) && S(r["Title"])==Hash(S(c["siteUrl"])+"\n"+key) && S(r["RecordHash"])==Hash(text),"CANONICAL_INTEGRITY"); var value=Parse(text); ValidateRecord(key,value); records.Add(key,new Record {Row=r,Value=value,Key=key,Version=etag}); }
        return records;
    }
    static void ValidateRecord(string key,JObject v)
    {
        Require(key=="writer:marketing" || key=="register:active" || new[]{"member:","qualification:","authority:","source:","receipt:","snapshot:","envelope:","intent:","request:","decision:","command:","provider:","native-plan:"}.Any(prefix=>key.StartsWith(prefix,StringComparison.Ordinal)),"RECORD_UNSUPPORTED");
        Require(v.Count>0,"RECORD_MALFORMED");
        RecordShape(key,v);
    }
    sealed partial class Engine
    {
        readonly JObject p,c,row,body,member; readonly Dictionary<string,Record> records; readonly string site,actor,op,fingerprint; readonly DateTimeOffset now; readonly JArray writes=new JArray();
        public Engine(JObject input) { p=input;c=Config(p["Config"]);site=S(c["siteUrl"]);row=Row(p["Row"],c); now=Date(p["Now"]);Text(p["RunId"],256);records=Records(p["Records"],c); Qualify(S(c["qualificationReceiptRef"]),H(c));op=Text(row["Operation"],80);body=Parse(S(row["PayloadJson"])); ValidatePayload(op,body);actor=S(row["Author"]["Email"]);member=Get("member:"+I(row["AuthorId"])); Require(member!=null && B(member["enabled"]) && S(member["actorId"])==actor,"MEMBERSHIP_DENIED"); Text(member["audience"],256);Require(A(member["roles"],10).All(x=>new[]{"employee","marketingParticipant","marketingReviewer"}.Contains(S(x))) && A(member["workIds"],500).All(Work),"MEMBERSHIP_INVALID"); fingerprint=H(O("operation",op,"payload",body,"actorId",actor,"tenantScope",site)); var command=Get("command:"+S(row["Title"])); Require(command==null || S(command["fingerprint"])==fingerprint && S(command["actorId"])==actor,"COMMAND_CHANGED"); }
        JObject Get(string key) { Record r;return records.TryGetValue(key,out r)?r.Value:null; }
        void Qualify(string reference,string hash) { var q=Get("qualification:"+reference);Require(q!=null && S(q["result"])=="PASS" && S(q["bindingHash"])==hash && Date(q["expiresAt"])>now,"QUALIFICATION_INVALID"); }
    }
}
