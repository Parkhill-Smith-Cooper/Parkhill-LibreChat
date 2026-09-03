<#
.SYNOPSIS
  Build the patched ms-365-mcp-server image (outlook-mcp sidecar) into ACR.

.DESCRIPTION
  Clones upstream at $Version, applies no-protected-resource-metadata.patch, and
  builds into the Parkhill ACR as ms365-mcp:<version>-pk.<n>.

  Re-run this on every upstream bump. If the patch no longer applies, read the
  patch header - it explains what it does and why - and re-apply by hand.

.EXAMPLE
  ./docker/outlook-mcp/build.ps1 -Version v0.146.2 -Suffix pk.1
#>
[CmdletBinding()]
param(
  [string]$Version  = 'v0.146.2',
  [string]$Suffix   = 'pk.1',
  [string]$Registry = 'parkhilllibrechat',
  [string]$Repo     = 'ms365-mcp'
)

$ErrorActionPreference = 'Stop'
$azDir = 'C:\Program Files (x86)\Microsoft SDKs\Azure\CLI2\wbin'
if (Test-Path $azDir) { $env:PATH = "$azDir;$env:PATH" }
$env:PYTHONIOENCODING = 'utf-8'; $env:PYTHONUTF8 = '1'

$patch = Join-Path $PSScriptRoot 'no-protected-resource-metadata.patch'
if (-not (Test-Path $patch)) { throw "patch not found: $patch" }

$work = Join-Path ([System.IO.Path]::GetTempPath()) "ms365-build-$(Get-Random)"
Write-Host "==> Cloning upstream $Version" -ForegroundColor Cyan
git clone --depth 1 --branch $Version https://github.com/softeria/ms-365-mcp-server.git $work

Write-Host "==> Applying Parkhill patch" -ForegroundColor Cyan
Push-Location $work
git apply --verbose $patch
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "patch failed to apply - see docker/outlook-mcp/README.md" }
Pop-Location

$tag = "$($Version.TrimStart('v'))-$Suffix"
Write-Host "==> Building $Repo`:$tag into $Registry" -ForegroundColor Cyan
az acr build --registry $Registry --image "$Repo`:$tag" --no-logs $work

Remove-Item $work -Recurse -Force
Write-Host "==> Done: $Registry.azurecr.io/$Repo`:$tag" -ForegroundColor Green
Write-Host "    Point the outlook-mcp container at it, e.g. via az containerapp update --yaml"
