@echo off
chcp 65001 >nul
title Массовая загрузка смен

echo ===============================================
echo   МАССОВАЯ ЗАГРУЗКА ПРОПУЩЕННЫХ СМЕН
echo ===============================================
echo.

:: Проверяем наличие Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ✗ Node.js не установлен!
    echo.
    echo Для работы скрипта требуется Node.js
    echo Скачайте с https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Проверяем наличие .env файла
if not exist ".env" (
    echo ✗ Файл .env не найден!
    echo.
    echo Создайте файл .env с настройками Supabase
    echo.
    pause
    exit /b 1
)

:: Меню выбора
:menu
echo Выберите действие:
echo.
echo 1. Создать пример CSV файла
echo 2. Загрузить смены из CSV файла
echo 3. Показать инструкцию
echo 4. Выход
echo.
set /p choice="Ваш выбор (1-4): "

if "%choice%"=="1" goto :create_sample
if "%choice%"=="2" goto :upload_shifts
if "%choice%"=="3" goto :show_help
if "%choice%"=="4" exit /b 0

echo Неверный выбор!
echo.
goto :menu

:create_sample
echo.
echo Создание примера CSV файла...
node bulk-shifts-upload.js --sample
echo.
pause
goto :menu

:upload_shifts
echo.
echo Доступные CSV файлы:
echo.
dir /b *.csv 2>nul
if %errorlevel% neq 0 (
    echo Нет CSV файлов в текущей папке
    echo.
    pause
    goto :menu
)
echo.
set /p filename="Введите имя CSV файла: "

if not exist "%filename%" (
    echo.
    echo ✗ Файл %filename% не найден!
    echo.
    pause
    goto :menu
)

echo.
echo Загрузка смен из файла %filename%...
echo.
node bulk-shifts-upload.js "%filename%"
echo.
pause
goto :menu

:show_help
echo.
echo ===============================================
echo   ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ
echo ===============================================
echo.
echo ФОРМАТ CSV ФАЙЛА:
echo -----------------
echo Первая строка - заголовки:
echo employee_name,date,store_address
echo.
echo Последующие строки - данные:
echo Иванов Иван Иванович,2025-08-29,Магазин №1
echo Петров Петр Петрович,2025-08-29,Магазин №2
echo Сидоров Сидор,2025-08-30,Старший продавец
echo.
echo ВАЖНО:
echo ------
echo - Имя сотрудника должно точно совпадать с БД
echo - Дата в формате ГГГГ-ММ-ДД (2025-08-29)
echo - Адрес магазина точно как в системе
echo - Для старших продавцов: "Старший продавец"
echo - Можно оставить адрес пустым
echo.
echo ПОДГОТОВКА ДАННЫХ:
echo ------------------
echo 1. Откройте Excel
echo 2. Создайте таблицу с 3 столбцами
echo 3. Заполните данные
echo 4. Сохраните как CSV (разделители - запятые)
echo.
echo ОБРАБОТКА ОШИБОК:
echo -----------------
echo - Дубликаты автоматически пропускаются
echo - Неизвестные сотрудники помечаются ошибкой
echo - В конце выводится статистика
echo.
pause
goto :menu