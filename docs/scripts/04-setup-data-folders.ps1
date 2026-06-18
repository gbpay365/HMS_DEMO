#Requires -Version 5.1
# ZAIZENS — create data folders and uploads junction
param(
  [string]$HmsRoot = 'C:\Program Files\ZAIZENS\HMS',
  [string]$DataRoot = 'D:\HMS-Data'
)

$ErrorActionPreference = 'Stop'

$dirs = @(
  $DataRoot,
  "$DataRoot\uploads",
  "$DataRoot\mysql-backups",
  "$DataRoot\uploads-backups",
  "$DataRoot\hms-backups\config",
  "$DataRoot\hms-backups\logs",
  "$HmsRoot\tmp"
)

foreach ($d in $dirs) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  Write-Host "OK $d"
}

$uploadLink = Join-Path $HmsRoot 'uploads'
if (Test-Path $uploadLink) {
  Write-Host "uploads already exists at $uploadLink — skip junction"
} else {
  cmd /c mklink /D "$uploadLink" "$DataRoot\uploads"
  Write-Host "Junction: $uploadLink -> $DataRoot\uploads"
}

Write-Host 'Data folders ready.'
