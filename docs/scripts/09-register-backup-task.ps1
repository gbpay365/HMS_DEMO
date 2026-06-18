#Requires -Version 5.1
# Register nightly backup task @ 02:00
param(
  [string]$HmsRoot = 'C:\Program Files\ZAIZENS\HMS',
  [string]$BackupScript = "$PSScriptRoot\08-zaizens-hms-backup.ps1",
  [string]$RunAs = 'SYSTEM',
  [string]$TaskName = 'ZAIZENS HMS Nightly Backup'
)

$ErrorActionPreference = 'Stop'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-ExecutionPolicy Bypass -File `"$BackupScript`"" `
  -WorkingDirectory $HmsRoot

$trigger = New-ScheduledTaskTrigger -Daily -At '02:00'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -RunLevel Highest -User $RunAs -Force

Write-Host "Registered scheduled task: $TaskName (daily 02:00)"
