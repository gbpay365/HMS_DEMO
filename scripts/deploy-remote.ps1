# Push C:\HMS_JS\Update to the deploy server and apply code + pharmacy data.
# Requires: same LAN/VPN, SMB (port 445), deploy server online.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-remote.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-remote.ps1 -CodeOnly
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-remote.ps1 -SkipDataImport

param(
  [switch]$CodeOnly,
  [switch]$SkipDataImport,
  [string]$EnvFile = ''
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent

function Load-DeployEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    throw "Missing $Path - copy scripts/deploy-server.env.example to scripts/deploy-server.env"
  }
  $vars = @{}
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $eq = $line.IndexOf('=')
    if ($eq -le 0) { return }
    $k = $line.Substring(0, $eq).Trim()
    $v = $line.Substring($eq + 1).Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    $vars[$k] = $v
  }
  return $vars
}

function Test-ServerPort {
  param([string]$HostName, [int]$Port, [int]$TimeoutMs = 5000)
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs)) { $client.Close(); return $false }
    $client.EndConnect($iar) | Out-Null
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

$envPath = if ($EnvFile) { $EnvFile } else { Join-Path $PSScriptRoot 'deploy-server.env' }
$cfg = Load-DeployEnv $envPath

$deployHost = $cfg.DEPLOY_SERVER_HOST
$user = $cfg.DEPLOY_SERVER_USER
$pass = $cfg.DEPLOY_SERVER_PASSWORD
$localUpdate = $cfg.DEPLOY_UPDATE_SOURCE
$remoteUpdate = $cfg.DEPLOY_REMOTE_UPDATE_PATH
$hmsRoot = $cfg.DEPLOY_HMS_ROOT

if (-not $deployHost -or -not $user -or -not $pass) {
  throw 'DEPLOY_SERVER_HOST, DEPLOY_SERVER_USER, DEPLOY_SERVER_PASSWORD required in deploy-server.env'
}
if (-not (Test-Path $localUpdate)) {
  throw "Local update folder missing: $localUpdate - run scripts/build-update-package.ps1 first"
}

Write-Host '=== ZAIZENS HMS remote deploy ===' -ForegroundColor Cyan
Write-Host ('Target: {0}@{1}' -f $user, $deployHost)
Write-Host "Source: $localUpdate"

if (-not (Test-ServerPort $deployHost 445)) {
  $msg = @(
    "Cannot reach $deployHost on port 445 (SMB).",
    'Ensure the deploy server is powered on and on the same network/VPN as this PC.',
    "Ping from this machine: ping $deployHost",
    'Then re-run: powershell -ExecutionPolicy Bypass -File scripts\deploy-remote.ps1'
  ) -join [Environment]::NewLine
  throw $msg
}

$sec = ConvertTo-SecureString $pass -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($user, $sec)

$uncRoot = '\\' + $deployHost + '\C$'
$remoteParent = Split-Path $remoteUpdate -Parent
$remoteUnc = '\\' + $deployHost + '\C$' + ($remoteUpdate -replace '^[A-Z]:', '')

Write-Host 'Mapping admin share...' -ForegroundColor Yellow
New-PSDrive -Name 'DEPLOY' -PSProvider FileSystem -Root $uncRoot -Credential $cred -ErrorAction Stop | Out-Null

try {
  $destParentUnc = '\\' + $deployHost + '\C$' + ($remoteParent -replace '^[A-Z]:', '')
  if (-not (Test-Path $destParentUnc)) {
    New-Item -ItemType Directory -Path $destParentUnc -Force | Out-Null
  }

  Write-Host "Copying update package to $remoteUpdate ..." -ForegroundColor Yellow
  robocopy $localUpdate $remoteUnc /E /Z /R:2 /W:3 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit $LASTEXITCODE" }

  $applyArgs = "-ExecutionPolicy Bypass -File `"$remoteUpdate\scripts\apply-deploy-update.ps1`""
  if (-not $SkipDataImport -and -not $CodeOnly) {
    $applyArgs += ' -ImportPharmacyData'
  }

  $remoteCmd = 'powershell.exe ' + $applyArgs
  $taskName = 'ZAIZENS-HMS-Deploy-' + (Get-Date -Format 'yyyyMMddHHmmss')
  $runAt = (Get-Date).AddMinutes(1).ToString('HH:mm')

  Write-Host 'Scheduling remote apply task (runs in about 1 minute)...' -ForegroundColor Yellow
  $create = schtasks /Create /S $deployHost /U $user /P $pass /RU $user /RP $pass /TN $taskName /TR $remoteCmd /SC ONCE /ST $runAt /F 2>&1
  if ($LASTEXITCODE -ne 0) { throw "schtasks /Create failed: $create" }

  $run = schtasks /Run /S $deployHost /U $user /P $pass /TN $taskName 2>&1
  if ($LASTEXITCODE -ne 0) { throw "schtasks /Run failed: $run" }

  Write-Host ''
  Write-Host 'Deploy initiated on remote server.' -ForegroundColor Green
  Write-Host "  Code/UI: $hmsRoot"
  if (-not $CodeOnly -and -not $SkipDataImport) {
    Write-Host '  Data: pharmacy catalog + inventory import from Update\data\pharmacy-deploy-export.json'
  }
  Write-Host ''
  Write-Host "Open the hospital URL and hard-refresh (Ctrl+F5)." -ForegroundColor Cyan
  Write-Host "Remote task: $taskName" -ForegroundColor Cyan
} finally {
  Remove-PSDrive -Name 'DEPLOY' -Force -ErrorAction SilentlyContinue
}
