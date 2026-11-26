<#
.SYNOPSIS
  Sync this fork's main with upstream danny-avila/LibreChat.

.DESCRIPTION
  Fetches upstream, merges upstream/main into local main, and reports any
  conflicts. Expected conflicts are branding assets and the client files listed in
  CUSTOMIZATIONS.md section 4; resolve by keeping ours. See CUSTOMIZATIONS.md for
  the full fork policy.

.EXAMPLE
  ./scripts/update-from-upstream.ps1
  ./scripts/update-from-upstream.ps1 -Push
  ./scripts/update-from-upstream.ps1 -Ref v0.8.9   # merge a release tag
#>
[CmdletBinding()]
param(
  [switch]$Push,
  # What to merge: a release tag (recommended, e.g. v0.8.9) or upstream/main.
  [string]$Ref = 'upstream/main'
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

$behind = (git rev-list --count "main..$Ref")
Write-Host "==> main is $behind commit(s) behind $Ref" -ForegroundColor Cyan
if ($behind -eq '0') {
  Write-Host "Already up to date. Nothing to merge." -ForegroundColor Green
  exit 0
}

Write-Host "==> New upstream commits:" -ForegroundColor Cyan
git log --oneline "main..$Ref" | Select-Object -First 30

Write-Host "==> Merging $Ref" -ForegroundColor Cyan
git merge --no-edit $Ref
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Merge conflict. Expected on branding assets and the upstream files listed in" -ForegroundColor Yellow
  Write-Host "CUSTOMIZATIONS.md (sections 4, 6, 7 and 11: ChatForm.tsx, useChatFunctions.ts," -ForegroundColor Yellow
  Write-Host "Image.tsx, callbacks.js, translation.json, packages/api index + package.json)." -ForegroundColor Yellow
  Write-Host "Re-apply each hook as those sections describe; for assets keep ours, e.g.:" -ForegroundColor Yellow
  Write-Host "  git checkout --ours client/public/assets/logo.svg"
  Write-Host "  git add client/public/assets/logo.svg"
  Write-Host "Lockfile: take theirs, then npm install to re-add mssql."
  Write-Host "Then: git commit --no-edit"
  Write-Host "Finally, verify the fork's guarded behavior survived the merge:"
  Write-Host "  cd client; npx jest src/components/Parkhill Error.spec"
  Write-Host "  cd packages/api; npx jest src/parkhill"
  Write-Host "  cd api; npx jest parkhillRoutedModel"
  exit 1
}

Write-Host "==> Merge clean." -ForegroundColor Green

if ($Push) {
  Write-Host "==> Pushing to origin/main" -ForegroundColor Cyan
  git push origin main
} else {
  Write-Host "Review, then push with: git push origin main" -ForegroundColor Cyan
}