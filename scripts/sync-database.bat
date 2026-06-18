@echo off
setlocal EnableExtensions
title ZAIZENS HMS - Database Sync (Local <-> Railway)

REM ============================================================================
REM  Bidirectional database sync: local MySQL on this server <-> Railway
REM
REM  First time:
REM    1. copy scripts\db-sync.env.example  to  scripts\db-sync.env
REM    2. Edit scripts\db-sync.env — fill LOCAL and RAILWAY passwords
REM    3. Run this file again
REM
REM  Options:
REM    sync-database.bat              Run sync
REM    sync-database.bat dry          Test only (no changes)
REM    sync-database.bat install      Install Node mysql2 package
REM    sync-database.bat schedule     Register Windows task every 10 min (Admin)
REM ============================================================================

set "HMS_HOME=%~dp0.."
cd /d "%HMS_HOME%"

if /i "%~1"=="install" goto :install
if /i "%~1"=="schedule" goto :schedule
if /i "%~1"=="dry" set "EXTRA_ARGS=--dry-run" & goto :run
if /i "%~1"=="help" goto :help
if /i "%~1"=="--dry-run" set "EXTRA_ARGS=--dry-run" & goto :run
if not "%~1"=="" set "EXTRA_ARGS=%*" & goto :run

:run
if not exist "scripts\db-sync.env" if not exist "scripts\railway-sync.env" (
  echo.
  echo [SETUP REQUIRED]
  echo   copy scripts\db-sync.env.example scripts\db-sync.env
  echo   notepad scripts\db-sync.env
  echo.
  exit /b 1
)

where node >nul 2>&1 || (echo [ERROR] Install Node.js from https://nodejs.org/ & exit /b 1)
set "NODE_PATH=%CD%\node_modules"

if not exist "node_modules\mysql2" (
  echo [INFO] Installing mysql2...
  call npm install --omit=dev --no-audit --no-fund
  if not exist "node_modules\mysql2" (
    echo [ERROR] mysql2 missing. Run:  sync-database.bat install
    exit /b 1
  )
)

if not exist "tmp\railway-sync-logs" mkdir "tmp\railway-sync-logs"
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"
set "LOG=tmp\railway-sync-logs\sync-%STAMP%.log"

echo.
echo ========================================
echo   ZAIZENS - Local ^<-^> Railway DB Sync
echo ========================================
echo   Folder: %CD%
echo   Log:    %LOG%
echo.

if exist "scripts\bidirectional-sync-local-railway.js" (
  node "scripts\bidirectional-sync-local-railway.js" %EXTRA_ARGS% > "%LOG%" 2>&1
) else if exist "docs\scripts\bidirectional-sync-local-railway.js" (
  node "docs\scripts\bidirectional-sync-local-railway.js" %EXTRA_ARGS% > "%LOG%" 2>&1
) else (
  echo [ERROR] bidirectional-sync-local-railway.js not found in scripts\
  exit /b 1
)

set "RC=%ERRORLEVEL%"
type "%LOG%"
echo.
if %RC% equ 0 (echo [OK] Sync finished.) else (echo [FAILED] See log above.)
echo Log: %LOG%
exit /b %RC%

:install
where npm >nul 2>&1 || (echo [ERROR] npm not found. Install Node.js. & exit /b 1)
echo Installing Node packages in %CD%...
call npm install --omit=dev --no-audit --no-fund
if exist "node_modules\mysql2" (echo [OK] Ready. Run sync-database.bat) else (echo [ERROR] Install failed. & exit /b 1)
exit /b 0

:schedule
net session >nul 2>&1 || (
  echo [ERROR] Right-click sync-database.bat and choose "Run as administrator" for schedule
  echo Or run:  scripts\register-bidirectional-sync-task.bat
  exit /b 1
)
call "%~dp0register-bidirectional-sync-task.bat" 10
exit /b %ERRORLEVEL%

:help
echo.
echo Usage:
echo   sync-database.bat           Sync local MySQL with Railway
echo   sync-database.bat dry       Dry run (no writes)
echo   sync-database.bat install   Install Node dependencies
echo   sync-database.bat schedule  Auto-sync every 10 min (Admin)
echo.
echo Config: scripts\db-sync.env
exit /b 0
