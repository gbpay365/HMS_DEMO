#Requires -Version 5.1
# ZAIZENS — NTFS hardening (read-only code, writable uploads/tmp)
param(
  [string]$HmsRoot = 'C:\Program Files\ZAIZENS\HMS',
  [string]$ServiceAccount = 'TSSF\svc-hms'
)

$ErrorActionPreference = 'Stop'

icacls $HmsRoot /inheritance:r
icacls $HmsRoot /grant:r "Administrators:(OI)(CI)(RX)"
icacls $HmsRoot /grant:r "SYSTEM:(OI)(CI)(F)"
icacls $HmsRoot /grant:r "${ServiceAccount}:(OI)(CI)(RX)"
icacls $HmsRoot /deny "Users:(OI)(CI)(F)" 2>$null

icacls "$HmsRoot\uploads" /grant:r "${ServiceAccount}:(OI)(CI)(M)"
icacls "$HmsRoot\tmp" /grant:r "${ServiceAccount}:(OI)(CI)(M)"

Write-Host "NTFS hardening applied on $HmsRoot"
