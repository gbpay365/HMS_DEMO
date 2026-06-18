@echo off
setlocal EnableExtensions
REM Remove the bidirectional sync scheduled task.
REM Run as Administrator.

set "TASK_NAME=ZAIZENS HMS Bidirectional DB Sync"
if not "%~1"=="" set "TASK_NAME=%~1"

net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Run as Administrator.
  exit /b 1
)

schtasks /Delete /F /TN "%TASK_NAME%"
if errorlevel 1 (
  echo [ERROR] Could not delete task "%TASK_NAME%".
  exit /b 1
)

echo [OK] Removed scheduled task: %TASK_NAME%
exit /b 0
