# Wrapper — keep scripts\ path in sync with docs\scripts\07-install-hms-service.ps1
#Requires -Version 5.1
#Requires -RunAsAdministrator
param(
  [string]$HmsRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$NodeExe = 'C:\Program Files\nodejs\node.exe',
  [string]$NssmExe = '',
  [string]$ServiceAccount = 'TSSF\svc-hms',
  [string]$ServicePassword = '',
  [string]$ServiceName = 'ZAIZENS-HMS'
)

$target = Join-Path $PSScriptRoot '..\docs\scripts\07-install-hms-service.ps1'
if (-not (Test-Path $target)) {
  $target = Join-Path $PSScriptRoot '07-install-hms-service.ps1'
}
if (-not (Test-Path $target)) { throw '07-install-hms-service.ps1 not found.' }

& $target @PSBoundParameters
