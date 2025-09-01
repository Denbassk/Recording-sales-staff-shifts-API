@echo off
:: Скрипт автоматической синхронизации офлайн данных
:: Запускается в фоне каждый час через планировщик задач

set LOG_FILE=%TEMP%\shifts_sync.log
echo [%date% %time%] Запуск синхронизации >> "%LOG_FILE%"

:: Проверка доступности сервера
curl -s -o nul -w "%%{http_code}" --connect-timeout 5 https://shifts-api.fly.dev > %TEMP%\sync_check.txt 2>nul
set /p HTTP_CODE=<%TEMP%\sync_check.txt
del %TEMP%\sync_check.txt 2>nul

if "%HTTP_CODE%"=="200" (
    echo [%date% %time%] Сервер доступен, запуск синхронизации >> "%LOG_FILE%"
    
    :: Запуск синхронизации через браузер в скрытом режиме
    start /min "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --headless --disable-gpu --no-sandbox "file:///%~dp0sync_worker.html"
    
    echo [%date% %time%] Синхронизация запущена >> "%LOG_FILE%"
) else (
    echo [%date% %time%] Сервер недоступен, синхронизация отложена >> "%LOG_FILE%"
)

:: Очистка старых логов (оставляем только последние 100 строк)
for /f "tokens=1-4 delims=:.," %%a in ("%time%") do set TEMP_TIME=%%a%%b%%c%%d
set TEMP_FILE=%TEMP%\shifts_sync_%TEMP_TIME%.tmp

if exist "%LOG_FILE%" (
    for /f "skip=100 delims=" %%i in ('type "%LOG_FILE%"') do echo %%i >> "%TEMP_FILE%"
    if exist "%TEMP_FILE%" (
        move /y "%TEMP_FILE%" "%LOG_FILE%" >nul 2>&1
    )
)

exit /b 0