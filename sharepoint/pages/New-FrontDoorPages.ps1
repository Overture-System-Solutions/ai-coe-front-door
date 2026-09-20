<#
.SYNOPSIS
Builds the AI CoE front door pages on a communication site from pages.json: the content document in Site Assets, one
front-door web part instance per page, the top navigation and the home page.

.DESCRIPTION
Operator tool for a site owner; the build and the tests never run it. It reads pages.json next to this script,
resolves the tokens from a parameter file (copy parameters.sample.json, fill it in, keep it out of git) and the named
parameters, uploads the resolved content document (the blocks of the seven content pages, the plane of a page written
for operators, and the shared footer every page view draws below its content, the five form pages included) to Site
Assets, then creates each page with a single front-door instance. Pages that already exist are skipped unless -Overwrite is given,
in which case they are sent to the site recycle bin and rebuilt from pages.json; edits made in the browser are
recoverable from the recycle bin but are not carried over. The content document is rewritten on every run (Site
Assets keeps its version history), and the navigation is rebuilt every time. A page whose build fails part-way is
recycled again so the next run recreates it.

Tokens in pages.json: {Name} is a parameter value; {Page:key} is the server-relative URL of a defined page;
{Url:Name} is a URL parameter. Text parameters must have a value. URL parameters may be blank: a blank one turns an
in-text link "[label]({Url:Name})" into its label, and a tile or call to action pointing at it is marked 'needsAccess'
with a warning, so the web part shows it as closed rather than dropping it. Optional parameters may be blank too: a
blank one takes the 'default' its declaration carries, or stays empty. Tokens inside the 'routes' table are resolved
the same way. A block that names a parameter in 'skipWhenBlank' (the private-pilot notice on Start here names
PilotTeamName) is dropped, with a warning, when that parameter is blank; the key itself never reaches the document.
The web part opens links to other origins in a new tab.

The package must already be installed on the site (upload as an update to the app catalog, then "Get it" on the site);
the script stops before creating anything when the front-door component is not available, and verifies after each
placement that SharePoint bound the component to the instance.

Every parameter must be given by name; a stray token on the command line (for example a bracket copied from an
example) is rejected instead of becoming a value.

.PARAMETER SiteUrl
Full URL of the communication site, for example https://<tenant>.sharepoint.com/sites/<site>.

.PARAMETER ParameterFile
JSON file mapping every parameter name declared in pages.json to its value. Defaults to parameters.json next to this
script. Named parameters below override values from the file.

.PARAMETER OrganizationName
Organization name used in the page text and set on every front-door instance.

.PARAMETER DraftServiceUrl
HTTP trigger URL of the AI draft flow for the idea page; blank keeps plain summaries.

.PARAMETER TelemetryProvider
Usage feed for the Operations page: claude (default), openai or both.

.PARAMETER Overwrite
Send pages that already exist to the recycle bin and rebuild them.

.PARAMETER AllowNonCommunicationSite
Proceed on a site that is not a communication site. There the QuickLaunch is the left navigation, and every existing
node in it is replaced by the five front-door entries.

.PARAMETER ClientId
Entra application (client) id registered for PnP PowerShell interactive login (Register-PnPEntraIDAppForInteractiveLogin).
Required unless the ENTRAID_CLIENT_ID or ENTRAID_APP_ID environment variable (or Set-PnPManagedAppId) supplies it;
the module ships no default id.

.EXAMPLE
pwsh ./New-FrontDoorPages.ps1 -SiteUrl https://<tenant>.sharepoint.com/sites/<site> -ParameterFile ./parameters.json -ClientId <app id> -OrganizationName Contoso
#>
#Requires -Version 7.4
#Requires -Modules @{ ModuleName = 'PnP.PowerShell'; RequiredVersion = '3.1.0' }
# Named parameters only: a stray token on the command line is an error, not the next parameter's value.
[CmdletBinding(PositionalBinding = $false)]
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
$definition = Get-Content -Raw -Encoding UTF8 $definitionPath | ConvertFrom-Json -AsHashtable
$contentFile = [string]$definition['contentFile']
$contentPath = "SiteAssets/$contentFile"

$values = @{}
if (Test-Path $ParameterFile) {
  $fileValues = Get-Content -Raw -Encoding UTF8 $ParameterFile | ConvertFrom-Json -AsHashtable
  foreach ($name in @($fileValues.Keys)) {
    $values[$name] = [string]$fileValues[$name]
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
foreach ($name in @($definition['parameters'].Keys)) {
  $declaration = $definition['parameters'][$name]
  $kinds[$name] = [string]$declaration['kind']
  if ($kinds[$name] -notin @('text', 'url', 'optional')) { throw "Parameter '$name' in pages.json has an unknown kind '$($kinds[$name])'; expected 'text', 'url' or 'optional'." }
  if ($declaration.Contains('default') -and $kinds[$name] -ne 'optional') { throw "Parameter '$name' in pages.json declares a default, which only an 'optional' parameter may carry." }
  if (-not $values.ContainsKey($name)) { $values[$name] = '' }
  if ([string]::IsNullOrWhiteSpace($values[$name])) {
    # Only a text parameter must be filled. A blank url parameter fails closed further down; a blank optional one
    # takes the default its declaration carries, or stays blank.
    if ($kinds[$name] -eq 'text') { $missing += $name }
    elseif ($kinds[$name] -eq 'optional' -and $declaration.Contains('default')) { $values[$name] = [string]$declaration['default'] }
  }
}
if ($missing.Count -gt 0) {
  throw "These text parameters have no value (set them in $ParameterFile or by name): $($missing -join ', ')"
}
foreach ($name in @($values.Keys)) {
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
if ($web.WebTemplate -ne 'SITEPAGEPUBLISHING' -and -not $AllowNonCommunicationSite) {
  throw "This is not a communication site ($($web.WebTemplate)). The script rebuilds the QuickLaunch, which is the horizontal top navigation only on communication sites; here it is the left navigation and every existing node would be removed. Pass -AllowNonCommunicationSite to proceed anyway."
}
$webRoot = $web.ServerRelativeUrl.TrimEnd('/')

# The component must be resolved to an object and passed as such: given the id as text, PnP.PowerShell 3.1.0 placed a
# web part with a null component ("webPartId":null in the canvas), which SharePoint neither renders nor lets anyone
# edit. The listed ids carry braces and upper case, so compare normalised ids.
function ConvertTo-GuidText([string]$value) {
  return ($value -replace '[{}]', '').Trim().ToLowerInvariant()
}
$homePageFile = (Get-PnPHomePage) -replace '^SitePages/', ''
$wantedId = ConvertTo-GuidText ([string]$definition['componentId'])
$components = @(Get-PnPPageComponent -Page $homePageFile -ListAvailable)
$component = $components | Where-Object { (ConvertTo-GuidText ([string]$_.Id)) -eq $wantedId } | Select-Object -First 1
if ($null -eq $component) {
  $listed = ($components | ForEach-Object { "$($_.Name) ($($_.Id))" }) -join '; '
  throw "The front-door component ($($definition['componentId'])) is not available on this site: install the package (app catalog upload, then 'Get it' on the site) and rerun. Components listed for ${homePageFile}: $listed"
}
Write-Host "Front-door component: $($component.Name) ($($component.Id))"

function Get-Page([string]$key) {
  $page = @($definition['pages'] | Where-Object { $_['key'] -eq $key })
  if ($page.Count -eq 0) { throw "pages.json defines no page with key '$key'." }
  return $page[0]
}

function Get-PageFile([string]$key) {
  return [string](Get-Page $key)['file']
}

function Get-PageUrl([string]$key) {
  return "$webRoot/SitePages/$(Get-PageFile $key)"
}

function Find-PageItem([string]$file) {
  $query = "<View><Query><Where><Eq><FieldRef Name='FileLeafRef'/><Value Type='Text'>$file</Value></Eq></Where></Query></View>"
  return Get-PnPListItem -List 'Site Pages' -Query $query | Select-Object -First 1
}

# In-text links first ("[label]({Url:Name})" keeps only its label when the parameter is blank), then page links,
# then URL parameters, then plain tokens.
function Resolve-Text([string]$text) {
  $urlLink = [System.Text.RegularExpressions.MatchEvaluator] {
    param($match)
    $url = $values[$match.Groups[2].Value]
    if ([string]::IsNullOrWhiteSpace($url)) { return $match.Groups[1].Value }
    return '[' + $match.Groups[1].Value + '](' + $url + ')'
  }
  $pageLink = [System.Text.RegularExpressions.MatchEvaluator] { param($match) Get-PageUrl $match.Groups[1].Value }
  $urlToken = [System.Text.RegularExpressions.MatchEvaluator] { param($match) [string]$values[$match.Groups[1].Value] }
  $plainToken = [System.Text.RegularExpressions.MatchEvaluator] {
    param($match)
    $name = $match.Groups[1].Value
    if (-not $values.ContainsKey($name)) { throw "Unknown token {$name} in pages.json." }
    return [string]$values[$name]
  }
  $text = [regex]::Replace($text, '\[([^\[\]]+)\]\(\{Url:([A-Za-z]+)\}\)', $urlLink)
  $text = [regex]::Replace($text, '\{Page:([A-Za-z]+)\}', $pageLink)
  $text = [regex]::Replace($text, '\{Url:([A-Za-z]+)\}', $urlToken)
  $text = [regex]::Replace($text, '\{([A-Za-z]+)\}', $plainToken)
  return $text
}

# True when an action item (a tile, a call to action) has no link and names neither a state nor a route.
function Test-Unlinked($item) {
  return [string]::IsNullOrWhiteSpace([string]$item['href']) -and -not $item.Contains('state') -and -not $item.Contains('route')
}

# True when a block stays in the document: it names no parameter in 'skipWhenBlank', or the one it names has a value
# (the private-pilot notice on Start here sets skipWhenBlank to PilotTeamName, so a site without a pilot team shows none).
function Test-BlockKept($block, [string]$where) {
  if (-not ($block -is [System.Collections.IDictionary]) -or -not $block.Contains('skipWhenBlank')) { return $true }
  $name = [string]$block['skipWhenBlank']
  if (-not $kinds.ContainsKey($name)) { throw "A block on $where names an undeclared parameter '$name' in skipWhenBlank." }
  if ([string]::IsNullOrWhiteSpace([string]$values[$name])) {
    Write-Warning "The $($block['type']) block '$($block['title'])' on $where is dropped because the parameter '$name' is blank."
    return $false
  }
  return $true
}

# Resolves every string in a block tree (and in the route table). A tile or hero call to action whose link resolves
# to nothing (a blank URL parameter) and that names neither a state nor a route stays on the page marked
# 'needsAccess', so the web part shows it as closed (a labelled non-link with its state) instead of dropping the
# promise; each is reported so the page owner can add the link later.
function Resolve-Node($node, [string]$where) {
  if ($node -is [string]) { return Resolve-Text $node }
  if ($node -is [System.Collections.IList]) {
    $out = [System.Collections.ArrayList]::new()
    foreach ($entry in $node) { [void]$out.Add((Resolve-Node $entry $where)) }
    return , $out.ToArray()
  }
  if ($node -is [System.Collections.IDictionary]) {
    $resolved = [ordered]@{}
    foreach ($key in @($node.Keys)) {
      # The skip rule is the script's, decided by Test-BlockKept; the web part never sees the key.
      if ($key -eq 'skipWhenBlank') { continue }
      $resolved[$key] = Resolve-Node $node[$key] $where
    }
    if ($resolved.Contains('type') -and $resolved['type'] -eq 'tiles') {
      foreach ($item in @($resolved['items'])) {
        if (Test-Unlinked $item) {
          Write-Warning "The tile '$($item['title'])' on $where has no link (its URL parameter is blank) and is shown as closed."
          $item['state'] = 'needsAccess'
        }
      }
    }
    if ($resolved.Contains('type') -and $resolved['type'] -eq 'hero' -and $resolved.Contains('cta') -and (Test-Unlinked $resolved['cta'])) {
      Write-Warning "The call to action '$($resolved['cta']['label'])' on $where has no link (its URL parameter is blank) and is shown as closed."
      $resolved['cta']['state'] = 'needsAccess'
    }
    return $resolved
  }
  return $node
}

# ---------------------------------------------------------------------------------------------------------------
# Content document: the blocks of every page that has them, resolved and uploaded to Site Assets
# ---------------------------------------------------------------------------------------------------------------
$documentPages = [ordered]@{}
foreach ($page in $definition['pages']) {
  if (-not $page.Contains('blocks')) { continue }
  $instance = $page['instance']
  if ($instance['view'] -ne 'page' -or $instance['pageKey'] -ne $page['key'] -or $instance['contentUrl'] -ne $contentPath) {
    throw "Page '$($page['key'])' carries blocks, so its instance must be a 'page' view with pageKey '$($page['key'])' reading $contentPath."
  }
  # Blocks keyed on a blank parameter (skipWhenBlank) are dropped before the token pass, so their tokens never resolve.
  $kept = @($page['blocks'] | Where-Object { Test-BlockKept $_ ([string]$page['file']) })
  $documentPage = [ordered]@{
    title = Resolve-Text ([string]$page['title'])
    blocks = Resolve-Node $kept ([string]$page['file'])
  }
  # A page written for operators names its plane (the owners-only Operations page); the web part shows codes beside
  # the plain wording there and keeps that page out of the user plane.
  if ($page.Contains('plane')) { $documentPage['plane'] = [string]$page['plane'] }
  $documentPages[[string]$page['key']] = $documentPage
}
$document = [ordered]@{ version = 1; pages = $documentPages }
# The route table and the shared sections (the footer below every page view, the form pages included) go through
# the same token pass as the blocks; vocabulary and settings are copied as written (their {organization} and {role}
# tokens belong to the web part, and Resolve-Text would refuse them).
if ($definition.Contains('routes')) { $document['routes'] = Resolve-Node $definition['routes'] 'routes' }
if ($definition.Contains('shared')) { $document['shared'] = Resolve-Node $definition['shared'] 'shared' }
foreach ($section in @('vocabulary', 'settings')) {
  if ($definition.Contains($section)) { $document[$section] = $definition[$section] }
}
$documentJson = $document | ConvertTo-Json -Depth 20

Write-Host "Uploading $contentPath ($($documentPages.Count) pages) ..."
$context = Get-PnPContext
$assets = $context.Web.Lists.EnsureSiteAssetsLibrary()
$context.Load($assets)
Invoke-PnPQuery
$temporary = New-TemporaryFile
try {
  [System.IO.File]::WriteAllText($temporary.FullName, $documentJson, [System.Text.UTF8Encoding]::new($false))
  Add-PnPFile -Path $temporary.FullName -Folder 'SiteAssets' -NewFileName $contentFile | Out-Null
} finally {
  Remove-Item $temporary.FullName -Force -ErrorAction SilentlyContinue
}
$readBack = Get-PnPFile -Url "$webRoot/$contentPath" -AsString | ConvertFrom-Json -AsHashtable
if ($readBack['version'] -ne 1 -or @($readBack['pages'].Keys).Count -ne $documentPages.Count) {
  throw "$contentPath did not read back as the document just uploaded."
}

# ---------------------------------------------------------------------------------------------------------------
# Pages: one section, one front-door instance each
# ---------------------------------------------------------------------------------------------------------------
$created = @()
$skipped = @()
$locked = @()
foreach ($page in $definition['pages']) {
  $file = [string]$page['file']
  $pageName = $file -replace '\.aspx$', ''
  $existing = Find-PageItem $file
  if ($null -ne $existing -and -not $Overwrite) {
    Write-Host "Skipping $file (exists; use -Overwrite to recycle and rebuild it)."
    $skipped += $file
    continue
  }
  if ($null -ne $existing) {
    # A page open in the browser's editor is locked for about ten minutes after its last refresh; leave it for a rerun.
    try {
      Remove-PnPPage -Identity $pageName -Force -Recycle | Out-Null
    } catch {
      Write-Warning "Skipping $file - it could not be recycled ($($_.Exception.Message.Trim())). Close every browser tab that has it open and rerun with -Overwrite once the lock has expired."
      $locked += $file
      continue
    }
  }
  Write-Host "Creating $file ..."
  try {
    Add-PnPPage -Name $pageName -Title (Resolve-Text ([string]$page['title'])) -LayoutType Article -HeaderLayoutType NoImage -CommentsEnabled:([bool]$page['commentsEnabled']) | Out-Null
    Add-PnPPageSection -Page $pageName -SectionTemplate OneColumn -Order 1 | Out-Null
    # A hashtable merges over the component's manifest defaults, so "view" overrides the legacy default.
    $properties = @{}
    foreach ($name in @($page['instance'].Keys)) {
      $properties[$name] = Resolve-Text ([string]$page['instance'][$name])
    }
    Add-PnPPageWebPart -Page $pageName -Component $component -Section 1 -Column 1 -Order 1 -WebPartProperties $properties | Out-Null
    # Read the control back: a web part without its component id would be saved silently and never render.
    $placed = @(Get-PnPPageComponent -Page $pageName | Where-Object { $_.PSObject.Properties['WebPartId'] -and (ConvertTo-GuidText ([string]$_.WebPartId)) -eq $wantedId })
    if ($placed.Count -ne 1) {
      throw "SharePoint did not bind the front-door component on $file (expected one control with WebPartId $wantedId)."
    }
    Set-PnPPage -Identity $pageName -Publish | Out-Null

    if ([string]$page['permissions'] -eq 'owners') {
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
foreach ($entry in $definition['navigation']) {
  $node = Add-PnPNavigationNode -Location QuickLaunch -Title ([string]$entry['title']) -Url (Get-PageUrl ([string]$entry['page']))
  if ($entry.Contains('children')) {
    foreach ($child in $entry['children']) {
      Add-PnPNavigationNode -Location QuickLaunch -Parent $node.Id -Title ([string]$child['title']) -Url (Get-PageUrl ([string]$child['page'])) | Out-Null
    }
  }
}
Set-PnPHomePage -RootFolderRelativeUrl "SitePages/$(Get-PageFile 'startHere')"

Write-Host ''
Write-Host "Content document: $contentPath ($($documentPages.Count) pages; earlier versions stay in its version history)"
Write-Host "Created: $($created.Count) page(s)$(if ($created.Count -gt 0) { ' - ' + ($created -join ', ') })"
Write-Host "Skipped: $($skipped.Count) page(s)$(if ($skipped.Count -gt 0) { ' - ' + ($skipped -join ', ') })"
Write-Host "Locked: $($locked.Count) page(s)$(if ($locked.Count -gt 0) { ' - ' + ($locked -join ', ') })"
# Bindings the pages carry from parameters rather than from committed content. A blank GovernanceReference leaves the
# legacy view quoting the package's own default policy reference and every page view reading "reference not yet set",
# so the summary names it as awaiting until the parameter is filled and the script is rerun with -Overwrite.
$governanceBinding = if ([string]::IsNullOrWhiteSpace([string]$values['GovernanceReference'])) { 'AWAITING (blank: review requests quote the default wording until GovernanceReference is set)' } else { 'set' }
$reviewSystemBinding = if ([string]::IsNullOrWhiteSpace([string]$values['ReviewSystemName'])) { 'default wording (blank: tool guidance names the review system generically until ReviewSystemName is set)' } else { 'set' }
Write-Host "Bindings: GovernanceReference $governanceBinding; ReviewSystemName $reviewSystemBinding"
Write-Host 'Navigation and home page set. Open each page once in the browser; a warning above names any tile or call to action shown as closed because its URL parameter was blank.'
if ($locked.Count -gt 0) {
  throw "$($locked.Count) page(s) were left as they were because they are locked for editing: $($locked -join ', '). Close the browser tabs that have them open, wait a few minutes, and rerun with -Overwrite."
}
