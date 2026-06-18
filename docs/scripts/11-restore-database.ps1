#Requires -Version 5.1
# Restore hms_demo from a mysqldump file (HMS service must be stopped)
param(
  [Parameter(Mandatory=$true)][string]$DumpFile,
  [string]$DbName = 'hms_demo',
  [string]$MysqlRootUser = 'root'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $DumpFile)) { throw "Dump not found: $DumpFile" }

$mysql = @(
  'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe',
  'C:\Program Files\MySQL Server 8.0\bin\mysql.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $mysql) { throw 'mysql client not found' }

Write-Host 'Stopping ZAIZENS-HMS service...'
nssm stop ZAIZENS-HMS 2>$null

$rootPass = Read-Host "MySQL root password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($rootPass)
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)

& $mysql -u $MysqlRootUser "-p$plain" -e "DROP DATABASE IF EXISTS $DbName; CREATE DATABASE $DbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
Get-Content $DumpFile | & $mysql -u $MysqlRootUser "-p$plain" $DbName

Write-Host 'Starting ZAIZENS-HMS service...'
nssm start ZAIZENS-HMS
Write-Host 'Restore complete. Verify login and OPD queue.'
