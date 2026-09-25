<#
.SYNOPSIS
Create-only AI CoE User Drafts schema and bounded list ACL. Default is offline dry-run.
.DESCRIPTION
Never repairs or broadens an existing list. Every existing target is explicitly rejected.
Existing private controller and ordinary writer SharePoint groups must be selected by ID.
Only a new list and (if absent) one new custom role are changed. No group/site membership changes.
This is NOT retention commissioning or two-account qualification. No business rows are written.
#>
[CmdletBinding(PositionalBinding = $false)]
param([switch]$DryRun,[switch]$Apply,[switch]$ConfirmCreateDraftList,[switch]$ConfirmPrivateController,
  [string]$SiteUrl,[int]$ControllerGroupId,[int]$WriterGroupId,[string]$ReceiptPath)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'ProvisioningReceipt.ps1')
$schema=[ordered]@{Title='Text';WorkflowId='Text';DraftJson='Note';IsCleared='Boolean';RetentionPolicyRef='Text';AccessPolicyRef='Text';ExpiresAt='DateTime'}
$title='AI CoE User Drafts';$roleName='AI CoE Draft Writer'
if($Apply -and (-not $ConfirmCreateDraftList -or -not $ConfirmPrivateController)){throw 'Apply is not authorized without ConfirmCreateDraftList and ConfirmPrivateController.'}
if($Apply -and $DryRun){throw 'Apply and DryRun cannot be combined.'}
if(-not $Apply){Write-Output 'Dry-run only: create-only AI CoE User Drafts, indexed non-unique Title, own read/write; no connection or writes. Qualification remains false.';return}
if($ControllerGroupId -le 0 -or $WriterGroupId -le 0 -or $ControllerGroupId -eq $WriterGroupId){throw 'Select distinct existing controller and ordinary writer group IDs.'}
Assert-ReceiptPath $ReceiptPath
foreach($suffix in @('.prepared.json','.applied.json')){if(Test-Path -LiteralPath ($ReceiptPath+$suffix)){throw 'ReceiptPath already used; reconcile manually.'}}
$connection=Get-AuthorizedConnection $SiteUrl
# Enumeration errors propagate. An identity read returning 403 is NEVER treated as absence.
$existing=@(Get-PnPList -Includes Title,Id -Connection $connection -ErrorAction Stop|Where-Object Title -eq $title)
if($existing.Count -gt 0){throw 'An existing AI CoE User Drafts list was found: create-only provisioning rejects it without changing config, fields, ACLs or data. Commission separately.'}
$controller=Get-PnPGroup -Identity $ControllerGroupId -Connection $connection -ErrorAction Stop
$writer=Get-PnPGroup -Identity $WriterGroupId -Connection $connection -ErrorAction Stop
foreach($group in @($controller,$writer)){
  if($null -eq $group){throw 'Selected group is absent or unreadable.'}
  Get-PnPProperty -ClientObject $group -Property Id,AllowMembersEditMembership,OnlyAllowMembersViewMembership,AllowRequestToJoinLeave -Connection $connection -ErrorAction Stop|Out-Null
  if($group.AllowMembersEditMembership -or $group.AllowRequestToJoinLeave){throw 'Selected groups must have controller-managed membership.'}
}
if(-not $controller.OnlyAllowMembersViewMembership){throw 'Controller group membership is not private.'}
$controllers=@(Get-PnPGroupMember -Group $ControllerGroupId -Connection $connection -ErrorAction Stop)
$writers=@(Get-PnPGroupMember -Group $WriterGroupId -Connection $connection -ErrorAction Stop)
if($controllers.Count -eq 0 -or $writers.Count -eq 0){throw 'Both selected groups must have explicit members for review.'}
foreach($member in @($controllers+$writers)){
  Get-PnPProperty -ClientObject $member -Property Id,PrincipalType,IsSiteAdmin -Connection $connection -ErrorAction Stop|Out-Null
  if([string]$member.PrincipalType -ne 'User'){throw 'Nested/broad principals are not supported; effective membership requires separate qualification.'}
}
if(@($writers|Where-Object {$controllers.Id -contains $_.Id -or $_.IsSiteAdmin}).Count -gt 0){throw 'Writer/controller overlap or site-admin ordinary writer is forbidden.'}
$web=Get-PnPWeb -Includes CurrentUser -Connection $connection -ErrorAction Stop
if($controllers.Id -notcontains $web.CurrentUser.Id){throw 'Run with a delegated identity directly in the selected private controller group.'}
$roles=@(Get-PnPRoleDefinition -Connection $connection -ErrorAction Stop)
$read=@($roles|Where-Object { [string]$_.RoleTypeKind -eq 'Reader' })
$full=@($roles|Where-Object { [string]$_.RoleTypeKind -eq 'Administrator' })
if($read.Count -ne 1 -or $full.Count -ne 1){throw 'Read/Full Control role identity is ambiguous.'}
function Get-Permissions($Role){
  Get-PnPProperty -ClientObject $Role -Property BasePermissions -Connection $connection -ErrorAction Stop|Out-Null
  @([enum]::GetNames([Microsoft.SharePoint.Client.PermissionKind])|Where-Object {$_ -notin @('EmptyMask','FullMask') -and $Role.BasePermissions.Has([Microsoft.SharePoint.Client.PermissionKind]::$_)}|Sort-Object)
}
$readNames=@(Get-Permissions $read[0])
$forbidden=@('ManageLists','OverrideListBehaviors','DeleteListItems','ManagePermissions')
if(@($readNames|Where-Object {$_ -in $forbidden}).Count -gt 0){throw 'Built-in Read is unexpectedly privileged.'}
$expectedPermissions=@($readNames+@('AddListItems','EditListItems')|Sort-Object -Unique)
$custom=@($roles|Where-Object Name -eq $roleName)
if($custom.Count -gt 1){throw 'Ambiguous custom writer role.'}
if($custom.Count -eq 1 -and ((Get-Permissions $custom[0]) -join ',') -ne ($expectedPermissions -join ',')){throw 'Existing custom writer role has permission drift; no changes authorized.'}
$config=@{schema=$schema;readSecurity=2;writeSecurity=2;controllerGroupId=$ControllerGroupId;writerGroupId=$WriterGroupId;writerPermissions=$expectedPermissions;siteUrl=$SiteUrl}
$configHash=Get-ObjectHash $config
$state=@{kind='draft-list';siteUrl=$SiteUrl;title=$title;listId='';config=$config;configHash=$configHash;qualified=$false;qualificationReceiptRef='';retentionPolicyRef='';accessPolicyRef='';retentionDays=0;qualifiedUntil='';rollback='No destructive rollback. Keep list private/unbound; reconcile with controller. Never reset inheritance or delete rows/list.'}
Write-PrivateReceipt ($ReceiptPath+'.prepared.json') $state @{status='prepared';configHash=$configHash;contentHash=(Get-ObjectHash @{targetAbsent=$true});qualified=$false}
if($custom.Count -eq 0){
  Add-PnPRoleDefinition -RoleName $roleName -Clone $read[0].Name -Include AddListItems,EditListItems -Description 'Own-item drafts: Read plus add/edit, no deletion or permission management.' -Connection $connection -ErrorAction Stop|Out-Null
}
$custom=@(Get-PnPRoleDefinition -Connection $connection -ErrorAction Stop|Where-Object Name -eq $roleName)
if($custom.Count -ne 1 -or ((Get-Permissions $custom[0]) -join ',') -ne ($expectedPermissions -join ',')){throw 'Custom writer role readback failed.'}
$new=New-PnPList -Title $title -Template GenericList -Url 'Lists/AICoEUserDrafts' -OnQuickLaunch:$false -EnableVersioning:$false -Connection $connection -ErrorAction Stop
if($null -eq $new -or -not $new.Id){throw 'New list identity readback missing; reconcile prepared receipt.'}
$listId=[string]$new.Id;$state.listId=$listId
# Only the just-created list is eligible for any configuration/permission writes.
Set-PnPList -Identity $listId -BreakRoleInheritance -CopyRoleAssignments:$false -ClearSubScopes:$false -EnableAttachments:$false -EnableVersioning:$false -Connection $connection -ErrorAction Stop|Out-Null
Set-PnPListPermission -Identity $listId -Group $ControllerGroupId -AddRole $full[0].Name -Connection $connection -ErrorAction Stop|Out-Null
# Remove only the creator grant automatically made when inheritance is broken; never change site ACLs.
Set-PnPListPermission -Identity $listId -User $web.CurrentUser.LoginName -RemoveRole $full[0].Name -Connection $connection -ErrorAction Stop|Out-Null
Set-PnPField -List $listId -Identity Title -Values @{Indexed=$true;EnforceUniqueValues=$false} -Connection $connection -ErrorAction Stop|Out-Null
foreach($name in $schema.Keys){
  if($name -eq 'Title'){continue}
  $extra=if($name -eq 'DraftJson'){' RichText="FALSE" AppendOnly="FALSE" NumLines="6"'}elseif($name -eq 'ExpiresAt'){' Format="DateTime"'}else{''}
  $xml='<Field Type="'+$schema[$name]+'" Name="'+$name+'" StaticName="'+$name+'" DisplayName="'+$name+'" Required="FALSE" EnforceUniqueValues="FALSE"'+$extra+' />'
  Add-PnPFieldFromXml -List $listId -FieldXml $xml -Connection $connection -ErrorAction Stop|Out-Null
}
Set-PnPList -Identity $listId -ReadSecurity 2 -WriteSecurity 2 -EnableAttachments:$false -EnableVersioning:$false -Connection $connection -ErrorAction Stop|Out-Null
# Grant ordinary writers only after schema and item isolation exist.
Set-PnPListPermission -Identity $listId -Group $WriterGroupId -AddRole $roleName -Connection $connection -ErrorAction Stop|Out-Null
$l=Get-PnPList -Identity $listId -Includes Id,Title,BaseTemplate,ReadSecurity,WriteSecurity,HasUniqueRoleAssignments,RoleAssignments,EnableAttachments,EnableVersioning -Connection $connection -ErrorAction Stop
if([string]$l.Id -ne $listId -or $l.Title -ne $title -or $l.BaseTemplate -ne 100 -or $l.ReadSecurity -ne 2 -or $l.WriteSecurity -ne 2 -or -not $l.HasUniqueRoleAssignments -or $l.EnableAttachments -or $l.EnableVersioning){throw 'List configuration readback failed.'}
$fields=@(Get-PnPField -List $listId -Includes InternalName,TypeAsString,Indexed,EnforceUniqueValues -Connection $connection -ErrorAction Stop)
if(@($fields|Where-Object EnforceUniqueValues).Count -ne 0){throw 'Own-item list readback includes a unique column.'}
$fieldState=@()
foreach($name in $schema.Keys){
  $f=@($fields|Where-Object InternalName -eq $name)
  if($f.Count -ne 1 -or $f[0].TypeAsString -ne $schema[$name]){throw 'Draft schema readback failed.'}
  if($name -eq 'Title' -and -not $f[0].Indexed){throw 'Title index readback failed.'}
  if($name -eq 'DraftJson'){
    Get-PnPProperty -ClientObject $f[0] -Property RichText,AppendOnly -Connection $connection -ErrorAction Stop|Out-Null
    if($f[0].RichText -or $f[0].AppendOnly){throw 'DraftJson must be plain text, no append.'}
  }
  $fieldState+=@{name=$name;type=$f[0].TypeAsString;indexed=[bool]$f[0].Indexed;unique=[bool]$f[0].EnforceUniqueValues}
}
$assignments=@($l.RoleAssignments)
if($assignments.Count -ne 2){throw 'List ACL readback contains unexpected principals.'}
foreach($assignment in $assignments){
  Get-PnPProperty -ClientObject $assignment -Property Member,RoleDefinitionBindings -Connection $connection -ErrorAction Stop|Out-Null
  $member=$assignment.Member;$bindings=@($assignment.RoleDefinitionBindings)
  if([string]$member.PrincipalType -ne 'SharePointGroup' -or $bindings.Count -ne 1){throw 'Unexpected list ACL principal or role.'}
  $expectedId=if($member.Id -eq $ControllerGroupId){$full[0].Id}elseif($member.Id -eq $WriterGroupId){$custom[0].Id}else{throw 'Unexpected list ACL principal.'}
  if($bindings[0].Id -ne $expectedId){throw 'List ACL role readback failed.'}
}
$state.readback=@{fields=$fieldState;readSecurity=$l.ReadSecurity;writeSecurity=$l.WriteSecurity;controllerGroupId=$ControllerGroupId;writerGroupId=$WriterGroupId;writerPermissions=@(Get-Permissions $custom[0])}
$contentHash=Get-ObjectHash $state.readback
Write-PrivateReceipt ($ReceiptPath+'.applied.json') $state @{status='applied';readbackVerified=$true;listId=$listId;configHash=$configHash;contentHash=$contentHash;qualified=$false}
Write-Output 'Schema and ACL readback confirmed. Qualification remains false. Two-account access and retention acceptance are external gates; do not enable host drafts yet.'
