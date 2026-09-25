<#
.SYNOPSIS
Additive, component-only installer and guarded rollback. Dry-run by default.
.DESCRIPTION
No QuickLaunch replacement, no page recycling, no content upload, no ACL changes, no publishing.
Apply and rollback require separate explicit authorization and an already authenticated matching PnP connection.
ReceiptPath is an operator-selected absolute filename prefix in an existing private local directory.
Prepared/applied receipts contain DPAPI-encrypted recovery data; retain them on the same Windows account/machine.
Incomplete prepared receipts require manual reconciliation, never blind replay. Use an exclusive editing window.
#>
[CmdletBinding(PositionalBinding = $false)]
param(
  [switch]$DryRun, [switch]$CheckBindings, [switch]$ApplyToSite, [switch]$ConfirmLiveApply,
  [switch]$Rollback, [switch]$ConfirmLiveRollback,
  [string]$ParameterFile=(Join-Path $PSScriptRoot 'parameters.sample.json'),
  [string]$DefinitionFile=(Join-Path $PSScriptRoot 'app-page.json'),
  [string]$SiteUrl, [string]$ReceiptPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'ProvisioningReceipt.ps1')
if($ApplyToSite -and -not $ConfirmLiveApply){throw 'ApplyToSite is not authorized without ConfirmLiveApply.'}
if($Rollback -and -not $ConfirmLiveRollback){throw 'Rollback is not authorized without ConfirmLiveRollback.'}
if(($ApplyToSite -and $Rollback) -or ($DryRun -and ($ApplyToSite -or $Rollback))){throw 'Select only one operation.'}
if(-not $ApplyToSite -and -not $Rollback){$DryRun=$true}
function Read-Controls([string]$Name) { @(Get-PnPPageComponent -Page $Name -Connection $connection -ErrorAction Stop) }
function Read-Bag($Control) {
  if(-not $Control.PSObject.Properties['PropertiesJson'] -or [string]::IsNullOrWhiteSpace([string]$Control.PropertiesJson)){throw 'Existing properties unreadable; refusing mutation.'}
  $bag=([string]$Control.PropertiesJson)|ConvertFrom-Json
  if($null -eq $bag -or $bag -isnot [pscustomobject]){throw 'Property bag must be a JSON object.'}
  return $bag
}
function Get-ControlSnapshot($Control) {
  # Do not serialize native PnP object graphs (they include page/context cycles).
  $snapshot=@{instanceId=[string]$Control.InstanceId}
  foreach($key in @('WebPartId','Order','ControlType','DataVersion','Text','JsonControlData','CanvasControlData')) {
    if($Control.PSObject.Properties[$key]){$snapshot[$key]=$Control.$key}
  }
  if($Control.PSObject.Properties['PropertiesJson']){$snapshot.properties=Read-Bag $Control}
  foreach($key in @('Section','Column')){
    if($Control.PSObject.Properties[$key] -and $null -ne $Control.$key){$snapshot[$key]=[int]$Control.$key.Order}
  }
  return $snapshot
}
function Get-ControlsHash($Controls) { Get-ObjectHash @(foreach($control in @($Controls)){if($null -ne $control){Get-ControlSnapshot $control}}) }
if($Rollback){
  Assert-ReceiptPath $ReceiptPath
  $saved=Read-PrivateReceipt ($ReceiptPath+'.applied.json')
  if($saved.kind -ne 'page' -or $saved.siteUrl -ne $SiteUrl -or $saved.file -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*\.aspx$'){throw 'Receipt does not match authorized page/site.'}
  $connection=Get-AuthorizedConnection $SiteUrl
  $name=$saved.file -replace '\.aspx$',''
  $controls=Read-Controls $name
  $target=@($controls|Where-Object { [string]$_.InstanceId -eq $saved.instanceId })
  if($target.Count -ne 1 -or [string]$target[0].WebPartId -ne $saved.componentId){throw 'Rollback instance identity drift.'}
  if((Get-ObjectHash (Read-Bag $target[0])) -ne $saved.afterHash -or (Get-ControlsHash $target) -ne $saved.afterControlHash){throw 'Post-apply component drift: refusing rollback.'}
  $otherHash=Get-ControlsHash @($controls|Where-Object { [string]$_.InstanceId -ne $saved.instanceId })
  Write-PrivateReceipt ($ReceiptPath+'.rollback-prepared.json') $saved @{status='rollback-prepared';configHash=$saved.configHash;contentHash=$saved.afterHash}
  if($saved.hadInstance){
    Set-PnPPageWebPart -Page $name -Identity $saved.instanceId -PropertiesJson $saved.beforeJson -Connection $connection -ErrorAction Stop | Out-Null
  } else {
    Remove-PnPPageComponent -Page $name -InstanceId $saved.instanceId -Force -Connection $connection -ErrorAction Stop | Out-Null
  }
  $after=Read-Controls $name
  $target=@($after|Where-Object { [string]$_.InstanceId -eq $saved.instanceId })
  if($saved.hadInstance){
    if($target.Count -ne 1 -or (Get-ObjectHash (Read-Bag $target[0])) -ne $saved.beforeHash){throw 'Rollback readback unconfirmed; reconcile manually.'}
  } elseif($target.Count -ne 0){throw 'Rollback removal readback unconfirmed.'}
  if((Get-ControlsHash @($after|Where-Object { [string]$_.InstanceId -ne $saved.instanceId })) -ne $otherHash){throw 'Unrelated component drift during rollback; reconcile manually.'}
  Write-PrivateReceipt ($ReceiptPath+'.rolled-back.json') $saved @{status='rolled-back';readbackVerified=$true;configHash=$saved.configHash;contentHash=$saved.beforeHash}
  Write-Output 'Rollback confirmed. Page, navigation and unrelated components retained; not published.'
  return
}
$definition=Get-Content -LiteralPath $DefinitionFile -Raw -Encoding UTF8 | ConvertFrom-Json
$values=Get-Content -LiteralPath $ParameterFile -Raw -Encoding UTF8 | ConvertFrom-Json
if(@($definition.pages).Count -ne 1 -or $definition.pages[0].instance.view -ne 'app'){throw 'Expected exactly one app page.'}
$page=$definition.pages[0]
function Get-ParamValue([string]$Name) { $p=$values.PSObject.Properties[$Name];if($null -eq $p -or $null -eq $p.Value){return ''};return [string]$p.Value }
function Resolve-Tokens([string]$Text) { [regex]::Replace($Text,'\{([A-Za-z][A-Za-z0-9]*)\}',{param($m) Get-ParamValue $m.Groups[1].Value}) }
$file=Resolve-Tokens $page.file
if($file -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*\.aspx$'){throw 'PageFile must name one .aspx file, not a path or URL.'}
if($DryRun -or $CheckBindings){
  foreach($p in $definition.parameters.PSObject.Properties){$state=if([string]::IsNullOrWhiteSpace((Get-ParamValue $p.Name))){'AWAITING'}else{'BOUND'};Write-Output ($p.Name+': '+$state)}
}
if($DryRun){Write-Output 'Dry-run: no connections or writes. No QuickLaunch replacement, page recycling, list or permission changes.';return}
Assert-ReceiptPath $ReceiptPath
foreach($suffix in @('.prepared.json','.applied.json','.rollback-prepared.json','.rolled-back.json')){if(Test-Path -LiteralPath ($ReceiptPath+$suffix)){throw 'ReceiptPath already used; reconcile before retry.'}}
$connection=Get-AuthorizedConnection $SiteUrl
$name=$file -replace '\.aspx$',''
$componentId=([string]$definition.componentId).Trim('{}').ToLowerInvariant()
$guid=[guid]::Empty;if(-not [guid]::TryParse($componentId,[ref]$guid)){throw 'Invalid component ID.'}
$homePageFile=(Get-PnPHomePage -Connection $connection -ErrorAction Stop) -replace '^SitePages/',''
$component=@(Get-PnPPageComponent -Page $homePageFile -ListAvailable -Connection $connection -ErrorAction Stop|Where-Object {([string]$_.Id).Trim('{}').ToLowerInvariant() -eq $componentId})
if($component.Count -ne 1){throw 'Expected exactly one installed SPFx component.'}
$query="<View><Query><Where><Eq><FieldRef Name='FileLeafRef'/><Value Type='Text'>$file</Value></Eq></Where></Query><RowLimit>2</RowLimit></View>"
# Never catch a denied read as absence.
$existing=@(Get-PnPListItem -List 'Site Pages' -Query $query -Fields 'FileLeafRef' -Connection $connection -ErrorAction Stop)
if($existing.Count -gt 1){throw 'Ambiguous page identity.'}
$created=$existing.Count -eq 0
$all=if($created){@()}else{@(Read-Controls $name)}
$controls=@($all|Where-Object {$_.PSObject.Properties['WebPartId'] -and ([string]$_.WebPartId).Trim('{}').ToLowerInvariant() -eq $componentId})
if($controls.Count -gt 1){throw 'Ambiguous front-door instances.'}
$hadInstance=$controls.Count -eq 1
$beforeJson=if($hadInstance){[string]$controls[0].PropertiesJson}else{'{}'}
$before=if($hadInstance){Read-Bag $controls[0]}else{[pscustomobject]@{}}
$properties=@{};foreach($p in $before.PSObject.Properties){$properties[$p.Name]=$p.Value}
foreach($p in $page.instance.PSObject.Properties){
  $value=if($p.Value -is [string]){Resolve-Tokens $p.Value}else{$p.Value}
  $bindings=if($p.Value -is [string]){@([regex]::Matches($p.Value,'\{([A-Za-z][A-Za-z0-9]*)\}'))}else{@()}
  # A missing optional binding never clears already configured state, including grouped role bindings.
  if($properties.ContainsKey($p.Name) -and @($bindings).Count -gt 0 -and @($bindings|Where-Object { [string]::IsNullOrWhiteSpace((Get-ParamValue $_.Groups[1].Value)) }).Count -gt 0){continue}
  $properties[$p.Name]=$value
}
$beforeHash=Get-ObjectHash $before;$expectedHash=Get-ObjectHash $properties
$configHash=Get-ObjectHash @{definition=$definition;parameters=$values}
$state=@{kind='page';siteUrl=$SiteUrl;file=$file;componentId=$componentId;created=$created;hadInstance=$hadInstance;instanceId=if($hadInstance){[string]$controls[0].InstanceId}else{''};beforeJson=$beforeJson;beforeHash=$beforeHash;afterHash=$expectedHash;configHash=$configHash}
$other=@($all|Where-Object {[string]$_.InstanceId -ne $state.instanceId})
$otherHash=Get-ControlsHash $other
Write-PrivateReceipt ($ReceiptPath+'.prepared.json') $state @{status='prepared';configHash=$configHash;contentHash=$beforeHash;intendedContentHash=$expectedHash}
if($created){
  Add-PnPPage -Name $name -Title (Resolve-Tokens $page.title) -LayoutType Article -HeaderLayoutType NoImage -CommentsEnabled:([bool]$page.commentsEnabled) -Connection $connection -ErrorAction Stop|Out-Null
  Add-PnPPageSection -Page $name -SectionTemplate OneColumn -Order 1 -Connection $connection -ErrorAction Stop|Out-Null
}
if($hadInstance){Set-PnPPageWebPart -Page $name -Identity $state.instanceId -PropertiesJson ($properties|ConvertTo-Json -Depth 60 -Compress) -Connection $connection -ErrorAction Stop|Out-Null}
else {
  $lastOrder=0;foreach($control in @($all)){if($null -ne $control -and $control.PSObject.Properties['Order']){$lastOrder=[Math]::Max($lastOrder,[int]$control.Order)}}
  Add-PnPPageWebPart -Page $name -Component $component[0] -Section 1 -Column 1 -Order ($lastOrder+1) -WebPartProperties $properties -Connection $connection -ErrorAction Stop|Out-Null
}
$allAfter=Read-Controls $name
$readback=@($allAfter|Where-Object {$_.PSObject.Properties['WebPartId'] -and ([string]$_.WebPartId).Trim('{}').ToLowerInvariant() -eq $componentId})
if($readback.Count -ne 1 -or (Get-ObjectHash (Read-Bag $readback[0])) -ne $expectedHash){throw 'Page property readback failed; prepared receipt retained for reconciliation.'}
if($hadInstance -and [string]$readback[0].InstanceId -ne $state.instanceId){throw 'Instance readback drift.'}
$state.instanceId=[string]$readback[0].InstanceId
$state.afterControlHash=Get-ControlsHash $readback
if((Get-ControlsHash @($allAfter|Where-Object {[string]$_.InstanceId -ne $state.instanceId})) -ne $otherHash){throw 'Unrelated control readback drift.'}
Write-PrivateReceipt ($ReceiptPath+'.applied.json') $state @{status='applied';readbackVerified=$true;configHash=$configHash;contentHash=$expectedHash}
Write-Output 'Applied and read back. DPAPI recovery receipts saved. Not published; no live qualification asserted.'
