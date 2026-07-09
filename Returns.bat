@echo off
chcp 65001 >nul
title Family Market - Повернення

set "DEVICE_KEY="
if exist "device.json" (
    for /f "tokens=2 delims=:," %%a in ('findstr "device_key" device.json') do (
        set "DEVICE_KEY=%%~a"
    )
)
set "DEVICE_KEY=%DEVICE_KEY: =%"
set "DEVICE_KEY=%DEVICE_KEY:"=%"

set "APP_URL=https://shifts-api.fly.dev/returns.html"
if defined DEVICE_KEY (
    set "APP_URL=https://shifts-api.fly.dev/returns.html?device=%DEVICE_KEY%"
)

echo Starting Returns Application...
echo URL: %APP_URL%

set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
    start "" "%CHROME%" --new-window "%APP_URL%"
) else (
    start "" "msedge.exe" "%APP_URL%"
)

exit
