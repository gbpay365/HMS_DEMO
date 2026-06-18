#Requires -Version 5.1
# Wrapper — delegates to scripts\register-bidirectional-sync-task.ps1
$repoRoot = Split-Path $PSScriptRoot -Parent | Split-Path -Parent
& (Join-Path $repoRoot 'scripts\register-bidirectional-sync-task.ps1') @args
