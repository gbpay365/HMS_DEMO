#Requires -Version 5.1
<#
.SYNOPSIS
  Daily backup of ZAIZENS HMS MySQL database and configuration.
.DESCRIPTION
  See docs/WINDOWS-LOCAL-BACKUP-DR.html
#>
param(
  [string]$BackupRoot = "D:\HMS-Backups",
  [string]$AppRoot = "C:\HMS_JS",
  [string]$DbName = "hms_demo",
  [string]$DbUser = "root",
  [string]$DbPassword = "",
  [string]$DbHost = "127.0.0.1",
  [string]$XamppBin = "C:\xampp\mysql\bin",
  [int]$RetainDays = 14
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$mysqlDaily = Join-Path $BackupRoot "mysql\daily"
$configDaily = Join-Path $BackupRoot "config\daily"
$logDir = Join-Path $BackupRoot "logs"

foreach ($d in @($mysqlDaily, $configDaily, $logDir)) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
}

$logFile = Join-Path $logDir "backup-$stamp.log"
function Log($msg) {
  $line = "[{0:yyyy-MM-dd HH:mm:ss}] {1}" -f (Get-Date), $msg
  Write-Host $line
  Add-Content -Path $logFile -Value $line
}

if (-not $DbPassword) {
  $envPath = Join-Path $AppRoot ".env"
  if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
      if ($_ -match '^DB_PASSWORD=(.*)$') { $DbPassword = $matches[1].Trim().Trim('"') }
    }
  }
}
if (-not $DbPassword) { throw "DbPassword not set. Pass -DbPassword or set DB_PASSWORD in .env" }

$mysqldump = Join-Path $XamppBin "mysqldump.exe"
if (-not (Test-Path $mysqldump)) { throw "mysqldump not found: $mysqldump" }

$sqlOut = Join-Path $mysqlDaily "hms-$stamp.sql"
$gzOut = "$sqlOut.gz"

Log "Starting MySQL dump: $DbName"
$dumpArgs = @(
  "-h$DbHost", "-u$DbUser", "-p$DbPassword",
  "--single-transaction", "--routines", "--triggers", "--events",
  $DbName
)
& $mysqldump @dumpArgs | Set-Content -Path $sqlOut -Encoding UTF8
if ($LASTEXITCODE -ne 0) { throw "mysqldump failed with exit code $LASTEXITCODE" }

Log "Compressing dump"
$inputStream = [System.IO.File]::OpenRead($sqlOut)
$outputStream = [System.IO.File]::Create($gzOut)
$gzip = New-Object System.IO.Compression.GzipStream($outputStream, [System.IO.Compression.CompressionMode]::Compress)
$inputStream.CopyTo($gzip)
$gzip.Close(); $inputStream.Close(); $outputStream.Close()
Remove-Item $sqlOut -Force

Log "Backing up configuration"
$envBackup = Join-Path $configDaily "env-$stamp.env"
Copy-Item (Join-Path $AppRoot ".env") $envBackup -ErrorAction Stop
$configSrc = Join-Path $AppRoot "config"
if (Test-Path $configSrc) {
  Copy-Item $configSrc (Join-Path $configDaily "config-$stamp") -Recurse -Force
}

Log "Pruning backups older than $RetainDays days"
Get-ChildItem $mysqlDaily -Filter "*.gz" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetainDays) } | Remove-Item -Force
Get-ChildItem $configDaily | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetainDays) } | Remove-Item -Recurse -Force

$manifest = Join-Path $BackupRoot "MANIFEST.txt"
@"
Last successful backup: $(Get-Date -Format o)
MySQL dump: $gzOut
Config: $envBackup
Log: $logFile
"@ | Set-Content $manifest -Encoding UTF8

Log "Backup complete: $gzOut"
