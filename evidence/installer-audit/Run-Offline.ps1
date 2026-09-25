$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$files=@(
 'sharepoint/pages/one-page/New-FrontDoorAppPage.ps1',
 'sharepoint/pages/one-page/New-FrontDoorDraftList.ps1',
 'sharepoint/pages/one-page/ProvisioningReceipt.ps1',
 'tests/audit-provisioning.ps1',
 'tests/audit-draft-provisioning.ps1'
)
$parsed=@()
foreach($file in $files){
 $tokens=$null;$parseErrors=$null
 [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root $file),[ref]$tokens,[ref]$parseErrors)|Out-Null
 if(@($parseErrors).Count -gt 0){throw ('Syntax failed: '+$file+': '+($parseErrors|Out-String))}
 $parsed+=$file
}
$pageResult= & (Join-Path $root 'tests/audit-provisioning.ps1') | ConvertFrom-Json
$draftResult= & (Join-Path $root 'tests/audit-draft-provisioning.ps1') | ConvertFrom-Json
if($pageResult.status -ne 'PASS' -or $draftResult.status -ne 'PASS'){throw 'Offline suite did not pass'}
$hashes=@{}
foreach($file in $files+@('sharepoint/pages/one-page/app-page.json','sharepoint/pages/one-page/parameters.sample.json','src/provisioning/onePageDefinition.test.ts')){
 $hashes[$file]=(Get-FileHash -LiteralPath (Join-Path $root $file) -Algorithm SHA256).Hash.ToLowerInvariant()
}
$result=[ordered]@{status='PASS';scope='OFFLINE fake PnP only; Windows DPAPI exercised';powershellVersion=$PSVersionTable.PSVersion.ToString();parsed=$parsed;page=$pageResult;draft=$draftResult;hashes=$hashes;liveQualified=$false;generatedAt=[DateTime]::UtcNow.ToString('o')}
$result|ConvertTo-Json -Depth 20|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'offline-results.json') -Encoding utf8
$result|ConvertTo-Json -Depth 20
