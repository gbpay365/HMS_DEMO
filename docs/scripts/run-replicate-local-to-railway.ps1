# Load railway-sync.env and run full local → Railway replication.
# Usage:
#   powershell -ExecutionPolicy Bypass -File docs\scripts\run-replicate-local-to-railway.ps1
#   powershell -ExecutionPolicy Bypass -File docs\scripts\run-replicate-local-to-railway.ps1 --Exclude tbl_patient,tbl_employee

param(
  [switch]$DryRun,
  [string]$Exclude = '',
  [string]$Tables = ''
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
$logFile = Join-Path $logDir ("replicate-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))

$nodeArgs = @('docs/scripts/replicate-local-to-railway.js')
if ($DryRun) { $nodeArgs += '--dry-run' }
if ($Exclude) { $nodeArgs += @('--exclude', $Exclude) }
if ($Tables) { $nodeArgs += @('--tables', $Tables) }

Push-Location $RepoRoot
try {
  & node @nodeArgs *>&1 | Tee-Object -FilePath $logFile
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Log: $logFile"
} finally {
  Pop-Location
}
