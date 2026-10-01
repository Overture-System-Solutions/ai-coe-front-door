// Local Microsoft ScriptBase boundary shim. Does not substitute connector business code.
using System;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
public interface IScriptContext { string OperationId {get;} HttpRequestMessage Request {get;} }
public abstract class ScriptBase {
 public IScriptContext Context {get;set;}
 public CancellationToken CancellationToken {get;set;}
 public static StringContent CreateJsonContent(string json) {return new StringContent(json,Encoding.UTF8,"application/json");}
 public abstract Task<HttpResponseMessage> ExecuteAsync();
}
class LocalContext:IScriptContext { public string OperationId {get{return "Evaluate";}} public HttpRequestMessage Request {get;set;} }
class Program {
 public static async Task Main(string[] args) {
  if(args.Length>0 && args[0]=="--script-hash") { Console.WriteLine(ScriptDigest.Sha256); return; }
  if(args.Length>0 && args[0]=="--direct") { var b=Newtonsoft.Json.Linq.JObject.Parse(Console.In.ReadToEnd()); Console.WriteLine(Script.Evaluate((string)b["Mode"], Newtonsoft.Json.JsonConvert.DeserializeObject<Newtonsoft.Json.Linq.JObject>((string)b["Payload"],new Newtonsoft.Json.JsonSerializerSettings {DateParseHandling=Newtonsoft.Json.DateParseHandling.None}))); return; }
  if(args.Length>0 && args[0]=="--lines") { string line; while((line=Console.ReadLine())!=null) { try { Console.WriteLine(await Execute(line)); } catch(Exception e) { Console.WriteLine("{\"HARNESS_ERROR\":"+Newtonsoft.Json.JsonConvert.SerializeObject(e.ToString())+"}"); } } }
  else Console.Write(await Execute(Console.In.ReadToEnd()));
 }
 static async Task<string> Execute(string input) {
  var script=new Script {Context=new LocalContext {Request=new HttpRequestMessage(HttpMethod.Post,"https://unused.invalid/evaluate") {Content=new StringContent(input)}}};
  var response=await script.ExecuteAsync(); return await response.Content.ReadAsStringAsync();
 }
}
