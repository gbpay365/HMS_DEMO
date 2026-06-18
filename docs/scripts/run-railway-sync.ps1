# Load railway-sync.env then run MySQL sync to Railway.
# See docs/MYSQL-REPLICATION-LOCAL-TO-RAILWAY.html

$ErrorActionPreference = "Stop"
$envFile = Join-Path $PSScriptRoot "railway-sync.env"
if (-not (Test-Path $envFile)) {
  Write-Error "Missing $envFile — copy from docs/MYSQL-REPLICATION-LOCAL-TO-RAILWAY.html Section 5.1"
}

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  if ($_ -match '^([^=]+)=(.*)$') {
    $name = $matches[1].Trim()
    $value = $matches[2].Trim().Trim('"')
    Set-Item -Path "Env:$name" -Value $value
  }
}

$logDir = "D:\HMS-Backups\railway-sync\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ("sync-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))

Push-Location (Split-Path $PSScriptRoot -Parent | Split-Path -Parent)
try {
  node scripts/sync-mysql-to-railway.js *>&1 | Tee-Object -FilePath $logFile
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Log: $logFile"
} finally {
  Pop-Location
}
