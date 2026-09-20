<#
.SYNOPSIS
Builds the AI CoE front door pages on a communication site from pages.json: the content document in Site Assets, one
front-door web part instance per page, the top navigation and the home page.

.DESCRIPTION
Operator tool for a site owner; the build and the tests never run it. It reads pages.json next to this script,
resolves the tokens from a parameter file (copy parameters.sample.json, fill it in, keep it out of git) and the named
parameters, uploads the resolved content document (the blocks of the content pages, the plane of a page written
for operators, and the shared footer every page view draws below its content, the five form pages included) to Site
Assets, then creates each page with a single front-door instance. A page that already exists keeps its content and its
browser edits: only the properties of its front-door instance are rewritten from pages.json and the page is
republished, so a site upgraded from an earlier version takes this version's properties without -Overwrite. With
-Overwrite every existing page is sent to the site recycle bin and rebuilt from pages.json; edits made in the browser
are recoverable from the recycle bin but are not carried over. The content document is rewritten on every run (Site
Assets keeps its version history), and the navigation is rebuilt every time. A page whose build fails part-way is
recycled again so the next run recreates it.

Tokens in pages.json: {Name} is a parameter value; {Page:key} is the server-relative URL of a defined page;
{Url:Name} is a URL parameter. Text parameters must have a value. URL parameters may be blank: a blank one turns an
in-text link "[label]({Url:Name})" into its label, and a tile or call to action pointing at it is marked 'needsAccess'
with a warning, so the web part shows it as closed rather than dropping it. Optional parameters may be blank too: a
blank one takes the 'default' its declaration carries, or stays empty. Group parameters (since 1.0.0.14) carry the
title of a site group, which the script looks up once: a blank title, or one the site does not carry, is reported and
nothing else happens, so a site whose groups are not created yet still provisions. Tokens inside the 'routes' table are resolved
the same way. A block that names a parameter in 'skipWhenBlank' (the private-pilot notice on Start here names
PilotTeamName) is dropped, with a warning, when that parameter is blank; the key itself never reaches the document.
A page may name a parameter the same way (since 1.0.0.15 the role-start page names PilotTeamName): a run without a
value for it builds no page, uploads no blocks for it, adds no navigation node, and drops every tile, card and in-text
link that targets it, each with a warning, so nothing on the site points at a page that was not built.
The web part opens links to other origins in a new tab.

The package must already be installed on the site (upload as an update to the app catalog, then "Get it" on the site);
the script stops before creating anything when the front-door component is not available, and verifies after each
placement that SharePoint bound the component to the instance.

List security (since 1.0.0.13): before the upload, every list named in the 'listSecurity' section of pages.json (the
two intake lists) is put under item-level security, so a site member reads and edits their own rows and the Status
page shows each person exactly their own requests. SharePoint bypasses item-level security for a principal whose
permission level holds Override List Behaviors (the Microsoft 365 permission reference lists it as Override Check-Out):
the default Design and Full Control levels hold it, the default Edit level of the site Members group does not, so the
script breaks the list's inheritance (keeping the existing grants), gives the site's Owners group Full Control, leaves
the Members group at its level and sets ReadSecurity 2 / WriteSecurity 2. Since 1.0.0.14 each entry may also name
'fullControlGroups': the 'group' parameters whose site groups are given Full Control on that list too, so a person in
the operators group who is not a site owner reads every row and not only the rows they sent. A group this site does
not carry is reported and granted nothing, as a page permission that names it is. A list the site does not carry is
skipped with a warning. The companion flows' connection must hold Override List Behaviors on both lists (Full Control,
Design or a custom level); an Edit-level connection is trimmed to its own items.

Lists (since 1.0.0.14): before the upload, every list named in the 'lists' section of pages.json (the program
measures list the Enterprise value page reads) is ensured: a list the site does not carry is created as a generic
list with the declared description, and a list it already carries keeps its rows and its design and is given only the
columns it lacks, each added to the default view, with a unique column indexed and made unique in one call. The
section never removes or renames a column, so a tenant's rows stay readable across releases; a column that must mean
something else gets a new name in a later version instead. Rerunning changes nothing.

Page permissions (since 1.0.0.14): each page in pages.json declares 'inherit' (the site's own permissions), 'owners'
(the site's Owners group alone, as the admin dashboard and the Operations page do) or 'groups:<Name>[,<Name>]', where
each name is a parameter of kind 'group'. For the last two the script resets the page's item permissions, gives the
Owners group Full Control and each named site group Read, so SharePoint itself refuses the page to everyone else. A
group parameter that is blank, or that names a group the site does not carry, grants nobody: that page stays
owners-only and the role the group would bind stays unbound.

Instance properties (since 1.0.0.14): every front-door instance carries the properties pages.json declares for it, and
two the script composes. 'roleGroups' pairs each role with the site group of a 'group' parameter, and only the pairs
whose group this site carries are kept, so a group that is blank or not there leaves its role unbound.
'paletteOverrides' carries the Palette parameter, so a tenant's colours are a parameter and never code. Both are
written when a page is created and when an existing page's instance is updated in place.

The run ends with a summary: the pages created, updated, skipped and locked, the lists ensured and secured, the name
of the content release (the ContentRelease parameter, or the date and time of the run), and the bindings - every url,
optional and group parameter as BOUND or AWAITING, by name and kind, never by value.

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
Send every page pages.json declares that already exists to the recycle bin and rebuild it, the five form pages and the
admin dashboard included. Without it an existing page keeps its content and only its instance properties are updated.

.PARAMETER HardenMembers
Optional hardening of the intake lists: move the site Members group from Edit to Contribute on each secured list.
Contribute withholds Manage Lists (the right to change the list's design and views); it is not what makes read
security work, which rests on the Edit level withholding Override List Behaviors. Without the switch the Members
group is left at its level.

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
  [switch]$HardenMembers,
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
# What this run was actually given, recorded before a declared default is substituted, so the bindings summary at the
# end can say what the site still owes rather than what a default is standing in for.
$supplied = @{}
foreach ($name in @($definition['parameters'].Keys)) {
  $declaration = $definition['parameters'][$name]
  $kinds[$name] = [string]$declaration['kind']
  if ($kinds[$name] -notin @('text', 'url', 'optional', 'group')) { throw "Parameter '$name' in pages.json has an unknown kind '$($kinds[$name])'; expected 'text', 'url', 'optional' or 'group'." }
  if ($declaration.Contains('default') -and $kinds[$name] -ne 'optional') { throw "Parameter '$name' in pages.json declares a default, which only an 'optional' parameter may carry." }
  if (-not $values.ContainsKey($name)) { $values[$name] = '' }
  $supplied[$name] = -not [string]::IsNullOrWhiteSpace($values[$name])
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

# Pages this run does not build (1.0.0.15): a page may name a parameter in 'skipWhenBlank' (the role-start page names
# PilotTeamName), and a run without a value for it builds no page, uploads no blocks for it, puts no node in the
# navigation, and drops every tile, card and in-text link that targets it. The set is answered once, before the token
# pass, so nothing downstream can resolve a link to a page that is not there.
$skippedPages = @{}
foreach ($page in $definition['pages']) {
  if (-not ($page.Contains('skipWhenBlank'))) { continue }
  $name = [string]$page['skipWhenBlank']
  if (-not $kinds.ContainsKey($name)) { throw "Page '$($page['key'])' names an undeclared parameter '$name' in skipWhenBlank." }
  if ([string]::IsNullOrWhiteSpace([string]$values[$name])) {
    Write-Warning "The page $($page['file']) is skipped because the parameter '$name' is blank; every tile, card and link that targets it is dropped."
    $skippedPages[[string]$page['key']] = $true
  }
}

function Test-PageKept($page) {
  return -not $skippedPages.ContainsKey([string]$page['key'])
}

function Get-PageUrl([string]$key) {
  if ($skippedPages.ContainsKey($key)) { throw "pages.json links to page '$key', which this run skipped; the link must be a tile, card or in-text link the run can drop." }
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
  $skippedLink = [System.Text.RegularExpressions.MatchEvaluator] {
    param($match)
    if ($skippedPages.ContainsKey($match.Groups[2].Value)) { return $match.Groups[1].Value }
    return $match.Value
  }
  $text = [regex]::Replace($text, '\[([^\[\]]+)\]\(\{Page:([A-Za-z]+)\}\)', $skippedLink)
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

# True when an item (a tile, a card, a status line) still has its destination: it names no page this run skipped
# (1.0.0.15). A card pointing at a page that was not built would promise a link SharePoint answers with a 404, so the
# item goes and the page keeps the rest of the block.
function Test-TargetKept($item, [string]$where, [bool]$report = $true) {
  if (-not ($item -is [System.Collections.IDictionary]) -or -not $item.Contains('href')) { return $true }
  $target = [regex]::Match([string]$item['href'], '^\{Page:([A-Za-z]+)\}$')
  if (-not $target.Success -or -not $skippedPages.ContainsKey($target.Groups[1].Value)) { return $true }
  if ($report) {
    Write-Warning "The item '$($item['title'])' on $where is dropped because it targets $($target.Groups[1].Value), a page this run skipped."
  }
  return $false
}

# True when a block stays in the document: it names no parameter in 'skipWhenBlank', or the one it names has a value
# (the private-pilot notice on Start here sets skipWhenBlank to PilotTeamName, so a site without a pilot team shows none),
# and it still has an item after the items targeting a skipped page were dropped (1.0.0.15).
function Test-BlockKept($block, [string]$where) {
  if (-not ($block -is [System.Collections.IDictionary])) { return $true }
  if ($block.Contains('skipWhenBlank')) {
    $name = [string]$block['skipWhenBlank']
    if (-not $kinds.ContainsKey($name)) { throw "A block on $where names an undeclared parameter '$name' in skipWhenBlank." }
    if ([string]::IsNullOrWhiteSpace([string]$values[$name])) {
      Write-Warning "The $($block['type']) block '$($block['title'])' on $where is dropped because the parameter '$name' is blank."
      return $false
    }
  }
  if ($block.Contains('items') -and @($block['items']).Count -gt 0 -and @($block['items'] | Where-Object { Test-TargetKept $_ $where $false }).Count -eq 0) {
    Write-Warning "The $($block['type']) block on $where is dropped because every item in it targets a page this run skipped."
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
      if ($key -eq 'items' -and $node[$key] -is [System.Collections.IList]) {
        # An item pointing at a page this run skipped goes before the token pass, so its {Page:} link never resolves.
        # The filtered list is held in a variable and passed as it is: an array argument reaches the parameter whole,
        # and wrapping it (a unary comma) would hand Resolve-Node an array of one array and nest every items list.
        $keptItems = @($node[$key] | Where-Object { Test-TargetKept $_ $where })
        $resolved[$key] = Resolve-Node $keptItems $where
        continue
      }
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
# Site groups and permission levels: the 'group' parameters, resolved once (1.0.0.14)
# ---------------------------------------------------------------------------------------------------------------
# The role names are resolved by kind (Administrator, Editor, Contributor, Reader) as the admin page's grant does, so
# a site in another language gets the same levels.
$fullControlRole = (Get-PnPRoleDefinition | Where-Object { $_.RoleTypeKind -eq 'Administrator' } | Select-Object -First 1).Name
$editRole = (Get-PnPRoleDefinition | Where-Object { $_.RoleTypeKind -eq 'Editor' } | Select-Object -First 1).Name
$contributeRole = (Get-PnPRoleDefinition | Where-Object { $_.RoleTypeKind -eq 'Contributor' } | Select-Object -First 1).Name
$readRole = (Get-PnPRoleDefinition | Where-Object { $_.RoleTypeKind -eq 'Reader' } | Select-Object -First 1).Name
# A parameter of kind 'group' carries the title of a site group, which belongs to the tenant and never to pages.json.
# Each is looked up here, once, and kept under its parameter name. A blank title, or one the site does not carry, is
# reported and skipped: the run goes on, a page that names the group keeps its owners-only grant, and the role the
# group would bind stays unbound, so the person sees the protected-page wording instead of content that is not theirs.
$siteGroups = @{}
foreach ($name in @($kinds.Keys)) {
  if ($kinds[$name] -ne 'group') { continue }
  $title = [string]$values[$name]
  $group = $null
  if (-not [string]::IsNullOrWhiteSpace($title)) {
    try { $group = Get-PnPGroup -Identity $title -ErrorAction SilentlyContinue } catch { $group = $null }
  }
  if ($null -eq $group) {
    $named = if ([string]::IsNullOrWhiteSpace($title)) { 'blank' } else { "'$title'" }
    Write-Warning "The site group of '$name' ($named) is not found; page stays owners-only and the role stays unbound."
    continue
  }
  $siteGroups[$name] = $group
  Write-Host "Site group for ${name}: $title"
}

# ---------------------------------------------------------------------------------------------------------------
# Instance properties: what every front-door instance carries from the parameters (1.0.0.14)
# ---------------------------------------------------------------------------------------------------------------
# pages.json gives each instance its properties and this composes the two that are not a plain token. 'roleGroups'
# binds a role id to a site group: the definition pairs each role with a group parameter, the token pass fills in the
# titles, and only the pairs whose group this site carries are kept, so a group that is blank or not there leaves its
# role unbound instead of naming a group nobody holds. 'paletteOverrides' carries the Palette parameter, so a tenant's
# colours are a parameter and never code; blank clears the override and the shipped colours stand.
function Format-RoleGroups([string]$value) {
  $bound = @()
  foreach ($pair in ($value -split ';')) {
    $separator = $pair.IndexOf('=')
    if ($separator -lt 0) { continue }
    $roleId = $pair.Substring(0, $separator).Trim()
    $title = $pair.Substring($separator + 1).Trim()
    if ($roleId -eq '' -or $title -eq '') { continue }
    if (@($siteGroups.Values | Where-Object { [string]$_.Title -eq $title }).Count -eq 0) { continue }
    $bound += "${roleId}=${title}"
  }
  return ($bound -join ';')
}

# The property bag of one page: every property pages.json declares, tokens resolved, plus the composed ones. The page
# the script creates and the page it updates in place get the same bag, so an upgraded site ends up where a new one
# starts.
function Get-InstanceProperties($page) {
  $properties = @{}
  foreach ($name in @($page['instance'].Keys)) {
    $properties[$name] = Resolve-Text ([string]$page['instance'][$name])
  }
  if ($properties.ContainsKey('roleGroups')) { $properties['roleGroups'] = Format-RoleGroups $properties['roleGroups'] }
  $properties['paletteOverrides'] = [string]$values['Palette']
  return $properties
}

# What this run calls the content it uploads. Blank names the run by its own date and time, so a summary always says
# which content a page is showing.
$releaseId = [string]$values['ContentRelease']
if ([string]::IsNullOrWhiteSpace($releaseId)) { $releaseId = [System.DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ') }

# ---------------------------------------------------------------------------------------------------------------
# List security: item-level read and write security on the intake lists, made effective (decision 6)
# ---------------------------------------------------------------------------------------------------------------
# SharePoint bypasses item-level security (ReadSecurity 2 / WriteSecurity 2) for a principal whose permission level
# holds Override List Behaviors (shown as Override Check-Out in the Microsoft 365 permission reference). The default
# Design and Full Control levels hold it; the default Edit level of the site Members group does not. So: break the
# list's inheritance keeping its grants (Set-PnPList; Set-PnPListPermission only adds or removes roles), give the Owners
# group Full Control (they read every row, as the admin dashboard needs), give the same to every site group the
# entry's 'fullControlGroups' names (1.0.0.14: the operators group, so an operator who is not a site owner reads every
# row rather than only the rows they sent), leave the Members group at its level, then
# set the two flags last, so a run that stops part-way never trims a list before the owners can read it. Rerunning
# changes nothing: inheritance is broken once, and a role already held is not granted twice.
# The role names come from the section above, resolved by kind so a site in another language gets the same levels.
$securedLists = @()
$unsecuredLists = @()
$listSecurity = if ($definition.Contains('listSecurity')) { @($definition['listSecurity']) } else { @() }
foreach ($entry in $listSecurity) {
  $title = [string]$entry['title']
  if ([string]$entry['security'] -ne 'ownItems') {
    throw "List security for '$title' in pages.json names an unknown mode '$($entry['security'])'; expected 'ownItems'."
  }
  # The groups that read every row of this list, named as parameters and never as group titles, so nothing
  # tenant-bound is committed. A name that is not a declared 'group' parameter is an authoring mistake in pages.json
  # and stops the run before anything is changed, exactly as it does for a page's permissions.
  $fullControlGroups = if ($entry.Contains('fullControlGroups')) { @($entry['fullControlGroups']) } else { @() }
  foreach ($parameterName in $fullControlGroups) {
    if (-not $kinds.ContainsKey($parameterName) -or $kinds[$parameterName] -ne 'group') {
      throw "List security for '$title' names '$parameterName' in 'fullControlGroups', which is not a parameter of kind 'group' in pages.json."
    }
  }
  # Only a list the site already carries: the intake list comes from the package feature, the use-case list from the
  # companion solution. Neither is created here.
  $list = Get-PnPList -Identity $title -Includes HasUniqueRoleAssignments -ErrorAction SilentlyContinue
  if ($null -eq $list) {
    Write-Warning "The list '$title' is not on this site; read security not applied. Install what provisions it and rerun."
    $unsecuredLists += $title
    continue
  }
  Write-Host "Securing $title (each person reads and edits their own items; Owners: $fullControlRole) ..."
  $owners = Get-PnPGroup -AssociatedOwnerGroup
  if (-not $list.HasUniqueRoleAssignments) {
    Set-PnPList -Identity $title -BreakRoleInheritance -CopyRoleAssignments
  }
  Set-PnPListPermission -Identity $title -Group $owners -AddRole $fullControlRole
  # Item-level security trims every principal whose permission level withholds Override List Behaviors, the site's
  # owners included until the grant above; the same is true of an operator, so the role a page binds is given the list
  # right that makes the operator view whole. A group that is blank, or that this site does not carry, was reported
  # when the parameters were resolved: it is reported again here, against the list it would have read, and the run
  # goes on with the list still secured.
  foreach ($parameterName in $fullControlGroups) {
    if (-not $siteGroups.ContainsKey($parameterName)) {
      Write-Warning "The site group of '$parameterName' is not on this site; Full Control on '$title' not granted, so that role reads only its own rows."
      continue
    }
    Set-PnPListPermission -Identity $title -Group $siteGroups[$parameterName] -AddRole $fullControlRole
    Write-Host "  The site group of '$parameterName' holds $fullControlRole on $title and reads every row."
  }
  if ($HardenMembers) {
    # Hardening only: Contribute removes Manage Lists (list design and view changes) from the Members group; it is not what makes read security work.
    # Read security rests on the Edit level withholding Override List Behaviors, which Contribute withholds as well.
    $members = Get-PnPGroup -AssociatedMemberGroup
    $memberRoles = @(Get-PnPListPermissions -Identity $title -PrincipalId $members.Id -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
    if ($memberRoles -contains $editRole) {
      Set-PnPListPermission -Identity $title -Group $members -RemoveRole $editRole -AddRole $contributeRole
    } else {
      Write-Host "  Members already hold no $editRole on $title; nothing to harden."
    }
  }
  Set-PnPList -Identity $title -ReadSecurity 2 -WriteSecurity 2
  $securedLists += $title
}
if ($securedLists.Count -gt 0) {
  Write-Warning "The companion flows' connection must hold Override List Behaviors (Full Control, Design or a custom permission level) on the intake lists; an Edit-level connection is trimmed to its own items."
}

# ---------------------------------------------------------------------------------------------------------------
# Lists: the lists pages.json declares, created once and only ever added to (1.0.0.14)
# ---------------------------------------------------------------------------------------------------------------
# A list this site does not carry is created as a plain generic list; a list it already carries is kept as it is and
# given only the columns it lacks. This section never removes or renames a field: a column an earlier version created
# holds a tenant's own rows, so a declaration that no longer names it leaves it where it is, and a column that must
# mean something else gets a new name instead. Rerunning changes nothing.
# # Migration: 1.0.0.14 creates the program measures list with its nine columns. Later versions append a column to
# # that list, or declare another list; no version drops a column, renames one, or changes its type.
# The section runs before the content document is uploaded, so a page the document carries never names a list the
# site is still missing. The titles and column names come from pages.json; this script names none of them.
$ensuredLists = @()
$listTypes = @('Text', 'Note', 'Number', 'DateTime', 'Choice', 'Boolean')
$listDefinitions = if ($definition.Contains('lists')) { @($definition['lists']) } else { @() }
# The whole declaration is checked before anything is created, so a typo in the second list cannot leave the first
# one half-built.
foreach ($entry in $listDefinitions) {
  $title = [string]$entry['title']
  foreach ($field in @($entry['fields'])) {
    $internalName = [string]$field['name']
    if ($internalName -notmatch '^[A-Za-z][A-Za-z0-9]{0,31}$') {
      throw "List '$title' in pages.json declares a column '$internalName'; a column name is a letter followed by letters or digits, 32 characters at most."
    }
    if ([string]$field['type'] -notin $listTypes) {
      throw "Column '$internalName' of list '$title' in pages.json is of type '$($field['type'])'; expected 'Text', 'Note', 'Number', 'DateTime', 'Choice' or 'Boolean'."
    }
    $hasChoices = $field.Contains('choices') -and @($field['choices']).Count -gt 0
    if (([string]$field['type'] -eq 'Choice') -ne $hasChoices) {
      throw "Column '$internalName' of list '$title' in pages.json must declare 'choices' when it is a Choice column and must not declare them otherwise."
    }
  }
}
foreach ($entry in $listDefinitions) {
  $title = [string]$entry['title']
  $fields = @($entry['fields'])
  $list = Get-PnPList -Identity $title -ErrorAction SilentlyContinue
  if ($null -eq $list) {
    Write-Host "Creating list $title ..."
    # The description is written once, at creation, so a page owner's own wording is never overwritten. It is a
    # second call because New-PnPList in the pinned PnP.PowerShell takes no description; Set-PnPList does.
    New-PnPList -Title $title -Template GenericList -OnQuickLaunch:$false | Out-Null
    Set-PnPList -Identity $title -Description ([string]$entry['description'])
  } else {
    Write-Host "List $title is already on this site; adding the columns it lacks ..."
  }
  foreach ($field in $fields) {
    $internalName = [string]$field['name']
    $existing = Get-PnPField -List $title -Identity $internalName -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
      Write-Host "  $internalName is already there and is left as it is."
      continue
    }
    $required = $field.Contains('required') -and [bool]$field['required']
    if ([string]$field['type'] -eq 'Choice') {
      Add-PnPField -List $title -DisplayName $internalName -InternalName $internalName -Type Choice -Choices ([string[]]@($field['choices'])) -Required:$required -AddToDefaultView | Out-Null
    } else {
      Add-PnPField -List $title -DisplayName $internalName -InternalName $internalName -Type ([string]$field['type']) -Required:$required -AddToDefaultView | Out-Null
    }
    # A unique column must be indexed as well, so both flags are set in one call, as the feature's intake key is.
    if ($field.Contains('unique') -and [bool]$field['unique']) {
      Set-PnPField -List $title -Identity $internalName -Values @{ Indexed = $true; EnforceUniqueValues = $true }
    } elseif ($field.Contains('indexed') -and [bool]$field['indexed']) {
      Set-PnPField -List $title -Identity $internalName -Values @{ Indexed = $true }
    }
    Write-Host "  Added $internalName ($($field['type']))."
  }
  $ensuredLists += $title
}

# ---------------------------------------------------------------------------------------------------------------
# Content document: the blocks of every page that has them, resolved and uploaded to Site Assets
# ---------------------------------------------------------------------------------------------------------------
$documentPages = [ordered]@{}
foreach ($page in $definition['pages']) {
  if (-not $page.Contains('blocks')) { continue }
  if (-not (Test-PageKept $page)) { continue }
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
  # A page written for operators names its plane (Operations, Enterprise value); the web part shows codes beside
  # the plain wording there and keeps those pages out of the user plane. A page may also name the roles it is
  # written for: the site's own permissions are what actually keep it shut (the group parameters below grant the
  # same groups), and this only tells someone who does reach it whose page it is, instead of drawing blocks that
  # would mislead them.
  if ($page.Contains('plane')) { $documentPage['plane'] = [string]$page['plane'] }
  if ($page.Contains('requiredRole')) { $documentPage['requiredRole'] = @($page['requiredRole']) }
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

# ---------------------------------------------------------------------------------------------------------------
# Release and bindings: what this run published, and which of the tenant's own inputs the site holds (1.0.0.14)
# ---------------------------------------------------------------------------------------------------------------
# The operator plane renders both, so a site owner reads which content a page is showing and what the site still
# owes without opening the parameter file. A binding is answered from the same three things the end-of-run summary
# prints: the kind the definition declares, whether this run was given a value, and whether the site carries the
# group a title names. Only the name, the kind and the state travel to the document; a value never does, with the
# one exception of a qualification receipt reference, which names a record rather than holding a secret.
$document['release'] = [ordered]@{ id = $releaseId; publishedAt = [System.DateTime]::UtcNow.ToString('yyyy-MM-dd'); source = $contentPath }
$bindingRows = @()
foreach ($name in @($kinds.Keys | Sort-Object)) {
  $kind = $kinds[$name]
  if ($kind -notin @('url', 'optional', 'group')) { continue }
  $isBound = if ($kind -eq 'group') { $siteGroups.ContainsKey($name) } else { [bool]$supplied[$name] }
  $row = [ordered]@{ name = $name; kind = $kind; state = $(if ($isBound) { 'bound' } else { 'awaiting' }) }
  if ($isBound -and $name -like '*ReceiptRef') { $row['receiptRef'] = [string]$values[$name] }
  $bindingRows += $row
}
$document['bindings'] = @($bindingRows)

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
# Page permissions: 'inherit', 'owners' or 'groups:<Name>[,<Name>]'
# ---------------------------------------------------------------------------------------------------------------
# A protected page names group parameters, never a group title, so nothing tenant-bound is committed. The item's
# inheritance is reset first, because breaking it on an item that is already unique would keep stray grants from an
# earlier run; then the site's Owners group gets Full Control and each site group the parameters resolved gets Read.
# A group parameter that was blank, or that named a group the site does not carry, was reported above and grants
# nobody here, so the page stays owners-only rather than open to everyone.
function Set-PagePermission([string]$file, [string]$permissions) {
  if ([string]::IsNullOrWhiteSpace($permissions) -or $permissions -eq 'inherit') { return }
  $readers = @()
  if ($permissions -ne 'owners') {
    if ($permissions -notmatch '^groups:[A-Za-z][A-Za-z0-9]*(,[A-Za-z][A-Za-z0-9]*)*$') {
      throw "Page '$file' in pages.json declares permissions '$permissions'; expected 'inherit', 'owners' or 'groups:<Name>[,<Name>]'."
    }
    foreach ($parameterName in (($permissions -replace '^groups:', '') -split ',')) {
      if (-not $kinds.ContainsKey($parameterName) -or $kinds[$parameterName] -ne 'group') {
        throw "Page '$file' names '$parameterName' in its permissions, which is not a parameter of kind 'group' in pages.json."
      }
      if ($siteGroups.ContainsKey($parameterName)) { $readers += $siteGroups[$parameterName] }
    }
  }
  $item = Find-PageItem $file
  $owners = Get-PnPGroup -AssociatedOwnerGroup
  Set-PnPListItemPermission -List 'Site Pages' -Identity $item.Id -InheritPermissions
  Set-PnPListItemPermission -List 'Site Pages' -Identity $item.Id -Group $owners -AddRole $fullControlRole -ClearExisting
  foreach ($group in $readers) {
    Set-PnPListItemPermission -List 'Site Pages' -Identity $item.Id -Group $group -AddRole $readRole
  }
}

# ---------------------------------------------------------------------------------------------------------------
# Pages: one section, one front-door instance each
# ---------------------------------------------------------------------------------------------------------------
$created = @()
$updated = @()
$skipped = @()
$locked = @()
$notBuilt = @()
foreach ($page in $definition['pages']) {
  if (-not (Test-PageKept $page)) {
    $notBuilt += [string]$page['file']
    continue
  }
  $file = [string]$page['file']
  $pageName = $file -replace '\.aspx$', ''
  $properties = Get-InstanceProperties $page
  $existing = Find-PageItem $file
  if ($null -ne $existing -and -not $Overwrite) {
    # The page itself, and every edit made to it in the browser, is left as it is: only the properties of its
    # front-door instance are rewritten from pages.json and the page is republished, so a site upgraded from an
    # earlier version takes this version's properties without -Overwrite, which would recycle every page.
    Write-Host "Updating the front-door instance on $file in place (the page keeps its content; -Overwrite rebuilds it) ..."
    try {
      $control = @(Get-PnPPageComponent -Page $pageName | Where-Object { $_.PSObject.Properties['WebPartId'] -and (ConvertTo-GuidText ([string]$_.WebPartId)) -eq $wantedId })
      if ($control.Count -ne 1) {
        throw "the page carries $($control.Count) front-door instance(s); one was expected"
      }
      Set-PnPPageWebPart -Page $pageName -Identity $control[0].InstanceId -PropertiesJson ($properties | ConvertTo-Json -Depth 5 -Compress)
      Set-PnPPage -Identity $pageName -Publish | Out-Null
      Set-PagePermission $file ([string]$page['permissions'])
      $updated += $file
    } catch {
      Write-Warning "Skipping $file - its instance properties could not be updated ($($_.Exception.Message.Trim())). Rerun with -Overwrite to recycle the page and rebuild it from pages.json, or set the values in the instance's property pane."
      $skipped += $file
    }
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
    Add-PnPPageWebPart -Page $pageName -Component $component -Section 1 -Column 1 -Order 1 -WebPartProperties $properties | Out-Null
    # Read the control back: a web part without its component id would be saved silently and never render.
    $placed = @(Get-PnPPageComponent -Page $pageName | Where-Object { $_.PSObject.Properties['WebPartId'] -and (ConvertTo-GuidText ([string]$_.WebPartId)) -eq $wantedId })
    if ($placed.Count -ne 1) {
      throw "SharePoint did not bind the front-door component on $file (expected one control with WebPartId $wantedId)."
    }
    Set-PnPPage -Identity $pageName -Publish | Out-Null

    Set-PagePermission $file ([string]$page['permissions'])
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
  # A navigation entry for a page this run skipped is dropped, as every tile and card that targets one is.
  if ($skippedPages.ContainsKey([string]$entry['page'])) { continue }
  $node = Add-PnPNavigationNode -Location QuickLaunch -Title ([string]$entry['title']) -Url (Get-PageUrl ([string]$entry['page']))
  if ($entry.Contains('children')) {
    foreach ($child in $entry['children']) {
      if ($skippedPages.ContainsKey([string]$child['page'])) { continue }
      Add-PnPNavigationNode -Location QuickLaunch -Parent $node.Id -Title ([string]$child['title']) -Url (Get-PageUrl ([string]$child['page'])) | Out-Null
    }
  }
}
Set-PnPHomePage -RootFolderRelativeUrl "SitePages/$(Get-PageFile 'startHere')"

Write-Host ''
Write-Host "Content document: $contentPath ($($documentPages.Count) pages; earlier versions stay in its version history)"
Write-Host "Created: $($created.Count) page(s)$(if ($created.Count -gt 0) { ' - ' + ($created -join ', ') })"
Write-Host "Updated: $($updated.Count) page(s) whose instance properties were rewritten in place$(if ($updated.Count -gt 0) { ' - ' + ($updated -join ', ') })"
Write-Host "Skipped: $($skipped.Count) page(s)$(if ($skipped.Count -gt 0) { ' - ' + ($skipped -join ', ') })"
Write-Host "Locked: $($locked.Count) page(s)$(if ($locked.Count -gt 0) { ' - ' + ($locked -join ', ') })"
Write-Host "Not built: $($notBuilt.Count) page(s) skipped because the parameter they are keyed on is blank$(if ($notBuilt.Count -gt 0) { ' - ' + ($notBuilt -join ', ') })"
Write-Host "Lists: $($ensuredLists.Count) declared list(s) created or extended$(if ($ensuredLists.Count -gt 0) { ' - ' + ($ensuredLists -join ', ') }); a column an earlier version created is never removed or renamed"
Write-Host "List security: $($securedLists.Count) list(s) under item-level security$(if ($securedLists.Count -gt 0) { ' - ' + ($securedLists -join ', ') })$(if ($unsecuredLists.Count -gt 0) { '; not on this site: ' + ($unsecuredLists -join ', ') })"
# Bindings: what the pages carry from the tenant's own parameters rather than from committed content. A parameter this
# run was not given reads AWAITING, even where a declared default stands in for it, so the summary says what the site
# still owes and not what a default is covering; a group title this site does not carry reads AWAITING too, because
# the role behind it stays unbound. Only the name, the kind and the state are printed: a value belongs to the tenant
# and never goes to the console or to a log. The document carries the same answer in its 'bindings' section (see
# "Release and bindings" above), read from the same three inputs, so the console and the Operations page agree.
Write-Host "Content release: $releaseId$(if (-not $supplied['ContentRelease']) { ' (named by this run; set ContentRelease to name it yourself)' })"
Write-Host 'Bindings (every url, optional and group parameter; a value is never printed):'
foreach ($name in @($kinds.Keys | Sort-Object)) {
  $kind = $kinds[$name]
  if ($kind -notin @('url', 'optional', 'group')) { continue }
  $bound = if ($kind -eq 'group') { $siteGroups.ContainsKey($name) } else { [bool]$supplied[$name] }
  $note = ''
  if (-not $bound -and $kind -eq 'group') { $note = ' - no site group of that title, so the role stays unbound and a page that names it stays owners-only' }
  elseif (-not $bound -and $definition['parameters'][$name].Contains('default')) { $note = ' - the declared default stands in' }
  Write-Host "  ${name} (${kind}): $(if ($bound) { 'BOUND' } else { 'AWAITING' })$note"
}
# A blank GovernanceReference leaves the legacy view quoting the package's own default policy reference and every page
# view reading "reference not yet set"; fill the parameter and rerun, and the instance properties are updated in place.
$governanceBinding = if ([string]::IsNullOrWhiteSpace([string]$values['GovernanceReference'])) { 'AWAITING (blank: review requests quote the default wording until GovernanceReference is set)' } else { 'set' }
$reviewSystemBinding = if ([string]::IsNullOrWhiteSpace([string]$values['ReviewSystemName'])) { 'default wording (blank: tool guidance names the review system generically until ReviewSystemName is set)' } else { 'set' }
Write-Host "Wording: GovernanceReference $governanceBinding; ReviewSystemName $reviewSystemBinding"
Write-Host 'Navigation and home page set. Open each page once in the browser; a warning above names any tile or call to action shown as closed because its URL parameter was blank.'
if ($locked.Count -gt 0) {
  throw "$($locked.Count) page(s) were left as they were because they are locked for editing: $($locked -join ', '). Close the browser tabs that have them open, wait a few minutes, and rerun with -Overwrite."
}
