#Requires -Version 5.1
# Register a Windows scheduled task to replicate local MySQL → Railway on an interval.
#
# Run PowerShell as Administrator:
#   cd C:\HMS_JS
#   powershell -ExecutionPolicy Bypass -File docs\scripts\register-replicate-scheduled-task.ps1 -IntervalMinutes 15
#
# Remove:
#   Unregister-ScheduledTask -TaskName 'ZAIZENS HMS Replicate to Railway' -Confirm:$false

param(
  [string]$HmsRoot = 'C:\HMS_JS',
  [int]$IntervalMinutes = 15,
  [string]$TaskName = 'ZAIZENS HMS Replicate to Railway',
  [string]$RunAs = $env:USERNAME
)

$ErrorActionPreference = 'Stop'
$runner = Join-Path $HmsRoot 'docs\scripts\run-replicate-local-to-railway.ps1'
if (-not (Test-Path $runner)) {
  Write-Error "Runner not found: $runner"
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-ExecutionPolicy Bypass -NoProfile -File `"$runner`"" `
  -WorkingDirectory $HmsRoot

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration ([TimeSpan]::MaxValue)

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 5)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -RunLevel Highest -User $RunAs -Force

Write-Host "Registered: $TaskName"
Write-Host "  Every $IntervalMinutes minute(s)"
Write-Host "  Script: $runner"
Write-Host "  Ensure docs\scripts\railway-sync.env exists with Railway password."
