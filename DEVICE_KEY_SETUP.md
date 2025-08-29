# ИНСТРУКЦИЯ ПО НАСТРОЙКЕ DEVICE_KEY ДЛЯ МАГАЗИНОВ

## Проблема:
После перехода на серверную версию, локальный файл device.json больше не работает.

## Решение:

### Вариант 1: Через URL (рекомендуется)
1. Используйте файл START_WITH_DEVICE.bat
2. Он автоматически читает device.json и передает его в URL

### Вариант 2: Ручная настройка для каждого магазина
Создайте ярлык с конкретным device_key:

```
chrome.exe "https://shifts-api.fly.dev?device=YOUR_DEVICE_KEY_HERE"
```

Например для магазина на ул. Пушкина:
```
chrome.exe "https://shifts-api.fly.dev?device=pushkin_store_001"
```

### Вариант 3: Централизованное управление
Храните device_key в localStorage браузера:

1. Откройте приложение первый раз
2. Нажмите F12 (консоль разработчика)
3. Введите: 
```javascript
localStorage.setItem('deviceKey', 'YOUR_DEVICE_KEY_HERE');
```
4. Закройте консоль

### Структура device.json (для справки):
```json
{
  "device_key": "store_unique_id_001",
  "store_name": "Магазин №1",
  "address": "ул. Пушкина, 10"
}
```

## Важно:
- device_key должен соответствовать записи в БД
- После первого запуска device_key сохраняется в браузере
- Папка public больше не требуется на компьютерах магазинов