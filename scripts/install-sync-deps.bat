@echo off
setlocal EnableExtensions
REM Install Node.js packages required for bidirectional DB sync (mysql2, dotenv).
cd /d "%~dp0.."

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node.js 18+ from https://nodejs.org/
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json not found in %CD%
  exit /b 1
)

echo Installing HMS Node dependencies in:
echo   %CD%
echo.

call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 exit /b 1

if exist "node_modules\mysql2" (
  echo.
  echo [OK] mysql2 is installed. You can run:
  echo   scripts\run-bidirectional-sync.bat
) else (
  echo [ERROR] mysql2 missing after install.
  exit /b 1
)
exit /b 0
