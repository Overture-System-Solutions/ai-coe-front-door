"""Offline WDL action/expression executor with explicitly simulated SharePoint.
Executes the actual generated definition and exact compiled Script.cs. It is NOT
Microsoft's hosted WDL engine, and cannot qualify native imports or permissions.
"""
import atexit, copy, datetime as dt, json, re, subprocess, uuid
from urllib.parse import urlparse,parse_qs
from test_connector import DOTNET,DLL,request
import model

class Crash(BaseException): pass
class Helper:
    def __init__(self):
        self.p=subprocess.Popen([DOTNET,str(DLL),'--lines'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        atexit.register(self.p.terminate)
    def __call__(self,mode,payload):
        self.p.stdin.write(json.dumps({'Mode':mode,'Payload':json.dumps(payload)})+'\n');self.p.stdin.flush()
        answer=json.loads(self.p.stdout.readline()); assert 'HARNESS_ERROR' not in answer,answer
        return answer

class Expression:
    def __init__(self,text,engine): self.s=text.lstrip('@');self.i=0;self.e=engine
    def space(self):
        while self.i<len(self.s) and self.s[self.i].isspace(): self.i+=1
    def parse(self):
        self.space()
        if self.s[self.i]=="'":
            self.i+=1; value=''
            while self.i<len(self.s):
                if self.s[self.i]=="'":
                    self.i+=1
                    if self.i<len(self.s) and self.s[self.i]=="'": value+="'"; self.i+=1; continue
                    break
                value+=self.s[self.i];self.i+=1
            node=('value',value)
        else:
            m=re.match(r'[A-Za-z_][A-Za-z0-9_]*|-?\d+',self.s[self.i:]); assert m,(self.s,self.i)
            name=m.group();self.i+=len(name);self.space()
            if self.i<len(self.s) and self.s[self.i]=='(':
                self.i+=1;args=[];self.space()
                while self.s[self.i]!=')':
                    args.append(self.parse());self.space()
                    if self.s[self.i]==',':self.i+=1;continue
                    break
                assert self.s[self.i]==')',(self.s,self.i);self.i+=1;node=('call',name,args)
            else:node=('value',{'true':True,'false':False,'null':None}.get(name,int(name) if re.fullmatch(r'-?\d+',name) else name))
        self.space()
        while self.i<len(self.s) and self.s[self.i] in '?[':
            if self.s[self.i]=='?':self.i+=1
            assert self.s[self.i]=='[';self.i+=1;key=self.parse();self.space();assert self.s[self.i]==']';self.i+=1;node=('get',node,key);self.space()
        return node
    def eval(self,n):
        if n[0]=='value':return n[1]
        if n[0]=='get':
            v=self.eval(n[1]);k=self.eval(n[2]);return v.get(k) if isinstance(v,dict) else (v[k] if isinstance(v,list) and isinstance(k,int) else None)
        fn,args=n[1:]
        if fn=='if': return self.eval(args[1] if self.eval(args[0]) else args[2])
        a=[self.eval(v) for v in args]; e=self.e
        functions={'outputs':lambda n:e.outputs.get(n),'body':lambda n:e.bodies.get(n),'variables':lambda n:e.variables.get(n),'items':lambda n:e.items[n],'parameters':lambda n:e.parameters[n],
          'string':lambda x: x if isinstance(x,str) else json.dumps(x,separators=(',',':')), 'json':json.loads,'int':int,'concat':lambda *x:''.join(map(str,x)), 'replace':lambda s,a,b:s.replace(a,b),
          'equals':lambda a,b:a==b,'not':lambda a:not a,'and':lambda *a:all(a),'or':lambda *a:any(a),'greater':lambda a,b:a>b,'length':len,'empty':lambda a:a is None or a=='' or a==[] or a=={},
          'coalesce':lambda *a:next((v for v in a if v is not None),None),'first':lambda a:a[0],'last':lambda a:a[-1], 'setProperty':lambda o,k,v:{**o,k:v},'add':lambda a,b:a+b,
          'formatDateTime':lambda t,f:dt.datetime.fromisoformat(t.replace('Z','+00:00')).strftime({'yyyyMMddHHmmss':'%Y%m%d%H%M%S'}[f]),'toUpper':lambda s:s.upper(),
          'uriPath':lambda u:urlparse(u).path,'createArray':lambda *a:list(a),'substring':lambda s,start,count:s[start:start+count],'sub':lambda a,b:a-b,
          'result':lambda n:[{'name':k,'error':v} for k,v in e.errors.items()],
          'union':lambda a,b:a+[v for v in b if v not in a], 'utcNow':lambda:e.sp.now,'guid':lambda:str(uuid.uuid4()),'workflow':lambda:{'run':{'name':e.runid}},
          'addMinutes':lambda t,m:(dt.datetime.fromisoformat(t.replace('Z','+00:00'))+dt.timedelta(minutes=m)).isoformat().replace('+00:00','Z')}
        assert fn in functions, 'Unsupported harness WDL function: '+fn
        return functions[fn](*a)
    def run(self):
        ast=self.parse();assert self.i==len(self.s),(self.s,self.i);return self.eval(ast)

class SharePointFixture:
    def __init__(self,page_size=200):
        self.site='https://test.invalid';self.now='2026-09-23T12:00:00Z';self.page_size=page_size
        self.ids={k:str(uuid.uuid5(uuid.NAMESPACE_URL,k)) for k in model.LISTS};self.tables={k:[] for k in model.LISTS};self.grants={};self.files={};self.effects=[];self.crash_after=None;self.hook=None
        cfg={k:json.loads(v) for k,v,*_ in model.seed_config()};cfg.update(request()['Config']);cfg.update(ServicePrincipalID=99)
        cfg.update({'ListId_'+k:v for k,v in self.ids.items()});cfg.pop('SiteUrl',None)
        for k,v in cfg.items():self.insert('Definitions',{'Title':k,'Value':json.dumps(v)},effect=False)
        self.insert('Journal',{'Title':'CORE_WRITER','State':'IDLE','ActiveIntent':None,'ClaimToken':None,'LeaseUntil':None},effect=False)
        row=request()['Row'];self.insert('Requests',row,effect=False)
    def effect(self,name):
        self.effects.append(name)
        if self.hook:self.hook(self,name)
        if self.crash_after==len(self.effects):raise Crash(name)
    def insert(self,key,fields,effect=True):
        assert not any(r['Title']==fields['Title'] for r in self.tables[key]),'409 unique key'
        fields=copy.deepcopy(fields)
        for name,typ,_ in model.LISTS[key][3]:
            if typ=='DateTime' and fields.get(name): fields[name]=dt.datetime.fromisoformat(fields[name].replace('Z','+00:00')).astimezone(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
        allowed={x[0] for x in model.LISTS[key][3]}|{'Title','ID','Id','Author','AuthorId','@odata.etag'}
        assert not set(fields)-allowed,(key,set(fields)-allowed)
        i=max([r['ID'] for r in self.tables[key]]+[0])+1
        row={**fields,'ID':i,'Id':i,'@odata.etag':'"1"'}
        if key in ('Requests','SystemRequests'):
            row.setdefault('AuthorId',99); row.setdefault('Author',{'Id':99,'EMail':'service@example.invalid'})
        self.tables[key].append(row)
        if effect:self.effect('insert:'+key+':'+fields['Title'])
        return copy.deepcopy(row)
    def request(self,method,uri,body,headers):
        if isinstance(body,str) and body.startswith('{'):body=json.loads(body)
        if uri.startswith('_api/web/GetFolderByServerRelativeUrl'):
            match=re.fullmatch(r"_api/web/GetFolderByServerRelativeUrl\('((?:''|[^'])*)'\)/Files/add\(url='([^']+)',overwrite=true\)",uri)
            assert match,uri
            path=match.group(1).replace("''", "'")+'/'+match.group(2)
            assert method=='POST';self.files[path]=body;self.effect('file:'+path);return {'ServerRelativeUrl':path}
        if uri.startswith('_api/web/GetFileByServerRelativeUrl'):
            match=re.fullmatch(r"_api/web/GetFileByServerRelativeUrl\('((?:''|[^'])*)'\)/\$value",uri)
            assert match,uri
            return self.files[match.group(1).replace("''", "'")]
        if uri.startswith('_api/web/roledefinitions'):return {'value':[{'Id':1073741826,'RoleTypeKind':2}]}
        match=re.search(r"lists\(guid'([^']+)'\)",uri)
        if match:key=next(k for k,v in self.ids.items() if v==match.group(1))
        else:
            match=re.search(r"getbytitle\('([^']+)'\)",uri);assert match,uri;key=next(k for k,v in model.LISTS.items() if v[0]==match.group(1))
        if '/RootFolder' in uri:return {'ServerRelativeUrl':'/sites/test/PrivatePackets'}
        item=re.search(r'/items\((\d+)\)',uri)
        if item:
            row=next(r for r in self.tables[key] if r['ID']==int(item.group(1)))
            gid=(key,row['ID'])
            if '/breakroleinheritance' in uri:
                self.grants.setdefault(gid,{99:5});self.effect('break-grant:'+str(gid));return {}
            if '/addroleassignment' in uri:
                aid=int(re.search(r'principalid=(\d+)',uri).group(1));self.grants[gid][aid]=2;self.effect('read-grant:'+str(aid));return {}
            if '/roleassignments?' in uri:return {'value':[{'Member':{'Id':i},'RoleDefinitionBindings':[{'RoleTypeKind':r}]} for i,r in self.grants.get(gid,{}).items()]}
            if method=='GET':return copy.deepcopy(row)
            assert headers.get('IF-MATCH')==row['@odata.etag'],'412 ETag precondition'
            assert headers.get('IF-MATCH')!='*'
            row.update(copy.deepcopy(body));row['@odata.etag']='"'+str(int(row['@odata.etag'].strip('"'))+1)+'"';self.effect('cas:'+key+':'+row['Title']);return {}
        if method=='POST':return self.insert(key,body)
        rows=list(self.tables[key]);args=parse_qs(urlparse(uri).query)
        if '$filter' in args:
            m=re.fullmatch("Title eq '((?:''|[^'])*)'",args['$filter'][0]);assert m,uri;rows=[r for r in rows if r['Title']==m.group(1).replace("''", "'")]
        offset=int(args.get('$skiptoken',['0'])[0]);limit=min(int(args.get('$top',['200'])[0]),self.page_size)
        chunk=rows[offset:offset+limit];out={'value':copy.deepcopy(chunk)}
        if offset+limit<len(rows):
            base=uri.split('&$skiptoken=')[0];out['odata.nextLink']=self.site+'/'+base+'&$skiptoken='+str(offset+limit)
        return out

class Engine:
    def __init__(self,flow,sp,helper):
        self.flow=flow;self.sp=sp;self.helper=helper;self.variables={};self.outputs={};self.bodies={};self.items={};self.status={};self.errors={};self.runid=str(uuid.uuid4())
        self.parameters={k:v.get('defaultValue') for k,v in flow.definition()['properties']['definition']['parameters'].items()}
        self.parameters['aicoe_SiteUrl (aicoe_SiteUrl)']=sp.site
    def value(self,v):
        if isinstance(v,str) and v.startswith('@'):return Expression(v,self).run()
        if isinstance(v,list):return [self.value(x) for x in v]
        if isinstance(v,dict):return {k:self.value(x) for k,x in v.items()}
        return v
    def condition(self,c):
        if isinstance(c,str):return self.value(c)
        k,v=next(iter(c.items()))
        if k=='and':return all(self.condition(x) for x in v)
        if k=='or':return any(self.condition(x) for x in v)
        if k=='not':return not self.condition(v)
        a=self.value(v)
        return {'equals':lambda:a[0]==a[1],'greater':lambda:a[0]>a[1]}[k]()
    def block(self,actions):
        failed=False
        for name,a in actions.items():
            after=a.get('runAfter',{})
            if any(self.status.get(k) not in states for k,states in after.items()):self.status[name]='Skipped';continue
            try:self.action(name,a);self.status[name]='Succeeded'
            except Exception as exc:self.status[name]='Failed';self.errors[name]=str(exc);failed=True
        if failed:raise RuntimeError(json.dumps(self.errors))
    def action(self,name,a):
        typ=a['type'];v=a.get('inputs')
        if typ=='Compose':self.outputs[name]=self.value(v)
        elif typ=='InitializeVariable':
            for x in v['variables']:self.variables[x['name']]=self.value(x.get('value'))
        elif typ=='SetVariable':self.variables[v['name']]=self.value(v['value'])
        elif typ=='IncrementVariable':self.variables[v['name']]+=self.value(v['value'])
        elif typ=='Terminate':raise RuntimeError(json.dumps(v))
        elif typ=='AppendToArrayVariable':self.variables[v['name']].append(self.value(v['value']))
        elif typ=='If':self.block(a.get('actions',{}) if self.condition(a['expression']) else a.get('else',{}).get('actions',{}))
        elif typ=='Scope':self.block(a['actions'])
        elif typ=='Foreach':
            for row in self.value(a['foreach']):self.items[name]=row;self.block(a['actions'])
        elif typ=='Until':
            for _ in range(a['limit']['count']):
                self.block(a['actions'])
                if self.value(a['expression']):break
            else:raise RuntimeError('until exhausted')
        elif typ=='OpenApiConnection':
            params=self.value(v['parameters']);op=v['host']['operationId']
            if op=='Evaluate':result=self.helper(params['body/Mode'],json.loads(params['body/Payload']))
            elif op=='HttpRequest':result=self.sp.request(params['parameters/method'],params['parameters/uri'],params.get('parameters/body'),params.get('parameters/headers',{}))
            elif hasattr(self.sp,'connector'):result=self.sp.connector(op,params)
            else:raise AssertionError('Unimplemented fixture operation '+op)
            self.bodies[name]=result;self.outputs[name]={'body':result}
        else:raise AssertionError('Unsupported WDL action '+typ)
    def run(self):self.block(self.flow.actions)
