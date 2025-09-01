# ИНСТРУКЦИЯ ПО РАЗВЕРТЫВАНИЮ В МАГАЗИНАХ

## 🚀 Быстрый старт для сотрудников магазина:

### Вариант 1: Основной (рекомендуется)
1. На рабочем столе найдите файл **"START_SMART"**
2. Дважды щелкните по нему
3. Система автоматически определит режим работы и откроет нужную версию

### Вариант 2: Если не работает автоматический запуск
1. Откройте браузер Google Chrome или Microsoft Edge
2. В адресной строке введите: `https://shifts-api.fly.dev`
3. Добавьте страницу в закладки (Ctrl+D) для быстрого доступа

### Вариант 3: Офлайн режим
1. Откройте файл **"index_local.html"**
2. Работайте как обычно - данные сохранятся локально
3. При появлении интернета данные автоматически отправятся

---

## 👨‍💻 Для IT-администратора:

### Развертывание на новом компьютере:

1. **Скопируйте папку Shifts-api** на диск D:\ или C:\
   ```
   D:\Shifts-api\Shifts-api\
   ```

2. **Создайте ярлыки на рабочем столе:**
   - START_SMART.bat → "Учет смен"
   - START_APP_DEBUG.bat → "Учет смен (диагностика)"

3. **Настройте device.json для каждого магазина:**
   ```json
   {
     "device_key": "dev_УНИКАЛЬНЫЙ_КЛЮЧ_МАГАЗИНА"
   }
   ```

4. **Проверьте работоспособность:**
   - Запустите test_connection.html
   - Все тесты должны быть зелеными

### Настройка сети и безопасности:

#### Windows Defender / Антивирус:
```powershell
# PowerShell (от администратора)
Add-MpPreference -ExclusionPath "D:\Shifts-api"
Add-MpPreference -ExclusionProcess "chrome.exe"
```

#### Корпоративный файрвол:
Добавьте в белый список:
- Домен: `*.fly.dev`
- Домен: `*.supabase.co`
- Порты: 443 (HTTPS), 80 (HTTP)

#### Групповые политики (GPO):
```
Конфигурация компьютера → Административные шаблоны → 
Windows Components → Internet Explorer → 
Internet Control Panel → Security Page → 
Site to Zone Assignment List

Добавить:
https://shifts-api.fly.dev - Зона 2 (Доверенные сайты)
https://*.supabase.co - Зона 2 (Доверенные сайты)
```

#### Прокси-сервер:
Если используется корпоративный прокси, добавьте исключения:
```
*.fly.dev;*.supabase.co;shifts-api.fly.dev
```

### Массовое развертывание через скрипт:

<function_calls>
<invoke name="filesystem:write_file">
<parameter name="content">@echo off
:: Скрипт массового развертывания системы учета смен
:: Запускать от имени администратора

echo ================================================
echo   УСТАНОВКА СИСТЕМЫ УЧЕТА СМЕН
echo ================================================
echo.

set INSTALL_DIR=D:\Shifts-api\Shifts-api
set DESKTOP=%USERPROFILE%\Desktop

:: Проверка прав администратора
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ОШИБКА: Требуются права администратора!
    echo Запустите скрипт от имени администратора.
    pause
    exit /b 1
)

:: Создание директории если не существует
if not exist "%INSTALL_DIR%" (
    echo Создание директории...
    mkdir "%INSTALL_DIR%"
)

:: Копирование файлов (предполагается, что файлы находятся в текущей директории)
echo Копирование файлов...
xcopy /E /Y "*.bat" "%INSTALL_DIR%\" >nul 2>&1
xcopy /E /Y "*.html" "%INSTALL_DIR%\" >nul 2>&1
xcopy /E /Y "*.js" "%INSTALL_DIR%\" >nul 2>&1
xcopy /E /Y "*.json" "%INSTALL_DIR%\" >nul 2>&1
xcopy /E /Y "*.md" "%INSTALL_DIR%\" >nul 2>&1
xcopy /E /Y "*.ps1" "%INSTALL_DIR%\" >nul 2>&1

:: Создание ярлыков на рабочем столе
echo Создание ярлыков...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\Учет смен.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\START_SMART.bat'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.IconLocation = 'shell32.dll,13'; $Shortcut.Save()"

powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\Учет смен (Диагностика).lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\START_APP_DEBUG.bat'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.IconLocation = 'shell32.dll,23'; $Shortcut.Save()"

:: Добавление в исключения Windows Defender
echo Настройка Windows Defender...
powershell -Command "Add-MpPreference -ExclusionPath '%INSTALL_DIR%'" >nul 2>&1

:: Проверка и установка Chrome если нет
echo Проверка браузера...
if not exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    if not exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
        echo.
        echo ВНИМАНИЕ: Google Chrome не установлен!
        echo Рекомендуется установить Chrome для лучшей совместимости.
        echo Скачать: https://www.google.com/chrome/
        echo.
    )
)

:: Настройка запланированной задачи для синхронизации
echo Настройка автосинхронизации...
schtasks /create /tn "ShiftsSync" /tr "%INSTALL_DIR%\sync_offline.bat" /sc hourly /f >nul 2>&1

:: Тестирование подключения
echo.
echo Тестирование подключения к серверу...
curl -s -o nul -w "Status: %%{http_code}" https://shifts-api.fly.dev
echo.

:: Финальная проверка
if exist "%INSTALL_DIR%\START_SMART.bat" (
    echo ✓ Установка завершена успешно!
    echo.
    echo Созданы ярлыки на рабочем столе:
    echo - "Учет смен" - основной запуск
    echo - "Учет смен (Диагностика)" - запуск с диагностикой
    echo.
    echo Для запуска используйте ярлык "Учет смен" на рабочем столе.
) else (
    echo ✗ Ошибка установки!
    echo Проверьте наличие файлов и повторите установку.
)

echo.
pause