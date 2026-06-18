#Requires -Version 5.1
#Requires -RunAsAdministrator
# Register ZAIZENS-HMS Windows service via NSSM
param(
  [string]$HmsRoot = 'C:\Program Files\ZAIZENS\HMS',
  [string]$NodeExe = 'C:\Program Files\nodejs\node.exe',
  [string]$NssmExe = '',
  [string]$ServiceAccount = 'TSSF\svc-hms',
  [string]$ServicePassword = '',
  [string]$ServiceName = 'ZAIZENS-HMS'
)

$ErrorActionPreference = 'Stop'

function Resolve-NssmExe {
  param([string]$Explicit)
  if ($Explicit -and (Test-Path $Explicit)) { return $Explicit }

  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $candidates = @(
    'C:\Program Files\ZAIZENS\tools\nssm\win64\nssm.exe',
    'C:\Program Files\ZAIZENS\tools\nssm\win32\nssm.exe',
    'C:\Program Files\ZAIZENS\tools\nssm\nssm.exe',
    (Join-Path $HmsRoot 'tools\nssm\win64\nssm.exe'),
    (Join-Path $HmsRoot 'tools\nssm\win32\nssm.exe')
  )
  foreach ($path in $candidates) {
    if (Test-Path $path) { return $path }
  }
  return $null
}

$nssm = Resolve-NssmExe -Explicit $NssmExe
if (-not $nssm) {
  throw @'
NSSM not found.

Install it first (elevated PowerShell):
  powershell -ExecutionPolicy Bypass -File "C:\Program Files\ZAIZENS\HMS\scripts\06b-install-nssm.ps1"

Or download https://nssm.cc/release/nssm-2.24.zip, extract win64\nssm.exe to:
  C:\Program Files\ZAIZENS\tools\nssm\win64\
'@
}

if (-not (Test-Path $NodeExe)) { throw "Node.js not found: $NodeExe" }
if (-not (Test-Path (Join-Path $HmsRoot 'app.js'))) { throw "HMS app.js not found under $HmsRoot" }

$tmpDir = Join-Path $HmsRoot 'tmp'
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

Write-Host "NSSM:      $nssm"
Write-Host "Node:      $NodeExe"
Write-Host "HMS root:  $HmsRoot"
Write-Host "Service:   $ServiceName"

& $nssm stop $ServiceName 2>$null
& $nssm remove $ServiceName confirm 2>$null

& $nssm install $ServiceName $NodeExe (Join-Path $HmsRoot 'app.js')
& $nssm set $ServiceName AppDirectory $HmsRoot
& $nssm set $ServiceName AppEnvironmentExtra NODE_ENV=production
& $nssm set $ServiceName AppStdout (Join-Path $HmsRoot 'tmp\service-stdout.log')
& $nssm set $ServiceName AppStderr (Join-Path $HmsRoot 'tmp\service-stderr.log')
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName AppRestartDelay 5000

if ($ServicePassword) {
  & $nssm set $ServiceName ObjectName $ServiceAccount $ServicePassword
} else {
  Write-Warning "Service runs as Local System. To use $ServiceAccount instead:"
  Write-Warning "  & `"$nssm`" set $ServiceName ObjectName $ServiceAccount YOUR_PASSWORD"
}

& $nssm start $ServiceName
Write-Host "$ServiceName installed and started (auto-start on boot)."
