#Requires -Version 5.1
# Register Windows Scheduled Task: bidirectional local MySQL ↔ Railway every N minutes.
#
# Run PowerShell as Administrator:
#   cd C:\HMS_JS
#   powershell -ExecutionPolicy Bypass -File scripts\register-bidirectional-sync-task.ps1 -IntervalMinutes 10
#
# Remove:
#   Unregister-ScheduledTask -TaskName 'ZAIZENS HMS Bidirectional DB Sync' -Confirm:$false

param(
  [string]$HmsRoot = 'C:\HMS_JS',
  [int]$IntervalMinutes = 10,
  [string]$TaskName = 'ZAIZENS HMS Bidirectional DB Sync',
  [string]$RunAs = $env:USERNAME
)

$ErrorActionPreference = 'Stop'
$runner = Join-Path $HmsRoot 'scripts\run-bidirectional-sync.bat'
$envFile = Join-Path $HmsRoot 'docs\scripts\railway-sync.env'

if (-not (Test-Path $runner)) {
  Write-Error "Runner not found: $runner"
}
if (-not (Test-Path $envFile)) {
  Write-Error "Missing $envFile — copy railway-sync.env.example and set LOCAL_DB_* and RAILWAY_MYSQL_* credentials."
}

$action = New-ScheduledTaskAction -Execute 'cmd.exe' `
  -Argument "/c `"$runner`"" `
  -WorkingDirectory $HmsRoot

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
  -RepetitionDuration ([TimeSpan]::MaxValue)

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 2)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -RunLevel Highest -User $RunAs -Force

Write-Host "Registered scheduled task: $TaskName"
Write-Host "  Interval: every $IntervalMinutes minute(s)"
Write-Host "  Runner:   $runner"
Write-Host "  Logs:     $HmsRoot\tmp\railway-sync-logs\"
Write-Host ""
Write-Host "Test now:"
Write-Host "  `"$runner`""
Write-Host "  Or dry-run: scripts\run-bidirectional-sync-dry-run.bat"
