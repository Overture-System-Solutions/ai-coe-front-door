<#
.SYNOPSIS
Additive one-page Front Door: one view:app instance on an explicitly selected Site Pages file.

.DESCRIPTION
Local dry-run and binding checks only. This script never replaces QuickLaunch and has no -Overwrite.
-ApplyToSite is refused from this local work; site application needs separate authorization and PnP.

.PARAMETER DryRun
Resolve the definition and print what would be placed. Does not connect.

.PARAMETER CheckBindings
Print each parameter as BOUND or AWAITING. Does not connect.

.PARAMETER ApplyToSite
Refused. Present so a later authorized run can be distinguished from this local dry-run.

.PARAMETER ParameterFile
JSON map of parameter names to values. Defaults to parameters.sample.json beside this script.

.PARAMETER DefinitionFile
app-page.json beside this script by default.

.PARAMETER SiteUrl
Ignored on DryRun/CheckBindings. Required only for a future authorized apply, which this script refuses.
#>
[CmdletBinding(PositionalBinding = $false)]
param(
  [switch]$DryRun,
  [switch]$CheckBindings,
  [switch]$ApplyToSite,
  [string]$ParameterFile = (Join-Path $PSScriptRoot 'parameters.sample.json'),
  [string]$DefinitionFile = (Join-Path $PSScriptRoot 'app-page.json'),
  [string]$SiteUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($ApplyToSite) {
  throw 'ApplyToSite is not authorized from this local worktree. Use -DryRun and -CheckBindings. Site application needs a separate authorization.'
}

if (-not $DryRun -and -not $CheckBindings) {
  throw 'Nothing to do. Pass -DryRun and/or -CheckBindings. This script does not connect to a site.'
}

if (-not (Test-Path -LiteralPath $DefinitionFile)) {
  throw "Definition file not found: $DefinitionFile"
}
if (-not (Test-Path -LiteralPath $ParameterFile)) {
  throw "Parameter file not found: $ParameterFile"
}

$definition = Get-Content -LiteralPath $DefinitionFile -Raw -Encoding UTF8 | ConvertFrom-Json
$values = Get-Content -LiteralPath $ParameterFile -Raw -Encoding UTF8 | ConvertFrom-Json

if ($null -eq $definition.pages -or @($definition.pages).Count -ne 1) {
  throw 'The one-page definition must declare exactly one page.'
}

$page = @($definition.pages)[0]
if ($page.instance.view -ne 'app') {
  throw "Expected instance.view app, found '$($page.instance.view)'."
}

function Get-ParamValue([string]$Name) {
  $prop = $values.PSObject.Properties[$Name]
  if ($null -eq $prop) { return '' }
  if ($null -eq $prop.Value) { return '' }
  return [string]$prop.Value
}

function Resolve-Tokens([string]$Text) {
  if ([string]::IsNullOrEmpty($Text)) { return $Text }
  return [regex]::Replace($Text, '\{([A-Za-z][A-Za-z0-9]*)\}', {
    param($match)
    return (Get-ParamValue $match.Groups[1].Value)
  })
}

Write-Output 'AI CoE Front Door — one-page additive definition'
Write-Output ('Definition: ' + (Resolve-Path -LiteralPath $DefinitionFile).Path)
Write-Output ('Parameters: ' + (Resolve-Path -LiteralPath $ParameterFile).Path)
Write-Output 'Mode: dry-run / binding check. No site connection. No QuickLaunch. No Overwrite.'
Write-Output ''

if ($CheckBindings -or $DryRun) {
  Write-Output 'Bindings:'
  foreach ($name in @($definition.parameters.PSObject.Properties.Name)) {
    $meta = $definition.parameters.$name
    $raw = Get-ParamValue $name
    $state = if ([string]::IsNullOrWhiteSpace($raw)) { 'AWAITING' } else { 'BOUND' }
    Write-Output ("  {0} ({1}): {2}" -f $name, $meta.kind, $state)
  }
  Write-Output ''
}

if ($DryRun) {
  $file = Resolve-Tokens $page.file
  if ([string]::IsNullOrWhiteSpace($file)) {
    throw 'PageFile resolved empty. Name the Site Pages file explicitly.'
  }
  Write-Output 'Would place (not executed):'
  Write-Output ("  page file: {0}" -f $file)
  Write-Output ("  title: {0}" -f (Resolve-Tokens $page.title))
  Write-Output ("  view: {0}" -f $page.instance.view)
  Write-Output ("  layout: {0}" -f $page.instance.layout)
  Write-Output ("  permissions: {0}" -f $page.permissions)
  Write-Output ("  roleGroups: {0}" -f (Resolve-Tokens $page.instance.roleGroups))
  Write-Output 'Would not: replace QuickLaunch, recycle existing pages, write lists, or connect to SharePoint.'
}

Write-Output ''
Write-Output 'Dry-run complete. Site application was not executed.'
