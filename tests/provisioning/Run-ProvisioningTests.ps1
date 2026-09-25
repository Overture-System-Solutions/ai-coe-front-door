param([string]$Case='dry-run')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$PSModuleAutoLoadingPreference='None' # No real PnP connection or module is reachable in this process.
Import-Module Microsoft.PowerShell.Management
Import-Module Microsoft.PowerShell.Utility
Import-Module Microsoft.PowerShell.Security
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$script=Join-Path $root 'backend/marketing-native/provisioning/New-MarketingLists.ps1'
function Assert($value,[string]$message){if(-not $value){throw "ASSERT: $message"}}
function Get-PnPConnection {throw 'A dry-run attempted a native operation'}
Assert (Test-Path $script) 'Missing create-only Marketing provisioning script'
$result=& $script
Assert ($result.Mode -eq 'DryRun' -and $result.Enabled -eq $false -and $result.Qualified -eq $false) 'Dry-run must stay explicitly disabled/unqualified'
Assert (@($result.Lists).Count -eq 3) 'Dry-run must describe exactly three isolated marketing.v1 lists'
Assert ($result.NativeOperations -eq 0) 'Dry-run must not connect'
$checks=1
if($Case -ne 'dry-run'){
 . (Join-Path $PSScriptRoot 'Fake-PnP.ps1')
 Reset-Fake
 $run=Join-Path $root ('evidence/provisioning/test-runs/'+[guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $run|Out-Null
 $global:F.Receipt=Join-Path $run 'create'
 $apply=@{Apply=$true;ConfirmCreateOnly=$true;ConfirmCurrentControllerAuthority=$true;SiteUrl='https://example.invalid/sites/marketing';ExpectedWebId='aaaaaaaa-0000-4000-8000-000000000001';ExpectedOperatorId=100;ExpectedOperatorLogin='i:0#.f|membership|controller@example.invalid';ControllerGroupId=10;RequesterGroupId=20;WriterPrincipalId=300;ExpectedWriterLogin='i:0#.f|membership|writer@example.invalid';ReceiptPath=$global:F.Receipt}
 $result=& $script @apply
 Assert ($result.Mode -eq 'Applied' -and -not $result.Qualified -and -not $result.Enabled) 'Apply must stay unqualified and disabled'
 Assert ($global:F.Lists.Count -eq 3) 'Exactly three new lists required'
 foreach($l in $global:F.Lists){
  Assert ($l.HasUniqueRoleAssignments -and $l.ReadSecurity -eq 1 -and $l.WriteSecurity -eq 1) 'No unique-column/own-read combination allowed'
  Assert (-not $l.EnableAttachments -and -not $l.EnableVersioning -and -not $l.EnableFolderCreation -and $l.NoCrawl -and $l.Hidden) 'Private list settings missing'
  $expectedCount=if($l.Title -like '*Requests'){2}else{1}
  Assert ($l.RoleAssignments.Count -eq $expectedCount) 'Only writer and request-only group ACL allowed'
  Assert (@($l.RoleAssignments|Where-Object {$_.Member.Id -notin @(300,20)}).Count -eq 0) 'Creator/controller/broad grants remain'
 }
 $schema=Get-Content (Join-Path $root 'backend/power-automate/marketing-runtime/provisioning.json') -Raw|ConvertFrom-Json
 foreach($s in $schema.lists){
  $l=@($global:F.Lists|Where-Object Title -eq $s.suggestedTitle)[0]
  Assert ($global:F.Fields[$l.Id].Count -eq $s.fields.Count) 'Schema field count mismatch'
  foreach($schemaField in $s.fields){$actual=@($global:F.Fields[$l.Id]|Where-Object InternalName -eq $schemaField.name)[0];Assert ($actual.Required -and $actual.TypeAsString -eq $schemaField.type) 'Exact marketing.v1 field type/required missing'}
 }
 $r=Get-Content ($global:F.Receipt+'.applied.json') -Raw|ConvertFrom-Json
 Assert ($r.readbackVerified -and -not $r.qualified -and $r.protection -eq 'Windows-DPAPI-CurrentUser') 'Receipt is not private/unqualified'
 $checks++
 function Refused([scriptblock]$Action,[string]$Pattern){try{& $Action|Out-Null}catch{if($_.Exception.Message -notmatch $Pattern){throw};return};throw "ASSERT: Expected refusal: $Pattern"}
 # Reuse refuses without any additional operation, even with a new receipt path.
 $before=$global:F.Writes.Count;$apply.ReceiptPath=Join-Path $run 'existing';$global:F.Receipt=$apply.ReceiptPath
 Refused {& $script @apply} 'Existing Marketing';Assert ($global:F.Writes.Count -eq $before) 'Existing list was touched';$checks++
 $scenarios=@(
  @{name='nonadmin-other-controller';set={ $global:F.OperatorAdmin=$false };pattern='readback access'},
  @{name='denied-list';set={ $global:F.Denied='lists' };pattern='403'},
  @{name='denied-group';set={ $global:F.Denied='membership' };pattern='403'},
  @{name='denied-roles';set={ $global:F.Denied='roles' };pattern='403'},
  @{name='denied-authority';set={ $global:F.Denied='effective-permissions' };pattern='403'},
  @{name='overlap';set={ $global:F.Overlap=$true };pattern='overlap'},
  @{name='nested';set={ $global:F.Nested=$true };pattern='Nested'},
  @{name='admin';set={ $global:F.AdminRequester=$true };pattern='site-admin'},
  @{name='request-admin';set={ $global:F.RequestAdmin=$true };pattern='administrative'},
  @{name='unsafe-group';set={ $global:F.UnsafeGroup=$true };pattern='Unsafe group'},
  @{name='unsafe-owner';set={ $global:F.UnsafeOwner=$true };pattern='group owner'},
  @{name='wrong-writer';set={ $global:F.WrongWriter=$true };pattern='writer identity'},
  @{name='wrong-operator';set={ $global:F.WrongOperator=$true };pattern='operator identity'},
  @{name='no-authority';set={ $global:F.Authority=$false };pattern='management authority'},
  @{name='unsafe-read';set={ $global:F.Roles[0].BasePermissions.Names+=@('EditListItems') };pattern='Read is unsafe'},
  @{name='unsafe-custom';set={ $global:F.Roles+=@([pscustomobject]@{Id=777;Name='AI CoE Marketing Request Submit';RoleTypeKind='None';BasePermissions=(Perm @('AddListItems','ViewListItems','Open','ViewPages','UseRemoteAPIs'))}) };pattern='permission drift'},
  @{name='occupied-url';set={ $global:F.Lists=@([pscustomobject]@{Id='22222222-0000-4000-8000-000000000000';Title='Unrelated';RootFolder=[pscustomobject]@{ServerRelativeUrl='/sites/marketing/Lists/AICoEMarketingResults'}}) };pattern='Existing Marketing'}
 )
 foreach($scenario in $scenarios){Reset-Fake;$apply.ReceiptPath=Join-Path $run $scenario.name;$global:F.Receipt=$apply.ReceiptPath;& $scenario.set;Refused {& $script @apply} $scenario.pattern;Assert ($global:F.Writes.Count -eq 0) "Preflight wrote: $($scenario.name)";$checks++}
 foreach($fault in @('acl','settings','field','rows')){
  Reset-Fake;$apply.ReceiptPath=Join-Path $run ('bad-'+$fault);$global:F.Receipt=$apply.ReceiptPath;$global:F.BadReadback=$fault
  Refused {& $script @apply} 'readback|empty'
  Assert (-not (Test-Path ($apply.ReceiptPath+'.applied.json'))) 'Failed readback created a success receipt'
  Assert (@($global:F.Lists.RoleAssignments|Where-Object {$_.Member.Id -eq 20}).Count -eq 0) 'Requester granted before private readback';$checks++
 }
 Reset-Fake;$apply.ReceiptPath=Join-Path $run 'late-role-drift';$global:F.Receipt=$apply.ReceiptPath;$global:F.LateRoleDrift=$true
 Refused {& $script @apply} 'permission drift';Assert (-not (Test-Path ($apply.ReceiptPath+'.applied.json'))) 'Role drift produced success';$checks++
 Reset-Fake;$apply.ReceiptPath=Join-Path $run 'late-overlap';$global:F.Receipt=$apply.ReceiptPath;$global:F.LateOverlap=$true
 Refused {& $script @apply} 'overlap';Assert (@($global:F.Lists.RoleAssignments|Where-Object {$_.Member.Id -eq 20}).Count -eq 0) 'Late overlap received grant';$checks++
 Reset-Fake;$apply.ReceiptPath=Join-Path $run 'gates';$global:F.Receipt=$apply.ReceiptPath
 $apply.ConfirmCurrentControllerAuthority=$false;Refused {& $script @apply} 'confirmation';$apply.ConfirmCurrentControllerAuthority=$true;$checks++
 $apply.DryRun=$true;Refused {& $script @apply} 'cannot be combined';$apply.Remove('DryRun');$checks++
 $apply.SiteUrl='https://wrong.invalid/sites/marketing';Refused {& $script @apply} 'connection';$checks++
 Assert ($global:F.Writes.Count -eq 0) 'A refused apply changed state'
}
[pscustomobject]@{status='PASS';checks=$checks;case=$Case;scope='Offline fake PnP only';qualified=$false}|ConvertTo-Json -Compress
