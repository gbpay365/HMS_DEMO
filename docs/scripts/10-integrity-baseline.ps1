#Requires -Version 5.1
# SHA-256 integrity baseline for application code
param(
  [string]$HmsRoot = 'C:\Program Files\ZAIZENS\HMS',
  [string]$OutFile = 'D:\HMS-Data\hms-backups\integrity-baseline.csv'
)

$ErrorActionPreference = 'Stop'
$targets = @(
  (Join-Path $HmsRoot 'app.js'),
  (Join-Path $HmsRoot 'lib'),
  (Join-Path $HmsRoot 'routes')
)

$rows = foreach ($t in $targets) {
  if (Test-Path $t -PathType Leaf) {
    $h = Get-FileHash $t -Algorithm SHA256
    [PSCustomObject]@{ Path = $t; Hash = $h.Hash; Date = (Get-Date -Format 'yyyy-MM-dd') }
  } elseif (Test-Path $t -PathType Container) {
    Get-ChildItem $t -Recurse -File | ForEach-Object {
      $h = Get-FileHash $_.FullName -Algorithm SHA256
      [PSCustomObject]@{ Path = $_.FullName; Hash = $h.Hash; Date = (Get-Date -Format 'yyyy-MM-dd') }
    }
  }
}

$dir = Split-Path $OutFile -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$rows | Export-Csv $OutFile -NoTypeInformation -Encoding UTF8
Write-Host "Baseline written: $OutFile ($($rows.Count) files)"
