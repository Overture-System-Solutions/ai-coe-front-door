param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$PSModuleAutoLoadingPreference='None'
Import-Module Microsoft.PowerShell.Management
Import-Module Microsoft.PowerShell.Utility
Import-Module Microsoft.PowerShell.Security
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$script=Join-Path $root 'backend/marketing-native/provisioning/New-MarketingBootstrap.ps1'
function Assert($condition,$message){if(-not $condition){throw "ASSERT: $message"}}
function Get-PnPConnection {throw 'Bootstrap must NEVER connect'}
Assert (Test-Path $script) 'Missing offline bootstrap generator'
$result=& $script
Assert ($result.Mode -eq 'DryRun' -and -not $result.Enabled -and -not $result.Qualified -and $result.NativeOperations -eq 0) 'Bootstrap default must be offline/unqualified'
$run=Join-Path $root ('evidence/provisioning/bootstrap-tests/'+[guid]::NewGuid().ToString('N'))
$result=& $script -WriteTemplates -OutputDirectory $run
$config=Get-Content (Join-Path $run 'config.template.json') -Raw|ConvertFrom-Json
Assert (-not $config.enabled -and -not $config.controllerQualified -and -not $config.securityQualified -and $null -eq $config.writerPrincipalId -and $config.qualificationReceiptRef -eq '' -and $config.provider.qualificationReceiptRef -eq '') 'Bootstrap invented qualification/identity'
Assert ($config.siteUrl -ceq 'https://osscontact.sharepoint.com/sites/CloudWaveDashboardDemo') 'Selected site not preserved'
$inputText=Get-Content (Join-Path $run 'controlled-inputs.template.json') -Raw
Assert (Test-Json -Json $inputText -SchemaFile (Join-Path (Split-Path $script -Parent) 'controlled-inputs.schema.json')) 'Empty controlled input is not schema-valid'
$gate=Get-Content (Join-Path $run 'commissioning.template.json') -Raw|ConvertFrom-Json
Assert (-not $gate.retentionQualified -and -not $gate.historicalResultRevocationTested -and -not $gate.lifecycleEnforcementImplemented) 'Metadata pretended to enforce retention'
$checks=4
$planner=Join-Path (Split-Path $script -Parent) 'ConvertTo-MarketingRecordPlan.ps1'
Assert (Test-Path $planner) 'Missing controlled record planner'
$site='https://synthetic.sharepoint.com/sites/marketing'
$inputObject=[ordered]@{kind='marketing.bootstrap-input.v1';siteUrl=$site;records=@(
 @{Key='member:200';Value=@{enabled=$false;actorId='requester@example.invalid';roles=@('marketingParticipant');workIds=@('CW-TEST');audience='Synthetic internal'}},
 @{Key='authority:binding-owner';Value=@{bindingRef='binding-owner';actorId='owner@example.invalid';label='SYNTHETIC TEST ONLY';scope=@('sourceRegister');expiresAt='2000-01-01T00:00:00Z';synthetic=$false;tenantScope=$site;revoked=$true}},
 @{Key='source:source-test';Value=@{entry=@{id='source-test';location=($site+'/Shared%20Documents/test.txt');versionOrETag='"1"';owner='Synthetic owner';asOf='2000-01-01';classification='Synthetic';audience='Synthetic internal';mayNotProve='Anything real'};actors=@('requester@example.invalid');purposes=@('campaignBrief');audiences=@('Synthetic internal');contentHash=('a'*64);revoked=$true}},
 @{Key='qualification:QUAL-native-test';Value=@{result='INCONCLUSIVE';bindingHash=('b'*64);expiresAt='2000-01-01T00:00:00Z'}},
 @{Key='receipt:RCP-test';Value=@{receiptId='RCP-test';operation='approveSourceRegister';targetRef='snapshot:REGISTER-test:v1';payloadHash=('c'*64);readbackHash=$null;result='INCONCLUSIVE';observedAt='2000-01-01T00:00:00Z';actorId='owner@example.invalid'}}
)}
$inputPath=Join-Path $run 'synthetic-input.json'
$inputObject|ConvertTo-Json -Depth 50|Set-Content -LiteralPath $inputPath -Encoding utf8
$planPath=Join-Path $run 'private-plan.json'
$result=& $planner -InputPath $inputPath -WriterPrincipalId 300 -ExpectedWriterActorId 'writer@example.invalid' -WritePlan -PlanPath $planPath
Assert ($result.RecordCount -eq 5 -and -not $result.Qualified -and -not $result.Enabled -and $result.NativeOperations -eq 0) 'Planner returned false authority'
. (Join-Path (Split-Path $script -Parent) 'ProvisioningReceipt.ps1')
$plan=Read-PrivateReceipt $planPath
Assert ($plan.planOnly -and -not $plan.readbackVerified -and -not $plan.qualified) 'Record plan is not explicit unverified input'
foreach($row in $plan.rows){
 $expected=([BitConverter]::ToString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($site+"`n"+$row.Fields.RecordKey)))).Replace('-','').ToLowerInvariant()
 Assert ($row.Fields.Title -ceq $expected -and $row.ExpectedVersion -eq $null -and $row.Fields.TenantScope -ceq $site) 'Canonical exact site/newline/key or create-only semantics changed'
 Assert ($row.Fields.RecordHash -ceq (Get-TextHash $row.Fields.RecordJson)) 'RecordJson byte hash wrong'
};$checks++
function Refused([scriptblock]$Action,[string]$Pattern){try{& $Action|Out-Null}catch{if($_.Exception.Message -notmatch $Pattern){throw};return};throw "ASSERT: Expected refusal: $Pattern"}
$baseline=$inputObject|ConvertTo-Json -Depth 50 -Compress
$badCases=@(
 @{name='enabled';change={param($v) $v.records[0].Value.enabled=$true};pattern='schema'},
 @{name='string-boolean';change={param($v) $v.records[0].Value.enabled='false'};pattern='schema'},
 @{name='qualification-pass';change={param($v) $v.records[3].Value.result='PASS'};pattern='schema'},
 @{name='approval-pass';change={param($v) $v.records[4].Value.result='PASS'};pattern='schema'},
 @{name='active-source';change={param($v) $v.records[2].Value.revoked=$false};pattern='schema'},
 @{name='active-authority';change={param($v) $v.records[1].Value.revoked=$false};pattern='schema'},
 @{name='unknown-key';change={param($v) $v.records[0].Value['password']='NOT-A-SECRET-TEST'};pattern='schema'},
 @{name='future-authority';change={param($v) $v.records[1].Value.expiresAt='2999-01-01T00:00:00Z'};pattern='expired'},
 @{name='future-qualification';change={param($v) $v.records[3].Value.expiresAt='2999-01-01T00:00:00Z'};pattern='expired'},
 @{name='tenant';change={param($v) $v.records[1].Value.tenantScope='https://other.sharepoint.com/sites/other'};pattern='binding mismatch'},
 @{name='wrong-binding';change={param($v) $v.records[1].Value.bindingRef='not-the-key'};pattern='binding mismatch'},
 @{name='wrong-source';change={param($v) $v.records[2].Value.entry.id='not-the-key'};pattern='same-site'},
 @{name='cross-site-source';change={param($v) $v.records[2].Value.entry.location='https://other.sharepoint.com/sites/other/file.txt'};pattern='same-site'},
 @{name='wrong-receipt';change={param($v) $v.records[4].Value.receiptId='not-the-key'};pattern='identity mismatch'},
 @{name='writer-principal';change={param($v) $v.records[0].Key='member:300'};pattern='Writer'},
 @{name='writer-actor';change={param($v) $v.records[0].Value.actorId='writer@example.invalid'};pattern='Writer'},
 @{name='duplicate-key';change={param($v) $v.records+=@($v.records[0])};pattern='Duplicate'},
 @{name='claimed-register';change={param($v) $v.records+=@(@{Key='register:active';Value=@{register=@{approval='approved'}}})};pattern='schema'},
 @{name='duplicate-actor';change={param($v) $copy=($v.records[0]|ConvertTo-Json -Depth 20|ConvertFrom-Json -AsHashtable);$copy.Key='member:201';$v.records+=@($copy)};pattern='Duplicate actor'},
 @{name='encoded-path';change={param($v) $v.records[2].Value.entry.location=$v.siteUrl+'/Shared%20Documents/x%2f..%2ftest.txt'};pattern='path'},
 @{name='dot-path';change={param($v) $v.records[2].Value.entry.location=$v.siteUrl+'/Shared%20Documents/../test.txt'};pattern='path'},
 @{name='backslash-path';change={param($v) $v.records[2].Value.entry.location=$v.siteUrl+'/Shared%20Documents\test.txt'};pattern='path'}
)
foreach($case in $badCases){
 $candidate=$baseline|ConvertFrom-Json -AsHashtable;& $case.change $candidate
 $candidate|ConvertTo-Json -Depth 50|Set-Content -LiteralPath $inputPath -Encoding utf8
 Refused {& $planner -InputPath $inputPath -WriterPrincipalId 300 -ExpectedWriterActorId 'writer@example.invalid'} $case.pattern;$checks++
}
Refused {& $script -WriteTemplates -OutputDirectory $run} 'NEW';$checks++
$baseline|Set-Content -LiteralPath $inputPath -Encoding utf8
Refused {& $planner -InputPath $inputPath -WriterPrincipalId 300 -ExpectedWriterActorId 'writer@example.invalid' -WritePlan -PlanPath $planPath} 'exists|already';$checks++
function New-Item {throw 'ASSERT: A drive-relative template path reached directory creation'}
try{Refused {& $script -WriteTemplates -OutputDirectory 'C:marketing-bootstrap-relative-test'} 'absolute';$checks++}finally{Remove-Item Function:New-Item}
[pscustomobject]@{status='PASS';checks=$checks;scope='Offline bootstrap only';qualified=$false}|ConvertTo-Json -Compress
