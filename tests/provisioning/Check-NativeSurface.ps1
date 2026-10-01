# Local API-surface check ONLY: imports installed PnP binaries, never obtains a connection or calls PnP APIs.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Import-Module PnP.PowerShell -RequiredVersion 3.1.0
$contextType=[Microsoft.SharePoint.Client.InternalClientContextExtensions]
$contextMethod=$contextType.GetMethod('GetContextSettings')
if(-not $contextType.IsPublic -or $null -eq $contextMethod -or -not $contextMethod.IsPublic -or -not $contextMethod.IsStatic -or $contextMethod.GetParameters().Count -ne 1 -or $contextMethod.GetParameters()[0].ParameterType.FullName -ne 'Microsoft.SharePoint.Client.ClientRuntimeContext'){throw 'Installed PnP context classification surface changed'}
foreach($name in @('AzureADInteractive','DeviceLogin')){if($name -notin [enum]::GetNames([PnP.Framework.Utilities.Context.ClientContextType])){throw 'Delegated context classification unavailable'}}
$checked=0;$scripts=0
foreach($file in Get-ChildItem -LiteralPath (Join-Path $root 'backend/marketing-native/provisioning') -Filter '*.ps1'){
 $tokens=$null;$errors=$null
 $ast=[Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)
 if($errors.Count){throw "PowerShell syntax errors in $($file.Name)"};$scripts++
 foreach($cmd in $ast.FindAll({param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -like '*-PnP*'},$true)){
  $name=$cmd.GetCommandName();$definition=Get-Command $name -Module PnP.PowerShell -ErrorAction Stop
  foreach($parameter in $cmd.CommandElements|Where-Object {$_ -is [Management.Automation.Language.CommandParameterAst]}){
   if(-not $definition.Parameters.ContainsKey($parameter.ParameterName)){throw "Unsupported installed PnP parameter: $name -$($parameter.ParameterName)"}
  };$checked++
 }
}
if($checked -lt 10 -or $scripts -lt 4){throw 'Unexpectedly incomplete native API surface coverage'}
[pscustomobject]@{status='PASS';scope='Local syntax and installed command metadata ONLY';scripts=$scripts;commandSites=$checked;contextClassificationSurfaceVerified=$true;powershell=$PSVersionTable.PSVersion.ToString();pnp=(Get-Module PnP.PowerShell).Version.ToString();nativeCalls=0;qualified=$false}|ConvertTo-Json -Compress
