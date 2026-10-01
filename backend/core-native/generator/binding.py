"""Explicit local build binding; does not discover or qualify a tenant connector."""
import json,re,hashlib,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def validate(value):
    expected={'runtimeApiName','connectorId','logicalName','qualificationReceipt','scriptSha256'}
    if not isinstance(value,dict) or set(value)!=expected:raise ValueError('Exact binding fields required: '+','.join(sorted(expected)))
    name=value['runtimeApiName']
    if not isinstance(name,str) or not re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_-]{5,255}',name) or any(x in name.upper() for x in ['UNBOUND','REPLACE','FIXTURE']):raise ValueError('Real environment-assigned API name required; do not normalize it')
    if not re.fullmatch(r'[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}',value['connectorId']):raise ValueError('Exact connector GUID required')
    if uuid.UUID(value['connectorId']).int==0:raise ValueError('Null connector GUID')
    if not re.fullmatch(r'aicoe_[a-zA-Z0-9_-]+',value['logicalName']):raise ValueError('Exact connector schema name required')
    if not isinstance(value['qualificationReceipt'],str) or len(value['qualificationReceipt'])<8:raise ValueError('Qualified custom-code receipt reference required')
    actual=hashlib.sha256((ROOT/'connector/Script.cs').read_bytes()).hexdigest()
    if value['scriptSha256']!=actual:raise ValueError('Qualification must bind current Script.cs bytes')
    return {**value,'deployable':False,'bindingStatus':'EXPLICIT_OPERATOR_BINDING_NATIVE_ACCEPTANCE_PENDING'}

def load(path,review=False):
    if path and review:raise ValueError('Choose a qualified binding OR review-unbound')
    if path:return validate(json.loads(Path(path).read_text()))
    if not review:raise ValueError('No binding: --review-unbound is required for a NONDEPLOYABLE review package')
    return {'runtimeApiName':'UNBOUND_CORE_INTEGRITY','connectorId':None,'logicalName':'aicoe_coreintegrity','qualificationReceipt':None,'scriptSha256':hashlib.sha256((ROOT/'connector/Script.cs').read_bytes()).hexdigest(),'deployable':False,'bindingStatus':'UNBOUND_REVIEW_ONLY'}
