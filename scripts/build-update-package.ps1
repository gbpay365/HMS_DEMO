# Build a full dev→production update folder at C:\HMS_JS\Update
# Usage: powershell -ExecutionPolicy Bypass -File scripts\build-update-package.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$UpdateDir = Join-Path $Root 'Update'

Write-Host '=== ZAIZENS HMS update package ===' -ForegroundColor Cyan
Write-Host "Root: $Root"

Set-Location $Root
Write-Host 'Building UI bundles...' -ForegroundColor Yellow
npm run build:ui
if ($LASTEXITCODE -ne 0) { throw 'build:ui failed' }

Write-Host 'Building deployment package...' -ForegroundColor Yellow
node scripts/build-deploy-package.js
if ($LASTEXITCODE -ne 0) { throw 'build-deploy-package failed' }

$DeployDir = Join-Path $Root 'dist\hms-deploy'
if (-not (Test-Path $DeployDir)) { throw "Deploy folder missing: $DeployDir" }

# Verify critical UI bundles exist before copying
$required = @(
  'public\dist\hms-ui.js',
  'public\dist\hms-login.js',
  'public\dist\hms-print.js',
  'app.js'
)
foreach ($rel in $required) {
  $p = Join-Path $DeployDir $rel
  if (-not (Test-Path $p)) { throw "Deploy package missing required file: $rel" }
}

if (Test-Path $UpdateDir) {
  Write-Host "Removing old Update folder..." -ForegroundColor Yellow
  Remove-Item $UpdateDir -Recurse -Force
}

Write-Host "Copying to $UpdateDir ..." -ForegroundColor Yellow
robocopy $DeployDir $UpdateDir /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit $LASTEXITCODE" }

$readme = @"
ZAIZENS HMS — FULL UPDATE (dev = production)
=============================================
Built: $(Get-Date -Format 'yyyy-MM-dd HH:mm')

CRITICAL: This package includes public/dist/hms-ui.js (React frontend).
Without it, the deployed app shows OLD UI even when backend files update.

ON PRODUCTION SERVER
--------------------
1. Stop service:  nssm stop ZAIZENS-HMS

2. Backup (recommended):
   robocopy "C:\Program Files\ZAIZENS\HMS" "C:\Program Files\ZAIZENS\HMS-backup-$(Get-Date -Format yyyyMMdd)" /E

3. Apply update — OVERWRITE ALL (do NOT use /XO):
   robocopy C:\HMS_JS\Update "C:\Program Files\ZAIZENS\HMS" /E /IS /IT /XF .env

   /IS /IT forces same or newer files to copy even if timestamps differ.

4. Keep server .env — never overwrite from dev.

5. Start service:  nssm start ZAIZENS-HMS

6. Hard refresh browser: Ctrl+F5 (or clear cache for hms-ui.js)

VERIFY after deploy
-------------------
- File exists: C:\Program Files\ZAIZENS\HMS\public\dist\hms-ui.js
- Size should be ~1.5 MB and dated today
- Pharmacy → Dispensing tab shows Dispensed / Awaiting toggle
"@
Set-Content -Path (Join-Path $UpdateDir 'UPDATE-README.txt') -Value $readme -Encoding UTF8

$ui = Get-Item (Join-Path $UpdateDir 'public\dist\hms-ui.js')
$fileCount = (Get-ChildItem $UpdateDir -Recurse -File).Count
$sizeMb = [math]::Round(((Get-ChildItem $UpdateDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)

Write-Host ''
Write-Host 'Update package ready:' -ForegroundColor Green
Write-Host "  $UpdateDir"
Write-Host "  Files: $fileCount"
Write-Host "  Size:  ${sizeMb} MB"
Write-Host "  hms-ui.js: $([math]::Round($ui.Length/1KB)) KB  $($ui.LastWriteTime)"
Write-Host ''
Write-Host 'Copy Update folder to production server, then run robocopy per UPDATE-README.txt' -ForegroundColor Cyan
