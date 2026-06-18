#Requires -Version 5.1
<#
.SYNOPSIS
  ZAIZENS / ZAIZENS HMS — nightly backup (MySQL + uploads + config).

.DESCRIPTION
  Run via Windows Task Scheduler as a privileged account (not svc-hms).
  Reads MySQL credentials from a secured options file — never pass passwords on the command line.

.PARAMETER DataRoot
  Root folder for backups and uploads (default D:\HMS-Data).

.PARAMETER EnvFile
  Path to HMS .env (for DB_NAME / DB_USER only — password comes from mysql options file).

.PARAMETER MysqlOptionsFile
  Path to MySQL client options file containing [client] user/password (chmod 600 equivalent ACL).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\zaizens-hms-backup.ps1
#>
param(
  [string]$DataRoot = 'D:\HMS-Data',
  [string]$EnvFile = 'C:\Program Files\ZAIZENS\HMS\.env',
  [string]$MysqlOptionsFile = 'D:\HMS-Data\hms-backups\mysql-backup.cnf',
  [string]$UploadsPath = 'D:\HMS-Data\uploads',
  [int]$KeepDaily = 30,
  [int]$KeepWeekly = 12
)

$ErrorActionPreference = 'Stop'
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$logDir = Join-Path $DataRoot 'hms-backups\logs'
$mysqlDir = Join-Path $DataRoot 'mysql-backups'
$uploadDir = Join-Path $DataRoot 'uploads-backups'
$configDir = Join-Path $DataRoot 'hms-backups\config'
$logFile = Join-Path $logDir "backup-$stamp.log"

function Write-Log($msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Add-Content -Path $logFile -Value $line -Encoding UTF8
  Write-Host $line
}

function Read-EnvVar($name) {
  if (-not (Test-Path $EnvFile)) { throw "Missing .env: $EnvFile" }
  $line = Get-Content $EnvFile | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  $val = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
  return $val
}

function Find-MysqlDump {
  $candidates = @(
    'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqldump.exe',
    'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe',
    'C:\xampp\mysql\bin\mysqldump.exe'
  )
  foreach ($p in $candidates) { if (Test-Path $p) { return $p } }
  $found = Get-Command mysqldump -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }
  throw 'mysqldump not found. Install MySQL client tools.'
}

foreach ($d in @($logDir, $mysqlDir, $uploadDir, $configDir)) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
}

Write-Log 'ZAIZENS HMS backup started'

$dbName = Read-EnvVar 'DB_NAME'
if (-not $dbName) { $dbName = 'hms_demo' }

if (-not (Test-Path $MysqlOptionsFile)) {
  throw "MySQL options file missing: $MysqlOptionsFile — create from docs Section 18.6"
}

$mysqldump = Find-MysqlDump
$sqlOut = Join-Path $mysqlDir "hms_demo_$stamp.sql"
Write-Log "Dumping database $dbName -> $sqlOut"

& $mysqldump `
  --defaults-extra-file="$MysqlOptionsFile" `
  --single-transaction --routines --triggers --events `
  --set-gtid-purged=OFF `
  --result-file="$sqlOut" `
  $dbName

if ($LASTEXITCODE -ne 0) { throw "mysqldump failed with exit code $LASTEXITCODE" }
Write-Log "Database dump OK ($('{0:N1}' -f ((Get-Item $sqlOut).Length / 1MB)) MB)"

if (Test-Path $UploadsPath) {
  $dest = Join-Path $uploadDir $stamp
  Write-Log "Mirroring uploads $UploadsPath -> $dest"
  & robocopy $UploadsPath $dest /MIR /R:2 /W:5 /NFL /NDL /NP /LOG+:$logFile | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
  Write-Log 'Uploads mirror OK'
} else {
  Write-Log "WARN: uploads path not found: $UploadsPath"
}

if (Test-Path $EnvFile) {
  Copy-Item $EnvFile (Join-Path $configDir "env_$stamp.env") -Force
  Write-Log 'Config snapshot copied'
}

# Retention — daily .sql files
Get-ChildItem $mysqlDir -Filter 'hms_demo_*.sql' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $KeepDaily |
  ForEach-Object { Remove-Item $_.FullName -Force; Write-Log "Purged old dump: $($_.Name)" }

# Retention — upload mirror folders (keep N most recent)
Get-ChildItem $uploadDir -Directory |
  Sort-Object Name -Descending |
  Select-Object -Skip 7 |
  ForEach-Object { Remove-Item $_.FullName -Recurse -Force; Write-Log "Purged old uploads backup: $($_.Name)" }

Write-Log 'ZAIZENS HMS backup completed successfully'
