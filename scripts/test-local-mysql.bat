@echo off
setlocal EnableExtensions
REM Test local MySQL connection using the same credentials as bidirectional sync.
cd /d "%~dp0.."
set "NODE_PATH=%CD%\node_modules"

if not exist "node_modules\mysql2" (
  echo [ERROR] Run scripts\install-sync-deps.bat first.
  exit /b 1
)

if exist "scripts\test-local-mysql.js" (
  node "scripts\test-local-mysql.js"
) else (
  node "docs\scripts\test-local-mysql.js"
)

exit /b %ERRORLEVEL%
