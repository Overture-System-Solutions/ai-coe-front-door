"""Offline native wire regressions against the exact compiled Script.cs, not a helper model."""
import copy
import json
import unittest
from test_helper import case, evaluate, sha, canonical, change_record


def put(p, key, value, etag='W/"real-row-42"'):
    fields = evaluate('InspectWrite', {'Config': p['Config'], 'Write': {'Key': key, 'Value': value, 'ExpectedVersion': None}, 'Rows': []})
    assert fields['Valid'], fields
    p['Records'] = [r for r in p['Records'] if r['RecordKey'] != key]
    p['Records'].append(dict(fields['Fields'], Id=max([r['Id'] for r in p['Records']]+[0])+1, **{'@odata.etag': etag}))


def retained_case(name='manual brief'):
    p = case(name)['input']
    plan = evaluate('Plan', p)
    assert plan['Valid'], plan
    put(p, 'native-plan:'+p['Row']['Title'], {'status':'prepared', 'fingerprint':evaluate('Preflight',p)['Fingerprint'], 'plan':plan})
    return p, plan


class NativeInteropTests(unittest.TestCase):
    def test_real_sharepoint_continuations_and_etag_aliases(self):
        p=case('authorized work list')['input'];cfg=p['Config']
        uri="_api/web/lists(guid'"+cfg['canonicalListId']+"')/items?$skiptoken=Paged%3dTRUE%26p_ID%3d9"
        for link in [uri, cfg['siteUrl']+'/'+uri, '/sites/marketing/'+uri]:
            for shape in ['verbose','odata','minimal']:
                row=copy.deepcopy(p['Records'][0]);etag=row.pop('@odata.etag')
                row[{'verbose':'__metadata','odata':'odata.etag','minimal':'@odata.etag'}[shape]]={'etag':etag} if shape=='verbose' else etag
                page={'d':{'results':[row], '__next':link}} if shape=='verbose' else {'value':[row], 'odata.nextLink' if shape=='odata' else '@odata.nextLink':link}
                out=evaluate('Page',{'Config':cfg,'Page':page});self.assertTrue(out['Valid'],out)
                self.assertTrue(out['Next'].startswith('_api/'));self.assertEqual(out['Rows'][0]['@odata.etag'],etag)
                q=copy.deepcopy(p);q['Records'][0]=row
                self.assertTrue(evaluate('Preflight',q)['Valid'])
        row=copy.deepcopy(p['Records'][0]);row['odata.etag']='"conflict"';p['Records'][0]=row
        self.assertFalse(evaluate('Preflight',p)['Valid'])

    def test_bad_nextlink_is_not_silently_truncated(self):
        cfg=case('authorized work list')['input']['Config']
        for next_link in [42,{},'https://evil.invalid/items',"_api/web/lists(guid'00000000-0000-0000-0000-000000000000')/items", "_api/web/lists(guid'"+cfg['canonicalListId']+"')/items/../roleassignments"]:
            self.assertFalse(evaluate('Page',{'Config':cfg,'Page':{'value':[],'@odata.nextLink':next_link}})['Valid'],next_link)

    def test_native_created_modified_precision(self):
        for fraction in ['', '.1','.123','.1234567']:
            p=case('manual brief')['input'];p['Row']['Created']=p['Row']['Modified']='2026-09-23T13:00:00'+fraction+'Z'
            out=evaluate('Plan',p);self.assertTrue(out['Valid'],out)
            self.assertEqual(out['Result']['envelope']['createdAt'],'2026-09-23T13:00:00Z')
        for stamp in ['2026-09-23T13:00:00.12345678Z','2026-02-30T13:00:00Z','2026-09-23T13:00:00+00:00']:
            p=case('manual brief')['input'];p['Row']['Created']=p['Row']['Modified']=stamp
            self.assertFalse(evaluate('Preflight',p)['Valid'])

    def test_finalized_plan_rechecks_every_retained_write(self):
        p, plan=retained_case()
        for w in plan['Writes']:put(p,w['Key'],w['Value'])
        final=evaluate('Plan',p);self.assertTrue(final['Valid'],final);self.assertFalse(final['FinalizeRequired'])
        self.assertEqual(final['Writes'],plan['Writes']);self.assertEqual(final['Result']['envelope'],plan['Result']['envelope'])
        e=final['Result']['envelope'];key='envelope:'+e['artifactId']+':'+str(e['revision'])
        self.assertEqual(final['Result']['storeVersion'],sha(canonical({'key':key,'revision':e['revision'],'payloadHash':e['payloadHash'],'version':'W/"real-row-42"'})))
        journal='native-plan:'+p['Row']['Title'];put(p,journal,{'status':'prepared','fingerprint':evaluate('Preflight',p)['Fingerprint'],'plan':final})
        for w in final['Writes']:
            q=copy.deepcopy(p);q['Records']=[r for r in q['Records'] if r['RecordKey']!=w['Key']]
            self.assertFalse(evaluate('Plan',q)['Valid'],w['Key'])
        q=copy.deepcopy(p);next(r for r in q['Records'] if r['RecordKey']==key)['@odata.etag']='W/"changed"'
        self.assertFalse(evaluate('Plan',q)['Valid'])

    def test_completed_original_recovery_retained_without_new_writes(self):
        from test_helper import AI_VECTORS
        c=next(c for c in AI_VECTORS if c['name']=='same original completed intent')
        p=copy.deepcopy(c['input']);plan=evaluate('Plan',p);self.assertTrue(plan['Valid'],plan);self.assertEqual(plan['Writes'],[])
        put(p,'native-plan:'+p['Row']['Title'],{'status':'prepared','fingerprint':evaluate('Preflight',p)['Fingerprint'],'plan':plan})
        final=evaluate('Plan',p);self.assertTrue(final['Valid'],final);self.assertEqual(final,plan)

    def test_new_mutation_plan_still_refuses_changed_state(self):
        p,plan=retained_case()
        for w in plan['Writes']:put(p,w['Key'],w['Value'])
        e=plan['Result']['envelope']
        put(p,'request:RVQ-LATER',{'requestId':'RVQ-LATER','target':{k:e[k] for k in ['kind','artifactId','revision','payloadHash']},'reviewKind':'strategyVoice','requestedBy':e['createdBy'],'requestedAt':p['Now']})
        self.assertFalse(evaluate('Plan',p)['Valid'])

    def test_pending_plan_does_not_recompute_or_hide_conflicting_writes(self):
        p,plan=retained_case();out=evaluate('Plan',p);self.assertEqual(out,plan)
        w=next(w for w in plan['Writes'] if w['Key'].startswith('receipt:'));value=copy.deepcopy(w['Value']);value['actorId']='different@example.invalid';put(p,w['Key'],value)
        self.assertFalse(evaluate('Plan',p)['Valid'])

    def test_projection_validates_operation_payload_and_result_shape(self):
        p=case('authorized work list')['input']
        for result in [{},[1],{'kind':'saved','storeVersion':'a'*64}]:
            self.assertFalse(evaluate('Projection',{'Config':p['Config'],'Row':p['Row'],'Result':result})['Valid'])
        p['Row']['PayloadJson']='{"role":"owner"}'
        self.assertFalse(evaluate('Projection',{'Config':p['Config'],'Row':p['Row'],'Result':[]})['Valid'])

if __name__=='__main__':unittest.main(verbosity=2)
