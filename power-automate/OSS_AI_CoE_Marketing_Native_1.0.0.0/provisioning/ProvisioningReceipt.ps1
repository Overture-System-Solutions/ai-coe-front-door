# Local-only receipt helpers. No PnP commands, connections, or secrets in output.
Set-StrictMode -Version Latest
function Assert-ReceiptPath([string]$Path) {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows DPAPI is required for private recovery receipts.' }
  if ([string]::IsNullOrWhiteSpace($Path) -or -not [IO.Path]::IsPathFullyQualified($Path)) { throw 'Select an explicit absolute ReceiptPath on a private local disk.' }
  if ($Path.StartsWith('\\') -or -not (Test-Path -LiteralPath (Split-Path $Path -Parent) -PathType Container)) { throw 'ReceiptPath parent must already exist on a private local disk.' }
}
function Get-TextHash([string]$Text) {
  $sha=[Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
}
function ConvertTo-Canonical($Value) {
  if ($null -eq $Value) { return $null }
  if ($Value -is [System.Collections.IDictionary]) {
    $ordered=[ordered]@{};foreach($key in @($Value.Keys | Sort-Object)) { $ordered[$key]=ConvertTo-Canonical $Value[$key] };return $ordered
  }
  if ($Value -is [pscustomobject]) {
    $ordered=[ordered]@{};foreach($key in @($Value.PSObject.Properties | ForEach-Object { $_.Name } | Sort-Object)) { $ordered[$key]=ConvertTo-Canonical $Value.$key };return $ordered
  }
  if ($Value -is [array]) { $array=@(foreach($item in $Value){ConvertTo-Canonical $item});return ,$array }
  return $Value
}
function Get-ObjectHash($Value) { Get-TextHash (ConvertTo-Json -InputObject (ConvertTo-Canonical $Value) -Depth 60 -Compress) }
function Write-PrivateReceipt([string]$Path,$Payload,$Metadata) {
  # DPAPI binds ciphertext integrity/confidentiality to this Windows user+machine.
  $json=ConvertTo-Json -InputObject $Payload -Depth 60 -Compress
  $secure=ConvertTo-SecureString -String $json -AsPlainText -Force
  try { $encrypted=ConvertFrom-SecureString -SecureString $secure } finally { $secure.Dispose() }
  $document=[ordered]@{version=1;protection='Windows-DPAPI-CurrentUser';createdAt=[DateTime]::UtcNow.ToString('o');payload=$encrypted}
  foreach($key in $Metadata.Keys){$document[$key]=$Metadata[$key]}
  $bytes=[Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $document -Depth 60))
  # CreateNew refuses receipt reuse; Flush(true) precedes all subsequent side effects.
  $stream=[IO.FileStream]::new($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough)
  try { $stream.Write($bytes,0,$bytes.Length);$stream.Flush($true) } finally { $stream.Dispose() }
}
function Read-PrivateReceipt([string]$Path) {
  $doc=Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  if($doc.version -ne 1 -or $doc.protection -ne 'Windows-DPAPI-CurrentUser'){throw 'Unsupported receipt protection.'}
  $secure=ConvertTo-SecureString -String $doc.payload
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) | ConvertFrom-Json) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secure.Dispose() }
}
function Get-AuthorizedConnection([string]$SiteUrl) {
  $uri=$null
  if(-not [Uri]::TryCreate($SiteUrl,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment){throw 'Explicit HTTPS SiteUrl without credentials/query/fragment required.'}
  $connection=Get-PnPConnection -ErrorAction Stop
  if($null -eq $connection -or ([string]$connection.Url).TrimEnd('/') -ne $SiteUrl.TrimEnd('/')){throw 'The existing authenticated PnP connection does not match SiteUrl.'}
  return $connection
}
