@echo off
setlocal
title Zhixingban
cd /d "%~dp0" || goto :error

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22 LTS ^(22.12 or newer^) from https://nodejs.org/
  goto :error
)
where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm and Add to PATH enabled.
  goto :error
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||(major===22&&minor>=12)?0:1)"
if errorlevel 1 (
  echo Please install Node.js 22 LTS ^(22.12 or newer^), then restart this script.
  goto :error
)

if not exist "node_modules\.package-lock.json" (
  echo Installing dependencies. Internet access is needed for this first step.
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto :error
)

echo Building Zhixingban...
call npm run build
if errorlevel 1 goto :error

echo Open http://127.0.0.1:5173 in your regular browser.
echo Keep this window open. Press Ctrl+C to stop.
echo If port 5173 is occupied, use the existing window or stop the other server.
start "" /b node "scripts\open-browser.mjs"
call npm run preview
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo Zhixingban could not start. Check the message above, then try again.
pause
exit /b 1
