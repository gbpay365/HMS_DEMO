#Requires -Version 5.1
# Deploy TSSF .env to HMS folder and restrict ACL
param(
  [string]$HmsRoot = 'C:\Program Files\ZAIZENS\HMS',
  [string]$SourceEnv = "$PSScriptRoot\02-zaizens-demo.env",
  [string]$ServiceAccount = 'TSSF\svc-hms'
)

$ErrorActionPreference = 'Stop'
$dest = Join-Path $HmsRoot '.env'

if (-not (Test-Path $SourceEnv)) { throw "Missing $SourceEnv" }
Copy-Item $SourceEnv $dest -Force
Write-Host "Installed $dest"

icacls $dest /inheritance:r | Out-Null
icacls $dest /grant:r "Administrators:(R)" | Out-Null
icacls $dest /grant:r "SYSTEM:(F)" | Out-Null
icacls $dest /grant:r "${ServiceAccount}:(R)" | Out-Null
Write-Host 'ACL applied to .env'
