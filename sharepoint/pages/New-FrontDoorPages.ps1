<#
.SYNOPSIS
Builds the AI CoE front door pages on a communication site from pages.json: sections, text, native tiles, one
front-door web part instance per piece page, the top navigation and the home page.

.DESCRIPTION
Operator tool for a site owner; the build and the tests never run it. It reads pages.json next to this script,
resolves the tokens from a parameter file (copy parameters.sample.json, fill it in, keep it out of git) and the named
parameters, then creates each page. Pages that already exist are skipped unless -Overwrite is given, in which case
they are sent to the site recycle bin and rebuilt from pages.json; edits made in the browser are recoverable from the
recycle bin but are not carried over. The navigation is rebuilt every time. A page whose build fails part-way is
recycled again so the next run recreates it.

Tokens in pages.json: {Name} is a parameter value; {Page:key} is the server-relative URL of a defined page;
{Url:Name} is a URL parameter. Text parameters must have a value. URL parameters may be blank: a blank one drops the
link and keeps the sentence, and a tile or button pointing at it is skipped with a warning. Links made from URL
parameters open in a new tab, because they lead away from the site.

The Quick Links and Button web parts need their property JSON captured once from a page authored in the browser
(see README, "Lay out the front door across pages"). Each template file is an object with two keys, 'properties'
(the web part's PropertiesJson, holding exactly one item) and 'serverProcessedContent' (where SharePoint keeps the
titles and links), with the item's title written as {Title} and its link as {Url}. Without
quicklinks.template.json and button.template.json next to this script those parts are skipped with a warning;
everything else is created. Both templates are checked before any page is touched.

The package must already be installed on the site (upload as an update to the app catalog, then "Get it" on the site);
the script checks that the front-door component is available before creating anything.

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
Send pages that already exist to the recycle bin and rebuild them.

.PARAMETER AllowNonCommunicationSite
Proceed on a site that is not a communication site. There the QuickLaunch is the left navigation, and every existing
node in it is replaced by the six front-door entries.

.PARAMETER ClientId
Entra application (client) id registered for PnP PowerShell interactive login (Register-PnPEntraIDAppForInteractiveLogin).
Required unless the ENTRAID_CLIENT_ID or ENTRAID_APP_ID environment variable (or Set-PnPManagedAppId) supplies it;
the module ships no default id.

.EXAMPLE
pwsh ./New-FrontDoorPages.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ParameterFile ./parameters.json -ClientId <app id> -OrganizationName Contoso
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
  [switch]$AllowNonCommunicationSite,
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
foreach ($name in @($values.Keys)) {
  if (-not $kinds.ContainsKey($name)) { Write-Warning "Parameter '$name' is not declared in pages.json and is ignored." }
}

# ---------------------------------------------------------------------------------------------------------------
# Native web part templates: read, normalised and checked before anything is created
# ---------------------------------------------------------------------------------------------------------------
function Read-Template([string]$kind, [string]$templateFile) {
  $templatePath = Join-Path $PSScriptRoot $templateFile
  if (-not (Test-Path $templatePath)) {
    Write-Warning "$templateFile is missing next to this script, so every $kind web part is skipped. Capture it as described in the README."
    return $null
  }
  $text = Get-Content -Raw -Encoding UTF8 $templatePath
  # A capture made by following the README leaves the scratch link in place; normalise it to the bare placeholders.
  $text = [regex]::Replace($text, 'https?://example\.invalid/(?:\{Url\}|%7BUrl%7D)', '{Url}')
  $text = $text.Replace('%7BUrl%7D', '{Url}').Replace('%7BTitle%7D', '{Title}')
  if ($text -notmatch '\{Url\}' -or $text -notmatch '\{Title\}') {
    throw "$templateFile does not contain the {Title} and {Url} placeholders; recapture it as described in the README."
  }
  $object = $text | ConvertFrom-Json -AsHashtable
  if (-not ($object -is [hashtable]) -or -not $object.ContainsKey('properties') -or -not $object.ContainsKey('serverProcessedContent')) {
    throw "$templateFile must be an object with 'properties' and 'serverProcessedContent' keys (see README, template capture)."
  }
  if ($kind -eq 'QuickLinks' -and (-not ($object['properties'] -is [hashtable]) -or -not $object['properties'].ContainsKey('items') -or @($object['properties']['items']).Count -lt 1)) {
    throw "$templateFile must hold exactly one item under properties.items (see README, template capture)."
  }
  return $text
}

$templates = @{
  QuickLinks = Read-Template 'QuickLinks' 'quicklinks.template.json'
  Button = Read-Template 'Button' 'button.template.json'
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
if ($web.WebTemplate -ne 'SITEPAGEPUBLISHING' -and -not $AllowNonCommunicationSite) {
  throw "This is not a communication site ($($web.WebTemplate)). The script rebuilds the QuickLaunch, which is the horizontal top navigation only on communication sites; here it is the left navigation and every existing node would be removed. Pass -AllowNonCommunicationSite to proceed anyway."
}
$webRoot = $web.ServerRelativeUrl.TrimEnd('/')

# Advisory check that the package is installed: the component list can carry ids with braces or upper case, so
# compare normalised ids and the web part's manifest name, and warn rather than stop when nothing matches.
function ConvertTo-GuidText([string]$value) {
  return ($value -replace '[{}]', '').Trim().ToLowerInvariant()
}
$homePageFile = (Get-PnPHomePage) -replace '^SitePages/', ''
$wantedId = ConvertTo-GuidText ([string]$definition.componentId)
$components = @(Get-PnPPageComponent -Page $homePageFile -ListAvailable)
$available = @($components | Where-Object { (ConvertTo-GuidText ([string]$_.Id)) -eq $wantedId -or [string]$_.Name -eq 'AiCoeFrontDoorWebPart' })
if ($available.Count -eq 0) {
  $listed = ($components | ForEach-Object { "$($_.Name) ($($_.Id))" }) -join '; '
  Write-Warning "The front-door component ($($definition.componentId)) was not found among the $($components.Count) components listed for $homePageFile. If the package is not installed on this site (app catalog upload, then 'Get it'), the front-door instances will be empty. Listed: $listed"
}

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

# Links first ({Url:...} anchors drop to plain text when the parameter is blank and open in a new tab otherwise),
# then page links, then plain tokens.
function Resolve-Text([string]$text) {
  $urlAnchor = [System.Text.RegularExpressions.MatchEvaluator] {
    param($match)
    $url = $values[$match.Groups[1].Value]
    if ([string]::IsNullOrWhiteSpace($url)) { return $match.Groups[2].Value }
    return '<a href="' + $url + '" target="_blank" data-interception="off" rel="noopener">' + $match.Groups[2].Value + '</a>'
  }
  $pageLink = [System.Text.RegularExpressions.MatchEvaluator] { param($match) Get-PageUrl $match.Groups[1].Value }
  $urlToken = [System.Text.RegularExpressions.MatchEvaluator] { param($match) [string]$values[$match.Groups[1].Value] }
  $plainToken = [System.Text.RegularExpressions.MatchEvaluator] {
    param($match)
    $name = $match.Groups[1].Value
    if (-not $values.ContainsKey($name)) { throw "Unknown token {$name} in pages.json." }
    return [string]$values[$name]
  }
  $text = [regex]::Replace($text, '<a href="\{Url:([A-Za-z]+)\}"[^>]*>(.*?)</a>', $urlAnchor)
  $text = [regex]::Replace($text, '\{Page:([A-Za-z]+)\}', $pageLink)
  $text = [regex]::Replace($text, '\{Url:([A-Za-z]+)\}', $urlToken)
  $text = [regex]::Replace($text, '\{([A-Za-z]+)\}', $plainToken)
  return $text
}

function Get-OptionalProperty($object, [string]$name) {
  if ($object.PSObject.Properties[$name]) { return $object.$name }
  return $null
}

function Resolve-LinkTarget($item) {
  $page = Get-OptionalProperty $item 'page'
  if ($page) { return Get-PageUrl ([string]$page) }
  $url = Get-OptionalProperty $item 'url'
  if ($url) { return Resolve-Text ([string]$url) }
  return ''
}

# The template holds exactly one item whose title is {Title} and whose link is {Url}. Quick Links keep their items
# both under properties.items and under serverProcessedContent (keys such as "items[0].title"), so the single item
# is cloned per link on both sides; the Button holds one link and is filled by plain replacement.
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
  foreach ($bucketName in @($object['serverProcessedContent'].Keys)) {
    $bucket = $object['serverProcessedContent'][$bucketName]
    if (-not ($bucket -is [hashtable])) { continue }
    $expanded = @{}
    foreach ($key in @($bucket.Keys)) {
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
  return ($object | ConvertTo-Json -Depth 30 -Compress).Replace('{Title}', $links[0].title).Replace('{Url}', $links[0].url)
}

function Add-NativePart([string]$pageName, [string]$kind, $items, [int]$section, [int]$column, [int]$order) {
  $template = $templates[$kind]
  if ($null -eq $template) { return }
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
  $json = Expand-Template $template $kind $links
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
    Write-Host "Skipping $file (exists; use -Overwrite to recycle and rebuild it)."
    $skipped += $file
    continue
  }
  if ($null -ne $existing) {
    Remove-PnPPage -Identity $pageName -Force -Recycle | Out-Null
  }
  Write-Host "Creating $file ..."
  try {
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
              Add-NativePart $pageName 'QuickLinks' $control.items $sectionOrder $columnIndex $controlOrder
            }
            'button' {
              $buttonItem = [pscustomobject]@{
                title = [string]$control.label
                page = Get-OptionalProperty $control 'page'
                url = Get-OptionalProperty $control 'url'
              }
              Add-NativePart $pageName 'Button' @($buttonItem) $sectionOrder $columnIndex $controlOrder
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
  } catch {
    Write-Warning "Building $file failed; the partial page is recycled so the next run recreates it."
    Remove-PnPPage -Identity $pageName -Force -Recycle -ErrorAction SilentlyContinue | Out-Null
    throw
  }
  $created += $file
}

# ---------------------------------------------------------------------------------------------------------------
# Navigation and home page (rebuilt every run; this also removes the list links the package feature adds)
# ---------------------------------------------------------------------------------------------------------------
Get-PnPNavigationNode -Location QuickLaunch | ForEach-Object { Remove-PnPNavigationNode -Identity $_.Id -Force }
foreach ($entry in $definition.navigation) {
  $node = Add-PnPNavigationNode -Location QuickLaunch -Title ([string]$entry.title) -Url (Get-PageUrl ([string]$entry.page))
  $children = Get-OptionalProperty $entry 'children'
  if ($null -ne $children) {
    foreach ($child in $children) {
      Add-PnPNavigationNode -Location QuickLaunch -Parent $node.Id -Title ([string]$child.title) -Url (Get-PageUrl ([string]$child.page)) | Out-Null
    }
  }
}
Set-PnPHomePage -RootFolderRelativeUrl "SitePages/$(Get-PageFile 'startHere')"

Write-Host ''
Write-Host "Created: $($created.Count) page(s)$(if ($created.Count -gt 0) { ' - ' + ($created -join ', ') })"
Write-Host "Skipped: $($skipped.Count) page(s)$(if ($skipped.Count -gt 0) { ' - ' + ($skipped -join ', ') })"
Write-Host 'Navigation and home page set. Review each page once in the browser and add the missing prose where a URL parameter was blank.'
