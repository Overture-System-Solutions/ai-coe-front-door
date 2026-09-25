<#
.SYNOPSIS
Create ONLY three new isolated marketing.v1 lists. Default is offline dry-run.
.DESCRIPTION
No Connect, EnsureUser, membership changes, business rows, migration, rollback or enablement.
All native calls use the existing explicitly matched PnP connection. Any existing target or
unsafe prerequisite refuses. Apply is not atomic; reconcile protected receipts after any error.
#>
[CmdletBinding(PositionalBinding=$false)]
param(
 [switch]$DryRun,[switch]$Apply,[switch]$ConfirmCreateOnly,[switch]$ConfirmCurrentControllerAuthority,
 [string]$SiteUrl,[string]$ExpectedWebId,[int]$ExpectedOperatorId,[string]$ExpectedOperatorLogin,
 [int]$ControllerGroupId,[int]$RequesterGroupId,[int]$WriterPrincipalId,[string]$ExpectedWriterLogin,
 [string]$ReceiptPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$schemaPath=Join-Path $PSScriptRoot 'marketing.v1.lists.json'
if((Get-FileHash $schemaPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne '690903876bf650bacaf33436620cf99ef26386a8c44748e9b31cae4df3ad6b25'){throw 'Pinned marketing.v1 schema changed; review required.'}
$descriptor=Get-Content -LiteralPath $schemaPath -Raw -Encoding UTF8|ConvertFrom-Json -AsHashtable
if($Apply -and $DryRun){throw 'Apply and DryRun cannot be combined.'}
if(-not $Apply){
 [pscustomobject]@{Mode='DryRun';Enabled=$false;Qualified=$false;NativeOperations=0;Lists=@($descriptor.lists);Note='Create-only plan, not tenant evidence. No connection or writes.'};return
}
if(-not $ConfirmCreateOnly -or -not $ConfirmCurrentControllerAuthority){throw 'Apply requires explicit create-only and current controller authority confirmation.'}
if($ControllerGroupId -le 0 -or $RequesterGroupId -le 0 -or $WriterPrincipalId -le 0 -or $ExpectedOperatorId -le 0 -or $ControllerGroupId -eq $RequesterGroupId -or $WriterPrincipalId -eq $RequesterGroupId -or $WriterPrincipalId -eq $ControllerGroupId){throw 'Explicit distinct approved group and writer principal IDs required.'}
$webGuid=[guid]::Empty
if(-not [guid]::TryParseExact($ExpectedWebId,'D',[ref]$webGuid) -or $webGuid -eq [guid]::Empty -or [string]::IsNullOrWhiteSpace($ExpectedOperatorLogin) -or [string]::IsNullOrWhiteSpace($ExpectedWriterLogin)){throw 'Explicit expected web ID and current operator/writer login identities required.'}
if($SiteUrl -cne $SiteUrl.TrimEnd('/') -or $SiteUrl -match '\s'){throw 'SiteUrl must be exact, without whitespace or trailing slash; no normalization of canonical keys.'}
$receiptHelper=Join-Path $PSScriptRoot 'ProvisioningReceipt.ps1'
if((Get-FileHash $receiptHelper -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'de862638c455939a7dfb634498fb5d1117ce3d1592b066dee11db0d93a98b48a'){throw 'Pinned DPAPI receipt helper changed.'}
. $receiptHelper
Assert-ReceiptPath $ReceiptPath
foreach($suffix in @('.prepared.json','.applied.json','.created-canonicalListId.json','.created-requestListId.json','.created-resultListId.json')){if(Test-Path -LiteralPath ($ReceiptPath+$suffix)){throw 'ReceiptPath already used; reconcile manually, never rerun with a new prefix to repair.'}}
$connection=Get-AuthorizedConnection $SiteUrl
# PnP 3.1.0's public ConnectionMethod/InitializationType labels are not
# sufficient (interactive login is labelled Credentials/ClientIDCertificate).
# Inspect only local context classification, never tokens/credentials.
try{$authenticationType=[string]([Microsoft.SharePoint.Client.InternalClientContextExtensions]::GetContextSettings($connection.Context).Type)}catch{throw 'Existing delegated PnP authentication classification unavailable; stop for controller review.'}
if($authenticationType -notin @('AzureADInteractive','DeviceLogin')){throw 'Existing delegated interactive/device PnP session required; app-only, raw-token and unknown modes are refused.'}
$web=Get-PnPWeb -Includes Id,Url,CurrentUser -Connection $connection -ErrorAction Stop
Get-PnPProperty -ClientObject $web.CurrentUser -Property Id,LoginName,PrincipalType,IsSiteAdmin -Connection $connection -ErrorAction Stop|Out-Null
if([string]$web.Id -ne $ExpectedWebId -or ([string]$web.Url).TrimEnd('/') -cne $SiteUrl -or $web.CurrentUser.Id -ne $ExpectedOperatorId -or $web.CurrentUser.LoginName -cne $ExpectedOperatorLogin -or [string]$web.CurrentUser.PrincipalType -ne 'User'){throw 'Current connection web/operator identity mismatch; delegated user required.'}
if($ExpectedOperatorId -ne $WriterPrincipalId -and -not $web.CurrentUser.IsSiteAdmin){throw 'Controller readback access would be lost after creator-grant removal. Use the verified writer/controller or an existing site collection administrator/controller; never add membership or elevate.'}
function Get-PermissionNames($Role){
 Get-PnPProperty -ClientObject $Role -Property BasePermissions -Connection $connection -ErrorAction Stop|Out-Null
 @([enum]::GetNames([Microsoft.SharePoint.Client.PermissionKind])|Where-Object {$_ -notin @('EmptyMask','FullMask') -and $Role.BasePermissions.Has([Microsoft.SharePoint.Client.PermissionKind]::$_)}|Sort-Object)
}
function Get-EffectivePermissions([string]$Login){
 $pending=$web.GetUserEffectivePermissions($Login)
 Invoke-PnPQuery -Connection $connection -ErrorAction Stop|Out-Null
 if($null -eq $pending.Value){throw 'Effective permissions unavailable.'};return $pending.Value
}
function Assert-Principals([string]$ExpectedHash='') {
 $operatorPermissions=Get-EffectivePermissions $ExpectedOperatorLogin
 foreach($p in @('ManageLists','ManagePermissions')){if(-not $operatorPermissions.Has([Microsoft.SharePoint.Client.PermissionKind]::$p)){throw 'Current controller has no effective list/permission management authority.'}}
 $controller=Get-PnPGroup -Identity $ControllerGroupId -Connection $connection -ErrorAction Stop
 $requester=Get-PnPGroup -Identity $RequesterGroupId -Connection $connection -ErrorAction Stop
 foreach($pair in @(@{group=$controller;id=$ControllerGroupId},@{group=$requester;id=$RequesterGroupId})){
  $group=$pair.group
  if($null -eq $group){throw 'Selected group absent or unreadable.'}
  Get-PnPProperty -ClientObject $group -Property Id,PrincipalType,Owner,AllowMembersEditMembership,OnlyAllowMembersViewMembership,AllowRequestToJoinLeave -Connection $connection -ErrorAction Stop|Out-Null
  Get-PnPProperty -ClientObject $group.Owner -Property Id,PrincipalType -Connection $connection -ErrorAction Stop|Out-Null
  if($group.Id -ne $pair.id -or [string]$group.PrincipalType -ne 'SharePointGroup' -or $group.AllowMembersEditMembership -or $group.AllowRequestToJoinLeave -or -not $group.OnlyAllowMembersViewMembership){throw 'Unsafe group: explicit private controller-managed SharePoint groups required.'}
  if(-not (($group.Owner.Id -eq $ControllerGroupId -and [string]$group.Owner.PrincipalType -eq 'SharePointGroup') -or ($group.Owner.Id -eq $ExpectedOperatorId -and [string]$group.Owner.PrincipalType -eq 'User'))){throw 'Unsafe group owner; must be selected controller group or verified current controller.'}
 }
 $controllers=@(Get-PnPGroupMember -Group $ControllerGroupId -Connection $connection -ErrorAction Stop)
 $requesters=@(Get-PnPGroupMember -Group $RequesterGroupId -Connection $connection -ErrorAction Stop)
 if($controllers.Count -eq 0 -or $requesters.Count -eq 0){throw 'Both groups must have explicit reviewable members.'}
 foreach($member in @($controllers+$requesters)){
  Get-PnPProperty -ClientObject $member -Property Id,LoginName,PrincipalType,IsSiteAdmin -Connection $connection -ErrorAction Stop|Out-Null
  if([string]$member.PrincipalType -ne 'User' -or $member.Id -le 0){throw 'Nested/broad principals unsupported; effective membership cannot be inferred.'}
 }
 if($controllers.Id -notcontains $ExpectedOperatorId){throw 'Current operator is not a direct selected controller group member.'}
 $writer=Get-PnPUser -Identity $WriterPrincipalId -Connection $connection -ErrorAction Stop
 if($null -eq $writer){throw 'Existing writer principal unavailable.'}
 Get-PnPProperty -ClientObject $writer -Property Id,LoginName,PrincipalType -Connection $connection -ErrorAction Stop|Out-Null
 if($writer.Id -ne $WriterPrincipalId -or $writer.LoginName -cne $ExpectedWriterLogin -or [string]$writer.PrincipalType -ne 'User'){throw 'Existing writer identity mismatch; no identity creation is permitted.'}
 foreach($member in $requesters){
  if($controllers.Id -contains $member.Id -or $member.Id -eq $WriterPrincipalId -or $member.IsSiteAdmin){throw 'Controller/writer/requester overlap or site-admin requester forbidden.'}
  $permissions=Get-EffectivePermissions $member.LoginName
  foreach($p in @('ManagePermissions','ManageWeb','ManageLists','CreateGroups','ManageSubwebs','AddAndCustomizePages')){if($permissions.Has([Microsoft.SharePoint.Client.PermissionKind]::$p)){throw 'Requester has unsafe administrative web permissions.'}}
 }
 # Capture values, not live CSOM references: even otherwise-safe membership/owner
 # changes require a new controller review. Validation alone is not drift detection.
 $snapshot=@{
  controller=@{id=$controller.Id;ownerId=$controller.Owner.Id;ownerType=[string]$controller.Owner.PrincipalType;members=@($controllers|Sort-Object Id|ForEach-Object {@{id=$_.Id;login=$_.LoginName;type=[string]$_.PrincipalType;admin=[bool]$_.IsSiteAdmin}})}
  requester=@{id=$requester.Id;ownerId=$requester.Owner.Id;ownerType=[string]$requester.Owner.PrincipalType;members=@($requesters|Sort-Object Id|ForEach-Object {@{id=$_.Id;login=$_.LoginName;type=[string]$_.PrincipalType;admin=[bool]$_.IsSiteAdmin}})}
  writer=@{id=$writer.Id;login=$writer.LoginName;type=[string]$writer.PrincipalType}
 }
 $hash=Get-ObjectHash $snapshot
 if($ExpectedHash -and $hash -cne $ExpectedHash){throw 'Group/principal drift since preflight; stop and reconcile without changing membership.'}
 return @{Writer=$writer;Hash=$hash}
}
$principals=Assert-Principals
$writer=$principals.Writer
$urls=@{canonicalListId='Lists/AICoEMarketingCanonical';requestListId='Lists/AICoEMarketingRequests';resultListId='Lists/AICoEMarketingResults'}
# Successful full enumeration only. 403/404/network errors are never absence.
$existing=@(Get-PnPList -Includes Id,Title,RootFolder -Connection $connection -ErrorAction Stop)
$sitePath=([uri]$SiteUrl).AbsolutePath.TrimEnd('/')
foreach($list in $existing){
 Get-PnPProperty -ClientObject $list.RootFolder -Property ServerRelativeUrl -Connection $connection -ErrorAction Stop|Out-Null
 foreach($s in $descriptor.lists){if($list.Title -eq $s.suggestedTitle -or $list.RootFolder.ServerRelativeUrl.TrimEnd('/') -eq ($sitePath+'/'+$urls[$s.binding])){throw 'Existing Marketing target title or URL found; create-only refuses any repair, reuse or ACL reset.'}}
}
$roleSpecs=@(
 @{Name='AI CoE Marketing Request Submit';Permissions=@('AddListItems','Open','ViewPages','UseRemoteAPIs')},
 @{Name='AI CoE Marketing Canonical Writer';Permissions=@('ViewListItems','OpenItems','AddListItems','EditListItems','Open','ViewPages','UseRemoteAPIs')},
 @{Name='AI CoE Marketing Result Writer';Permissions=@('ViewListItems','OpenItems','AddListItems','ManagePermissions','Open','ViewPages','UseRemoteAPIs')}
)
$roles=@(Get-PnPRoleDefinition -Connection $connection -ErrorAction Stop)
$read=@($roles|Where-Object {$_.Id -eq 1073741826 -and [string]$_.RoleTypeKind -eq 'Reader'})
$full=@($roles|Where-Object {$_.Id -eq 1073741829 -and [string]$_.RoleTypeKind -eq 'Administrator'})
if($read.Count -ne 1 -or $full.Count -ne 1){throw 'Built-in Read/Full Control identity is ambiguous or absent.'}
$readAllowed=@('ViewListItems','OpenItems','ViewVersions','CreateAlerts','UseClientIntegration','UseRemoteAPIs','ViewFormPages','Open','ViewPages','BrowseUserInfo')
$readNames=@(Get-PermissionNames $read[0])
if(@($readNames|Where-Object {$_ -notin $readAllowed}).Count -gt 0 -or $readNames -notcontains 'ViewListItems' -or $readNames -notcontains 'OpenItems'){throw 'Built-in Read is unsafe or incomplete; do not silently repair it.'}
function Assert-CustomRole($Spec,$AllRoles,[bool]$Required){
 $found=@($AllRoles|Where-Object Name -eq $Spec.Name)
 if($found.Count -gt 1 -or ($Required -and $found.Count -ne 1)){throw 'Custom role identity ambiguous or missing.'}
 if($found.Count -eq 1 -and ((Get-PermissionNames $found[0]) -join ',') -cne (@($Spec.Permissions|Sort-Object) -join ',')){throw 'Existing custom role permission drift; no reconfiguration authorized.'}
}
function Assert-CurrentRoles {
 $nowRoles=@(Get-PnPRoleDefinition -Connection $connection -ErrorAction Stop)
 foreach($spec in $roleSpecs){
  Assert-CustomRole $spec $nowRoles $true
  $after=@($nowRoles|Where-Object Name -eq $spec.Name)
  if(-not $roleIds.ContainsKey($spec.Name) -or $after[0].Id -ne $roleIds[$spec.Name]){throw 'Custom role identity drift.'}
 }
 $nowRead=@($nowRoles|Where-Object {$_.Id -eq 1073741826 -and [string]$_.RoleTypeKind -eq 'Reader'})
 if($nowRead.Count -ne 1 -or ((Get-PermissionNames $nowRead[0]) -join ',') -cne ($readNames -join ',')){throw 'Read role permission drift.'}
}
foreach($spec in $roleSpecs){Assert-CustomRole $spec $roles $false}
$state=[ordered]@{kind='marketing-create-only';protocol='marketing.v1';siteUrl=$SiteUrl;webId=$ExpectedWebId;operatorId=$ExpectedOperatorId;controllerGroupId=$ControllerGroupId;requesterGroupId=$RequesterGroupId;writerPrincipalId=$WriterPrincipalId;listIds=@{};enabled=$false;qualified=$false;controllerQualified=$false;securityQualified=$false;retentionQualified=$false;qualificationReceiptRef='';schemaSha256='690903876bf650bacaf33436620cf99ef26386a8c44748e9b31cae4df3ad6b25';rollback='None. Freeze/unbind Marketing; reconcile exact created IDs under current controller authority. Never delete/reset an existing list.'}
$state.principalSnapshotHash=$principals.Hash
Write-PrivateReceipt ($ReceiptPath+'.prepared.json') $state @{status='prepared';qualified=$false;configHash=(Get-ObjectHash $state)}
$roleIds=@{}
foreach($spec in $roleSpecs){
 if(@($roles|Where-Object Name -eq $spec.Name).Count -eq 0){Add-PnPRoleDefinition -RoleName $spec.Name -Include $spec.Permissions -Description 'Bounded Marketing only. Do not broaden; see native commissioning gates.' -Connection $connection -ErrorAction Stop|Out-Null}
 $roles=@(Get-PnPRoleDefinition -Connection $connection -ErrorAction Stop)
 Assert-CustomRole $spec $roles $true
 $roleIds[$spec.Name]=[int](@($roles|Where-Object Name -eq $spec.Name)[0].Id)
}
$writerRoles=@{canonicalListId=$roleSpecs[1].Name;requestListId=$read[0].Name;resultListId=$roleSpecs[2].Name}
function Assert-List($Id,$Spec,[bool]$PublicRequests){
 $l=Get-PnPList -Identity $Id -Includes Id,Title,RootFolder,BaseTemplate,ReadSecurity,WriteSecurity,HasUniqueRoleAssignments,RoleAssignments,EnableAttachments,EnableVersioning,EnableFolderCreation,Hidden,NoCrawl,ItemCount -Connection $connection -ErrorAction Stop
 Get-PnPProperty -ClientObject $l.RootFolder -Property ServerRelativeUrl -Connection $connection -ErrorAction Stop|Out-Null
 if($l.RootFolder.ServerRelativeUrl -cne ($sitePath+'/'+$urls[$Spec.binding])){throw 'List URL readback failed.'}
 if([string]$l.Id -ne $Id -or $l.Title -cne $Spec.suggestedTitle -or $l.BaseTemplate -ne 100 -or $l.ReadSecurity -ne 1 -or $l.WriteSecurity -ne 1 -or -not $l.HasUniqueRoleAssignments -or $l.EnableAttachments -or $l.EnableVersioning -or $l.EnableFolderCreation -or -not $l.Hidden -or -not $l.NoCrawl){throw 'List configuration readback failed.'}
 if(((-not $PublicRequests) -or $Spec.binding -ne 'requestListId') -and $l.ItemCount -ne 0){throw 'New private list must read back empty; unexpected activity requires controller reconciliation.'}
 $fields=@(Get-PnPField -List $Id -Includes InternalName,TypeAsString,Required,Indexed,EnforceUniqueValues -Connection $connection -ErrorAction Stop)
 foreach($wanted in $Spec.fields){
  $f=@($fields|Where-Object InternalName -eq $wanted.name)
  if($f.Count -ne 1 -or $f[0].TypeAsString -cne $wanted.type -or -not $f[0].Required -or [bool]$f[0].Indexed -ne [bool]$wanted['indexed'] -or [bool]$f[0].EnforceUniqueValues -ne [bool]$wanted['unique']){throw 'Field schema readback failed.'}
  if($wanted.type -eq 'Note'){
   Get-PnPProperty -ClientObject $f[0] -Property RichText,AppendOnly -Connection $connection -ErrorAction Stop|Out-Null
   if($f[0].RichText -or $f[0].AppendOnly){throw 'Note fields must be plain non-append text.'}
  }
 }
 $expected=@{};$expected[$WriterPrincipalId]=@{type='User';role=@($roles|Where-Object Name -eq $writerRoles[$Spec.binding])[0].Id}
 if($PublicRequests -and $Spec.binding -eq 'requestListId'){$expected[$RequesterGroupId]=@{type='SharePointGroup';role=@($roles|Where-Object Name -eq $roleSpecs[0].Name)[0].Id}}
 $assignments=@($l.RoleAssignments);$seen=@{}
 if($assignments.Count -ne $expected.Count){throw 'List ACL readback contains unexpected assignments.'}
 foreach($a in $assignments){
  Get-PnPProperty -ClientObject $a -Property Member,RoleDefinitionBindings -Connection $connection -ErrorAction Stop|Out-Null
  Get-PnPProperty -ClientObject $a.Member -Property Id,PrincipalType -Connection $connection -ErrorAction Stop|Out-Null
  $id=[int]$a.Member.Id;$bindings=@($a.RoleDefinitionBindings)
  if(-not $expected.ContainsKey($id) -or $seen.ContainsKey($id) -or [string]$a.Member.PrincipalType -ne $expected[$id].type -or $bindings.Count -ne 1 -or $bindings[0].Id -ne $expected[$id].role){throw 'List ACL exact principal/role readback failed.'};$seen[$id]=$true
 }
}
foreach($s in $descriptor.lists){
 $new=New-PnPList -Title $s.suggestedTitle -Template GenericList -Url $urls[$s.binding] -Hidden -OnQuickLaunch:$false -EnableVersioning:$false -Connection $connection -ErrorAction Stop
 $id=if($null -ne $new){[string]$new.Id}else{''};$newGuid=[guid]::Empty
 if(-not [guid]::TryParseExact($id,'D',[ref]$newGuid) -or $newGuid -eq [guid]::Empty -or $state.listIds.Values -contains $id -or @($existing|Where-Object {[string]$_.Id -eq $id}).Count -gt 0){throw 'New list identity invalid/reused; stop and reconcile preparation receipt.'}
 $state.listIds[$s.binding]=$id
 Write-PrivateReceipt ($ReceiptPath+'.created-'+$s.binding+'.json') $state @{status='created-not-configured';listId=$id;qualified=$false}
 Set-PnPList -Identity $id -BreakRoleInheritance -CopyRoleAssignments:$false -ClearSubscopes:$false -EnableAttachments:$false -EnableVersioning:$false -EnableFolderCreation:$false -Hidden:$true -NoCrawl -ReadSecurity 1 -WriteSecurity 1 -Connection $connection -ErrorAction Stop|Out-Null
 foreach($f in $s.fields){
  if($f.name -eq 'Title'){Set-PnPField -List $id -Identity Title -Values @{Required=$true;Indexed=[bool]$f['indexed'];EnforceUniqueValues=[bool]$f['unique']} -Connection $connection -ErrorAction Stop|Out-Null;continue}
  $extra=if($f.type -eq 'Note'){' RichText="FALSE" AppendOnly="FALSE" NumLines="6"'}elseif($f.type -eq 'Number'){' Decimals="0" Min="1"'}else{''}
  $indexed=if($f['indexed']){'TRUE'}else{'FALSE'};$unique=if($f['unique']){'TRUE'}else{'FALSE'}
  $xml='<Field Type="'+$f.type+'" Name="'+$f.name+'" StaticName="'+$f.name+'" DisplayName="'+$f.name+'" Required="TRUE" Indexed="'+$indexed+'" EnforceUniqueValues="'+$unique+'"'+$extra+' />'
  Add-PnPFieldFromXml -List $id -FieldXml $xml -Connection $connection -ErrorAction Stop|Out-Null
 }
 # Writer only: do not leave the controller group/creator on service-only lists.
 Set-PnPListPermission -Identity $id -User $writer.LoginName -AddRole $writerRoles[$s.binding] -Connection $connection -ErrorAction Stop|Out-Null
 Set-PnPListPermission -Identity $id -User $ExpectedOperatorLogin -RemoveRole $full[0].Name -Connection $connection -ErrorAction Stop|Out-Null
 Assert-List $id $s $false
}
# Re-read the whole private set: earlier lists can drift while later ones are created.
# The ONLY participant grant occurs after this complete private schema/ACL readback.
foreach($s in $descriptor.lists){Assert-List $state.listIds[$s.binding] $s $false}
$currentPrincipals=Assert-Principals $principals.Hash
$writer=$currentPrincipals.Writer
Assert-CurrentRoles
$requestId=$state.listIds.requestListId
Set-PnPListPermission -Identity $requestId -Group $RequesterGroupId -AddRole $roleSpecs[0].Name -Connection $connection -ErrorAction Stop|Out-Null
foreach($s in $descriptor.lists){Assert-List $state.listIds[$s.binding] $s $true}
Assert-CurrentRoles
Assert-Principals $principals.Hash|Out-Null
$state.readbackVerified=$true
Write-PrivateReceipt ($ReceiptPath+'.applied.json') $state @{status='applied';readbackVerified=$true;qualified=$false;contentHash=(Get-ObjectHash $state)}
[pscustomobject]@{Mode='Applied';Enabled=$false;Qualified=$false;ListIds=$state.listIds;ReceiptPath=($ReceiptPath+'.applied.json');Note='Schema/ACL only. No business/persona, hosted flow, provider or retention qualification.'}
