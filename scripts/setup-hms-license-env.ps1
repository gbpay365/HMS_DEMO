#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install ZAIZENS license public keys into HMS .env.

  Hospital .env files are locked read-only (even for Administrators) after NTFS
  hardening. This script temporarily grants write access, runs the Node helper,
  then restores the restrictive ACL.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File "C:\Program Files\ZAIZENS\HMS\scripts\setup-hms-license-env.ps1"

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup-hms-license-env.ps1 -Port 80 -ServiceAccount "TSSF\svc-hms"
#>
param(
  [string]$HmsRoot = (Split-Path -Parent $PSScriptRoot),
  [int]$Port = 80,
  [string]$ServiceAccount = ''
)

$ErrorActionPreference = 'Stop'

function Test-IsAdmin {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-EnvReaderAccounts {
  param([string]$EnvPath)
  if (-not (Test-Path $EnvPath)) { return @() }

  $skip = @(
    'BUILTIN\Administrators',
    'NT AUTHORITY\SYSTEM',
    'CREATOR OWNER',
    'APPLICATION PACKAGE AUTHORITY\ALL APPLICATION PACKAGES',
    'APPLICATION PACKAGE AUTHORITY\ALL RESTRICTED APPLICATION PACKAGES'
  )

  $readers = New-Object System.Collections.Generic.List[string]
  if ($ServiceAccount) { [void]$readers.Add($ServiceAccount) }

  $lines = & icacls $EnvPath 2>$null
  foreach ($line in $lines) {
    if ($line -notmatch '^\s+([^:]+):\((R|RX)\)') { continue }
    $account = $Matches[1].Trim()
    if ($skip -contains $account) { continue }
    if ($readers -notcontains $account) { [void]$readers.Add($account) }
  }
  return $readers.ToArray()
}

function Enable-EnvWriteAccess {
  param([string]$EnvPath)
  $dir = Split-Path -Parent $EnvPath
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  if (-not (Test-Path $EnvPath)) {
    New-Item -ItemType File -Path $EnvPath -Force | Out-Null
  }
  & icacls $EnvPath /grant "Administrators:(F)" | Out-Null
}

function Restore-EnvAcl {
  param(
    [string]$EnvPath,
    [string[]]$ReaderAccounts
  )
  if (-not (Test-Path $EnvPath)) { return }

  & icacls $EnvPath /inheritance:r | Out-Null
  & icacls $EnvPath /grant:r "Administrators:(R)" | Out-Null
  & icacls $EnvPath /grant:r "SYSTEM:(F)" | Out-Null
  foreach ($account in $ReaderAccounts) {
    if (-not $account) { continue }
    & icacls $EnvPath /grant:r "${account}:(R)" | Out-Null
  }
}

function Set-EnvPort {
  param(
    [string]$EnvPath,
    [int]$Port
  )
  if ($Port -lt 1 -or $Port -gt 65535) {
    throw "Invalid port: $Port"
  }

  $content = if (Test-Path $EnvPath) {
    Get-Content -Path $EnvPath -Raw
  } else {
    "# HMS environment`r`n"
  }

  $line = "PORT=$Port"
  if ($content -match '(?m)^PORT=') {
    $content = [regex]::Replace($content, '(?m)^PORT=.*$', $line)
  } else {
    if ($content -and -not $content.EndsWith("`n")) { $content += "`r`n" }
    $content += "$line`r`n"
  }

  if (-not $content.EndsWith("`n")) { $content += "`r`n" }
  [System.IO.File]::WriteAllText($EnvPath, $content, [System.Text.UTF8Encoding]::new($false))
}

if (-not (Test-IsAdmin)) {
  throw @'
This script must run in an elevated PowerShell (Run as administrator).

Right-click PowerShell -> Run as administrator, then:
  cd "C:\Program Files\ZAIZENS\HMS\scripts"
  powershell -ExecutionPolicy Bypass -File .\setup-hms-license-env.ps1
'@
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js not found on PATH.' }

$js = Join-Path $PSScriptRoot 'setup-hms-license-env.js'
if (-not (Test-Path $js)) { throw "Missing $js" }

$envPath = Join-Path $HmsRoot '.env'
$readers = Get-EnvReaderAccounts -EnvPath $envPath

Write-Host "HMS root:  $HmsRoot"
Write-Host "Target:    $envPath"
Write-Host "PORT:      $Port"
Write-Host 'Unlocking .env for write (Administrators full control)...'

Enable-EnvWriteAccess -EnvPath $envPath

try {
  Push-Location $HmsRoot
  & $node $js --env $envPath
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Set-EnvPort -EnvPath $envPath -Port $Port
  Write-Host "Set PORT=$Port in .env"
}
finally {
  Pop-Location
  Write-Host 'Restoring read-only .env ACL...'
  Restore-EnvAcl -EnvPath $envPath -ReaderAccounts $readers
}

Write-Host ''
Write-Host "License public keys and PORT=$Port installed. Restart the HMS Windows service now."
Write-Host ''
