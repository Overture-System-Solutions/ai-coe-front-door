# Independent fault injection around the real provisioner. No native module/authentication.
param([string]$Case='all')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$PSModuleAutoLoadingPreference='None'
Import-Module Microsoft.PowerShell.Management
Import-Module Microsoft.PowerShell.Utility
Import-Module Microsoft.PowerShell.Security
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$provisioner=Join-Path $root 'backend/marketing-native/provisioning/New-MarketingLists.ps1'
function Assert($condition,[string]$message){if(-not $condition){throw "ASSERT: $message"}}
. (Join-Path $PSScriptRoot 'Fake-PnP.ps1')
$global:IndependentBaseMembers=${function:Get-PnPGroupMember}
$global:IndependentBasePermission=${function:Set-PnPListPermission}
$global:IndependentBaseConnection=${function:Get-PnPConnection}
$global:IndependentBaseList=${function:Get-PnPList}
$global:IndependentBaseFields=${function:Get-PnPField}
$global:IndependentBaseRoles=${function:Get-PnPRoleDefinition}
$global:IndependentBaseUser=${function:Get-PnPUser}
function Get-PnPUser {
 param($Identity,$Connection,$ErrorAction)
 if($global:IndependentFault -eq 'writer-controller'){
  Read-Op 'user' $Connection
  Assert ($Identity -eq 100) 'Expected explicit current writer/controller ID'
  Actor 100 'i:0#.f|membership|controller@example.invalid'
 }else{& $global:IndependentBaseUser @PSBoundParameters}
}
function Get-PnPConnection {
 param($ErrorAction)
 $c=& $global:IndependentBaseConnection
 if($global:IndependentFault -eq 'app-only'){$c.Context.Type='AzureADCertificate'}
 if($global:IndependentFault -eq 'unclassified-token'){$c.Context.Type='AccessToken'}
 if($global:IndependentFault -eq 'device-session'){$c.Context.Type='DeviceLogin'}
 if($global:IndependentFault -eq 'unknown-session'){$c.Context.Type='Unknown'}
 $c
}
function Get-PnPGroupMember {
 param($Group,$Connection,$ErrorAction)
 $members=@(& $global:IndependentBaseMembers @PSBoundParameters)
 if($global:IndependentFault -eq 'not-controller' -and $Group -eq 10){$members=@(Actor 101 'i:0#.f|membership|other-controller@example.invalid')}
 if($global:IndependentFault -eq 'writer-requester' -and $Group -eq 20){$members=@(Actor 300 'i:0#.f|membership|writer@example.invalid')}
 if($Group -eq 20 -and (($global:IndependentFault -eq 'group-drift' -and $global:F.Created -gt 0) -or ($global:IndependentFault -eq 'group-drift-after-grant' -and $global:IndependentGranted))){
  $members+=Actor 201 'i:0#.f|membership|second-requester@example.invalid'
 }
 $members
}
function Set-PnPListPermission {
 param($Identity,$Group,$User,$AddRole,$RemoveRole,$Connection,$ErrorAction)
 & $global:IndependentBasePermission @PSBoundParameters
 if($Group -eq 20 -and $AddRole){$global:IndependentGranted=$true}
}
function Get-PnPList {
 param($Identity,$Includes,$Connection,$ErrorAction)
 $value=& $global:IndependentBaseList @PSBoundParameters
 if($Identity){
  if($global:IndependentFault -eq 'wrong-list-url'){$value.RootFolder.ServerRelativeUrl='/sites/marketing/Lists/Unexpected'}
  if($global:IndependentFault -eq 'own-write-unique'){$value.WriteSecurity=2}
  if($global:IndependentFault -eq 'private-row-after-grant' -and $global:IndependentGranted -and $value.Title -like '*Canonical'){$value.ItemCount=1}
  if($global:IndependentFault -eq 'late-canonical-field' -and $value.Title -like '*Results'){
   $canonical=@($global:F.Lists|Where-Object Title -like '*Canonical')[0]
   @($global:F.Fields[$canonical.Id]|Where-Object InternalName -eq 'Title')[0].EnforceUniqueValues=$false
  }
 }
 $value
}
function Get-PnPField {
 param($List,$Includes,$Connection,$ErrorAction)
 $fields=@(& $global:IndependentBaseFields @PSBoundParameters)
 foreach($field in $fields){
  if($global:IndependentFault -eq 'unique-index-drift' -and $field.InternalName -eq 'Title'){$field.EnforceUniqueValues=$false}
  if($global:IndependentFault -eq 'indexed-drift' -and $field.InternalName -eq 'Title'){$field.Indexed=$false}
  if($global:IndependentFault -eq 'required-drift' -and $field.InternalName -eq 'Title'){$field.Required=$false}
  if($global:IndependentFault -eq 'field-type-drift' -and $field.InternalName -eq 'RecordJson'){$field.TypeAsString='Text'}
  if($global:IndependentFault -eq 'note-richtext' -and $field.TypeAsString -eq 'Note'){$field.RichText=$true}
  if($global:IndependentFault -eq 'note-appendonly' -and $field.TypeAsString -eq 'Note'){$field.AppendOnly=$true}
 }
 $fields
}
function Get-PnPRoleDefinition {
 param($Connection,$ErrorAction)
 $roles=@(& $global:IndependentBaseRoles @PSBoundParameters)
 if($global:IndependentFault -eq 'role-id-drift' -and $global:F.Created -gt 0){@($roles|Where-Object Name -eq 'AI CoE Marketing Request Submit')[0].Id=2000001000}
 if($global:IndependentFault -eq 'read-role-drift' -and $global:F.Created -gt 0){$roles[0].BasePermissions.Names+=@('EditListItems')}
 if($global:IndependentFault -eq 'post-grant-role-drift' -and $global:IndependentGranted){@($roles|Where-Object Name -eq 'AI CoE Marketing Request Submit')[0].BasePermissions.Names+=@('ViewListItems')}
 $roles
}
$run=Join-Path $root ('evidence/provisioning/independent-runs/'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run|Out-Null
$cases=@(
 @{name='group-drift';pattern='principal.*drift|group.*drift';beforeGrant=$true},
 @{name='group-drift-after-grant';pattern='principal.*drift|group.*drift';beforeGrant=$false},
 @{name='app-only';pattern='delegated';beforeGrant=$true;noWrites=$true},
 @{name='unclassified-token';pattern='delegated';beforeGrant=$true;noWrites=$true},
 @{name='role-id-drift';pattern='role.*drift';beforeGrant=$true},
 @{name='read-role-drift';pattern='Read role permission drift';beforeGrant=$true},
 @{name='wrong-list-url';pattern='readback';beforeGrant=$true},
 @{name='own-write-unique';pattern='readback';beforeGrant=$true},
 @{name='private-row-after-grant';pattern='empty';beforeGrant=$false},
 @{name='late-canonical-field';pattern='schema readback';beforeGrant=$true},
 @{name='unique-index-drift';pattern='schema readback';beforeGrant=$true},
 @{name='indexed-drift';pattern='schema readback';beforeGrant=$true},
 @{name='required-drift';pattern='schema readback';beforeGrant=$true},
 @{name='field-type-drift';pattern='schema readback';beforeGrant=$true},
 @{name='note-richtext';pattern='plain non-append';beforeGrant=$true},
 @{name='note-appendonly';pattern='plain non-append';beforeGrant=$true},
 @{name='post-grant-role-drift';pattern='permission drift';beforeGrant=$false},
 @{name='unknown-session';pattern='delegated';beforeGrant=$true;noWrites=$true},
 @{name='not-controller';pattern='not a direct';beforeGrant=$true;noWrites=$true},
 @{name='writer-requester';pattern='overlap';beforeGrant=$true;noWrites=$true},
 @{name='denied-user';pattern='403';beforeGrant=$true;denied='user';noWrites=$true},
 @{name='denied-property';pattern='403';beforeGrant=$true;denied='property';noWrites=$true},
 @{name='denied-fields';pattern='403';beforeGrant=$true;denied='fields'},
 @{name='device-session';success=$true},
 @{name='writer-controller';success=$true},
 @{name='drive-relative-receipt';pattern='absolute';beforeGrant=$true;noWrites=$true}
)
if($Case -ne 'all'){$cases=@($cases|Where-Object name -eq $Case)}
Assert ($cases.Count -gt 0) 'No independent tests selected'
$observations=@()
foreach($test in $cases){
 Reset-Fake;$global:IndependentFault=$test.name;$global:IndependentGranted=$false
 if($test['denied']){$global:F.Denied=$test.denied}
 $global:F.Receipt=Join-Path $run $test.name
 $args=@{Apply=$true;ConfirmCreateOnly=$true;ConfirmCurrentControllerAuthority=$true;SiteUrl='https://example.invalid/sites/marketing';ExpectedWebId='aaaaaaaa-0000-4000-8000-000000000001';ExpectedOperatorId=100;ExpectedOperatorLogin='i:0#.f|membership|controller@example.invalid';ControllerGroupId=10;RequesterGroupId=20;WriterPrincipalId=300;ExpectedWriterLogin='i:0#.f|membership|writer@example.invalid';ReceiptPath=$global:F.Receipt}
 if($test.name -eq 'writer-controller'){$global:F.OperatorAdmin=$false;$args.WriterPrincipalId=100;$args.ExpectedWriterLogin=$args.ExpectedOperatorLogin}
 $errorText='';$status='PASS'
 try {
  $refused=$false
  $result=$null
  try {
   if($test.name -eq 'drive-relative-receipt'){
    . (Join-Path $root 'backend/marketing-native/provisioning/ProvisioningReceipt.ps1')
    # Path validation ONLY: never write to the drive-relative target.
    Push-Location 'C:\'
    try{Assert-ReceiptPath 'C:Windows\marketing-receipt-test'}finally{Pop-Location}
   }else{$result=& $provisioner @args}
  } catch {$refused=$true;$errorText=$_.Exception.Message}
  if($test['success']){
   Assert (-not $refused) ('Expected success: '+$errorText)
   Assert ($result.Mode -eq 'Applied' -and -not $result.Enabled -and -not $result.Qualified) 'Positive path enabled or qualified itself'
   Assert ((Test-Path ($global:F.Receipt+'.applied.json')) -and $global:F.Lists.Count -eq 3 -and $global:IndependentGranted) 'Incomplete successful local apply'
  }else{
   Assert $refused ('Expected refusal for '+$test.name)
   Assert ($errorText -match $test.pattern) ('Unexpected refusal: '+$errorText)
   Assert (-not (Test-Path ($global:F.Receipt+'.applied.json'))) 'Refusal produced a success receipt'
   if($test.beforeGrant){Assert (-not $global:IndependentGranted) 'Requester grant occurred before failed safety check'}
   if($test['noWrites']){Assert ($global:F.Writes.Count -eq 0) 'Preflight refusal changed fake state'}
  }
 } catch {$status='FAIL';$errorText=$_.Exception.Message}
 $observations+=@([pscustomobject]@{name=$test.name;status=$status;observation=$errorText;requesterGranted=$global:IndependentGranted;fakeWrites=$global:F.Writes.Count})
}
$failed=@($observations|Where-Object status -eq 'FAIL').Count
[pscustomobject]@{status=$(if($failed){'FAIL'}else{'PASS'});checks=$observations.Count;failed=$failed;scope='Independent offline fake PnP fault injection';qualified=$false;cases=$observations}|ConvertTo-Json -Depth 10 -Compress
if($failed){exit 1}
