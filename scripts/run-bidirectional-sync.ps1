#Requires -Version 5.1
# Run bidirectional local MySQL ↔ Railway sync (loads railway-sync.env).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\run-bidirectional-sync.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\run-bidirectional-sync.ps1 -DryRun

param(
  [switch]$DryRun,
  [string]$Exclude = '',
  [string]$Tables = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $RepoRoot 'docs\scripts\railway-sync.env'

if (-not (Test-Path $envFile)) {
  Write-Error "Missing $envFile — copy docs\scripts\railway-sync.env.example to railway-sync.env and set passwords."
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
$logFile = Join-Path $logDir ("bidirectional-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))

$nodeArgs = @('docs/scripts/bidirectional-sync-local-railway.js')
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
