@echo off
rem Double-click to start the Roster Performance Tool on Windows.
rem The first run installs what it needs (a minute or two); after that it
rem starts in a few seconds. Close this window to stop the tool.

cd /d "%~dp0"
title Roster Performance Tool
set "URL=http://localhost:3002"

where node >nul 2>nul
if errorlevel 1 (
  start "" "https://nodejs.org/en/download"
  echo.
  echo Node.js isn't installed yet. Install the LTS version from the page that just opened,
  echo then double-click Start Roster Tool again.
  goto stop
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=12)?0:1)"
if errorlevel 1 (
  start "" "https://nodejs.org/en/download"
  echo.
  echo This tool needs a newer Node.js. Install the LTS version from the page that just opened, then try again.
  goto stop
)

if not exist node_modules (
  echo First run: installing what the tool needs. This takes a minute or two...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo The install didn't finish. Check your internet connection and try again.
    goto stop
  )
)

echo Starting...
call npm run build >nul
if errorlevel 1 (
  echo.
  echo The tool couldn't be built. Delete the node_modules folder and try again.
  goto stop
)

rem Open the browser once the server answers.
start "" /b powershell -NoProfile -Command "for($i=0;$i -lt 40;$i++){try{Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3002/api/state | Out-Null; Start-Process '%URL%'; break}catch{Start-Sleep -Milliseconds 250}}"

echo.
echo The Roster Performance Tool is running at %URL%
echo Keep this window open while you use it. Close it to stop the tool.
echo.
call npm run start --silent

:stop
echo.
pause
