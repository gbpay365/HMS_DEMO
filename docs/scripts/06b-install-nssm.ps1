#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install NSSM (Non-Sucking Service Manager) for ZAIZENS-HMS Windows service.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File "C:\Program Files\ZAIZENS\HMS\scripts\06b-install-nssm.ps1"
#>
param(
  [string]$InstallDir = 'C:\Program Files\ZAIZENS\tools\nssm'
)

$ErrorActionPreference = 'Stop'

function Get-NssmExe {
  param([string]$Root)
  $candidates = @(
    (Join-Path $Root 'win64\nssm.exe'),
    (Join-Path $Root 'win32\nssm.exe'),
    (Join-Path $Root 'nssm.exe')
  )
  foreach ($path in $candidates) {
    if (Test-Path $path) { return $path }
  }
  return $null
}

$existing = Get-NssmExe -Root $InstallDir
if ($existing) {
  Write-Host "NSSM already installed: $existing"
  exit 0
}

$zipUrl = 'https://nssm.cc/release/nssm-2.24.zip'
$tempZip = Join-Path $env:TEMP 'nssm-2.24.zip'
$tempExtract = Join-Path $env:TEMP ('nssm-extract-' + [guid]::NewGuid().ToString())

Write-Host "Downloading NSSM from $zipUrl ..."
Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force

$inner = Get-ChildItem -Path $tempExtract -Directory | Where-Object { $_.Name -like 'nssm-*' } | Select-Object -First 1
if (-not $inner) { throw 'Unexpected NSSM zip layout.' }

Copy-Item -Path (Join-Path $inner.FullName '*') -Destination $InstallDir -Recurse -Force

$nssmExe = Get-NssmExe -Root $InstallDir
if (-not $nssmExe) { throw "NSSM install failed under $InstallDir" }

$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$pathEntry = $InstallDir
if ($machinePath -notlike "*$pathEntry*") {
  [Environment]::SetEnvironmentVariable('Path', ($machinePath.TrimEnd(';') + ';' + $pathEntry), 'Machine')
  $env:Path += ";$pathEntry"
}

Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "NSSM installed: $nssmExe"
Write-Host 'Open a new elevated command prompt, then run 07-install-hms-service.ps1'
