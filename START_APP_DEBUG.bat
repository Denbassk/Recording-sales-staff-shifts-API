@echo off
:: chcp 65001 заменено на chcp 1251 для правильного отображения кириллицы в Windows
chcp 1251 >nul

echo ===============================================
echo   ДИАГНОСТИКА ПОДКЛЮЧЕНИЯ К СЕРВЕРУ
echo ===============================================
echo.

:: Проверка подключения к интернету
echo [1] Проверка интернет-соединения...
ping -n 1 google.com >nul 2>&1
if %errorlevel%==0 (
    echo    ? Интернет доступен
) else (
    echo    ? НЕТ ПОДКЛЮЧЕНИЯ К ИНТЕРНЕТУ!
    echo    Проверьте сетевое подключение
    pause
    exit /b 1
)

echo.
echo [2] Проверка доступности сервера Fly.io...
ping -n 1 shifts-api.fly.dev >nul 2>&1
if %errorlevel%==0 (
    echo    ? Сервер отвечает на ping
) else (
    echo    ? Сервер не отвечает на ping (может быть заблокирован ICMP)
)

echo.
echo [3] Проверка HTTPS подключения...
curl -I -s -o nul -w "%%{http_code}" https://shifts-api.fly.dev > temp_status.txt 2>nul
set /p STATUS=<temp_status.txt
del temp_status.txt

if "%STATUS%"=="200" (
    echo    ? Сервер доступен по HTTPS
) else if "%STATUS%"=="301" (
    echo    ? Сервер доступен (редирект)
) else if "%STATUS%"=="302" (
    echo    ? Сервер доступен (редирект)
) else if "%STATUS%"=="" (
    echo    ? НЕ УДАЕТСЯ ПОДКЛЮЧИТЬСЯ К СЕРВЕРУ
    echo    Возможные причины:
    echo    - Блокировка файрволом или антивирусом
    echo    - Проблемы с SSL сертификатом
    echo    - Сервер временно недоступен
) else (
    echo    ? Сервер вернул код: %STATUS%
)

echo.
echo [4] Проверка локального device.json...
if exist "device.json" (
    echo    ? Файл device.json найден
    type device.json | find "device_key" >nul
    if %errorlevel%==0 (
        echo    ? Ключ устройства присутствует
    ) else (
        echo    ? Ключ устройства не найден в файле
    )
) else (
    echo    ? Файл device.json не найден
)

echo.
echo ===============================================
echo   ВАРИАНТЫ ЗАПУСКА:
echo ===============================================
echo.
echo 1. Запустить в браузере (онлайн версия)
echo 2. Запустить локальный сервер
echo 3. Показать инструкцию по устранению проблем
echo 4. Выход
echo.
set /p choice="Выберите вариант (1-4): "

if "%choice%"=="1" goto :launch_browser
if "%choice%"=="2" goto :launch_local
if "%choice%"=="3" goto :show_help
if "%choice%"=="4" exit /b

:launch_browser
echo.
echo Запуск в браузере...
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --disable-web-security --user-data-dir="%TEMP%\chrome_temp" "https://shifts-api.fly.dev"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --disable-web-security --user-data-dir="%TEMP%\chrome_temp" "https://shifts-api.fly.dev"
) else (
    start msedge "https://shifts-api.fly.dev"
)
goto :end

:launch_local
echo.
echo Проверка Node.js...
node -v >nul 2>&1
if %errorlevel%==0 (
    echo ? Node.js установлен
    echo Запуск локального сервера...
    start cmd /k "cd /d %~dp0 && node server.cjs"
    timeout /t 3 >nul
    start http://localhost:3000
) else (
    echo ? Node.js не установлен!
    echo Для запуска локального сервера требуется Node.js
    echo Скачайте с https://nodejs.org/
    pause
)
goto :end

:show_help
echo.
echo ===============================================
echo   ИНСТРУКЦИЯ ПО УСТРАНЕНИЮ ПРОБЛЕМ:
echo ===============================================
echo.
echo 1. ПРОВЕРЬТЕ АНТИВИРУС:
echo    - Добавьте https://shifts-api.fly.dev в исключения
echo    - Временно отключите защиту для теста
echo.
echo 2. ПРОВЕРЬТЕ ФАЙРВОЛ:
echo    - Разрешите Chrome доступ к интернету
echo    - Проверьте корпоративные политики безопасности
echo.
echo 3. ОЧИСТИТЕ КЭШ БРАУЗЕРА:
echo    - Ctrl+Shift+Delete в Chrome
echo    - Выберите "Весь период"
echo    - Очистите кэш и куки
echo.
echo 4. ИСПОЛЬЗУЙТЕ АЛЬТЕРНАТИВНЫЙ БРАУЗЕР:
echo    - Microsoft Edge
echo    - Firefox
echo.
echo 5. ПРОВЕРЬТЕ ПРОКСИ-НАСТРОЙКИ:
echo    - Панель управления > Свойства браузера
echo    - Вкладка "Подключения" > "Настройка сети"
echo    - Убедитесь, что настройки корректны
echo.
pause
goto :end

:end
echo.
echo Нажмите любую клавишу для выхода...
pause >nul
exit