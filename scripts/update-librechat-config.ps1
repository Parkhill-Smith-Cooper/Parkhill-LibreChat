<#
.SYNOPSIS
  Push the local librechat.yaml to the Azure Files share and restart the
  Container App so the change takes effect. Use after editing mcpServers,
  endpoints, interface, etc.

.EXAMPLE
  ./scripts/update-librechat-config.ps1
#>
[CmdletBinding()]
param(
  [string]$ResourceGroup = 'rg-librechat',
  [string]$StorageAccount = 'stlibrechatmx31a9',
  [string]$ShareName = 'config',
  [string]$AppName = 'ca-librechat',
  [string]$ConfigPath = "$PSScriptRoot\..\librechat.yaml"
)

$ErrorActionPreference = 'Stop'
$azDir = 'C:\Program Files (x86)\Microsoft SDKs\Azure\CLI2\wbin'
if (Test-Path $azDir) { $env:PATH = "$azDir;$env:PATH" }
$env:PYTHONIOENCODING = 'utf-8'; $env:PYTHONUTF8 = '1'

if (-not (Test-Path $ConfigPath)) { throw "librechat.yaml not found at $ConfigPath" }

Write-Host "==> Uploading librechat.yaml to share '$ShareName' on $StorageAccount" -ForegroundColor Cyan
$key = az storage account keys list -g $ResourceGroup --account-name $StorageAccount --query "[0].value" -o tsv
az storage file upload --account-name $StorageAccount --account-key $key --share-name $ShareName --source $ConfigPath | Out-Null

Write-Host "==> Restarting $AppName (latest revision)" -ForegroundColor Cyan
$rev = az containerapp show -n $AppName -g $ResourceGroup --query "properties.latestRevisionName" -o tsv
az containerapp revision restart --name $AppName -g $ResourceGroup --revision $rev | Out-Null

Write-Host "==> Done. Tail MCP startup with:" -ForegroundColor Green
Write-Host "    az containerapp logs show -n $AppName -g $ResourceGroup --container api --tail 60 --type console"