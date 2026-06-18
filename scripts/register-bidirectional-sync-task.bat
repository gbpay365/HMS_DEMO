@echo off
setlocal EnableExtensions
REM Register Windows Scheduled Task — runs bidirectional sync every N minutes (default 10).
REM Run this file as Administrator (right-click -> Run as administrator).
REM
REM Usage:
REM   scripts\register-bidirectional-sync-task.bat
REM   scripts\register-bidirectional-sync-task.bat 10
REM   scripts\register-bidirectional-sync-task.bat 15 "My Custom Task Name"

set "INTERVAL=10"
set "TASK_NAME=ZAIZENS HMS Bidirectional DB Sync"

if not "%~1"=="" set "INTERVAL=%~1"
if not "%~2"=="" set "TASK_NAME=%~2"

set "REPO_ROOT=%~dp0.."
for %%I in ("%REPO_ROOT%") do set "REPO_ROOT=%%~fI"
if exist "%REPO_ROOT%\sync-database.bat" (
  set "RUNNER=%REPO_ROOT%\sync-database.bat"
) else (
  set "RUNNER=%REPO_ROOT%\scripts\sync-database.bat"
)
if exist "%REPO_ROOT%\scripts\db-sync.env" (
  set "ENV_FILE=%REPO_ROOT%\scripts\db-sync.env"
) else if exist "%REPO_ROOT%\scripts\railway-sync.env" (
  set "ENV_FILE=%REPO_ROOT%\scripts\railway-sync.env"
) else (
  set "ENV_FILE=%REPO_ROOT%\docs\scripts\railway-sync.env"
)

net session >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Run as Administrator to register a scheduled task.
  echo Right-click register-bidirectional-sync-task.bat -^> Run as administrator
  exit /b 1
)

if not exist "%RUNNER%" (
  echo [ERROR] Runner not found: %RUNNER%
  exit /b 1
)

if not exist "%ENV_FILE%" (
  echo [ERROR] Missing %ENV_FILE%
  echo Copy railway-sync.env.example and set database credentials.
  exit /b 1
)

echo Registering scheduled task...
echo   Task:     %TASK_NAME%
echo   Every:    %INTERVAL% minute(s)
echo   Runner:   %RUNNER%
echo.

schtasks /Create /F /TN "%TASK_NAME%" ^
  /TR "cmd.exe /c \"\"%RUNNER%\"\"" ^
  /SC MINUTE /MO %INTERVAL% ^
  /RU "%USERNAME%" /RL HIGHEST

if errorlevel 1 (
  echo [ERROR] schtasks failed. Try running as Administrator.
  exit /b 1
)

echo.
echo [OK] Scheduled task registered.
echo Logs: %REPO_ROOT%\tmp\railway-sync-logs\
echo.
echo Test now:
echo   "%RUNNER%"
echo.
echo Remove task:
echo   scripts\unregister-bidirectional-sync-task.bat
exit /b 0
