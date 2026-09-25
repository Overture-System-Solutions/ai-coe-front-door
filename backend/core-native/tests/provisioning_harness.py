"""Fresh-site REST/connector simulator for executing flow 00, not a tenant."""
import copy,json,re
from urllib.parse import parse_qs,urlparse
from xml.etree import ElementTree as ET
from wdl_harness import SharePointFixture
import model

class FreshSite(SharePointFixture):
    def __init__(self):
        super().__init__();self.tables={k:[] for k in model.LISTS};self.existing=set();self.fields={k:{'Title':'Text'} for k in model.LISTS};self.denied=False
    def request(self,method,uri,body,headers):
        if isinstance(body,str) and body.startswith('{'):body=json.loads(body)
        if uri.startswith('_api/web/lists?'):
            if self.denied:raise RuntimeError('403 simulated denied discovery')
            title=parse_qs(urlparse(uri).query)['$filter'][0][10:-1].replace("''", "'")
            keys=[k for k in self.existing if model.LISTS[k][0]==title]
            return {'value':[{'Id':self.ids[k],'Title':model.LISTS[k][0],'BaseTemplate':model.LISTS[k][1]} for k in keys]}
        if uri=='_api/web/lists' and method=='POST':
            key=next(k for k,v in model.LISTS.items() if v[0]==body['Title']);assert key not in self.existing
            self.existing.add(key);self.effect('create-list:'+key);return {'Id':self.ids[key]}
        match=re.search(r"(?:getbytitle|lists)\((?:guid)?'((?:''|[^'])*)'\)",uri)
        assert match,uri
        val=match.group(1).replace("''", "'");key=next(k for k,v in model.LISTS.items() if v[0]==val or self.ids[k]==val)
        assert key in self.existing, 'List does not exist: '+key
        if '/fields?' in uri:
            name=parse_qs(urlparse(uri).query)['$filter'][0][17:-1]
            return {'value':[{'InternalName':name,'TypeAsString':self.fields[key][name]}] if name in self.fields[key] else []}
        if '/fields/createfieldasxml' in uri:
            f=ET.fromstring(body['parameters']['SchemaXml']);self.fields[key][f.attrib['Name']]=f.attrib['Type'];return {}
        if '/fields/getbyinternalnameortitle' in uri:return {}
        if '/items' in uri:return super().request(method,uri,body,headers)
        if method=='GET':return {'Id':self.ids[key],'Title':model.LISTS[key][0],'BaseTemplate':model.LISTS[key][1]}
        return {}
    def connector(self,op,params):
        key=next(k for k,v in model.LISTS.items() if v[0]==params['table'])
        assert key in self.existing
        if op=='GetItems':return self.request('GET',"_api/web/lists(guid'"+self.ids[key]+"')/items?$filter="+params['$filter']+'&$top='+str(params['$top']),None,{})
        fields={k:(v.get('Value') if isinstance(v,dict) and set(v)=={'Value'} else v) for k,v in params['item'].items()}
        assert set(fields)<=set(self.fields[key]),(key,set(fields)-set(self.fields[key]))
        if op=='PostItem':return self.insert(key,fields)
        if op=='PatchItem':
            row=next(r for r in self.tables[key] if r['ID']==params['id']);row.update(copy.deepcopy(fields));return row
        raise AssertionError(op)
