from pathlib import Path
import json,unittest,xml.etree.ElementTree as ET
W=Path(__file__).parent
ROOT=W/'candidate'
SITE='https://osscontact.sharepoint.com/sites/CloudWaveDashboardDemo'
CONTACT='samuel.conrad@osscontact.com'
def flows():return {p.name:json.loads(p.read_text()) for p in (ROOT/'Workflows').glob('*.json')}
def dictionaries(x):
 if isinstance(x,dict):
  yield x
  for v in x.values():yield from dictionaries(v)
 elif isinstance(x,list):
  for v in x:yield from dictionaries(v)
def flow(key):return next(v for k,v in flows().items() if key in k)
class SolutionTests(unittest.TestCase):
 def test_01_all_sharepoint_operations_target_oss_demo(self):
  self.assertEqual(len(flows()),5)
  datasets=[d['dataset'] for f in flows().values() for d in dictionaries(f) if 'dataset' in d]
  self.assertTrue(datasets)
  self.assertEqual(set(datasets),{SITE})
 def test_02_demo_routes_all_notifications_and_approvals_only_to_sam(self):
  recipients=[]
  for f in flows().values():
   for d in dictionaries(f):
    for k in ('emailMessage/To','WebhookApprovalCreationInput/assignedTo'):
     if k in d:recipients.append(d[k])
    if 'WebhookApprovalCreationInput/enableReassignment' in d:self.assertIs(d['WebhookApprovalCreationInput/enableReassignment'],False)
  self.assertEqual(set(recipients),{CONTACT})
  all_text=json.dumps(flows())
  self.assertNotIn('Jordan.Martens',all_text)
  self.assertEqual(flow('Triage')['properties']['definition']['actions']['Default_approver']['inputs'],CONTACT)
 def test_03_preserve_front_door_id_through_intake_and_receipt(self):
  actions=flow('IntakeProcessing')['properties']['definition']['actions']
  self.assertIn(',CoEID,',actions['Get_submitted_items']['inputs']['parameters']['parameters/uri'])
  nested=actions['For_each_use_case']['actions']['If_intake_is_pending']['actions']
  expression=nested['Intake_update_body']['inputs']['CoEID']
  self.assertTrue(expression.startswith("@if(empty(items('For_each_use_case')?['CoEID']),"))
  self.assertTrue(expression.endswith(",items('For_each_use_case')?['CoEID'])"))
  receipt=nested['If_submitter_email_present']['actions']['Send_receipt']['inputs']['parameters']['emailMessage/Body']
  self.assertIn("outputs('Intake_update_body')?['CoEID']",receipt)
 def test_04_isolated_demo_solution_has_new_ids_and_disabled_flows(self):
  root=ET.parse(ROOT/'solution.xml').getroot();m=root.find('SolutionManifest')
  self.assertEqual(m.findtext('UniqueName'),'OSSCloudWaveDashboardDemo')
  self.assertEqual(m.findtext('Version'),'1.0.0.7')
  self.assertEqual(m.findtext('Managed'),'0')
  old=ET.parse(W/'original-unpacked/Other/Solution.xml').getroot()
  old_ids={x.attrib['id'].lower() for x in old.findall('.//RootComponent') if 'id' in x.attrib}
  defs=ET.parse(ROOT/'customizations.xml').getroot()
  workflows=defs.findall('./Workflows/Workflow');self.assertEqual(len(workflows),5)
  new_ids={x.attrib['WorkflowId'].lower() for x in workflows};self.assertTrue(new_ids.isdisjoint(old_ids))
  for x in workflows:
   self.assertEqual(x.findtext('StateCode'),'0');self.assertEqual(x.findtext('StatusCode'),'1')
   self.assertTrue((ROOT/x.findtext('JsonFileName').lstrip('/')).is_file())
  names={r.attrib['connectionreferencelogicalname'] for r in defs.findall('.//connectionreference')}
  self.assertEqual(names,{'cwdd_sharedsharepointonline','cwdd_sharedoffice365','cwdd_sharedapprovals'})
  for f in flows().values():
   for ref in f['properties']['connectionReferences'].values():self.assertIn(ref['connection']['connectionReferenceLogicalName'],names)
 def test_05_provisioning_does_not_treat_permission_failure_as_missing_list(self):
  a=flow('SharePointProvisioning')['properties']['definition']['actions']['For_each_list']['actions']
  self.assertEqual(a['If_list_exists']['runAfter']['Get_list'],['Succeeded'])
  self.assertIn("length(body('Get_list')?['value'])",a['If_list_exists']['expression'])
  self.assertIn('_api/web/lists?$select=',a['Get_list']['inputs']['parameters']['parameters/uri'])
  fields=a['For_each_field']['actions']
  self.assertEqual(fields['If_field_exists']['runAfter']['Get_field'],['Succeeded'])
  self.assertIn("length(body('Get_field')?['value'])",fields['If_field_exists']['expression'])
 def test_06_serialized_polling_avoids_overlapping_read_then_write_runs(self):
  for f in flows().values():
   d=f['properties']['definition']
   for t in d['triggers'].values():
    if t['type']=='Recurrence':self.assertEqual(t.get('runtimeConfiguration',{}).get('concurrency',{}).get('runs'),1)
   for a in dictionaries(d['actions']):
    if a.get('type')=='Foreach':self.assertEqual(a.get('runtimeConfiguration',{}).get('concurrency',{}).get('repetitions'),1)
if __name__=='__main__':unittest.main(verbosity=2)





