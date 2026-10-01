<# Offline local template generator. No PnP, no credentials, no approvals or tenant writes. #>
[CmdletBinding(PositionalBinding=$false)]
param([switch]$DryRun,[switch]$WriteTemplates,[string]$OutputDirectory,
 [string]$SiteUrl='https://osscontact.sharepoint.com/sites/CloudWaveDashboardDemo')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($DryRun -and $WriteTemplates){throw 'DryRun and WriteTemplates cannot be combined.'}
if($SiteUrl -cnotmatch '^https://[^\s/?#@]+\.sharepoint\.com/(sites|teams)/[A-Za-z0-9_-]+$'){throw 'Exact HTTPS SharePoint site URL required; no normalization.'}
if(-not $WriteTemplates){[pscustomobject]@{Mode='DryRun';Enabled=$false;Qualified=$false;NativeOperations=0;Note='Local disabled templates only. Use WriteTemplates to an explicit new private directory.'};return}
if([string]::IsNullOrWhiteSpace($OutputDirectory) -or -not [IO.Path]::IsPathFullyQualified($OutputDirectory) -or (Test-Path -LiteralPath $OutputDirectory)){throw 'Select an absolute NEW private output directory; no overwrite allowed.'}
$config=[ordered]@{enabled=$false;siteUrl=$SiteUrl;canonicalListId='';requestListId='';resultListId='';writerPrincipalId=$null;readRoleDefinitionId=1073741826;qualificationReceiptRef='';controllerQualified=$false;securityQualified=$false;provider=@{model='';qualificationReceiptRef=''}}
$inputTemplate=[ordered]@{kind='marketing.bootstrap-input.v1';siteUrl=$SiteUrl;records=@()}
$commissioning=[ordered]@{kind='marketing.commissioning-checklist.v1';siteUrl=$SiteUrl;enabled=$false;qualified=$false;controllerQualified=$false;securityQualified=$false;retentionQualified=$false;historicalResultRevocationTested=$false;lifecycleEnforcementImplemented=$false;providerQualified=$false;hostedHelperQualified=$false;hostedFlowQualified=$false;writerIdentityVerified=$false;writerHint='samuel.conrad@osscontact.com';writerHintIsPermissionEvidence=$false;participantIdentitiesVerified=$false;qualificationReceiptRef='';policyRef='';policyOwnerBindingRef='';retentionDays=$null;revocationSlaMinutes=$null;retentionEnforcementRef='';acceptedEvidenceRefs=@();note='This is an unqualified checklist, NOT an approval/qualification receipt. Metadata does not remove historical result Read grants or purge data.'}
$documents=[ordered]@{'config.template.json'=$config;'controlled-inputs.template.json'=$inputTemplate;'commissioning.template.json'=$commissioning}
New-Item -ItemType Directory -Path $OutputDirectory -ErrorAction Stop|Out-Null
foreach($name in $documents.Keys){
 $bytes=[Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $documents[$name] -Depth 50))
 $stream=[IO.FileStream]::new((Join-Path $OutputDirectory $name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
[pscustomobject]@{Mode='TemplatesWritten';Enabled=$false;Qualified=$false;NativeOperations=0;Directory=$OutputDirectory;Files=@($documents.Keys)}
