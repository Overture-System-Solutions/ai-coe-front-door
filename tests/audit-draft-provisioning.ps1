param([string]$ScriptPath=(Join-Path $PSScriptRoot '../sharepoint/pages/one-page/New-FrontDoorDraftList.ps1'))
$ErrorActionPreference='Stop'
# Minimal native enum seam only; all PnP commands below are process-local fakes.
Add-Type 'namespace Microsoft.SharePoint.Client { public enum PermissionKind { EmptyMask, ViewListItems, Open, AddListItems, EditListItems, DeleteListItems, ManageLists, OverrideListBehaviors, ManagePermissions, FullMask } }'
if(-not (Test-Path $ScriptPath)){throw 'Missing create-only server draft provisioning implementation'}
$global:DraftRoot=Join-Path $PSScriptRoot ('../evidence/installer-audit/draft-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $global:DraftRoot|Out-Null
$global:DraftReceipt=Join-Path $global:DraftRoot 'create'
$global:D=[pscustomobject]@{Lists=@();Fields=@();Roles=@();Writes=@();Reads=0;Denied=$false;BadReadback=$false;Assignments=@();Overlap=$false}
function Assert($condition,$message){if(-not $condition){throw $message}}
function Assert-Refused([scriptblock]$action,[string]$pattern){try{& $action|Out-Null}catch{if($_.Exception.Message -notmatch $pattern){throw};return};throw 'Expected refusal'}
function Get-PnPConnection {$global:D.Reads++;[pscustomobject]@{Url='https://example.invalid/sites/test'}}
function Get-PnPList {param($Identity,$Includes,$Connection,$ErrorAction) if($global:D.Denied){throw '403 denied'};if($Identity){$global:D.Lists|Where-Object Id -eq $Identity}else{$global:D.Lists}}
function Get-PnPGroup {param($Identity,$Connection,$ErrorAction) [pscustomobject]@{Id=$Identity;AllowMembersEditMembership=$false;OnlyAllowMembersViewMembership=$true;AllowRequestToJoinLeave=$false}}
function Get-PnPGroupMember {param($Group,$Connection,$ErrorAction) $id=if($Group -eq 10 -or $global:D.Overlap){100}else{200};[pscustomobject]@{Id=$id;LoginName=('user'+$id);PrincipalType='User';IsSiteAdmin=$false}}
function Get-PnPWeb {param($Includes,$Connection,$ErrorAction) [pscustomobject]@{CurrentUser=[pscustomobject]@{Id=100;LoginName='user100'}}}
function Get-PnPProperty {param($ClientObject,[string[]]$Property,$Connection,$ErrorAction) if($Property.Count -eq 1){$ClientObject.($Property[0])}}
function Perm($names) {$p=[pscustomobject]@{Names=$names};$p|Add-Member ScriptMethod Has {param($name) $this.Names -contains [string]$name};return $p}
$global:D.Roles=@([pscustomobject]@{Id=1;Name='Read';RoleTypeKind='Reader';BasePermissions=(Perm @('ViewListItems','Open'))},[pscustomobject]@{Id=2;Name='Full Control';RoleTypeKind='Administrator';BasePermissions=(Perm @('ManageLists','OverrideListBehaviors'))})
function Get-PnPRoleDefinition {param($Identity,$Connection,$ErrorAction) if($Identity){$global:D.Roles|Where-Object Name -eq $Identity}else{$global:D.Roles}}
function Write-Op($name){Assert (Test-Path ($global:DraftReceipt+'.prepared.json')) 'No prepared receipt before draft mutation';$global:D.Writes+=$name}
function Add-PnPRoleDefinition {param($RoleName,$Clone,$Include,$Description,$Connection,$ErrorAction) Write-Op 'role';$base=@($global:D.Roles|Where-Object Name -eq $Clone)[0];$global:D.Roles+=[pscustomobject]@{Id=3;Name=$RoleName;RoleTypeKind='None';BasePermissions=(Perm @($base.BasePermissions.Names+$Include))}}
function New-PnPList {param($Title,$Template,$Url,[switch]$OnQuickLaunch,[switch]$EnableVersioning,$Connection,$ErrorAction) Write-Op 'list';$list=[pscustomobject]@{Id='11111111-2222-4333-8444-555555555555';Title=$Title;BaseTemplate=100;ReadSecurity=1;WriteSecurity=1;HasUniqueRoleAssignments=$false;RoleAssignments=@();EnableVersioning=$false;EnableAttachments=$true};$global:D.Lists=@($list);$global:D.Fields=@([pscustomobject]@{InternalName='Title';TypeAsString='Text';Indexed=$false;EnforceUniqueValues=$false;RichText=$false;AppendOnly=$false});$list}
function Set-PnPList {param($Identity,[switch]$BreakRoleInheritance,[switch]$CopyRoleAssignments,[switch]$ClearSubScopes,$ReadSecurity,$WriteSecurity,$EnableAttachments,$EnableVersioning,$Connection,$ErrorAction) Write-Op 'list-settings';$l=$global:D.Lists[0];if($BreakRoleInheritance){Assert (-not $CopyRoleAssignments) 'Copied broad permissions';$l.HasUniqueRoleAssignments=$true;$l.RoleAssignments=@([pscustomobject]@{Member=[pscustomobject]@{Id=100;LoginName='user100';PrincipalType='User'};RoleDefinitionBindings=@($global:D.Roles[1])})};if($ReadSecurity){$l.ReadSecurity=$ReadSecurity;$l.WriteSecurity=$WriteSecurity};$l.EnableAttachments=$false;$l.EnableVersioning=$false}
function Set-PnPListPermission {param($Identity,$Group,$User,$AddRole,$RemoveRole,$Connection,$ErrorAction) Write-Op 'permission';$l=$global:D.Lists[0];if($Group){$role=@($global:D.Roles|Where-Object Name -eq $AddRole)[0];$l.RoleAssignments+=[pscustomobject]@{Member=[pscustomobject]@{Id=$Group;LoginName='';PrincipalType='SharePointGroup'};RoleDefinitionBindings=@($role)}}else{$l.RoleAssignments=@($l.RoleAssignments|Where-Object {$_.Member.LoginName -ne $User})}}
function Set-PnPField {param($List,$Identity,$Values,$Connection,$ErrorAction) Write-Op 'field-settings';$f=@($global:D.Fields|Where-Object InternalName -eq $Identity)[0];foreach($key in $Values.Keys){$f.$key=$Values[$key]}}
function Add-PnPFieldFromXml {param($List,$FieldXml,$Connection,$ErrorAction) Write-Op 'field';$x=([xml]$FieldXml).Field;$global:D.Fields+=[pscustomobject]@{InternalName=[string]$x.Name;TypeAsString=[string]$x.Type;Indexed=$false;EnforceUniqueValues=$false;RichText=$false;AppendOnly=$false}}
function Get-PnPField {param($List,$Includes,$Connection,$ErrorAction) if($global:D.BadReadback){@($global:D.Fields|Where-Object InternalName -ne 'ExpiresAt')}else{$global:D.Fields}}
$checks=0
& $ScriptPath |Out-Null;Assert ($global:D.Reads -eq 0 -and $global:D.Writes.Count -eq 0) 'Default must not connect';$checks++
$argsMap=@{Apply=$true;ConfirmCreateDraftList=$true;ConfirmPrivateController=$true;SiteUrl='https://example.invalid/sites/test';ControllerGroupId=10;WriterGroupId=20;ReceiptPath=$global:DraftReceipt}
& $ScriptPath @argsMap|Out-Null
$l=$global:D.Lists[0]
Assert ($l.ReadSecurity -eq 2 -and $l.WriteSecurity -eq 2 -and $l.HasUniqueRoleAssignments) 'Own-item security missing'
Assert ($global:D.Fields.Count -eq 7 -and @($global:D.Fields|Where-Object EnforceUniqueValues).Count -eq 0 -and $global:D.Fields[0].Indexed) 'Schema mismatch or unique field'
Assert (@($l.RoleAssignments).Count -eq 2) 'Unexpected ACL principal'
$role=@($global:D.Roles|Where-Object Name -eq 'AI CoE Draft Writer')[0]
Assert ($role.BasePermissions.Has('AddListItems') -and $role.BasePermissions.Has('EditListItems') -and -not $role.BasePermissions.Has('DeleteListItems') -and -not $role.BasePermissions.Has('ManageLists') -and -not $role.BasePermissions.Has('OverrideListBehaviors')) 'Unsafe writer role'
$r=Get-Content ($global:DraftReceipt+'.applied.json') -Raw|ConvertFrom-Json
Assert ($r.readbackVerified -and -not $r.qualified) 'Schema provisioning claimed live qualification';$checks++
$count=$global:D.Writes.Count;$global:DraftReceipt=Join-Path $global:DraftRoot 'existing';$argsMap.ReceiptPath=$global:DraftReceipt
Assert-Refused {& $ScriptPath @argsMap} 'existing';Assert ($global:D.Writes.Count -eq $count) 'Existing list modified';$checks++
$global:D.Lists=@();$global:D.Denied=$true
Assert-Refused {& $ScriptPath @argsMap} '403';Assert ($global:D.Writes.Count -eq $count) '403 treated as absence';$checks++
$global:D.Denied=$false;$global:D.Overlap=$true
Assert-Refused {& $ScriptPath @argsMap} 'overlap';Assert ($global:D.Writes.Count -eq $count) 'Overlapping identities accepted';$checks++
$global:D.Overlap=$false;$argsMap.SiteUrl='https://other.invalid'
Assert-Refused {& $ScriptPath @argsMap} 'connection';$checks++
$argsMap.SiteUrl='https://example.invalid/sites/test'
$unsafeRole=@($global:D.Roles|Where-Object Name -eq 'AI CoE Draft Writer')[0]
$unsafeRole.BasePermissions.Names+=@('ManageLists')
Assert-Refused {& $ScriptPath @argsMap} 'permission drift'
Assert ($global:D.Writes.Count -eq $count) 'Existing role drift was silently broadened';$checks++
$unsafeRole.BasePermissions.Names=@($unsafeRole.BasePermissions.Names|Where-Object {$_ -ne 'ManageLists'})
$argsMap.ConfirmCreateDraftList=$false
Assert-Refused {& $ScriptPath @argsMap} 'authorized';$checks++
$argsMap.ConfirmCreateDraftList=$true;$global:D.BadReadback=$true
Assert-Refused {& $ScriptPath @argsMap} 'schema|readback'
Assert (-not (Test-Path ($global:DraftReceipt+'.applied.json'))) 'Readback failure marked applied';$checks++
[pscustomobject]@{status='PASS';checks=$checks;scope='Offline fake PnP only';receiptDirectory=$global:DraftRoot;qualified=$false}|ConvertTo-Json -Compress
