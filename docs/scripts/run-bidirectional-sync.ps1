#Requires -Version 5.1
# Wrapper — delegates to scripts\run-bidirectional-sync.ps1
$repoRoot = Split-Path $PSScriptRoot -Parent | Split-Path -Parent
& (Join-Path $repoRoot 'scripts\run-bidirectional-sync.ps1') @args
