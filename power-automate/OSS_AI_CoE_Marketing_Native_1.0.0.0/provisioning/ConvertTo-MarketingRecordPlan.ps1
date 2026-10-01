<#
.SYNOPSIS
Validate non-authorizing controlled input and prepare exact create-only canonical rows OFFLINE.
.DESCRIPTION
Never reads/writes SharePoint, enables membership or issues PASS evidence. Only disabled members,
revoked authorities/sources, expired INCONCLUSIVE qualification and non-PASS receipts are supported.
An approved register is intentionally not manufactured here. The existing writer's separately
approved governance process is required for active records and real authenticated approvals.
#>
[CmdletBinding(PositionalBinding=$false)]
param([Parameter(Mandatory)][string]$InputPath,[int]$WriterPrincipalId,[string]$ExpectedWriterActorId,
 [switch]$DryRun,[switch]$WritePlan,[string]$PlanPath)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($DryRun -and $WritePlan){throw 'DryRun and WritePlan cannot be combined.'}
$raw=Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8
if([Text.Encoding]::UTF8.GetByteCount($raw) -gt 1000000){throw 'Controlled input exceeds offline bound.'}
try{$valid=Test-Json -Json $raw -SchemaFile (Join-Path $PSScriptRoot 'controlled-inputs.schema.json') -ErrorAction Stop}catch{throw 'Controlled input schema rejected; no authority or plan produced.'}
if(-not $valid){throw 'Controlled input schema rejected.'}
$input=ConvertFrom-Json -InputObject $raw -AsHashtable -Depth 50
if($input.records.Count -gt 0 -and ($WriterPrincipalId -le 0 -or $ExpectedWriterActorId -notmatch '^[^\s@]+@[^\s@]+$')){throw 'Explicit independently verified writer ID/actor required for nonempty candidate input; never inferred from a UPN hint.'}
$helper=Join-Path $PSScriptRoot 'ProvisioningReceipt.ps1'
if((Get-FileHash $helper -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'de862638c455939a7dfb634498fb5d1117ce3d1592b066dee11db0d93a98b48a'){throw 'Pinned DPAPI/hash helper changed.'}
. $helper
$keys=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$memberActors=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$rows=@()
foreach($record in $input.records){
 $key=$record.Key;$value=$record.Value
 if(-not $keys.Add($key)){throw 'Duplicate controlled record key.'}
 $prefix,$suffix=$key.Split(':',2)
 switch($prefix){
  'member' {
   if(-not $memberActors.Add($value.actorId)){throw 'Duplicate actor mapped to multiple member principals.'}
   if([long]$suffix -gt [int]::MaxValue -or [long]$suffix -eq $WriterPrincipalId -or $value.actorId -eq $ExpectedWriterActorId){throw 'Writer cannot be a business participant; invalid or overlapping member principal.'}
  }
  'authority' {
   if($suffix -cne $value.bindingRef -or $value.tenantScope -cne $input.siteUrl){throw 'Authority key/tenant binding mismatch.'}
   if([DateTimeOffset]::Parse($value.expiresAt) -gt [DateTimeOffset]::UtcNow){throw 'Bootstrap authorities must remain revoked and expired; no active approval fabricated.'}
  }
  'source' {
   if($value.entry.location -match '(?i)%2f|%5c|%2e|%25|\\|/\.{1,2}/'){throw 'Ambiguous encoded/traversal source path refused; no silent path repair.'}
   $uri=[uri]$value.entry.location;$site=[uri]$input.siteUrl
   if($suffix -cne $value.entry.id -or $uri.GetLeftPart([UriPartial]::Authority) -cne $site.GetLeftPart([UriPartial]::Authority) -or -not $uri.AbsolutePath.StartsWith($site.AbsolutePath+'/',[StringComparison]::Ordinal) -or $uri.UserInfo -or $uri.Query -or $uri.Fragment){throw 'Source key/location must be exact same-site plain text.'}
   if($value.actors -contains $ExpectedWriterActorId){throw 'Writer cannot be a business source participant.'}
  }
  'qualification' {if([DateTimeOffset]::Parse($value.expiresAt) -gt [DateTimeOffset]::UtcNow){throw 'Bootstrap qualification must be expired/INCONCLUSIVE.'}}
  'receipt' {if($suffix -cne $value.receiptId){throw 'Receipt key/identity mismatch.'}}
 }
 $json=ConvertTo-Json -InputObject $value -Depth 40 -Compress
 if($json.Length -gt 60000){throw 'Controlled RecordJson exceeds conservative Note-field bound; native limits remain a gate.'}
 $rows+=@([ordered]@{Key=$key;ExpectedVersion=$null;Fields=[ordered]@{Title=(Get-TextHash ($input.siteUrl+"`n"+$key));RecordKey=$key;TenantScope=$input.siteUrl;RecordJson=$json;RecordHash=(Get-TextHash $json)}})
}
$plan=[ordered]@{kind='marketing.controlled-record-plan.v1';planOnly=$true;siteUrl=$input.siteUrl;enabled=$false;qualified=$false;readbackVerified=$false;authorityVerified=$false;rows=$rows;note='NOT authorization or tenant evidence. Requires separate controller review, current identity/source evidence, sole-writer serialization, successful absence checks and exact readback. Never use bootstrap INCONCLUSIVE records as approvals.'}
if($WritePlan){Assert-ReceiptPath $PlanPath;Write-PrivateReceipt $PlanPath $plan @{status='offline-plan-only';qualified=$false;recordCount=$rows.Count;contentHash=(Get-ObjectHash $plan)}}
[pscustomobject]@{Mode=$(if($WritePlan){'PrivatePlanWritten'}else{'DryRun'});SchemaValid=$true;Enabled=$false;Qualified=$false;NativeOperations=0;RecordCount=$rows.Count}
