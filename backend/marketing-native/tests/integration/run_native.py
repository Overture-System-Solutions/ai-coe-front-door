"""Run the actual generated WDL with the compiled Marketing helper.
External SharePoint/provider responses remain explicit fixtures. No network or native acceptance.
"""
import argparse, copy, hashlib, json, sys, os, zipfile
from pathlib import Path
from native_harness import CompiledHelper, Engine, SharePointFixture
from native_harness import canonical, sha
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'generator'))
import marketing_flow

def load_definition(path=None):
    path=path or os.environ.get('MARKETING_FLOW_ZIP')
    if not path:return marketing_flow.command_flow().definition()
    with zipfile.ZipFile(path) as archive:
        names=[name for name in archive.namelist() if name.startswith('Workflows/') and name.endswith('.json')]
        assert len(names)==1,'One exact packaged workflow required'
        definition=json.loads(archive.read(names[0]))
        assert definition['properties']['state']=='Stopped','Package must be OFF'
        return definition

def compare_result(value,expected,fixture):
    """Compare complete semantic values, allowing only the actual store's version token."""
    expected=copy.deepcopy(expected)
    if isinstance(value,dict) and 'envelope' in value and 'storeVersion' in value:
        envelope=value['envelope'];key='envelope:'+envelope['artifactId']+':'+str(envelope['revision'])
        rows=[r for r in fixture.tables['canonical'] if r['RecordKey']==key]
        assert len(rows)==1,'Version token requires one immutable service row'
        token=sha(canonical({'key':key,'revision':envelope['revision'],'payloadHash':envelope['payloadHash'],'version':rows[0]['@odata.etag']}))
        assert value['storeVersion']==token,'Public version is not bound to actual immutable row readback'
        expected['storeVersion']=token
    assert value==expected,'Full semantic reference mismatch'

def main():
    p=argparse.ArgumentParser();p.add_argument('--dll',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--case',action='append');p.add_argument('--flow-zip',type=Path)
    args=p.parse_args();assert args.dll.is_file(),'Actual compiled Marketing helper DLL is required; no substitute model.'
    cases=[]
    for name in ['node-reference-vectors.json','node-ai-reference-vectors.json']:
        cases+=json.loads((ROOT/'evidence/integration'/name).read_text())['cases']
    if args.case:cases=[case for case in cases if case['name'] in args.case]
    assert cases,'No selected integration cases'
    original=load_definition(args.flow_zip);results=[]
    with_helper=CompiledHelper(args.dll)
    try:
        for case in cases:
            with_helper.refusals=[]
            common=copy.deepcopy(case['input']);fixture=SharePointFixture(common)
            fixture.provider_response=common.get('ProviderResponse')
            definition=copy.deepcopy(original)
            # Only this explicit fixture configuration enables local execution. No delivered definition is changed.
            definition['properties']['definition']['actions']['Cfg']['inputs']=common['Config']
            engine=Engine(definition,fixture,with_helper)
            try:
                engine.run()
                matches=[r for r in fixture.tables['result'] if r['RequestId']==common['Row']['Title']]
                assert len(matches)==1,'Exactly one result projection required'
                result=json.loads(matches[0]['ResultJson']);value=result['value'];expected=case['expectedValue']
                assert result['operation']==case['operation'] and result['actorId']==common['Row']['Author']['Email']
                assert fixture.can_read(matches[0]['Id'],common['Row']['AuthorId'])
                compare_result(value,expected,fixture)
                results.append({'name':case['name'],'operation':case['operation'],'pass':True,'actionsExecuted':engine.action_count,'durableEffects':fixture.effects,'simulatedProviderCalls':len(fixture.provider_calls)})
            except Exception as error:
                results.append({'name':case['name'],'operation':case['operation'],'pass':False,'error':str(error),'helperRefusals':with_helper.refusals,'failedActions':engine.errors,'actionsExecuted':engine.action_count,'durableEffects':fixture.effects})
    finally:with_helper.close()
    record={'boundary':'ACTUAL_GENERATED_WDL_AND_COMPILED_HELPER_WITH_EXPLICIT_FAKE_EXTERNALS','helperSha256':hashlib.sha256(args.dll.read_bytes()).hexdigest(),'flowSha256':hashlib.sha256(json.dumps(original,sort_keys=True).encode()).hexdigest(),'count':len(results),'passed':sum(r['pass'] for r in results),'results':results,'nativeAcceptance':False}
    if args.flow_zip:record['flowZipSha256']=hashlib.sha256(args.flow_zip.read_bytes()).hexdigest()
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({'count':record['count'],'passed':record['passed'],'failed':[r['name'] for r in results if not r['pass']]},indent=2))
    return 0 if all(r['pass'] for r in results) else 1
if __name__=='__main__':raise SystemExit(main())
