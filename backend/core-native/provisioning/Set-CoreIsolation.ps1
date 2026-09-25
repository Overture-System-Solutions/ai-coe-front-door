#Requires -Modules PnP.PowerShell
[CmdletBinding(SupportsShouldProcess, ConfirmImpact='High')]
param(
 [Parameter(Mandatory)][string]$SiteUrl,
 [Parameter(Mandatory)][int]$ServicePrincipalId,
 [Parameter(Mandatory)][int]$RequestersGroupId,
 [Parameter(Mandatory)][string]$AuthorizationReference,
 [switch]$Apply
)
$ErrorActionPreference='Stop'
if (-not $Apply) { Write-Output 'Plan only: isolate all CORE lists/library; grant create-only ingress and service FullControl. No tenant call.'; return }
if ([string]::IsNullOrWhiteSpace($AuthorizationReference)) { throw 'Explicit tenant permission authorization required' }
# Use the already authorized caller connection; this script does not acquire credentials.
$ctx=Get-PnPContext
$web=$ctx.Web
$ctx.Load($web); $ctx.ExecuteQuery()
if ($web.Url.TrimEnd('/') -cne $SiteUrl.TrimEnd('/')) { throw 'Connected site mismatch' }
if ($ServicePrincipalId -eq $RequestersGroupId) { throw 'Service and requester principal must differ' }
$model=Get-Content (Join-Path $PSScriptRoot '../out/data-model.json') -Raw | ConvertFrom-Json
$roles=$web.RoleDefinitions; $ctx.Load($roles); $ctx.ExecuteQuery()
$createRole=$roles | Where-Object Name -CEQ 'CORE Immutable Request Create'
$allowed=[Microsoft.SharePoint.Client.BasePermissions]::new()
@('AddListItems','Open','ViewPages','UseRemoteAPIs','ViewFormPages') | ForEach-Object { $allowed.Set([Microsoft.SharePoint.Client.PermissionKind]::$_) }
if (-not $createRole) {
 $info=[Microsoft.SharePoint.Client.RoleDefinitionCreationInformation]::new()
 $info.Name='CORE Immutable Request Create'; $info.Description='Add requests only; no ViewListItems, EditListItems, DeleteListItems or ManageLists.'; $info.BasePermissions=$allowed
 $createRole=$roles.Add($info); $ctx.ExecuteQuery()
} else {
 $ctx.Load($createRole); $ctx.ExecuteQuery()
 if ($createRole.BasePermissions.High -ne $allowed.High -or $createRole.BasePermissions.Low -ne $allowed.Low) { throw 'Existing create-only role drift; do not silently accept broader permissions' }
}
$full=$roles | Where-Object RoleTypeKind -EQ Administrator
if (-not $full) { throw 'FullControl role unavailable' }
foreach ($property in $model.PSObject.Properties) {
 $name=$property.Value.title
 if (-not $PSCmdlet.ShouldProcess("$SiteUrl / $name", "Replace inherited/list grants with service-only access; reference $AuthorizationReference")) { continue }
 $list=$web.Lists.GetByTitle($name); $ctx.Load($list); $ctx.ExecuteQuery()
 $list.BreakRoleInheritance($false,$true); $ctx.ExecuteQuery()
 $grants=$list.RoleAssignments; $ctx.Load($grants); $ctx.ExecuteQuery()
 foreach ($grant in @($grants)) { $grant.DeleteObject() }
 $service=$web.SiteUsers.GetById($ServicePrincipalId)
 $binding=[Microsoft.SharePoint.Client.RoleDefinitionBindingCollection]::new($ctx); $binding.Add($full)
 $null=$list.RoleAssignments.Add($service,$binding)
 if ($property.Name -ceq 'Requests') {
  $group=$web.SiteGroups.GetById($RequestersGroupId)
  $add=[Microsoft.SharePoint.Client.RoleDefinitionBindingCollection]::new($ctx); $add.Add($createRole)
  $null=$list.RoleAssignments.Add($group,$add)
 }
 $list.ReadSecurity=1; $list.WriteSecurity=1; $list.Update(); $ctx.ExecuteQuery()
 $ctx.Load($list); $ctx.Load($list.RoleAssignments); $ctx.ExecuteQuery()
 if (-not $list.HasUniqueRoleAssignments -or $list.ReadSecurity -ne 1 -or $list.WriteSecurity -ne 1) { throw "Isolation readback failed: $name" }
 Write-Output "Isolated: $name; direct API two-account validation STILL REQUIRED"
}
# Does not set NativeQualified/SecurityQualified. Site collection administrators remain privileged by SharePoint design.
