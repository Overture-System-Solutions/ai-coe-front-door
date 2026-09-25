param([string]$ScriptPath = (Join-Path $PSScriptRoot '../sharepoint/pages/one-page/New-FrontDoorAppPage.ps1'))
$ErrorActionPreference='Stop'
$global:AuditRoot=Join-Path $PSScriptRoot ('../evidence/installer-audit/page-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $global:AuditRoot | Out-Null
$global:Receipt=Join-Path $global:AuditRoot 'create'
$global:AuditPage=[pscustomobject]@{ Exists=$false; Controls=@(); Writes=@(); Reads=0; Denied=$false; BadReadback=$false }
function Assert($condition,$message) { if(-not $condition){throw $message} }
function Assert-Refused([scriptblock]$action,[string]$pattern) { try { & $action | Out-Null } catch { if($_.Exception.Message -notmatch $pattern){throw};return };throw 'Expected refusal' }
function Get-PnPConnection { $global:AuditPage.Reads++; [pscustomobject]@{ Url='https://example.invalid/sites/test' } }
function Get-PnPHomePage { param($Connection,$ErrorAction) 'SitePages/Home.aspx' }
function Get-PnPListItem { param($List,$Query,$Fields,$Connection,$ErrorAction) if($global:AuditPage.Denied){throw '403 denied'};if($global:AuditPage.Exists){[pscustomobject]@{Id=1}} }
function Get-PnPPageComponent { param($Page,[switch]$ListAvailable,$Connection,$ErrorAction) if($ListAvailable){[pscustomobject]@{Id='cf2e5904-0703-4fe4-ae5a-ec012d6fa689'}}else{$global:AuditPage.Controls} }
function Register-Write($operation) { Assert (Test-Path ($global:Receipt+'.prepared.json')) 'Missing durable prepared receipt before mutation'; $global:AuditPage.Writes+=$operation }
function Add-PnPPage { param($Name,$Title,$LayoutType,$HeaderLayoutType,$CommentsEnabled,$Connection,$ErrorAction) Register-Write 'page';$global:AuditPage.Exists=$true }
function Add-PnPPageSection { param($Page,$SectionTemplate,$Order,$Connection,$ErrorAction) Register-Write 'section' }
function Add-PnPPageWebPart { param($Page,$Component,$Section,$Column,$Order,$WebPartProperties,$Connection,$ErrorAction) Register-Write 'webpart';$global:AuditPage.Controls+=([pscustomobject]@{WebPartId='cf2e5904-0703-4fe4-ae5a-ec012d6fa689';InstanceId='11111111-1111-4111-8111-111111111111';PropertiesJson=($WebPartProperties|ConvertTo-Json -Depth 30 -Compress)}) }
function Set-PnPPageWebPart { param($Page,$Identity,$PropertiesJson,$Connection,$ErrorAction) Register-Write 'properties';$control=@($global:AuditPage.Controls|Where-Object InstanceId -eq $Identity)[0];$control.PropertiesJson=if($global:AuditPage.BadReadback){'{}'}else{$PropertiesJson} }
function Remove-PnPPageComponent { param($Page,$InstanceId,[switch]$Force,$Connection,$ErrorAction) Assert (Test-Path ($global:Receipt+'.rollback-prepared.json')) 'Rollback intent not durable';$global:AuditPage.Writes+='remove-component';$global:AuditPage.Controls=@($global:AuditPage.Controls|Where-Object InstanceId -ne $InstanceId) }
function Set-PnPPage { throw 'Publishing is outside component-only scope' }
$checks=0
$errors=$null;$tokens=$null;[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $ScriptPath),[ref]$tokens,[ref]$errors)|Out-Null
Assert (@($errors).Count -eq 0) 'PowerShell syntax errors';$checks++
& $ScriptPath -DryRun | Out-Null
Assert ($global:AuditPage.Writes.Count -eq 0 -and $global:AuditPage.Reads -eq 0) 'DryRun touched PnP';$checks++
& $ScriptPath -ApplyToSite -ConfirmLiveApply -SiteUrl 'https://example.invalid/sites/test' -ReceiptPath $global:Receipt | Out-Null
Assert ($global:AuditPage.Exists -and @($global:AuditPage.Controls).Count -eq 1) 'Additive apply failed'
$appliedReceiptDoc=Get-Content ($global:Receipt+'.applied.json') -Raw | ConvertFrom-Json
Assert ($appliedReceiptDoc.readbackVerified -and $appliedReceiptDoc.configHash -match '^[a-f0-9]{64}$') 'Applied receipt lacks readback/hash';$checks++
& $ScriptPath -Rollback -ConfirmLiveRollback -SiteUrl 'https://example.invalid/sites/test' -ReceiptPath $global:Receipt | Out-Null
Assert ($global:AuditPage.Exists -and $global:AuditPage.Controls.Count -eq 0) 'Rollback must leave page intact and remove only created instance';$checks++
$global:AuditPage.Controls=@([pscustomobject]@{WebPartId='cf2e5904-0703-4fe4-ae5a-ec012d6fa689';InstanceId='11111111-1111-4111-8111-111111111111';PropertiesJson='{"view":"app","draftListId":"configured-list","draftPolicyJson":"private-policy","draftServiceUrl":"https://example.invalid/private?secret=do-not-log","custom":{"x":1}}'},[pscustomobject]@{WebPartId='other';InstanceId='other-instance';PropertiesJson='{"keep":true}'})
$before=$global:AuditPage.Controls[0].PropertiesJson
$global:Receipt=Join-Path $global:AuditRoot 'update'
& $ScriptPath -ApplyToSite -ConfirmLiveApply -SiteUrl 'https://example.invalid/sites/test' -ReceiptPath $global:Receipt | Out-Null
$actual=$global:AuditPage.Controls[0].PropertiesJson | ConvertFrom-Json
Assert ($actual.draftListId -eq 'configured-list' -and $actual.draftPolicyJson -eq 'private-policy' -and $actual.draftServiceUrl -match 'do-not-log' -and $actual.custom.x -eq 1) 'Blank template erased configured properties';$checks++
Assert ((Get-Content ($global:Receipt+'.prepared.json') -Raw) -notmatch 'do-not-log|private-policy') 'Secret leaked into receipt';$checks++
$applied=$global:AuditPage.Controls[0].PropertiesJson
$global:AuditPage.Controls[0].PropertiesJson='{"view":"app","changed":true}'
Assert-Refused { & $ScriptPath -Rollback -ConfirmLiveRollback -SiteUrl 'https://example.invalid/sites/test' -ReceiptPath $global:Receipt } 'drift';$checks++
$global:AuditPage.Controls[0].PropertiesJson=$applied
& $ScriptPath -Rollback -ConfirmLiveRollback -SiteUrl 'https://example.invalid/sites/test' -ReceiptPath $global:Receipt | Out-Null
Assert ($global:AuditPage.Controls[0].PropertiesJson -eq $before -and $global:AuditPage.Controls[1].PropertiesJson -eq '{"keep":true}') 'Rollback did not restore exact prior bag/preserve unrelated control';$checks++
$global:Receipt=Join-Path $global:AuditRoot 'moved'
$global:AuditPage.Controls[0] | Add-Member NoteProperty Order 1 -Force
& $ScriptPath -ApplyToSite -ConfirmLiveApply -SiteUrl 'https://example.invalid/sites/test' -ReceiptPath $global:Receipt | Out-Null
$global:AuditPage.Controls[0].Order=3
Assert-Refused { & $ScriptPath -Rollback -ConfirmLiveRollback -SiteUrl 'https://example.invalid/sites/test' -ReceiptPath $global:Receipt } 'drift';$checks++
Assert-Refused { & $ScriptPath -ApplyToSite -SiteUrl 'https://example.invalid/sites/test' } 'not authorized';$checks++
$global:Receipt=Join-Path $global:AuditRoot 'denied';$global:AuditPage.Denied=$true;$count=$global:AuditPage.Writes.Count
Assert-Refused { & $ScriptPath -ApplyToSite -ConfirmLiveApply -SiteUrl 'https://example.invalid/sites/test' -ReceiptPath $global:Receipt } '403'
Assert ($global:AuditPage.Writes.Count -eq $count) '403 caused mutation';$checks++
$global:AuditPage.Denied=$false
Assert-Refused { & $ScriptPath -ApplyToSite -ConfirmLiveApply -SiteUrl 'https://elsewhere.invalid' -ReceiptPath $global:Receipt } 'connection';$checks++
$global:Receipt=Join-Path $global:AuditRoot 'bad-readback';$global:AuditPage.BadReadback=$true
Assert-Refused { & $ScriptPath -ApplyToSite -ConfirmLiveApply -SiteUrl 'https://example.invalid/sites/test' -ReceiptPath $global:Receipt } 'readback'
Assert ((Test-Path ($global:Receipt+'.prepared.json')) -and -not (Test-Path ($global:Receipt+'.applied.json'))) 'Failed readback wrongly marked applied';$checks++
[pscustomobject]@{status='PASS';scope='Offline fake PnP only';checks=$checks;receiptDirectory=$global:AuditRoot;liveQualified=$false} | ConvertTo-Json -Compress
