from pathlib import Path
import json,re,zipfile,hashlib,xml.etree.ElementTree as ET,subprocess,os,importlib.util,unittest,io
from datetime import datetime,timezone
W=Path(__file__).parent;O=Path('/mnt/c/Users/scfre/Downloads/OSS_CloudWave_Demo_1.0.0.7');zpath=O/'OSSCloudWaveDashboardDemo_1_0_0_7.zip'
SOURCE=Path('/mnt/c/Users/scfre/Downloads/TempTegriaAndCloudwaveResources/CloudWave/UPLOAD-1-AI-CoE-Core-Automation_1_0_11_0')
def walk(x):
 yield x
 if isinstance(x,dict):
  for v in x.values():yield from walk(v)
 elif isinstance(x,list):
  for v in x:yield from walk(v)
def check_expression(s):
 stack=[];quote=False;i=0
 while i<len(s):
  c=s[i]
  if c=="'":
   if quote and i+1<len(s) and s[i+1]=="'":i+=2;continue
   quote=not quote
  elif not quote:
   if c in '([':stack.append(c)
   if c in ')]':assert stack and stack.pop()=={')':'(',']':'['}[c],s
  i+=1
 assert not quote and not stack,s
with zipfile.ZipFile(zpath) as z:
 assert z.testzip() is None
 names=z.namelist();assert {'solution.xml','customizations.xml','[Content_Types].xml'}.issubset(names)
 assert all(not p.startswith('/') and '..' not in Path(p).parts for p in names)
 flows={n:json.loads(z.read(n)) for n in names if n.endswith('.json')}
 assert len(flows)==5
 custom=ET.fromstring(z.read('customizations.xml'));manifest=ET.fromstring(z.read('solution.xml')).find('SolutionManifest')
 workflows=custom.findall('./Workflows/Workflow');assert len(workflows)==5
 assert {w.attrib['WorkflowId'].lower() for w in workflows}=={r.attrib['id'].lower() for r in manifest.findall('./RootComponents/RootComponent') if r.attrib['type']=='29'}
 for w in workflows:assert w.findtext('JsonFileName').lstrip('/') in names
 XMLs=[ET.fromstring(z.read(n)) for n in names if n.endswith('.xml')]
 assert manifest.findtext('UniqueName')=='OSSCloudWaveDashboardDemo' and manifest.findtext('Version')=='1.0.0.7'
 schemas={};expressions=0;ops=0
 for n,f in flows.items():
  candidate=json.loads((W/'candidate'/n).read_text());assert candidate==f,'PAC changed definition '+n
  reexport=json.loads((W/'final-roundtrip'/n).read_text());assert reexport==f,'Roundtrip changed JSON '+n
  definition=f['properties']['definition'];all_names=set()
  for d in walk(definition['actions']):
   if isinstance(d,dict) and 'actions' in d and isinstance(d['actions'],dict):all_names.update(d['actions'])
  all_names.update(definition['actions'])
  for d in walk(definition):
   if isinstance(d,dict):
    if d.get('type') in ('OpenApiConnection','OpenApiConnectionWebhook'):
     ops+=1;host=d['inputs']['host'];assert host['connectionName'] in f['properties']['connectionReferences']
    if 'runAfter' in d:
     for name in d['runAfter']:assert name in all_names,(n,name)
   if isinstance(d,str) and d.startswith('@'):
    check_expression(d);expressions+=1
    for name in re.findall(r"(?:outputs|body|items|actions)\('([^']+)'\)",d):assert name in all_names,(n,name)
  text=json.dumps(f);assert 'AI-CoE-Lab' not in text and 'Jordan.Martens' not in text
  if 'Provisioning' in n:
   for l in definition['actions']['List_definitions']['inputs']:schemas[l['title']]=l['fields']
 # Re-run the same six tests directly against bytes extracted from the final import ZIP.
 finalroot=W/'final-import-bytes';finalroot.mkdir(exist_ok=True)
 for n in names:
  if n.endswith('/'):continue
  q=finalroot/n;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(z.read(n))
spec=importlib.util.spec_from_file_location('solution_tests',W/'test_solution.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);mod.ROOT=finalroot
buf=io.StringIO();result=unittest.TextTestRunner(stream=buf,verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(mod));(W/'evidence/final-zip-tests.txt').write_text(buf.getvalue());assert result.wasSuccessful(),buf.getvalue()
original=json.loads((W/'evidence/original-hashes.json').read_text());assert all(hashlib.sha256((SOURCE/n).read_bytes()).hexdigest()==h for n,h in original.items())
front=json.loads((W/'evidence/front-door-package-inventory.json').read_text());assert hashlib.sha256(Path(front['file']).read_bytes()).hexdigest()==front['sha256']
contact_tests=json.loads((W/'evidence/frontend-contract-test.json').read_text());assert contact_tests['status']=='PASS'
settings=json.loads((O/'connection-settings-template.json').read_text());assert len(settings['ConnectionReferences'])==3
(O/'schema-reference.json').write_text(json.dumps(schemas,indent=2))
r={'status':'LOCAL_CHECKS_PASS_LIVE_IMPORT_PENDING','built_at':datetime.now(timezone.utc).isoformat(),'zip':str(zpath),'sha256':hashlib.sha256(zpath.read_bytes()).hexdigest(),'bytes':zpath.stat().st_size,'solution':'OSSCloudWaveDashboardDemo','solution_version':'1.0.0.7','front_door_manifest_version':'1.0.0.7','front_door_sha256':front['sha256'],'target_site':'https://osscontact.sharepoint.com/sites/CloudWaveDashboardDemo','demo_contact':'samuel.conrad@osscontact.com','zip_members':len(names),'flows':len(flows),'connection_references':3,'provisioned_core_lists':len(schemas),'local_test_first_checks':result.testsRun,'frontend_submission_fixture_cases':len(contact_tests['submissionCases']),'expression_delimiter_and_symbol_checks':expressions,'connector_actions_inspected':ops,'pac_version':'2.12.1','pac_unpack_pack_roundtrip':'PASS; JSON definitions identical after roundtrip','source_original_hashes':'unchanged','front_door_package_hash':'unchanged','all_packaged_flows_off':all(w.findtext('StateCode')=='0' and w.findtext('StatusCode')=='1' for w in workflows),'live_tenant_accessed':False,'live_import_tested':False,'cloud_flows_executed':False,'messages_sent':False,'ai_integration_added':False,'limits':['Local frontend contract test uses explicit in-memory HTTP fixtures, not live Microsoft responses.','Expression checks validate delimiters/references and configured behaviors, not the full Microsoft workflow engine.','PAC packing is not a Power Apps Checker service run or tenant import test.','Initial flow metadata is Off; reimporting into an existing running copy can preserve runtime state.','Existing field types and permissions require live checks; source query limits and non-atomic writes remain demo limitations.']}
(O/'VERIFICATION.json').write_text(json.dumps(r,indent=2));(O/'SHA256.txt').write_text(r['sha256']+'  '+zpath.name+'\n');print(buf.getvalue());print(json.dumps(r,indent=2))
