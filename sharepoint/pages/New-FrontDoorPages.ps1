<#
.SYNOPSIS
Builds the AI CoE front door pages on a communication site from pages.json: sections, text, native tiles, one
front-door web part instance per piece page, the top navigation and the home page.

.DESCRIPTION
Operator tool for a site owner; the build and the tests never run it. It reads pages.json next to this script,
resolves the tokens from a parameter file (copy parameters.sample.json, fill it in, keep it out of git) and the named
parameters, then creates each page. Pages that already exist are skipped unless -Overwrite is given, in which case
they are removed and rebuilt. The navigation is rebuilt every time.

Tokens in pages.json: {Name} is a parameter value; {Page:key} is the server-relative URL of a defined page;
{Url:Name} is a URL parameter. Text parameters must have a value. URL parameters may be blank: a blank one drops the
link and keeps the sentence, and a tile or button pointing at it is skipped with a warning.

The Quick Links and Button web parts need their property JSON captured once from a page authored in the browser
(see README, "Lay out the front door across pages"). Without quicklinks.template.json and button.template.json next
to this script those parts are skipped with a warning; everything else is created.

The package must already be installed on the site (upload as an update to the app catalog, then "Get it" on the site)
so that the front-door component is available to Add-PnPPageWebPart.

.PARAMETER SiteUrl
Full URL of the communication site, for example https://<tenant>.sharepoint.com/sites/<site>.

.PARAMETER ParameterFile
JSON file mapping every parameter name declared in pages.json to its value. Defaults to parameters.json next to this
script. Named parameters below override values from the file.

.PARAMETER OrganizationName
Organization name used in the page text and set on every front-door instance.

.PARAMETER DraftServiceUrl
HTTP trigger URL of the Claude draft flow for the idea page; blank keeps plain summaries.

.PARAMETER TelemetryProvider
Usage feed for the Status page: claude (default), openai or both.

.PARAMETER Overwrite
Remove and rebuild pages that already exist.

.PARAMETER ClientId
Entra application (client) id registered for PnP PowerShell interactive login; omit to use the module's default.

.EXAMPLE
pwsh ./New-FrontDoorPages.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ParameterFile ./parameters.json -OrganizationName Contoso
#>
#Requires -Version 7.4
#Requires -Modules @{ ModuleName = 'PnP.PowerShell'; RequiredVersion = '3.1.0' }
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SiteUrl,
  [string]$ParameterFile = (Join-Path $PSScriptRoot 'parameters.json'),
  [string]$OrganizationName,
  [string]$DraftServiceUrl,
  [ValidateSet('', 'claude', 'openai', 'both')][string]$TelemetryProvider = '',
  [switch]$Overwrite,
  [string]$ClientId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------------------------------------------
# Definition and parameter values
# ---------------------------------------------------------------------------------------------------------------
$definitionPath = Join-Path $PSScriptRoot 'pages.json'
$definition = Get-Content -Raw -Encoding UTF8 $definitionPath | ConvertFrom-Json

$values = @{}
if (Test-Path $ParameterFile) {
  $fileValues = Get-Content -Raw -Encoding UTF8 $ParameterFile | ConvertFrom-Json
  foreach ($property in $fileValues.PSObject.Properties) {
    $values[$property.Name] = [string]$property.Value
  }
} elseif ($PSBoundParameters.ContainsKey('ParameterFile')) {
  throw "Parameter file not found: $ParameterFile"
}
if ($OrganizationName) { $values['OrganizationName'] = $OrganizationName }
if ($DraftServiceUrl) { $values['DraftServiceUrl'] = $DraftServiceUrl }
if ($TelemetryProvider) { $values['TelemetryProvider'] = $TelemetryProvider }
if (-not $values.ContainsKey('TelemetryProvider') -or [string]::IsNullOrWhiteSpace($values['TelemetryProvider'])) {
  $values['TelemetryProvider'] = 'claude'
}

$kinds = @{}
$missing = @()
foreach ($parameter in $definition.parameters.PSObject.Properties) {
  $kinds[$parameter.Name] = [string]$parameter.Value.kind
  if (-not $values.ContainsKey($parameter.Name)) { $values[$parameter.Name] = '' }
  if ($kinds[$parameter.Name] -eq 'text' -and [string]::IsNullOrWhiteSpace($values[$parameter.Name])) { $missing += $parameter.Name }
}
if ($missing.Count -gt 0) {
  throw "These text parameters have no value (set them in $ParameterFile or by name): $($missing -join ', ')"
}
foreach ($name in $values.Keys) {
  if (-not $kinds.ContainsKey($name)) { Write-Warning "Parameter '$name' is not declared in pages.json and is ignored." }
}

# ---------------------------------------------------------------------------------------------------------------
# Site
# ---------------------------------------------------------------------------------------------------------------
if ($ClientId) {
  Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId
} else {
  Connect-PnPOnline -Url $SiteUrl -Interactive
}
$web = Get-PnPWeb -Includes ServerRelativeUrl, WebTemplate
if ($web.WebTemplate -ne 'SITEPAGEPUBLISHING') {
  Write-Warning "This is not a communication site ($($web.WebTemplate)); the horizontal top navigation is only the QuickLaunch on communication sites."
}
$webRoot = $web.ServerRelativeUrl.TrimEnd('/')

function Get-PageFile([string]$key) {
  $page = $definition.pages | Where-Object { $_.key -eq $key } | Select-Object -First 1
  if ($null -eq $page) { throw "pages.json defines no page with key '$key'." }
  return [string]$page.file
}

function Get-PageUrl([string]$key) {
  return "$webRoot/SitePages/$(Get-PageFile $key)"
}

function Find-PageItem([string]$file) {
  $query = "<View><Query><Where><Eq><FieldRef Name='FileLeafRef'/><Value Type='Text'>$file</Value></Eq></Where></Query></View>"
  return Get-PnPListItem -List 'Site Pages' -Query $query | Select-Object -First 1
}

# Links first ({Url:...} anchors drop to plain text when the parameter is blank), then page links, then plain tokens.
function Resolve-Text([string]$text) {
  $urlAnchor = [System.Text.RegularExpressions.MatchEvaluator] {
    param($match)
    $url = $values[$match.Groups[1].Value]
    if ([string]::IsNullOrWhiteSpace($url)) { return $match.Groups[2].Value }
    return '<a href="' + $url + '">' + $match.Groups[2].Value + '</a>'
  }
  $pageLink = [System.Text.RegularExpressions.MatchEvaluator] { param($match) Get-PageUrl $match.Groups[1].Value }
  $urlToken = [System.Text.RegularExpressions.MatchEvaluator] { param($match) [string]$values[$match.Groups[1].Value] }
  $plainToken = [System.Text.RegularExpressions.MatchEvaluator] {
    param($match)
    $name = $match.Groups[1].Value
    if (-not $values.ContainsKey($name)) { throw "Unknown token {$name} in pages.json." }
    return [string]$values[$name]
  }
  $text = [regex]::Replace($text, '<a href="\{Url:([A-Za-z]+)\}">(.*?)</a>', $urlAnchor)
  $text = [regex]::Replace($text, '\{Page:([A-Za-z]+)\}', $pageLink)
  $text = [regex]::Replace($text, '\{Url:([A-Za-z]+)\}', $urlToken)
  $text = [regex]::Replace($text, '\{([A-Za-z]+)\}', $plainToken)
  return $text
}

function Resolve-LinkTarget($item) {
  if ($item.PSObject.Properties['page'] -and $item.page) { return Get-PageUrl $item.page }
  if ($item.PSObject.Properties['url'] -and $item.url) { return Resolve-Text ([string]$item.url) }
  return ''
}

# The captured template holds exactly one item whose title is {Title} and whose link is {Url}. Quick Links keep
# their items both under properties.items and under serverProcessedContent (keys such as "items[0].title"), so the
# single item is cloned per link on both sides; the Button holds one link and is filled by plain replacement.
function Expand-Template([string]$template, [string]$kind, $links) {
  if ($kind -eq 'Button') {
    return $template.Replace('{Title}', $links[0].title).Replace('{Url}', $links[0].url)
  }
  $object = $template | ConvertFrom-Json -AsHashtable
  $properties = $object['properties']
  $sample = $properties['items'][0]
  $items = @()
  for ($index = 0; $index -lt $links.Count; $index++) {
    $clone = ($sample | ConvertTo-Json -Depth 30 -Compress | ConvertFrom-Json -AsHashtable)
    $clone['id'] = $index + 1
    $items += , $clone
  }
  $properties['items'] = $items
  if ($object.ContainsKey('serverProcessedContent')) {
    foreach ($bucketName in @($object['serverProcessedContent'].Keys)) {
      $bucket = $object['serverProcessedContent'][$bucketName]
      $expanded = @{}
      foreach ($key in $bucket.Keys) {
        if ($key -match '^items\[0\]') {
          for ($index = 0; $index -lt $links.Count; $index++) {
            $value = [string]$bucket[$key]
            $expanded[($key -replace '^items\[0\]', "items[$index]")] = $value.Replace('{Title}', $links[$index].title).Replace('{Url}', $links[$index].url)
          }
        } else {
          $expanded[$key] = $bucket[$key]
        }
      }
      $object['serverProcessedContent'][$bucketName] = $expanded
    }
  }
  return ($object | ConvertTo-Json -Depth 30 -Compress).Replace('{Title}', $links[0].title).Replace('{Url}', $links[0].url)
}

function Add-NativePart([string]$pageName, [string]$kind, [string]$templateFile, $items, [int]$section, [int]$column, [int]$order) {
  $templatePath = Join-Path $PSScriptRoot $templateFile
  if (-not (Test-Path $templatePath)) {
    Write-Warning "$templateFile is missing next to this script, so the $kind web part on $pageName is skipped. Capture it as described in the README."
    return
  }
  $links = @()
  foreach ($item in $items) {
    $url = Resolve-LinkTarget $item
    if ([string]::IsNullOrWhiteSpace($url)) {
      Write-Warning "The $kind item '$($item.title)' on $pageName has no link (its URL parameter is blank) and is skipped."
      continue
    }
    $links += , @{ title = [string]$item.title; url = $url }
  }
  if ($links.Count -eq 0) { return }
  $json = Expand-Template (Get-Content -Raw -Encoding UTF8 $templatePath) $kind $links
  Add-PnPPageWebPart -Page $pageName -DefaultWebPartType $kind -Section $section -Column $column -Order $order -WebPartProperties $json | Out-Null
}

# ---------------------------------------------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------------------------------------------
$created = @()
$skipped = @()
foreach ($page in $definition.pages) {
  $file = [string]$page.file
  $pageName = $file -replace '\.aspx$', ''
  $existing = Find-PageItem $file
  if ($null -ne $existing -and -not $Overwrite) {
    Write-Host "Skipping $file (exists; use -Overwrite to rebuild)."
    $skipped += $file
    continue
  }
  if ($null -ne $existing) {
    Remove-PnPPage -Identity $pageName -Force
  }
  Write-Host "Creating $file ..."
  Add-PnPPage -Name $pageName -Title ([string]$page.title) -LayoutType Article -HeaderLayoutType NoImage -CommentsEnabled:([bool]$page.commentsEnabled) | Out-Null

  $sectionOrder = 1
  foreach ($section in $page.sections) {
    Add-PnPPageSection -Page $pageName -SectionTemplate ([string]$section.template) -Order $sectionOrder | Out-Null
    $columnIndex = 1
    foreach ($column in $section.columns) {
      $controlOrder = 1
      foreach ($control in $column.controls) {
        switch ([string]$control.type) {
          'text' {
            Add-PnPPageTextPart -Page $pageName -Section $sectionOrder -Column $columnIndex -Order $controlOrder -Text (Resolve-Text ([string]$control.html)) | Out-Null
          }
          'frontDoor' {
            # A hashtable merges over the component's manifest defaults, so "view" overrides the legacy default.
            $properties = @{}
            foreach ($property in $control.properties.PSObject.Properties) {
              $properties[$property.Name] = Resolve-Text ([string]$property.Value)
            }
            Add-PnPPageWebPart -Page $pageName -Component ([string]$definition.componentId) -Section $sectionOrder -Column $columnIndex -Order $controlOrder -WebPartProperties $properties | Out-Null
          }
          'quickLinks' {
            Add-NativePart $pageName 'QuickLinks' 'quicklinks.template.json' $control.items $sectionOrder $columnIndex $controlOrder
          }
          'button' {
            $buttonItem = [pscustomobject]@{ title = [string]$control.label; page = $control.page; url = $control.url }
            Add-NativePart $pageName 'Button' 'button.template.json' @($buttonItem) $sectionOrder $columnIndex $controlOrder
          }
          default { throw "Unknown control type '$($control.type)' on $file." }
        }
        $controlOrder++
      }
      $columnIndex++
    }
    $sectionOrder++
  }
  Set-PnPPage -Identity $pageName -Publish | Out-Null

  if ([string]$page.permissions -eq 'owners') {
    $item = Find-PageItem $file
    $owners = Get-PnPGroup -AssociatedOwnerGroup
    $adminRole = (Get-PnPRoleDefinition | Where-Object { $_.RoleTypeKind -eq 'Administrator' } | Select-Object -First 1).Name
    # Reset first: breaking inheritance on an item that is already unique keeps stray grants from an earlier run.
    Set-PnPListItemPermission -List 'Site Pages' -Identity $item.Id -InheritPermissions
    Set-PnPListItemPermission -List 'Site Pages' -Identity $item.Id -Group $owners -AddRole $adminRole -ClearExisting
  }
  $created += $file
}

# ---------------------------------------------------------------------------------------------------------------
# Navigation and home page (rebuilt every run; this also removes the list links the package feature adds)
# ---------------------------------------------------------------------------------------------------------------
Get-PnPNavigationNode -Location QuickLaunch | ForEach-Object { Remove-PnPNavigationNode -Identity $_.Id -Force }
foreach ($entry in $definition.navigation) {
  $node = Add-PnPNavigationNode -Location QuickLaunch -Title ([string]$entry.title) -Url (Get-PageUrl ([string]$entry.page))
  if ($entry.PSObject.Properties['children']) {
    foreach ($child in $entry.children) {
      Add-PnPNavigationNode -Location QuickLaunch -Parent $node.Id -Title ([string]$child.title) -Url (Get-PageUrl ([string]$child.page)) | Out-Null
    }
  }
}
Set-PnPHomePage -RootFolderRelativeUrl "SitePages/$(Get-PageFile 'startHere')"

Write-Host ''
Write-Host "Created: $($created.Count) page(s)$(if ($created.Count -gt 0) { ' - ' + ($created -join ', ') })"
Write-Host "Skipped: $($skipped.Count) page(s)$(if ($skipped.Count -gt 0) { ' - ' + ($skipped -join ', ') })"
Write-Host 'Navigation and home page set. Review each page once in the browser and add the missing prose where a URL parameter was blank.'
