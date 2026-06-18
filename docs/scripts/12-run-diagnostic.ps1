#Requires -Version 5.1
# Run HMS diagnostic and save output next to HMS root
param(
  [string]$HmsRoot = 'C:\Program Files\ZAIZENS\HMS'
)

$ErrorActionPreference = 'Stop'
Push-Location $HmsRoot
node diagnostic2.js
Pop-Location

$out = Join-Path $HmsRoot 'diagnostic2-output.txt'
if (Test-Path $out) {
  Copy-Item $out (Join-Path $HmsRoot 'tmp\diagnostic2-output.txt') -Force
  Write-Host "Diagnostic saved: $out"
} else {
  Write-Warning 'diagnostic2-output.txt not found — check node diagnostic2.js manually'
}
