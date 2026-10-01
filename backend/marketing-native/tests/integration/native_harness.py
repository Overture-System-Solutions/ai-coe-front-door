"""Execute real WDL with a compiled helper and strictly labelled fake external I/O.
This is not Microsoft's hosted engine, a live provider, or tenant acceptance.
"""
import ast, copy, datetime, hashlib, json, re, subprocess, uuid, sys
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote, quote
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'generator'))
from marketing_validate import OfflineExpression
DONOR=ROOT.parent/'core-native/tests/wdl_harness.py'
# Reuse only the inspected expression/action interpreter, never its CORE business fixture.
namespace={'json':json,'re':re,'dt':datetime,'uuid':uuid}
tree=ast.parse(DONOR.read_text());classes=[n for n in tree.body if isinstance(n,ast.ClassDef) and n.name in ('Expression','Engine')]
exec(compile(ast.Module(body=classes,type_ignores=[]),str(DONOR),'exec'),namespace)
BaseExpression,BaseEngine=namespace['Expression'],namespace['Engine']
sha=lambda value:hashlib.sha256(value.encode('utf8')).hexdigest()
def compact(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def canonical(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'),sort_keys=True)
class HttpFailure(RuntimeError):pass
class Crash(BaseException):pass
class CompiledHelper:
    def __init__(self,dll,operation='Evaluate'):
        self.process=subprocess.Popen(['/home/far_cdx/.cache/oss-demo-dotnet/dotnet',str(dll),'--lines'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.calls=[];self.refusals=[];self.operation=operation
    def __call__(self,mode,payload):
        self.calls.append(mode)
        self.process.stdin.write(compact({'Mode':mode,'Payload':compact(payload)})+'\n');self.process.stdin.flush()
        line=self.process.stdout.readline()
        if not line:raise RuntimeError('Compiled helper exited without a response: '+self.process.stderr.read())
        value=json.loads(line)
        if 'HARNESS_ERROR' in value:raise RuntimeError(value['HARNESS_ERROR'])
        if value.get('Valid') is False:self.refusals.append({'mode':mode,'code':value.get('Error')})
        return value
    def close(self):
        self.process.terminate();self.process.wait(timeout=10)
class Expression(OfflineExpression):
    def eval(self,n):
        if n[0]=='call':
            fn,parts=n[1:]
            if fn=='item':return self.e.current_item
            if fn in ('uriComponent','contains','startsWith','lessOrEquals','take','mod','div','toLower','encodeUriComponent'):
                a=[self.eval(p) for p in parts]
                return {'uriComponent':lambda:quote(a[0],safe=''), 'encodeUriComponent':lambda:quote(a[0],safe=''),
                        'contains':lambda:a[1] in a[0], 'startsWith':lambda:a[0].startswith(a[1]),
                        'lessOrEquals':lambda:a[0]<=a[1], 'take':lambda:a[0][:a[1]],
                        'mod':lambda:a[0]%a[1], 'div':lambda:a[0]//a[1], 'toLower':lambda:a[0].lower()}[fn]()
        return super().eval(n)
class Engine(BaseEngine):
    def __init__(self,definition,sp,helper):
        definition_object=definition
        class Flow:
            actions=definition_object['properties']['definition']['actions']
            def definition(self):return definition_object
        super().__init__(Flow(),sp,helper);self.current_item=None;self.action_count=0
    def value(self,v):
        if isinstance(v,str) and v.startswith('@'):return Expression(v,self).run()
        return super().value(v)
    def action(self,name,a):
        self.action_count+=1
        if self.action_count>100000:raise RuntimeError('Fixture bounded action limit exceeded')
        if a['type'] in ('Query','Select'):
            inputs=a['inputs'];rows=self.value(inputs['from']);previous=self.current_item;out=[]
            for item in rows:
                self.current_item=item
                if a['type']=='Query':
                    if self.value(inputs['where']):out.append(item)
                else:out.append(self.value(inputs['select']))
            self.current_item=previous;self.bodies[name]=out;self.outputs[name]={'body':out};return
        if a['type']=='OpenApiConnection':
            p=self.value(a['inputs']['parameters']);op=a['inputs']['host']['operationId']
            if op=='Evaluate':result={'body':self.helper(p['body/Mode'],json.loads(p['body/Payload'])),'headers':{},'statusCode':200}
            elif op=='HttpRequest':result=self.sp.request(p['parameters/method'],p['parameters/uri'],p.get('parameters/body'),p.get('parameters/headers',{}))
            elif op=='GenerateIntakeDraft':result={'body':self.sp.provider(p),'headers':{},'statusCode':200}
            else:raise AssertionError('Unexpected native connector operation: '+op)
            self.outputs[name]=result;self.bodies[name]=result['body'];return
        return super().action(name,a)
class SharePointFixture:
    def __init__(self,common):
        self.site=common['Config']['siteUrl'];self.config=copy.deepcopy(common['Config']);self.now=common['Now']
        self.tables={'canonical':copy.deepcopy(common['Records']),'request':[copy.deepcopy(common['Row'])],'result':[]}
        self.ids={k:self.config[k+'ListId'] for k in self.tables}
        self.calls=[];self.effects=[];self.page_size=5000;self.hook=None;self.crash_after=None;self.provider_calls=[];self.provider_response=None
        self.grants={};self.sources={s['sourceId']:copy.deepcopy(s) for s in common.get('Sources',[])}
        self.fields_allowed={k:{'Title'}|{f['name'] for f in v['fields']} for k,v in zip(['canonical','request','result'],json.loads((ROOT.parent/'power-automate/marketing-runtime/provisioning.json').read_text())['lists'])}
        for key,rows in self.tables.items():
            for row in rows:
                row.setdefault('@odata.etag','"1"')
    def base(self,key):return "_api/web/lists(guid'"+self.ids[key]+"')/items"
    def fields(self,key,value):
        text=compact(value)
        return {'Title':sha(self.site+'\n'+key),'RecordKey':key,'TenantScope':self.site,'RecordJson':text,'RecordHash':sha(text)}
    def effect(self,name):
        self.effects.append(name)
        if self.hook:self.hook(name,self)
        if self.crash_after==len(self.effects):raise Crash(name)
    def can_read(self,item,actor):return actor==self.config['writerPrincipalId'] or self.grants.get(item,{}).get(actor)==[1073741826]
    def result(self,body,status=200,headers=None):return {'body':copy.deepcopy(body),'statusCode':status,'headers':headers or {}}
    def request(self,method,url,body,headers):
        self.calls.append((method,url))
        if url.startswith(self.site+'/'):url=url[len(self.site)+1:]
        if not url.startswith('_api/'):raise HttpFailure('Outside fake approved site')
        if isinstance(body,str):body=json.loads(body)
        if url.startswith('_api/web/currentuser'):return self.result({'Id':self.config['writerPrincipalId']})
        if 'GetFileByServerRelativePath' in url:return self.source_request(method,url,headers)
        match=re.search(r"lists\(guid'([^']+)'\)/items",url)
        if not match:raise HttpFailure('Unimplemented fake SharePoint path: '+url)
        key=next((k for k,v in self.ids.items() if v==match[1]),None)
        if key is None:raise HttpFailure('Unknown private list')
        rows=self.tables[key];item=re.search(r'/items\((\d+)\)',url)
        if item:
            row=next((r for r in rows if r['Id']==int(item[1])),None)
            if row is None:raise HttpFailure('404')
            if '/breakroleinheritance' in url:
                self.grants.setdefault(row['Id'],{self.config['writerPrincipalId']:[1073741829]});self.effect('private-acl:'+str(row['Id']));return self.result({},204)
            if '/roleassignments/addroleassignment' in url:
                actor=int(re.search(r'principalid=(\d+)',url)[1]);role=int(re.search(r'roledefid=(\d+)',url)[1]);self.grants.setdefault(row['Id'],{})[actor]=[role];self.effect('grant:'+str(actor));return self.result({},204)
            if 'RoleAssignments' in url:
                return self.result({'HasUniqueRoleAssignments':row['Id'] in self.grants,'RoleAssignments':[{'PrincipalId':actor,'RoleDefinitionBindings':[{'Id':r} for r in roles]} for actor,roles in self.grants.get(row['Id'],{}).items()]})
            if method=='GET':return self.result(row,headers={'ETag':row['@odata.etag']})
            if method!='POST' or headers.get('X-HTTP-Method')!='MERGE' or headers.get('IF-MATCH') in (None,'*') or headers['IF-MATCH']!=row['@odata.etag']:raise HttpFailure('412')
            if set(body)-self.fields_allowed[key]:raise HttpFailure('400 unknown field')
            row.update(copy.deepcopy(body));prior=int(re.sub(r'\D','',row['@odata.etag']) or 1);row['@odata.etag']='"'+str(prior+1)+'"';self.effect('update:'+key+':'+row['Title']);return self.result({},204)
        if method=='POST':
            if set(body)-self.fields_allowed[key]:raise HttpFailure('400 unknown field')
            unique='RequestId' if key=='result' else 'Title'
            if any(r.get(unique)==body.get(unique) for r in rows):raise HttpFailure('409')
            row={'Id':max([r['Id'] for r in rows]+[0])+1,'@odata.etag':'"1"',**copy.deepcopy(body)};rows.append(row)
            self.effect('insert:'+key+':'+row['Title']);return self.result(row,201,{'ETag':row['@odata.etag']})
        if method!='GET':raise HttpFailure('Unsupported fake method')
        args=parse_qs(urlsplit(url).query)
        if '$filter' in args:
            matched=re.fullmatch(r"(Title|RecordKey|RequestId) eq '((?:''|[^'])*)'",args['$filter'][0])
            if not matched:raise HttpFailure('Unsupported filter')
            rows=[r for r in rows if r.get(matched[1])==matched[2].replace("''", "'")]
        rows=sorted(rows,key=lambda r:r['Id']);offset=int(args.get('$skiptoken',['0'])[0]);size=min(int(args.get('$top',['5000'])[0]),self.page_size)
        result={'value':rows[offset:offset+size]}
        if offset+size<len(rows):result['odata.nextLink']=self.site+'/'+url.split('&$skiptoken=')[0]+('&' if '?' in url else '?')+'$skiptoken='+str(offset+size)
        return self.result(result)
    def source_request(self,method,url,headers):
        if method!='GET':raise HttpFailure('Source writes prohibited')
        for row in self.tables['canonical']:
            if not row['RecordKey'].startswith('source:'):continue
            source=json.loads(row['RecordJson']);entry=source['entry'];path=urlsplit(entry['location']).path
            if path not in unquote(url):continue
            observed=self.sources.get(entry['id'])
            if not observed:raise HttpFailure('Missing fake source bytes')
            if 'getUserEffectivePermissions' in url:return self.result({'GetUserEffectivePermissions':{'Low':observed['permissionLowAfter']}})
            if '/$value' in url:
                if headers.get('If-Match')!=observed['contentETag']:raise HttpFailure('412 source ETag')
                result=self.result(observed['content'],headers={'ETag':observed['contentETag']})
                if self.hook:self.hook('source-bytes',self)
                return result
            return self.result({'ETag':observed['metadataETagAfter']})
        raise HttpFailure('Unknown approved source')
    def provider(self,wire):
        self.provider_calls.append(copy.deepcopy(wire));self.effect('provider-call')
        if callable(self.provider_response):return self.provider_response(wire)
        if self.provider_response is None:raise HttpFailure('Provider deliberately unbound in this fixture')
        return copy.deepcopy(self.provider_response)
