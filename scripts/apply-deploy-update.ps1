# Apply dev update package on the deploy server and import pharmacy data.
# Run ON THE DEPLOY SERVER as Administrator.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\apply-deploy-update.ps1 -ImportDeployData
#   powershell -ExecutionPolicy Bypass -File scripts\apply-deploy-update.ps1 -SkipBackup
#   powershell -ExecutionPolicy Bypass -File scripts\apply-deploy-update.ps1 -SkipServiceRestart

param(
  [string]$HmsRoot = 'C:\Program Files\ZAIZENS\HMS',
  [string]$UpdateSource = 'C:\HMS_JS\Update',
  [switch]$SkipServiceRestart,
  [switch]$SkipBackup,
  [switch]$ImportPharmacyData,
  [switch]$ImportDeployData,
  [switch]$PullPharmacyFromRailway
)

$ErrorActionPreference = 'Stop'

function Test-RobocopyOk {
  param([int]$Code)
  # Robocopy uses bit flags: 0-7 mean success (files copied or nothing to do)
  return $Code -lt 8
}

function Resolve-NssmExe {
  $candidates = @(
    'C:\Program Files\ZAIZENS\tools\nssm\win64\nssm.exe',
    'C:\Program Files\ZAIZENS\tools\nssm\win32\nssm.exe',
    'C:\Program Files\ZAIZENS\tools\nssm\nssm.exe',
    (Join-Path $HmsRoot 'tools\nssm\win64\nssm.exe'),
    (Join-Path $HmsRoot 'tools\nssm\win32\nssm.exe')
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  $cmd = Get-Command nssm -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Invoke-Nssm {
  param([string]$Exe, [string[]]$NssmArgs)
  if (-not $Exe -or -not (Test-Path $Exe)) { return 1 }
  $argLine = ($NssmArgs | ForEach-Object {
    if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '""') + '"' } else { $_ }
  }) -join ' '
  $p = Start-Process -FilePath $Exe -ArgumentList $argLine -Wait -PassThru -NoNewWindow `
    -RedirectStandardError ([System.IO.Path]::GetTempFileName()) `
    -RedirectStandardOutput ([System.IO.Path]::GetTempFileName())
  return $p.ExitCode
}

function Test-HmsServiceExists {
  param([string]$ServiceName)
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  return [bool]$svc
}

function Stop-HmsProcesses {
  param([string]$Root, [string]$ServiceName, [string]$NssmExe)

  $stopped = $false
  $serviceExists = Test-HmsServiceExists $ServiceName

  if ($NssmExe -and $serviceExists) {
    Write-Host "Stopping service $ServiceName via NSSM..." -ForegroundColor Yellow
    $code = Invoke-Nssm -Exe $NssmExe -NssmArgs @('stop', $ServiceName)
    if ($code -eq 0) { $stopped = $true }
    Start-Sleep -Seconds 3
  } elseif ($NssmExe -and -not $serviceExists) {
    Write-Host "Windows service $ServiceName is not installed (skipping NSSM stop)." -ForegroundColor DarkYellow
  }

  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($svc -and $svc.Status -eq 'Running') {
    Write-Host "Stopping Windows service $ServiceName..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $stopped = $true
  }

  $nodeProcs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $cmd = $_.CommandLine
      if (-not $cmd) { return $false }
      $cmd -like "*$Root*" -or $cmd -like '*app.js*' -or $cmd -like '*ZAIZENS*HMS*'
    })

  if ($nodeProcs.Count -eq 0) {
    $nodeProcs = @(Get-Process -Name node -ErrorAction SilentlyContinue)
  }

  foreach ($proc in $nodeProcs) {
    $nodePid = if ($proc.ProcessId) { $proc.ProcessId } else { $proc.Id }
    Write-Host "Stopping node.exe PID $nodePid ..." -ForegroundColor Yellow
    Stop-Process -Id $nodePid -Force -ErrorAction SilentlyContinue
    $stopped = $true
  }

  if (-not $stopped) {
    Write-Host 'No HMS service/node process found (may already be stopped).' -ForegroundColor DarkYellow
  } else {
    Start-Sleep -Seconds 2
  }
}

function Get-BackupRoot {
  $candidates = @(
    'D:\HMS-Data\deploy-backups',
    'C:\HMS_JS\deploy-backups',
    (Join-Path (Split-Path $HmsRoot -Parent) 'deploy-backups')
  )
  foreach ($dir in $candidates) {
    try {
      if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
      }
      $testFile = Join-Path $dir ('._write_test_' + [guid]::NewGuid().ToString())
      Set-Content -Path $testFile -Value 'ok' -Encoding ASCII
      Remove-Item $testFile -Force
      return $dir
    } catch {
      continue
    }
  }
  return (Split-Path $HmsRoot -Parent)
}

function Test-IsAdministrator {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Unlock-HmsRootForDeploy {
  param([string]$Root)
  Write-Host 'Granting Administrators write access for deploy (hardened trees may skip locked files)...' -ForegroundColor Yellow
  # Single-quoted grant string — do not use double quotes: PowerShell parses (OI)(CI)(M) as subexpressions.
  & icacls.exe $Root /grant 'Administrators:(OI)(CI)(M)' /T /C *> $null
}

Write-Host '=== ZAIZENS HMS - apply deploy update ===' -ForegroundColor Cyan
Write-Host "HMS root:   $HmsRoot"
Write-Host "Update src: $UpdateSource"
if (-not (Test-IsAdministrator)) {
  Write-Host 'WARNING: Not elevated. Right-click PowerShell -> Run as administrator for C:\Program Files\... deploys.' -ForegroundColor Red
}

if (-not (Test-Path $UpdateSource)) {
  throw "Update folder not found: $UpdateSource"
}
if (-not (Test-Path (Join-Path $UpdateSource 'app.js'))) {
  throw 'Update folder is incomplete (missing app.js).'
}

$svc = 'ZAIZENS-HMS'
$nssm = Resolve-NssmExe
$hmsExists = Test-Path $HmsRoot

if (-not $SkipServiceRestart) {
  Stop-HmsProcesses -Root $HmsRoot -ServiceName $svc -NssmExe $nssm
}

if ($hmsExists -and -not $SkipBackup) {
  $backupParent = Get-BackupRoot
  $backup = Join-Path $backupParent ('HMS-backup-' + (Get-Date -Format 'yyyyMMdd-HHmm'))
  Write-Host "Backup to $backup ..." -ForegroundColor Yellow
  robocopy $HmsRoot $backup /E /B /COPY:DAT /R:2 /W:3 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if (-not (Test-RobocopyOk $LASTEXITCODE)) {
    Write-Host "Backup warning: robocopy exit $LASTEXITCODE (continuing deploy). Use -SkipBackup to hide this." -ForegroundColor Yellow
    Write-Host 'Tip: ensure no node.exe is still running and retry, or run with -SkipBackup if files are locked.' -ForegroundColor Yellow
  } else {
    Write-Host 'Backup OK.' -ForegroundColor Green
  }
} elseif (-not $hmsExists) {
  Write-Host 'HMS install folder not found - first-time deploy (no backup needed).' -ForegroundColor Yellow
  New-Item -ItemType Directory -Path $HmsRoot -Force | Out-Null
} else {
  Write-Host 'Skipping backup (-SkipBackup).' -ForegroundColor Yellow
}

Write-Host 'Applying update (preserving server .env)...' -ForegroundColor Yellow
if ($hmsExists) {
  Unlock-HmsRootForDeploy -Root $HmsRoot
}

# Robocopy /XF .env leaves the production .env untouched — no backup/restore needed.
robocopy $UpdateSource $HmsRoot /E /B /IS /IT /XF .env /COPY:DAT /R:2 /W:3 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if (-not (Test-RobocopyOk $LASTEXITCODE)) {
  throw "Update robocopy failed with exit $LASTEXITCODE"
}

$envPath = Join-Path $HmsRoot '.env'
if (-not (Test-Path $envPath)) {
  Write-Host 'WARNING: .env not found after update. Copy 02-zaizens-demo.env and configure before starting HMS.' -ForegroundColor Red
} else {
  Write-Host 'Production .env preserved.' -ForegroundColor Green
}

$ui = Get-Item (Join-Path $HmsRoot 'public\dist\hms-ui.js') -ErrorAction SilentlyContinue
if (-not $ui) { throw 'Deploy failed: public\dist\hms-ui.js missing after update.' }
Write-Host "UI bundle OK: $([math]::Round($ui.Length/1KB)) KB  $($ui.LastWriteTime)" -ForegroundColor Green

Set-Location $HmsRoot

if ($PullPharmacyFromRailway) {
  Write-Host 'Pulling pharmacy catalog + inventory from Railway...' -ForegroundColor Yellow
  node scripts\sync-local-railway.js --direction railway-to-local --tables tbl_service_catalog,tbl_inventory_category,tbl_inventory_item
  if ($LASTEXITCODE -ne 0) { throw 'Railway pull failed' }
}

if ($ImportDeployData -or $ImportPharmacyData) {
  $dataFile = Join-Path $UpdateSource 'data\deploy-data-export.json'
  if (-not (Test-Path $dataFile)) {
    $dataFile = Join-Path $UpdateSource 'data\pharmacy-deploy-export.json'
  }
  if (-not (Test-Path $dataFile)) {
    throw "Deploy data export not found in $UpdateSource\data\"
  }
  Write-Host 'Importing service catalog + pharmacy inventory from dev export...' -ForegroundColor Yellow
  node scripts\import-deploy-data.js --file $dataFile
  if ($LASTEXITCODE -ne 0) { throw 'Data import failed' }
}

if (-not $SkipServiceRestart) {
  if ($nssm -and (Test-HmsServiceExists $svc)) {
    Write-Host 'Starting HMS service...' -ForegroundColor Yellow
    $code = Invoke-Nssm -Exe $nssm -NssmArgs @('start', $svc)
    if ($code -ne 0) {
      Write-Host 'NSSM start returned non-zero. Start manually if needed.' -ForegroundColor Yellow
    }
  } elseif ($nssm) {
    Write-Host 'Service not registered. Starting HMS with node.exe ...' -ForegroundColor Yellow
    Start-Process -FilePath 'node.exe' -ArgumentList 'app.js' -WorkingDirectory $HmsRoot -WindowStyle Hidden
  } else {
    Write-Host 'NSSM not found. Start HMS manually, for example:' -ForegroundColor Yellow
    Write-Host "  cd `"$HmsRoot`"" -ForegroundColor Cyan
    Write-Host '  node app.js' -ForegroundColor Cyan
  }
}

Write-Host ''
Write-Host 'Deploy update applied.' -ForegroundColor Green
Write-Host 'Verify: Service Catalog + Pharmacy -> Products. Hard-refresh: Ctrl+F5' -ForegroundColor Cyan
