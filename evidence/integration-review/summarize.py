"""Aggregate actual logs and exact bytes; no inferred or duplicate totals."""
from pathlib import Path
import datetime as dt
import hashlib
import json
import re
import xml.etree.ElementTree as ET
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def tap(name,expected):
    text=(HERE/name).read_text()
    counts={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$',text,re.M)}
    names=re.findall(r'^ok \d+ - (.*)$',text,re.M)
    assert counts['tests']==counts['pass']==expected==len(names),(name,counts,len(names))
    assert all(counts[k]==0 for k in ['fail','cancelled','skipped','todo'])
    return {**counts,'testNames':names,'logSha256':digest(HERE/name)}
suites=ET.parse(HERE/'native-tests.xml').getroot().findall('testsuite')
native={k:sum(int(s.attrib[k]) for s in suites) for k in ['tests','failures','errors','skipped']}
assert native=={'tests':30,'failures':0,'errors':0,'skipped':0}
cases=[c.attrib for s in suites for c in s.findall('testcase')]
assert len(cases)==native['tests']
original=json.loads((ROOT/'backend/core-native/evidence/final-verification.json').read_text())
original_names={n.split('.')[-1] for n in original['testCases']}
current_names={c['name'] for c in cases}
missing=original_names-current_names
added=current_names-original_names
assert missing=={'test_review_build_has_current_bytes_no_reference_model_claims'}
assert added=={'test_existing_review_packages_have_current_bytes_without_rebuilding'}
probes=json.loads((HERE/'independent-probes.json').read_text())
source_changes={p:{'atProbe':sha,'current':digest(ROOT/p)} for p,sha in probes['sourceHashes'].items() if digest(ROOT/p)!=sha}
protected=json.loads((HERE/'protected-before.json').read_text())
changed=[name for name,stamp in protected.items() if digest(ROOT/name)!=stamp['sha256'] or (ROOT/name).stat().st_size!=stamp['bytes']]
assert not changed,changed
manifest=json.loads((HERE/'marketing-exact-zip/manifest.json').read_text())
input_changes=[p['path'] for p in manifest['inputs'] if digest(ROOT/p['path'])!=p['sha256']]
result={'verifiedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'scope':'Offline synthetic boundaries; no live tenant/provider/ACL execution','native':{**native,'originalUnmodifiedTests':len(original_names)-len(missing),'excludedBuildTest':sorted(missing),'existingByteReplacement':sorted(added)},'marketingSource':tap('marketing-source.log',30),'marketingExactZipSmoke':tap('marketing-zip-smoke.log',1),'clientAndDraft':tap('client-drafts.log',14),'typecheck':{'rootFiles':len(json.loads((HERE/'focused-typecheck.json').read_text())['rootFiles']),'diagnostics':len(json.loads((HERE/'focused-typecheck.json').read_text())['diagnostics'])},'packagedCoreSmoke':json.loads((HERE/'native-delivery-receipt.json').read_text())['packagedSmoke'],'independentProbeObservations':len(probes['observations']),'independentDefectGroups':['DRAFT-RECOVERY-CONCURRENCY','MARKETING-REVOKED-SOURCE-REPLAY','MARKETING-LATE-REVOKED-SOURCE'],'sourceChangesSinceProbes':source_changes,'marketingInputChangesSinceArchive':input_changes,'protectedFiles':len(protected),'protectedFilesUnchanged':not changed,'notClaimed':['unmodified execution of native rebuilding test','new PAC execution','full Heft/shared build','browser end-to-end or tenant acceptance','Marketing execution-host binding completion']}
(HERE/'summary.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['marketingSource','marketingExactZipSmoke','clientAndDraft']},indent=2))
print(json.dumps({k:{a:b for a,b in result[k].items() if a!='testNames'} for k in ['marketingSource','marketingExactZipSmoke','clientAndDraft']},indent=2))
