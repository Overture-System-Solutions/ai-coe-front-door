# PROCESS-LOCAL FAKE PnP. Never import PnP.PowerShell here.
Add-Type 'namespace Microsoft.SharePoint.Client { public enum PermissionKind { EmptyMask, ViewListItems, AddListItems, EditListItems, DeleteListItems, ApproveItems, OpenItems, ViewVersions, DeleteVersions, CancelCheckout, ManagePersonalViews, ManageLists, ViewFormPages, AnonymousSearchAccessList, Open, ViewPages, AddAndCustomizePages, ApplyThemeAndBorder, ApplyStyleSheets, ViewUsageData, CreateSSCSite, ManageSubwebs, CreateGroups, ManagePermissions, BrowseDirectories, BrowseUserInfo, AddDelPrivateWebParts, UpdatePersonalWebParts, ManageWeb, AnonymousSearchAccessWebLists, UseClientIntegration, UseRemoteAPIs, ManageAlerts, CreateAlerts, EditMyUserInfo, EnumeratePermissions, FullMask } }'
# Offline substitute for the locally installed context-settings extension only.
Add-Type 'namespace Microsoft.SharePoint.Client { public static class InternalClientContextExtensions { public static object GetContextSettings(object context) { return context; } } }'
function Perm([string[]]$Names){$p=[pscustomobject]@{Names=$Names};$p|Add-Member ScriptMethod Has {param($p) $this.Names -contains [string]$p};return $p}
function Actor([int]$Id,[string]$Login){[pscustomobject]@{Id=$Id;LoginName=$Login;PrincipalType='User';IsSiteAdmin=($Id -eq 100 -and $global:F.OperatorAdmin);Email=($Login -replace '^.*\|','')}}
function Reset-Fake {
 $global:F=[pscustomobject]@{Reads=0;Writes=@();Lists=@();Fields=@{};Roles=@();Denied='';BadReadback='';Overlap=$false;Nested=$false;AdminRequester=$false;UnsafeGroup=$false;UnsafeOwner=$false;WrongWriter=$false;WrongOperator=$false;OperatorAdmin=$true;Authority=$true;SiteUrl='https://example.invalid/sites/marketing';RequestAdmin=$false;Receipt='';Created=0;LateOverlap=$false;LateRoleDrift=$false;Preflight=0}
 $global:F.Roles=@([pscustomobject]@{Id=1073741826;Name='Read';RoleTypeKind='Reader';BasePermissions=(Perm @('ViewListItems','OpenItems','ViewVersions','Open','ViewPages','UseRemoteAPIs','ViewFormPages','BrowseUserInfo','CreateAlerts','UseClientIntegration'))},[pscustomobject]@{Id=1073741829;Name='Full Control';RoleTypeKind='Administrator';BasePermissions=(Perm @('ManageLists','ManagePermissions','ManageWeb'))})
}
function Read-Op([string]$Name,$Connection){$global:F.Reads++;if($Name -eq $global:F.Denied){throw "403 denied: $Name"};if($Name -ne 'connection'){Assert ($Connection.Url -eq $global:F.SiteUrl) 'An operation dropped its explicit connection'}}
function Write-Op([string]$Name,$Connection){Read-Op $Name $Connection;Assert (Test-Path ($global:F.Receipt+'.prepared.json')) 'Write occurred before durable protected preparation';$global:F.Writes+=$Name}
function Get-PnPConnection {Read-Op 'connection' $null;[pscustomobject]@{Url=$global:F.SiteUrl;Context=[pscustomobject]@{Type='AzureADInteractive'}}}
function Get-PnPWeb {param($Includes,$Connection,$ErrorAction)
 Read-Op 'web' $Connection
 $id=if($global:F.WrongOperator){999}else{100}
 $web=[pscustomobject]@{Url=$global:F.SiteUrl;Id='aaaaaaaa-0000-4000-8000-000000000001';CurrentUser=(Actor $id 'i:0#.f|membership|controller@example.invalid')}
 $web|Add-Member ScriptMethod GetUserEffectivePermissions {param($login)
  $names=if($login -like '*controller*' -and $global:F.Authority){@('ManageLists','ManagePermissions','ManageWeb')}elseif($login -like '*requester*' -and $global:F.RequestAdmin){@('ManagePermissions')}else{@('Open','ViewPages')}
  [pscustomobject]@{Value=(Perm $names)}
 };$web
}
function Invoke-PnPQuery {param($Connection,$ErrorAction) Read-Op 'effective-permissions' $Connection}
function Get-PnPUser {param($Identity,$Connection,$ErrorAction)
 Read-Op 'user' $Connection
 if($Identity -ne 300){throw 'Unexpected writer ID'}
 $id=if($global:F.WrongWriter){301}else{300};Actor $id 'i:0#.f|membership|writer@example.invalid'
}
function Get-PnPGroup {param($Identity,$Connection,$ErrorAction)
 Read-Op 'group' $Connection
 [pscustomobject]@{Id=$Identity;PrincipalType='SharePointGroup';AllowMembersEditMembership=$global:F.UnsafeGroup;OnlyAllowMembersViewMembership=$true;AllowRequestToJoinLeave=$false;Owner=[pscustomobject]@{Id=$(if($global:F.UnsafeOwner){20}else{10});PrincipalType='SharePointGroup'}}
}
function Get-PnPGroupMember {param($Group,$Connection,$ErrorAction)
 Read-Op 'membership' $Connection;$global:F.Preflight++
 if($Group -eq 10){Actor 100 'i:0#.f|membership|controller@example.invalid'}else{
  $a=Actor 200 'i:0#.f|membership|requester@example.invalid'
  if($global:F.Overlap -or ($global:F.LateOverlap -and $global:F.Created -gt 0)){$a.Id=100}
  if($global:F.Nested){$a.PrincipalType='SecurityGroup'}
  if($global:F.AdminRequester){$a.IsSiteAdmin=$true};$a
 }
}
function Get-PnPProperty {param($ClientObject,$Property,$Connection,$ErrorAction) Read-Op 'property' $Connection}
function Get-PnPList {param($Identity,$Includes,$Connection,$ErrorAction)
 Read-Op 'lists' $Connection
 if($Identity){$l=@($global:F.Lists|Where-Object {[string]$_.Id -eq [string]$Identity})[0]
  if($global:F.BadReadback -eq 'acl'){$l.RoleAssignments+=@([pscustomobject]@{Member=(Actor 987 'rogue@example.invalid');RoleDefinitionBindings=@($global:F.Roles[0])})}
  if($global:F.BadReadback -eq 'settings'){$l.ReadSecurity=2}
  if($global:F.LateRoleDrift -and $global:F.Created -gt 0){$target=@($global:F.Roles|Where-Object Name -eq 'AI CoE Marketing Request Submit')[0];$target.BasePermissions.Names+=@('ViewListItems')}
 if($global:F.BadReadback -eq 'rows'){$l.ItemCount=1};$l
 }else{$global:F.Lists}
}
function Get-PnPRoleDefinition {param($Connection,$ErrorAction) Read-Op 'roles' $Connection;$global:F.Roles}
function Add-PnPRoleDefinition {param($RoleName,$Include,$Description,$Connection,$ErrorAction)
 Write-Op 'role' $Connection
 $global:F.Roles+=[pscustomobject]@{Id=(2000000000+$global:F.Roles.Count);Name=$RoleName;RoleTypeKind='None';BasePermissions=(Perm $Include)}
}
function New-PnPList {param($Title,$Template,$Url,[switch]$Hidden,[switch]$OnQuickLaunch,[switch]$EnableVersioning,$Connection,$ErrorAction)
 Write-Op 'list' $Connection;$global:F.Created++
 Assert ($Hidden -and -not $OnQuickLaunch -and -not $EnableVersioning) 'Unsafe creation settings'
 $id='11111111-0000-4000-8000-'+$global:F.Created.ToString('000000000000')
 $l=[pscustomobject]@{Id=$id;Title=$Title;BaseTemplate=100;RootFolder=[pscustomobject]@{ServerRelativeUrl='/sites/marketing/'+$Url};ReadSecurity=1;WriteSecurity=1;HasUniqueRoleAssignments=$false;RoleAssignments=@();EnableAttachments=$true;EnableVersioning=$false;EnableFolderCreation=$true;Hidden=$true;NoCrawl=$false;ItemCount=0}
 $global:F.Lists+=@($l);$global:F.Fields[$id]=@([pscustomobject]@{InternalName='Title';TypeAsString='Text';Required=$false;Indexed=$false;EnforceUniqueValues=$false;RichText=$false;AppendOnly=$false})
 $l
}
function Set-PnPList {param($Identity,[switch]$BreakRoleInheritance,[switch]$CopyRoleAssignments,[switch]$ClearSubscopes,$ReadSecurity,$WriteSecurity,$EnableAttachments,$EnableVersioning,$EnableFolderCreation,$Hidden,[switch]$NoCrawl,$Connection,$ErrorAction)
 Write-Op 'list-settings' $Connection;$l=@($global:F.Lists|Where-Object Id -eq $Identity)[0]
 if($BreakRoleInheritance){Assert (-not $CopyRoleAssignments -and -not $ClearSubscopes) 'Broad inheritance change';$l.HasUniqueRoleAssignments=$true;$l.RoleAssignments=@([pscustomobject]@{Member=(Actor 100 'i:0#.f|membership|controller@example.invalid');RoleDefinitionBindings=@($global:F.Roles[1])})}
 foreach($key in @('ReadSecurity','WriteSecurity','EnableAttachments','EnableVersioning','EnableFolderCreation','Hidden')){if($PSBoundParameters.ContainsKey($key)){$l.$key=$PSBoundParameters[$key]}}
 if($NoCrawl){$l.NoCrawl=$true}
}
function Set-PnPListPermission {param($Identity,$Group,$User,$AddRole,$RemoveRole,$Connection,$ErrorAction)
 Write-Op 'permission' $Connection;$l=@($global:F.Lists|Where-Object Id -eq $Identity)[0]
 $member=if($Group){[pscustomobject]@{Id=[int]$Group;PrincipalType='SharePointGroup';LoginName=''}}elseif($User -like '*writer*'){Actor 300 $User}else{Actor 100 $User}
 $a=@($l.RoleAssignments|Where-Object {$_.Member.Id -eq $member.Id})
 if($AddRole){$r=@($global:F.Roles|Where-Object Name -eq $AddRole)[0];if($a.Count){$a[0].RoleDefinitionBindings+=@($r)}else{$l.RoleAssignments+=@([pscustomobject]@{Member=$member;RoleDefinitionBindings=@($r)})}}
 if($RemoveRole -and $a.Count){$a[0].RoleDefinitionBindings=@($a[0].RoleDefinitionBindings|Where-Object Name -ne $RemoveRole);$l.RoleAssignments=@($l.RoleAssignments|Where-Object {$_.RoleDefinitionBindings.Count -gt 0})}
}
function Set-PnPField {param($List,$Identity,$Values,$Connection,$ErrorAction)
 Write-Op 'field-settings' $Connection;$f=@($global:F.Fields[$List]|Where-Object InternalName -eq $Identity)[0];foreach($k in $Values.Keys){$f.$k=$Values[$k]}
}
function Add-PnPFieldFromXml {param($List,$FieldXml,$Connection,$ErrorAction)
 Write-Op 'field' $Connection;$x=([xml]$FieldXml).Field
 $global:F.Fields[$List]+=[pscustomobject]@{InternalName=[string]$x.Name;TypeAsString=[string]$x.Type;Required=($x.GetAttribute('Required') -eq 'TRUE');Indexed=($x.GetAttribute('Indexed') -eq 'TRUE');EnforceUniqueValues=($x.GetAttribute('EnforceUniqueValues') -eq 'TRUE');RichText=$false;AppendOnly=$false}
}
function Get-PnPField {param($List,$Includes,$Connection,$ErrorAction)
 Read-Op 'fields' $Connection
 if($global:F.BadReadback -eq 'field'){$global:F.Fields[$List]|Where-Object InternalName -ne 'RecordJson'}else{$global:F.Fields[$List]}
}
function Connect-PnPOnline {throw 'NEVER authenticate in tests or provisioning'}
function Ensure-PnPUser {throw 'NEVER create an identity'}
function Add-PnPGroupMember {throw 'NEVER change membership'}
function Add-PnPListItem {throw 'NEVER write business data'}
function Remove-PnPList {throw 'NEVER destructively roll back'}
