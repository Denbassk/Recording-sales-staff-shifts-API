@echo off
chcp 65001 >nul
title Система учета смен - Запуск

echo ===============================================
echo   СИСТЕМА УЧЕТА СМЕН
echo ===============================================
echo.
echo Проверка подключения к серверу...

:: Проверяем доступность сервера с помощью curl
curl -s -o nul -w "%%{http_code}" --connect-timeout 5 https://shifts-api.fly.dev > temp_check.txt 2>nul
set /p HTTP_CODE=<temp_check.txt
del temp_check.txt 2>nul

if "%HTTP_CODE%"=="200" goto :online_mode
if "%HTTP_CODE%"=="301" goto :online_mode
if "%HTTP_CODE%"=="302" goto :online_mode

:: Если сервер недоступен, запускаем локальную версию
goto :offline_mode

:online_mode
echo ✓ Сервер доступен. Запуск онлайн версии...
echo.

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

:: Запускаем в браузере
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%APP_URL%"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%APP_URL%"
) else (
    start msedge "%APP_URL%"
)
goto :end

:offline_mode
echo ⚠ Сервер недоступен. Запуск локальной версии...
echo.
echo ВНИМАНИЕ: Работа в офлайн режиме!
echo Данные будут сохранены локально и отправлены
echo на сервер при восстановлении подключения.
echo.

:: Проверяем наличие локальной версии
if not exist "index_local.html" (
    echo ✗ Локальная версия не найдена!
    echo Создание локальной версии...
    
    :: Копируем основной index.html если он есть
    if exist "index.html" (
        copy "index.html" "index_local.html" >nul
        echo ✓ Локальная версия создана
    ) else (
        echo ✗ Не удалось создать локальную версию
        echo.
        echo Попробуйте:
        echo 1. Проверить интернет-соединение
        echo 2. Запустить diagnose.ps1 для диагностики
        pause
        exit /b 1
    )
)

:: Запускаем локальную версию
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --allow-file-access-from-files "%CD%\index_local.html"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --allow-file-access-from-files "%CD%\index_local.html"
) else (
    start msedge --allow-file-access-from-files "%CD%\index_local.html"
)

:end
exit