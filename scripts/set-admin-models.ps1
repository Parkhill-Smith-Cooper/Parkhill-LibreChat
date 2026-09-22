<#
.SYNOPSIS
  Apply, inspect, or remove the ADMIN-only model overlay.

.DESCRIPTION
  Models listed in scripts/admin-models.json are exposed through a custom endpoint
  that exists ONLY in the ADMIN role's config override document. Non-admins never
  receive it in their resolved config, so the models are absent from the model
  selector and rejected by validateModel if requested directly. See CUSTOMIZATIONS.md
  section 5.

  Auth note: this fork logs in via Entra ID only (ALLOW_EMAIL_LOGIN=false), so the
  script cannot sign in for you. You need TWO things from an admin browser session,
  and they must come from the SAME request:
    1. Sign in to LibreChat as an ADMIN user.
    2. Open DevTools (F12) > Network tab.
    3. Click any request to /api/... (reload the page if the list is empty).
    4. Under Request Headers, copy the value after "Authorization: Bearer " -> -Token
    5. From the same Request Headers, copy the whole "Cookie:" value  -> -Cookie

  Why the cookie is required: with OPENID_REUSE_TOKENS=true the access token is
  RS256, signed by Entra. requireJwtAuth only validates that with the 'openidJwt'
  strategy, and it decides to use that strategy from the token_provider /
  openid_user_id cookies -- not from the Authorization header. Send the header
  alone and it falls back to the local HS256 'jwt' strategy, which rejects an
  Entra token with 401.

  The access token lives in memory (an axios default header), NOT in localStorage,
  which is why the Network tab is the place to read it. Both values are short-lived:
  on a 401, reload the app and re-copy both.

.EXAMPLE
  $tok = '<Authorization value, without "Bearer ">'
  $ck  = '<full Cookie header value>'
  ./scripts/set-admin-models.ps1 -Token $tok -Cookie $ck -Action Show

.EXAMPLE
  ./scripts/set-admin-models.ps1 -Token $tok -Cookie $ck -Action Apply

.EXAMPLE
  ./scripts/set-admin-models.ps1 -Token $tok -Cookie $ck -Action Apply -BaseUrl https://ca-librechat.<region>.azurecontainerapps.io

.EXAMPLE
  ./scripts/set-admin-models.ps1 -Token $tok -Cookie $ck -Action Remove
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Token,
  # Required when signing in through Entra ID (OPENID_REUSE_TOKENS=true). The access
  # token is then RS256, signed by Entra, and the server only validates it with the
  # 'openidJwt' strategy -- which it selects from the `token_provider` and
  # `openid_user_id` COOKIES, not the Authorization header. Without them the server
  # falls back to the local HS256 'jwt' strategy and rejects the token with 401.
  # Copy the whole Cookie request header from the same DevTools request as the token.
  [string]$Cookie,
  [ValidateSet('Apply', 'Show', 'Remove')]
  [string]$Action = 'Show',
  # Defaults to local dev. For production, pass the Container App URL explicitly:
  #   -BaseUrl https://<ca-librechat-fqdn>
  # Find it with: az containerapp show -n ca-librechat -g rg-librechat --query properties.configuration.ingress.fqdn -o tsv
  [string]$BaseUrl = 'http://localhost:3080',
  [string]$ConfigPath = "$PSScriptRoot\admin-models.json",
  [int]$Priority = 100
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$uri = "$($BaseUrl.TrimEnd('/'))/api/admin/config/role/ADMIN"
$headers = @{ Authorization = "Bearer $($Token.Trim())" }

# Replay the browser's auth cookies so the server picks the openidJwt strategy.
$session = $null
if ($Cookie) {
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $cookieHost = ([Uri]$BaseUrl).Host
  foreach ($pair in ($Cookie -split ';')) {
    $kv = $pair.Trim() -split '=', 2
    if ($kv.Count -eq 2 -and $kv[0].Trim()) {
      $c = New-Object System.Net.Cookie($kv[0].Trim(), $kv[1].Trim(), '/', $cookieHost)
      try { $session.Cookies.Add($c) } catch { Write-Verbose "Skipped cookie $($kv[0])" }
    }
  }
  $names = ($session.Cookies.GetCookies("$([Uri]$BaseUrl)") | ForEach-Object { $_.Name })
  if ($names -notcontains 'token_provider' -or $names -notcontains 'openid_user_id') {
    Write-Warning "Cookie header has no 'token_provider'/'openid_user_id'. If this is an Entra login, the request will 401 - re-copy the full Cookie header."
  }
}

function Invoke-AdminApi {
  param(
    [string]$Method,
    [string]$Json
  )
  $params = @{
    Uri         = $uri
    Method      = $Method
    Headers     = $headers
    ContentType = 'application/json; charset=utf-8'
  }
  if ($session) { $params.WebSession = $session }
  if ($Json) { $params.Body = [System.Text.Encoding]::UTF8.GetBytes($Json) }
  try {
    return Invoke-RestMethod @params
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      # PS 5.1 usually buffers the error body here; fall back to the raw stream.
      $body = $_.ErrorDetails.Message
      if (-not $body) {
        try {
          $reader = New-Object IO.StreamReader($resp.GetResponseStream())
          $body = $reader.ReadToEnd()
        } catch { $body = '<no response body>' }
      }
      $code = [int]$resp.StatusCode
      if ($code -eq 404) {
        return [pscustomobject]@{ __notFound = $true; body = $body }
      }
      if ($code -eq 401) {
        $hint = if ($Cookie) {
          "The token or cookies are expired. Reload LibreChat and re-copy BOTH from the same request."
        } else {
          "No -Cookie was supplied. This deployment uses Entra ID (OPENID_REUSE_TOKENS=true), so the Authorization header alone is not enough - the server needs the token_provider/openid_user_id cookies to validate an Entra-signed token. Re-run with -Cookie '<full Cookie header>'."
        }
        throw "401 Unauthorized. $hint Body: $body"
      }
      if ($code -eq 403) {
        throw "403 Forbidden - the account lacks 'access:admin' or 'manage:configs'. Body: $body"
      }
      throw "HTTP $code from $Method $uri. Body: $body"
    }
    throw
  }
}

if ($Action -eq 'Show') {
  Write-Host "==> Reading ADMIN config override from $BaseUrl" -ForegroundColor Cyan
  $current = Invoke-AdminApi -Method 'GET'
  if ($current.__notFound) {
    Write-Host 'No ADMIN override exists yet - no admin-only models are configured.' -ForegroundColor Yellow
    Write-Host 'Auth worked (the server reached the database and found nothing).'
    Write-Host 'Create it with:  -Action Apply'
    exit 0
  }
  $current | ConvertTo-Json -Depth 20
  exit 0
}

if ($Action -eq 'Remove') {
  Write-Host "==> Removing the ADMIN config override at $BaseUrl" -ForegroundColor Yellow
  Write-Host "    Admin-only endpoints disappear for everyone; public models are untouched."
  $confirm = Read-Host "    Type 'yes' to continue"
  if ($confirm -ne 'yes') { Write-Host 'Aborted.' -ForegroundColor Red; exit 1 }
  $result = Invoke-AdminApi -Method 'DELETE'
  if ($result.__notFound) {
    Write-Host '==> Nothing to remove - no ADMIN override exists.' -ForegroundColor Yellow
    exit 0
  }
  Write-Host '==> Removed.' -ForegroundColor Green
  exit 0
}

if (-not (Test-Path $ConfigPath)) { throw "Overlay file not found at $ConfigPath" }

$overrides = Get-Content $ConfigPath -Raw | ConvertFrom-Json

# Strip documentation-only keys ("_comment", "_note", ...) at every level. The admin
# API stores the overrides document verbatim, so anything left here persists in Mongo.
function Remove-DocKeys {
  param($Node)
  if ($Node -is [System.Collections.IEnumerable] -and $Node -isnot [string]) {
    foreach ($item in $Node) { Remove-DocKeys -Node $item }
    return
  }
  if ($Node -is [PSCustomObject]) {
    foreach ($key in @($Node.PSObject.Properties.Name)) {
      if ($key.StartsWith('_')) {
        $Node.PSObject.Properties.Remove($key)
      } else {
        Remove-DocKeys -Node $Node.$key
      }
    }
  }
}
Remove-DocKeys -Node $overrides

$names = @()
foreach ($endpoint in $overrides.endpoints.custom) {
  $models = $endpoint.models.default -join ', '
  $names += "      - $($endpoint.name): $models"
}
if ($names.Count -eq 0) { throw "No custom endpoints found in $ConfigPath - nothing to apply." }

Write-Host "==> Applying ADMIN-only endpoints to $BaseUrl" -ForegroundColor Cyan
$names | ForEach-Object { Write-Host $_ }

$payload = @{ overrides = $overrides; priority = $Priority } | ConvertTo-Json -Depth 20
Invoke-AdminApi -Method 'PUT' -Json $payload | Out-Null

Write-Host '==> Applied. The admin API invalidated the config caches, so this is live now.' -ForegroundColor Green
Write-Host ''
Write-Host 'Verify:' -ForegroundColor Green
Write-Host "  As an admin:     curl -H 'Authorization: Bearer <admin-jwt>' $BaseUrl/api/endpoints"
Write-Host "  As a normal user: the same call must NOT list the endpoints above,"
Write-Host '                    and a chat request naming one must be rejected.'
