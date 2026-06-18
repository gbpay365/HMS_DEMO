@echo off
REM ZAIZENS HMS — bidirectional DB sync (double-click or run from CMD)
cd /d "%~dp0"
call "%~dp0scripts\sync-database.bat" %*
