# Load railway-sync.env and run selective table sync (local ↔ Railway).
# Usage:
#   powershell -ExecutionPolicy Bypass -File docs\scripts\run-sync-local-railway.ps1 -Preset all-config
#   powershell -ExecutionPolicy Bypass -File docs\scripts\run-sync-local-railway.ps1 -Preset catalog -Preset specialisation
#   powershell -ExecutionPolicy Bypass -File docs\scripts\run-sync-local-railway.ps1 -Tables tbl_service_catalog,tbl_role
#   powershell -ExecutionPolicy Bypass -File docs\scripts\run-sync-local-railway.ps1 -Preset acl -Direction railway-to-local

param(
  [string[]]$Preset = @(),
  [string]$Tables = '',
  [ValidateSet('local-to-railway', 'railway-to-local')]
  [string]$Direction = 'local-to-railway',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = $PSScriptRoot
$RepoRoot = Split-Path $ScriptRoot -Parent | Split-Path -Parent
$envFile = Join-Path $ScriptRoot 'railway-sync.env'

if (-not (Test-Path $envFile)) {
  Write-Error "Missing $envFile — copy from railway-sync.env.example and set RAILWAY_MYSQL_PASSWORD."
}

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  if ($_ -match '^([^=]+)=(.*)$') {
    $name = $matches[1].Trim()
    $value = $matches[2].Trim().Trim('"')
    Set-Item -Path "Env:$name" -Value $value
  }
}

$logDir = Join-Path $RepoRoot 'tmp\railway-sync-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ("sync-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))

$nodeArgs = @('docs/scripts/sync-local-railway.js', '--direction', $Direction)
foreach ($p in $Preset) {
  if ($p) { $nodeArgs += @('--preset', $p) }
}
if ($Tables) { $nodeArgs += @('--tables', $Tables) }
if ($DryRun) { $nodeArgs += '--dry-run' }

Push-Location $RepoRoot
try {
  & node @nodeArgs *>&1 | Tee-Object -FilePath $logFile
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Log: $logFile"
} finally {
  Pop-Location
}
