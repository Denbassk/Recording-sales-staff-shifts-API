@echo off
echo Starting Shifts Application...

:: Читаем device_key из локального файла если есть
set DEVICE_KEY=
if exist "device.json" (
    for /f "tokens=2 delims=:, " %%a in ('type device.json ^| find "device_key"') do (
        set DEVICE_KEY=%%~a
    )
)

:: Формируем URL с параметром
if "%DEVICE_KEY%"=="" (
    set APP_URL=https://shifts-api.fly.dev
) else (
    set APP_URL=https://shifts-api.fly.dev?device=%DEVICE_KEY%
)

:: Запускаем в Chrome
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%APP_URL%"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%APP_URL%"
) else (
    start msedge "%APP_URL%"
)

exit