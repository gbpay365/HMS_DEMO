# Create ZAIZENS-branded demo copy at C:\HMS_DEMO from HMS_JS
# Usage: powershell -ExecutionPolicy Bypass -File scripts\create-hms-demo.ps1

$ErrorActionPreference = 'Stop'
$Source = Split-Path $PSScriptRoot -Parent
$Target = 'C:\HMS_DEMO'

Write-Host '=== ZAIZENS HMS Demo Setup ===' -ForegroundColor Cyan
Write-Host "Source: $Source"
Write-Host "Target: $Target"

if (Test-Path $Target) {
  Write-Host 'Removing existing demo folder...' -ForegroundColor Yellow
  Remove-Item $Target -Recurse -Force
}

New-Item -ItemType Directory -Path $Target -Force | Out-Null

$excludeDirs = @('node_modules', '.git', 'tmp', 'dist', 'Update', 'backups', '.cursor')
$xd = ($excludeDirs | ForEach-Object { "/XD", "$Source\$_" }) -join ' '

Write-Host 'Copying application files (robocopy)...' -ForegroundColor Yellow
$robocopyArgs = @(
  $Source, $Target,
  '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/NP',
  '/XD', (Join-Path $Source 'node_modules'), (Join-Path $Source '.git'), (Join-Path $Source 'tmp'),
  (Join-Path $Source 'dist'), (Join-Path $Source 'Update'), (Join-Path $Source '.cursor'),
  (Join-Path $Source 'database\backups'),
  '/XF', 'hms_export.sql'
)
& robocopy @robocopyArgs | Out-Null
# robocopy exit 0-7 = success
if ($LASTEXITCODE -gt 7) { throw "robocopy failed with exit $LASTEXITCODE" }

# Skip large SQL backups inside database
$backupDir = Join-Path $Target 'database\backups'
if (Test-Path $backupDir) {
  Remove-Item $backupDir -Recurse -Force
}

Write-Host 'Rebranding TSSF / ZAIZENS / SOA -> ZAIZENS...' -ForegroundColor Yellow
node (Join-Path $Source 'scripts\rebrand-hms-demo.mjs') $Target
if ($LASTEXITCODE -ne 0) { throw 'rebrand script failed' }

$demoEnv = @"
# ZAIZENS HMS - Demo installation (C:\HMS_DEMO)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=hms_demo

SESSION_SECRET=zaizens-demo-session-secret-change-me
PORT=3004

# Branding - all facility-facing names show ZAIZENS
HMS_BRAND_NAME=ZAIZENS
HMS_PRODUCT_NAME=ZAIZENS Integrated HMS
HMS_LOGIN_SUBTITLE=An integrated HMS
HMS_BRAND_TAGLINE=Digital Intelligence. Redefined.
HMS_FACILITY_LEGAL_NAME=ZAIZENS
HMS_FACILITY_NAME=ZAIZENS Demo Hospital
HMS_ORG_NAME=ZAIZENS
HMS_BRAND_WEBSITE=https://www.zaizens.com/
HMS_LOGO_PATH=/img/zaizens-brand.svg
HMS_FAVICON_PATH=/img/zaizens-favicon.svg
HMS_SLIP_HEADER=ZAIZENS
HMS_PATIENT_CODE_PREFIX=ZAI
HMS_PATIENT_CODE_SUFFIX=ZNS

# Copy LICENSE_* keys from your dev .env if license checks are required
"@

Set-Content -Path (Join-Path $Target '.env') -Value $demoEnv -Encoding UTF8

$sqlPath = Join-Path $Target 'database\demo-rebrand.sql'
$sql = @"
-- Run after importing or cloning DB for demo branding (MySQL)
UPDATE tbl_facility SET name = 'ZAIZENS', code = 'MAIN' WHERE id = 1;
UPDATE tbl_facility SET name = 'ZAIZENS Branch' WHERE id = 2 AND name LIKE '%TSSF%';

-- Financial settings org name (if table exists)
UPDATE tbl_hms_fin_setting SET setting_value = 'ZAIZENS'
 WHERE setting_key IN ('company.legal_name', 'company.name') AND setting_value LIKE '%TSSF%';

SELECT id, code, name FROM tbl_facility;
"@
Set-Content -Path $sqlPath -Value $sql -Encoding UTF8

$readme = @"
ZAIZENS HMS — Demo Installation
================================

Location: C:\HMS_DEMO
Default URL: http://localhost:3004

Quick start
-----------
1. Create MySQL database:  CREATE DATABASE hms_demo CHARACTER SET utf8mb4;
2. Import your HMS schema/data (or copy from existing `hms` DB).
3. Run branding SQL:  mysql -u root hms_demo < database\demo-rebrand.sql
4. Install dependencies:
     cd C:\HMS_DEMO
     npm install
     npm install --prefix frontend --include=dev
5. Start demo server:
     npm start
6. Open http://localhost:3004 and hard-refresh (Ctrl+F5).

Branding
--------
All TSSF / ZAIZENS / SOA facility names are rebranded to ZAIZENS via:
  - .env HMS_* variables
  - Code defaults in lib/hmsBrand.js
  - database/demo-rebrand.sql for existing DB rows

Patient ID format: ZAI-000001-ZNS (demo prefix/suffix).

To refresh demo from source:
  powershell -ExecutionPolicy Bypass -File C:\HMS_JS\scripts\create-hms-demo.ps1
"@
Set-Content -Path (Join-Path $Target 'DEMO-README.txt') -Value $readme -Encoding UTF8

Write-Host ''
Write-Host 'Demo ready at' $Target -ForegroundColor Green
Write-Host 'See DEMO-README.txt for setup steps.' -ForegroundColor Green
