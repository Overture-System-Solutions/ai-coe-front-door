#!/usr/bin/env python3
"""Build native review candidates. Never executes the historical Python reference model."""
from __future__ import annotations
import argparse,hashlib,io,json,zipfile
from pathlib import Path
import model as M,flows,package,validate,binding,native_runtime as N
ROOT=Path(__file__).resolve().parents[1]

def sha(data):return hashlib.sha256(data).hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--review-unbound',action='store_true')
    parser.add_argument('--binding',type=Path)
    parser.add_argument('--out',type=Path,default=ROOT/'out')
    args=parser.parse_args()
    try:bound=binding.load(args.binding,args.review_unbound)
    except ValueError as exc:parser.error(str(exc))
    N.HELPER_API=bound['runtimeApiName'];N.HELPER_LOGICAL=bound['logicalName'];N.HELPER_ID=bound['connectorId']
    out=args.out;out.mkdir(parents=True,exist_ok=True)
    evidence={'solution':M.SOLUTION_UNIQUE,'version':M.SOLUTION_VERSION,'transportVersion':'v0.2.0','binding':bound,'packages':{},'flows':[],'validation':{},'sourceHashes':{}}
    def save_package(name,payload):
        (out/name).write_bytes(payload)
        with zipfile.ZipFile(io.BytesIO(payload)) as z:
            members={i.filename:{'sha256':sha(z.read(i)),'bytes':i.file_size} for i in z.infolist()}
        evidence['packages'][name]={'sha256':sha(payload),'bytes':len(payload),'members':members}
    for literal in (False,True):
        fl=[fn(literal={'site':M.DEFAULT_SITE,'mail':'REPLACE-BEFORE-ENABLING.invalid','label':'Pilot'} if literal else None) for fn in flows.ALL_FLOWS]
        errs={f.name:validate.validate(f.definition(),f.name,literal) for f in fl}
        if any(errs.values()):raise ValueError(errs)
        payload,_=package.build_zip(fl,literal)
        suffix='_UNBOUND_REVIEW_ONLY' if args.review_unbound else '_BOUND_NATIVE_ACCEPTANCE_PENDING'
        suffix+=('_literal-fallback' if literal else '')
        name=f'{M.SOLUTION_UNIQUE}_{M.SOLUTION_VERSION.replace(".","_")}{suffix}.zip'
        save_package(name,payload)
        folder=out/('flow-definitions-literal-fallback' if literal else 'flow-definitions');folder.mkdir(exist_ok=True)
        for f in fl:
            data=(json.dumps(f.definition(),indent=2)+'\n').encode();(folder/(package.safe_name(f.name)+'.json')).write_bytes(data)
            if not literal:evidence['flows'].append({'name':f.name,'workflowId':f.guid,'actions':len(list(validate.walk(f.actions))),'definitionSha256':sha(data),'stateCode':0,'nativeExecuted':False})
        evidence['validation']['literal' if literal else 'primary']=errs
    helper_files={name:(ROOT/'connector'/name).read_bytes() for name in ['Script.cs','apiDefinition.swagger.json','apiProperties.json','deployment.json','README.md']}
    helper_files['Script.csx']=helper_files['Script.cs']
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
        for name,data in sorted(helper_files.items()):
            zi=zipfile.ZipInfo(name,(2026,9,23,12,0,0));zi.compress_type=zipfile.ZIP_DEFLATED;zi.external_attr=0o644<<16;z.writestr(zi,data)
    save_package('AICoECoreIntegrity_3_0_0_1_REGISTRATION_CANDIDATE.zip',buf.getvalue())
    model_doc={k:{'title':v[0],'template':v[1],'title_means':v[2],'columns':[{'name':n,'type':t,**opts} for n,t,opts in v[3]]} for k,v in M.LISTS.items()}
    (out/'data-model.json').write_text(json.dumps(model_doc,indent=2)+'\n')
    (out/'definitions-seed.json').write_text(json.dumps([{'Key':k,'Value':v,'Category':c,'Provisional':p,'Note':n} for k,v,c,p,n in M.seed_config()],indent=2)+'\n')
    for folder in ['generator','connector','provisioning','contract','tests']:
        for p in sorted((ROOT/folder).glob('*')):
            if p.is_file():evidence['sourceHashes'][str(p.relative_to(ROOT))]=sha(p.read_bytes())
    evidence['not_claimed']=['registered or qualified helper connector','flow designer Save','tenant import or execution','real ACLs/two-account isolation','model calls','Send','production or business acceptance']
    (out/'build-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
    (out/'deployment-settings-template.json').write_text(json.dumps({'EnvironmentVariables':[{'SchemaName':n,'Value':None} for n,_,_ in M.ENV_VARS],'ConnectionReferences':[{'LogicalName':'aicoe_sharepointonline','ConnectionId':None,'ConnectorId':'/providers/Microsoft.PowerApps/apis/shared_sharepointonline'},{'LogicalName':N.HELPER_REF,'ConnectionId':None,'ConnectorId':'/providers/Microsoft.PowerApps/apis/'+N.HELPER_API}]},indent=2)+'\n')
    print(json.dumps({'binding':bound,'packages':{k:{x:v[x] for x in ['sha256','bytes']} for k,v in evidence['packages'].items()}},indent=2))

if __name__=='__main__':main()
