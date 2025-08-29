@echo off
echo Starting Shifts Application...

:: Проверяем наличие Chrome
where chrome >nul 2>nul
if %errorlevel%==0 (
    start chrome "https://shifts-api.fly.dev"
    goto end
)

:: Проверяем наличие Chrome по стандартному пути
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "https://shifts-api.fly.dev"
    goto end
)

if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "https://shifts-api.fly.dev"
    goto end
)

:: Если Chrome не найден, пробуем Edge
where msedge >nul 2>nul
if %errorlevel%==0 (
    start msedge "https://shifts-api.fly.dev"
    goto end
)

:: В крайнем случае используем браузер по умолчанию
echo Chrome not found, opening in default browser...
start https://shifts-api.fly.dev

:end
exit