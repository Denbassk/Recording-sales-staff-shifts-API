# 🔧 ИТОГОВОЕ РЕШЕНИЕ ПРОБЛЕМЫ "НЕТ СВЯЗИ С СЕРВЕРОМ"

## 📝 Краткая инструкция для магазинов:

### Если система не работает, выполните по порядку:

1. **Запустите `START_SMART.bat`**
   - Файл автоматически определит проблему
   - Запустит подходящую версию (онлайн или офлайн)

2. **Если не помогло - запустите `START_APP_DEBUG.bat`**
   - Выберите пункт 3 для диагностики
   - Покажите результаты IT-специалисту

3. **Временное решение - работа офлайн:**
   - Откройте файл `index_local.html`
   - Вводите данные как обычно
   - Они сохранятся и отправятся позже автоматически

---

## 🎯 Для IT-администратора - полное решение:

### Проблема №1: Блокировка файрволом/антивирусом

**Решение:**
```powershell
# PowerShell от администратора
# Добавить в исключения Windows Defender
Add-MpPreference -ExclusionPath "D:\Shifts-api"
Add-MpPreference -ExclusionProcess "chrome.exe"

# Добавить правило файрвола
New-NetFirewallRule -DisplayName "Shifts API Allow" -Direction Outbound -Action Allow -RemoteAddress 66.241.125.162 -Protocol TCP -RemotePort 443
```

### Проблема №2: Корпоративный прокси

**Решение:**
1. Откройте Internet Options → Connections → LAN Settings
2. В Advanced добавьте в исключения: `*.fly.dev;*.supabase.co`
3. Или настройте PAC файл:
```javascript
function FindProxyForURL(url, host) {
    if (shExpMatch(host, "*.fly.dev") || 
        shExpMatch(host, "*.supabase.co")) {
        return "DIRECT";
    }
    return "PROXY proxy.company.com:8080";
}
```

### Проблема №3: Старые браузеры

**Решение:**
```batch
:: Проверка и обновление браузера
@echo off
wmic datafile where name="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" get Version /value
:: Если версия < 90, требуется обновление
```

### Проблема №4: SSL/TLS настройки

**Решение через реестр:**
```batch
reg add "HKLM\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.2\Client" /v DisabledByDefault /t REG_DWORD /d 0 /f
reg add "HKLM\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.2\Client" /v Enabled /t REG_DWORD /d 1 /f
```

---

## 🚀 Автоматическое развертывание для всех магазинов:

### Шаг 1: Подготовка
1. Скачайте все файлы в папку
2. Настройте уникальные `device.json` для каждого магазина

### Шаг 2: Установка
Запустите `INSTALL.bat` от администратора на каждом компьютере

### Шаг 3: Проверка
Запустите `test_connection.html` - все тесты должны быть зелеными

---

## ⚡ Экстренные меры:

### Если ничего не работает:

1. **Мобильный хотспот:**
   - Подключите компьютер к мобильному интернету
   - Откройте https://shifts-api.fly.dev

2. **Запись на бумаге:**
   - Записывайте: Имя, Время прихода, Магазин
   - В конце дня отправьте фото администратору

3. **Альтернативный доступ:**
   - С любого устройства откройте: https://shifts-api.fly.dev
   - Введите данные всех сотрудников

---

## 📊 Мониторинг и поддержка:

### Проверка логов:
```batch
type %TEMP%\shifts_sync.log
```

### Проверка офлайн данных:
Откройте консоль браузера (F12) на странице системы и введите:
```javascript
JSON.parse(localStorage.getItem('offlineShifts') || '[]').length
```

### Принудительная синхронизация:
```batch
D:\Shifts-api\Shifts-api\sync_offline.bat
```

---

## ✅ Контрольный чек-лист:

- [ ] START_SMART.bat запускается
- [ ] test_connection.html показывает все зеленые тесты
- [ ] https://shifts-api.fly.dev открывается в браузере
- [ ] device.json существует и содержит ключ
- [ ] Антивирус не блокирует
- [ ] Прокси настроен правильно
- [ ] Chrome или Edge установлен и обновлен

---

## 📞 Контакты для экстренной помощи:

1. Запустите диагностику: `START_APP_DEBUG.bat`
2. Сделайте скриншот результатов
3. Отправьте администратору

**Версия документа:** 1.0
**Дата обновления:** 01.09.2025