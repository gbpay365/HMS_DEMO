@echo off
REM Plan sync only — no database writes.
call "%~dp0run-bidirectional-sync.bat" --dry-run %*
