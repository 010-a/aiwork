@echo off
setlocal
cd /d "%~dp0" || exit /b 1
node "service-dist\cli.mjs" stop
if errorlevel 1 pause
