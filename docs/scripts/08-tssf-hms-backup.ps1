#Requires -Version 5.1
<#
  ZAIZENS / ZAIZENS HMS — nightly backup (MySQL + uploads + config).
  See docs/scripts/README.md
#>
param(
  [string]$DataRoot = 'D:\HMS-Data',
  [string]$EnvFile = 'C:\Program Files\ZAIZENS\HMS\.env',
  [string]$MysqlOptionsFile = 'D:\HMS-Data\hms-backups\mysql-backup.cnf',
  [string]$UploadsPath = 'D:\HMS-Data\uploads',
  [int]$KeepDaily = 30
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
  return ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
}

function Find-MysqlDump {
  @(
    'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqldump.exe',
    'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe'
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}

foreach ($d in @($logDir, $mysqlDir, $uploadDir, $configDir)) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
}

Write-Log 'ZAIZENS HMS backup started'
$dbName = Read-EnvVar 'DB_NAME'
if (-not $dbName) { $dbName = 'hms_demo' }

if (-not (Test-Path $MysqlOptionsFile)) {
  Copy-Item (Join-Path $PSScriptRoot '03-mysql-backup.cnf') $MysqlOptionsFile -Force
  Write-Log "Copied default mysql-backup.cnf to $MysqlOptionsFile"
}

$mysqldump = Find-MysqlDump
if (-not $mysqldump) { throw 'mysqldump not found' }

$sqlOut = Join-Path $mysqlDir "hms_demo_$stamp.sql"
Write-Log "Dumping $dbName -> $sqlOut"

& $mysqldump `
  --defaults-extra-file="$MysqlOptionsFile" `
  --single-transaction --routines --triggers --events `
  --set-gtid-purged=OFF `
  --result-file="$sqlOut" `
  $dbName

if ($LASTEXITCODE -ne 0) { throw "mysqldump exit $LASTEXITCODE" }
Write-Log "Dump OK ($('{0:N1}' -f ((Get-Item $sqlOut).Length / 1MB)) MB)"

if (Test-Path $UploadsPath) {
  $dest = Join-Path $uploadDir $stamp
  & robocopy $UploadsPath $dest /MIR /R:2 /W:5 /NFL /NDL /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy exit $LASTEXITCODE" }
  Write-Log 'Uploads mirror OK'
}

if (Test-Path $EnvFile) {
  Copy-Item $EnvFile (Join-Path $configDir "env_$stamp.env") -Force
  Write-Log 'Config snapshot OK'
}

Get-ChildItem $mysqlDir -Filter 'hms_demo_*.sql' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $KeepDaily |
  ForEach-Object { Remove-Item $_.FullName -Force; Write-Log "Purged $($_.Name)" }

Write-Log 'Backup completed successfully'
