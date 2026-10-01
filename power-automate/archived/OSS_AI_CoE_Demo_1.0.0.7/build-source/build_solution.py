from pathlib import Path
import json,shutil,xml.etree.ElementTree as ET,uuid
W=Path(__file__).parent
SOURCE=Path('/mnt/c/Users/scfre/Downloads/TempTegriaAndCloudwaveResources/CloudWave/UPLOAD-1-AI-CoE-Core-Automation_1_0_11_0')
SITE='https://osscontact.sharepoint.com/sites/CloudWaveDashboardDemo'
CONTACT='samuel.conrad@osscontact.com'
def rewrite(value):
 if isinstance(value,str):return value.replace('https://osscontact.sharepoint.com/sites/AI-CoE-Lab',SITE).replace('Jordan.Martens@osscontact.com',CONTACT).replace('aicoe_shared','cwdd_shared')
 if isinstance(value,list):return [rewrite(x) for x in value]
 if isinstance(value,dict):
  out={k:rewrite(v) for k,v in value.items()}
  for k in ('emailMessage/To','WebhookApprovalCreationInput/assignedTo','ApproverEmail'):
   if k in out:out[k]=CONTACT
  if 'WebhookApprovalCreationInput/enableReassignment' in out:out['WebhookApprovalCreationInput/enableReassignment']=False
  for k in ('Default_approver','Notification_email'):
   if k in out and isinstance(out[k],dict):out[k]['inputs']=CONTACT
  if out.get('type')=='Foreach':out['runtimeConfiguration']={'concurrency':{'repetitions':1}}
  if out.get('type')=='Recurrence':out['runtimeConfiguration']={'concurrency':{'runs':1}}
  return out
 return value
def fix_intake(document):
 actions=document['properties']['definition']['actions']
 query=actions['Get_submitted_items']['inputs']['parameters']
 query['parameters/uri']=query['parameters/uri'].replace('$select=Id,Title,','$select=Id,Title,CoEID,')
 nested=actions['For_each_use_case']['actions']['If_intake_is_pending']['actions']
 original=nested['Intake_update_body']['inputs']['CoEID']
 nested['Intake_update_body']['inputs']['CoEID']="@if(empty(items('For_each_use_case')?['CoEID']),"+original[1:]+",items('For_each_use_case')?['CoEID'])"
 nested['If_submitter_email_present']['actions']['Send_receipt']['inputs']['parameters']['emailMessage/Body']="@concat('<p>[OSS DEMO] Submission received.</p><p>Reference: ',outputs('Intake_update_body')?['CoEID'],'</p><p>The synthetic case will move through triage and human review.</p>')"
 return document
def fix_provisioning(document):
 a=document['properties']['definition']['actions']['For_each_list']['actions']
 a['Get_list']['inputs']['parameters']['parameters/uri']="@concat('_api/web/lists?$select=Id,Title&$filter=Title%20eq%20%27',encodeUriComponent(replace(items('For_each_list')?['title'],'''','''''')), '%27')"
 a['If_list_exists']['expression']="@greater(length(body('Get_list')?['value']),0)"
 a['If_list_exists']['runAfter']={'Get_list':['Succeeded']}
 f=a['For_each_field']['actions']
 old=f['Get_field']['inputs']['parameters']['parameters/uri']
 before=old.split('/fields/')[0]
 f['Get_field']['inputs']['parameters']['parameters/uri']=before+"/fields?$select=InternalName,FieldTypeKind&$filter=InternalName%20eq%20%27',items('For_each_field')?['internalName'],'%27')"
 f['If_field_exists']['expression']="@greater(length(body('Get_field')?['value']),0)"
 f['If_field_exists']['runAfter']={'Get_field':['Succeeded']}
 return document
def isolate(out):
 ET.register_namespace('xsi','http://www.w3.org/2001/XMLSchema-instance')
 tree=ET.parse(out/'solution.xml');m=tree.getroot().find('SolutionManifest')
 m.find('UniqueName').text='OSSCloudWaveDashboardDemo'
 m.find('Version').text='1.0.0.7'
 m.find('LocalizedNames/LocalizedName').set('description','OSS CloudWave Dashboard Demo')
 m.find('Descriptions/Description').set('description','OSS demo core workflows for front-door 1.0.0.7. All notifications and approvals route only to the demo contact. No AI-provider integration.')
 pub=m.find('Publisher');pub.find('UniqueName').text='OSSCloudWaveDemoPublisher';pub.find('CustomizationPrefix').text='cwdd';pub.find('CustomizationOptionValuePrefix').text='88001';pub.find('LocalizedNames/LocalizedName').set('description','OSS CloudWave Demo')
 doc=ET.parse(out/'customizations.xml');mapping={}
 for w in doc.getroot().findall('./Workflows/Workflow'):
  old=w.attrib['WorkflowId'];new='{'+str(uuid.uuid5(uuid.NAMESPACE_URL,SITE+'#'+old.lower()))+'}'
  mapping[old.lower()]=new
  w.set('WorkflowId',new);w.set('Name',w.attrib['Name'].replace('AI CoE —','OSS Demo —'))
  w.find('LocalizedNames/LocalizedName').set('description',w.attrib['Name'])
  w.find('StateCode').text='0';w.find('StatusCode').text='1';w.find('IntroducedVersion').text='1.0.0.7'
  file=w.find('JsonFileName');oldpath=out/file.text.lstrip('/')
  newpath=oldpath.with_name(oldpath.name.replace(old.strip('{}').upper(),new.strip('{}').upper()))
  oldpath.replace(newpath);file.text='/Workflows/'+newpath.name
 for rc in m.findall('RootComponents/RootComponent'):
  if rc.get('id','').lower() in mapping:rc.set('id',mapping[rc.attrib['id'].lower()])
 for c in doc.getroot().findall('.//connectionreference'):
  c.set('connectionreferencelogicalname',c.attrib['connectionreferencelogicalname'].replace('aicoe_shared','cwdd_shared'))
  c.find('connectionreferencedisplayname').text=c.findtext('connectionreferencedisplayname').replace('AI CoE','OSS Demo')
 ET.indent(tree);ET.indent(doc)
 tree.write(out/'solution.xml',encoding='utf-8',xml_declaration=True);doc.write(out/'customizations.xml',encoding='utf-8',xml_declaration=True)
def build():
 out=W/'candidate';out.mkdir(exist_ok=True)
 for p in SOURCE.rglob('*'):
  if not p.is_file():continue
  dst=out/p.relative_to(SOURCE);dst.parent.mkdir(parents=True,exist_ok=True)
  if p.suffix=='.json':
   document=rewrite(json.loads(p.read_text()))
   if 'IntakeProcessing' in p.name:document=fix_intake(document)
   if 'SharePointProvisioning' in p.name:document=fix_provisioning(document)
   dst.write_text(json.dumps(document,indent=2,ensure_ascii=False)+'\n')
  else:shutil.copyfile(p,dst)
 isolate(out)
 return out
if __name__=='__main__':print(build())
