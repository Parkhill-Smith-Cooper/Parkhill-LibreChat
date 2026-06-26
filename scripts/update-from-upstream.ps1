<#
.SYNOPSIS
  Sync this fork's main with upstream danny-avila/LibreChat.

.DESCRIPTION
  Fetches upstream, merges upstream/main into local main, and reports any
  conflicts. Branding assets are the only expected conflict; resolve by keeping
  ours. See CUSTOMIZATIONS.md for the full fork policy.

.EXAMPLE
  ./scripts/update-from-upstream.ps1
  ./scripts/update-from-upstream.ps1 -Push
#>
[CmdletBinding()]
param(
  [switch]$Push
)

$ErrorActionPreference = 'Stop'

function Assert-CleanTree {
  $status = git status --porcelain
  if ($status) {
    Write-Host "Working tree is not clean. Commit or stash first:" -ForegroundColor Red
    git status -s
    exit 1
  }
}

Write-Host "==> Verifying remotes" -ForegroundColor Cyan
$upstream = (git remote get-url upstream 2>$null)
if (-not $upstream) {
  Write-Host "No 'upstream' remote. Add it with:" -ForegroundColor Red
  Write-Host "  git remote add upstream https://github.com/danny-avila/LibreChat.git"
  exit 1
}

Assert-CleanTree

Write-Host "==> Fetching upstream" -ForegroundColor Cyan
git fetch upstream --tags

git checkout main

$behind = (git rev-list --count main..upstream/main)
Write-Host "==> main is $behind commit(s) behind upstream/main" -ForegroundColor Cyan
if ($behind -eq '0') {
  Write-Host "Already up to date. Nothing to merge." -ForegroundColor Green
  exit 0
}

Write-Host "==> New upstream commits:" -ForegroundColor Cyan
git log --oneline main..upstream/main | Select-Object -First 30

Write-Host "==> Merging upstream/main" -ForegroundColor Cyan
git merge --no-edit upstream/main
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Merge conflict. Expected only on branding assets — keep ours, e.g.:" -ForegroundColor Yellow
  Write-Host "  git checkout --ours client/public/assets/logo.svg"
  Write-Host "  git add client/public/assets/logo.svg"
  Write-Host "Then: git commit --no-edit"
  exit 1
}

Write-Host "==> Merge clean." -ForegroundColor Green

if ($Push) {
  Write-Host "==> Pushing to origin/main" -ForegroundColor Cyan
  git push origin main
} else {
  Write-Host "Review, then push with: git push origin main" -ForegroundColor Cyan
}