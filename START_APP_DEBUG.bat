@echo off
:: chcp 65001 �������� �� chcp 1251 ��� ����������� ����������� ��������� � Windows
chcp 1251 >nul

echo ===============================================
echo   ����������� ����������� � �������
echo ===============================================
echo.

:: �������� ����������� � ���������
echo [1] �������� ��������-����������...
ping -n 1 google.com >nul 2>&1
if %errorlevel%==0 (
    echo    ? �������� ��������
) else (
    echo    ? ��� ����������� � ���������!
    echo    ��������� ������� �����������
    pause
    exit /b 1
)

echo.
echo [2] �������� ����������� ������� Fly.io...
ping -n 1 shifts-api.fly.dev >nul 2>&1
if %errorlevel%==0 (
    echo    ? ������ �������� �� ping
) else (
    echo    ? ������ �� �������� �� ping (����� ���� ������������ ICMP)
)

echo.
echo [3] �������� HTTPS �����������...
curl -I -s -o nul -w "%%{http_code}" https://shifts-api.fly.dev > temp_status.txt 2>nul
set /p STATUS=<temp_status.txt
del temp_status.txt

if "%STATUS%"=="200" (
    echo    ? ������ �������� �� HTTPS
) else if "%STATUS%"=="301" (
    echo    ? ������ �������� (��������)
) else if "%STATUS%"=="302" (
    echo    ? ������ �������� (��������)
) else if "%STATUS%"=="" (
    echo    ? �� ������� ������������ � �������
    echo    ��������� �������:
    echo    - ���������� ��������� ��� �����������
    echo    - �������� � SSL ������������
    echo    - ������ �������� ����������
) else (
    echo    ? ������ ������ ���: %STATUS%
)

echo.
echo [4] �������� ���������� device.json...
if exist "device.json" (
    echo    ? ���� device.json ������
    type device.json | find "device_key" >nul
    if %errorlevel%==0 (
        echo    ? ���� ���������� ������������
    ) else (
        echo    ? ���� ���������� �� ������ � �����
    )
) else (
    echo    ? ���� device.json �� ������
)

echo.
echo ===============================================
echo   �������� �������:
echo ===============================================
echo.
echo 1. ��������� � �������� (������ ������)
echo 2. ��������� ��������� ������
echo 3. �������� ���������� �� ���������� �������
echo 4. �����
echo.
set /p choice="�������� ������� (1-4): "

if "%choice%"=="1" goto :launch_browser
if "%choice%"=="2" goto :launch_local
if "%choice%"=="3" goto :show_help
if "%choice%"=="4" exit /b

:launch_browser
echo.
echo ������ � ��������...
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
echo �������� Node.js...
node -v >nul 2>&1
if %errorlevel%==0 (
    echo ? Node.js ����������
    echo ������ ���������� �������...
    start cmd /k "cd /d %~dp0 && node server.cjs"
    timeout /t 3 >nul
    start http://localhost:3000
) else (
    echo ? Node.js �� ����������!
    echo ��� ������� ���������� ������� ��������� Node.js
    echo �������� � https://nodejs.org/
    pause
)
goto :end

:show_help
echo.
echo ===============================================
echo   ���������� �� ���������� �������:
echo ===============================================
echo.
echo 1. ��������� ���������:
echo    - �������� https://shifts-api.fly.dev � ����������
echo    - �������� ��������� ������ ��� �����
echo.
echo 2. ��������� �������:
echo    - ��������� Chrome ������ � ���������
echo    - ��������� ������������� �������� ������������
echo.
echo 3. �������� ��� ��������:
echo    - Ctrl+Shift+Delete � Chrome
echo    - �������� "���� ������"
echo    - �������� ��� � ����
echo.
echo 4. ����������� �������������� �������:
echo    - Microsoft Edge
echo    - Firefox
echo.
echo 5. ��������� ������-���������:
echo    - ������ ���������� > �������� ��������
echo    - ������� "�����������" > "��������� ����"
echo    - ���������, ��� ��������� ���������
echo.
pause
goto :end

:end
echo.
echo ������� ����� ������� ��� ������...
pause >nul
exit