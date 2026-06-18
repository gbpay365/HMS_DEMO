#Requires -Version 5.1
<#
.SYNOPSIS
  Restore ZAIZENS HMS MySQL database from .sql or .sql.gz backup.
.EXAMPLE
  .\windows-hms-restore.ps1 -SqlBackup D:\HMS-Backups\mysql\daily\hms-20260603-020000.sql.gz
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$SqlBackup,
  [string]$DbName = "hms_demo",
  [string]$DbUser = "root",
  [string]$DbPassword = "",
  [string]$DbHost = "127.0.0.1",
  [string]$XamppBin = "C:\xampp\mysql\bin"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $SqlBackup)) { throw "Backup file not found: $SqlBackup" }

if (-not $DbPassword) {
  if (Test-Path "C:\HMS_JS\.env") {
    Get-Content "C:\HMS_JS\.env" | ForEach-Object {
      if ($_ -match '^DB_PASSWORD=(.*)$') { $DbPassword = $matches[1].Trim().Trim('"') }
    }
  }
}
if (-not $DbPassword) { throw "Set -DbPassword or DB_PASSWORD in .env" }

$mysql = Join-Path $XamppBin "mysql.exe"
if (-not (Test-Path $mysql)) { throw "mysql client not found: $mysql" }

Write-Host "Restoring $SqlBackup into database $DbName …"
Write-Host "WARNING: This overwrites existing data in $DbName"

$sqlTemp = $SqlBackup
if ($SqlBackup -match '\.gz$') {
  $sqlTemp = [System.IO.Path]::GetTempFileName() + ".sql"
  $in = [System.IO.File]::OpenRead($SqlBackup)
  $gzip = New-Object System.IO.Compression.GzipStream($in, [System.IO.Compression.CompressionMode]::Decompress)
  $out = [System.IO.File]::Create($sqlTemp)
  $gzip.CopyTo($out)
  $out.Close(); $gzip.Close(); $in.Close()
}

& $mysql @("-h$DbHost", "-u$DbUser", "-p$DbPassword", $DbName) -e "SELECT 1" | Out-Null
Get-Content $sqlTemp -Raw | & $mysql @("-h$DbHost", "-u$DbUser", "-p$DbPassword", $DbName)
if ($LASTEXITCODE -ne 0) { throw "mysql import failed" }

if ($sqlTemp -ne $SqlBackup) { Remove-Item $sqlTemp -Force }
Write-Host "Restore complete. Verify with: SELECT COUNT(*) FROM tbl_patient;"
