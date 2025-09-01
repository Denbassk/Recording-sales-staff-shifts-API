# PowerShell скрипт для диагностики подключения к серверу Shifts API
# Кодировка: UTF-8 with BOM

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  ДИАГНОСТИКА СИСТЕМЫ УЧЕТА СМЕН" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Функция для проверки подключения
function Test-ServerConnection {
    param($Url, $Method = "GET")
    
    try {
        $response = Invoke-WebRequest -Uri $Url -Method $Method -TimeoutSec 10 -UseBasicParsing
        return @{
            Success = $true
            StatusCode = $response.StatusCode
            Message = "OK"
        }
    }
    catch {
        if ($_.Exception.Response) {
            return @{
                Success = $false
                StatusCode = [int]$_.Exception.Response.StatusCode
                Message = $_.Exception.Message
            }
        }
        else {
            return @{
                Success = $false
                StatusCode = 0
                Message = $_.Exception.Message
            }
        }
    }
}

# 1. Проверка интернет соединения
Write-Host "[1] Проверка интернет-соединения..." -ForegroundColor Yellow
$pingResult = Test-Connection -ComputerName "8.8.8.8" -Count 1 -Quiet
if ($pingResult) {
    Write-Host "    ✓ Интернет доступен" -ForegroundColor Green
} else {
    Write-Host "    ✗ НЕТ ПОДКЛЮЧЕНИЯ К ИНТЕРНЕТУ!" -ForegroundColor Red
    Write-Host "    Проверьте сетевое подключение" -ForegroundColor Red
    Read-Host "Нажмите Enter для выхода"
    exit
}

# 2. Проверка DNS
Write-Host ""
Write-Host "[2] Проверка DNS разрешения..." -ForegroundColor Yellow
try {
    $dnsResult = Resolve-DnsName "shifts-api.fly.dev" -ErrorAction Stop
    Write-Host "    ✓ DNS работает корректно" -ForegroundColor Green
    Write-Host "    IP адрес: $($dnsResult[0].IPAddress)" -ForegroundColor Gray
}
catch {
    Write-Host "    ✗ Ошибка DNS разрешения!" -ForegroundColor Red
    Write-Host "    $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Проверка доступности сервера
Write-Host ""
Write-Host "[3] Проверка доступности сервера..." -ForegroundColor Yellow
$serverUrl = "https://shifts-api.fly.dev"
$result = Test-ServerConnection -Url $serverUrl

if ($result.Success) {
    Write-Host "    ✓ Сервер доступен (HTTP $($result.StatusCode))" -ForegroundColor Green
} else {
    Write-Host "    ✗ Сервер недоступен!" -ForegroundColor Red
    Write-Host "    Ошибка: $($result.Message)" -ForegroundColor Red
    
    # Дополнительная диагностика
    Write-Host ""
    Write-Host "    Возможные причины:" -ForegroundColor Yellow
    Write-Host "    • Блокировка корпоративным файрволом" -ForegroundColor Gray
    Write-Host "    • Блокировка антивирусом" -ForegroundColor Gray
    Write-Host "    • Проблемы с SSL сертификатом" -ForegroundColor Gray
    Write-Host "    • Прокси-сервер блокирует подключение" -ForegroundColor Gray
}

# 4. Проверка API endpoint
Write-Host ""
Write-Host "[4] Проверка API endpoint..." -ForegroundColor Yellow
$apiUrl = "$serverUrl/employees"
$apiResult = Test-ServerConnection -Url $apiUrl

if ($apiResult.Success) {
    Write-Host "    ✓ API доступен" -ForegroundColor Green
} else {
    Write-Host "    ✗ API недоступен!" -ForegroundColor Red
    Write-Host "    Код ошибки: $($apiResult.StatusCode)" -ForegroundColor Red
}

# 5. Проверка локальных файлов
Write-Host ""
Write-Host "[5] Проверка локальных файлов..." -ForegroundColor Yellow

$deviceJsonPath = Join-Path $PSScriptRoot "device.json"
if (Test-Path $deviceJsonPath) {
    Write-Host "    ✓ device.json найден" -ForegroundColor Green
    try {
        $deviceContent = Get-Content $deviceJsonPath -Raw | ConvertFrom-Json
        if ($deviceContent.device_key) {
            Write-Host "    ✓ Ключ устройства: $($deviceContent.device_key.Substring(0,15))..." -ForegroundColor Green
        } else {
            Write-Host "    ✗ Ключ устройства не найден в файле" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "    ✗ Ошибка чтения device.json" -ForegroundColor Red
    }
} else {
    Write-Host "    ⚠ device.json не найден" -ForegroundColor Yellow
}

# 6. Проверка прокси настроек
Write-Host ""
Write-Host "[6] Проверка прокси настроек..." -ForegroundColor Yellow
$proxy = [System.Net.WebRequest]::GetSystemWebProxy()
$proxyUri = $proxy.GetProxy($serverUrl)

if ($proxyUri.ToString() -eq $serverUrl) {
    Write-Host "    ✓ Прямое подключение (без прокси)" -ForegroundColor Green
} else {
    Write-Host "    ⚠ Используется прокси: $proxyUri" -ForegroundColor Yellow
    Write-Host "    Это может вызывать проблемы с подключением" -ForegroundColor Yellow
}

# 7. Проверка SSL/TLS
Write-Host ""
Write-Host "[7] Проверка SSL/TLS..." -ForegroundColor Yellow
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-Host "    ✓ TLS 1.2 поддерживается" -ForegroundColor Green
}
catch {
    Write-Host "    ✗ Проблема с SSL/TLS" -ForegroundColor Red
}

# Итоговые рекомендации
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  РЕКОМЕНДАЦИИ" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

if ($result.Success -and $apiResult.Success) {
    Write-Host "✓ Система работает нормально!" -ForegroundColor Green
    Write-Host "Можете запускать приложение через START_APP.bat" -ForegroundColor Green
} else {
    Write-Host "Попробуйте следующее:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Отключите антивирус на время теста" -ForegroundColor White
    Write-Host "2. Добавьте https://shifts-api.fly.dev в исключения файрвола" -ForegroundColor White
    Write-Host "3. Проверьте настройки прокси в браузере" -ForegroundColor White
    Write-Host "4. Попробуйте открыть в другом браузере" -ForegroundColor White
    Write-Host "5. Очистите кэш и куки браузера (Ctrl+Shift+Delete)" -ForegroundColor White
    Write-Host "6. Используйте локальную версию (index_local.html)" -ForegroundColor White
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Read-Host "Нажмите Enter для выхода"