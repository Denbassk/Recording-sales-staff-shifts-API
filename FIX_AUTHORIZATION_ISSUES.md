# 🔧 ИНСТРУКЦИЯ ПО ИСПРАВЛЕНИЮ ПРОБЛЕМ С АВТОРИЗАЦИЕЙ

## Обнаруженные проблемы:

1. **Race Condition** - когда несколько продавцов входят одновременно, система не успевает корректно обработать запросы
2. **Отсутствие retry логики** - при временных сбоях связи система сразу сдается
3. **Нет блокировки на создание смен** - два одновременных запроса могут создать дубликаты
4. **Офлайн режим не может полноценно работать без локального сервера**

## Решение для продакшн сервера:

### Шаг 1: Обновите серверный код

Замените функцию логина в `server.cjs` на исправленную версию из файла `server_login_fix.js`.

Ключевые изменения:
- Добавлена блокировка `withLock` для предотвращения race conditions
- Улучшено логирование для отладки
- Добавлена retry логика при создании смен
- Более точная проверка существующих смен

### Шаг 2: Обновите клиентский код

Замените `script.js` на `script_improved.js`.

Ключевые изменения:
- Добавлена retry логика (3 попытки)
- Предотвращение двойных отправок
- Улучшенная синхронизация офлайн данных
- Автоматическая периодическая синхронизация

### Шаг 3: Деплой на Fly.io

```bash
# В папке проекта
cd D:\Shifts-api\Shifts-api

# Коммит изменений
git add .
git commit -m "Fix: Race condition and retry logic for login"

# Деплой на Fly.io
fly deploy
```

## Временное решение БЕЗ обновления сервера:

### Вариант 1: Последовательная авторизация

Создайте инструкцию для магазинов:
1. Первый продавец входит и ждет подтверждения
2. Второй продавец ждет 30 секунд
3. Затем входит второй продавец

### Вариант 2: Локальный прокси-сервер

Запустите локальный Node.js сервер, который будет кэшировать и управлять запросами:

```javascript
// local-proxy.js
const express = require('express');
const axios = require('axios');
const app = express();

const queue = [];
let processing = false;

app.use(express.json());

app.post('/login', async (req, res) => {
    // Добавляем в очередь
    return new Promise((resolve) => {
        queue.push({ req: req.body, res, resolve });
        processQueue();
    });
});

async function processQueue() {
    if (processing || queue.length === 0) return;
    
    processing = true;
    const item = queue.shift();
    
    try {
        // Отправляем на реальный сервер с задержкой
        await new Promise(r => setTimeout(r, 1000));
        const response = await axios.post('https://shifts-api.fly.dev/login', item.req);
        item.res.json(response.data);
    } catch (error) {
        item.res.status(error.response?.status || 500).json(error.response?.data || { error: 'Server error' });
    }
    
    processing = false;
    item.resolve();
    
    // Обрабатываем следующий
    setTimeout(processQueue, 500);
}

app.listen(3001, () => {
    console.log('Прокси запущен на порту 3001');
});
```

## Автоматизация добавления смен:

### Скрипт для массового добавления смен из файла:

```javascript
// bulk-shifts-upload.js
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Настройки подключения
const supabaseUrl = 'https://pdiminbulbzlywvnowta.supabase.co';
const supabaseKey = 'YOUR_SERVICE_ROLE_KEY'; // Используйте service role key

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadShifts(csvFile) {
    // Читаем CSV файл с пропущенными сменами
    // Формат: employee_name,date,store_address
    const data = fs.readFileSync(csvFile, 'utf8');
    const lines = data.split('\n').slice(1); // Пропускаем заголовок
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const line of lines) {
        if (!line.trim()) continue;
        
        const [employeeName, date, storeAddress] = line.split(',').map(s => s.trim());
        
        try {
            // Находим сотрудника
            const { data: employee } = await supabase
                .from('employees')
                .select('id')
                .ilike('fullname', employeeName)
                .single();
            
            if (!employee) {
                console.error(`Сотрудник не найден: ${employeeName}`);
                errorCount++;
                continue;
            }
            
            // Находим магазин
            let storeId = null;
            if (storeAddress && storeAddress !== 'Старший продавец') {
                const { data: store } = await supabase
                    .from('stores')
                    .select('id')
                    .eq('address', storeAddress)
                    .single();
                
                if (store) storeId = store.id;
            }
            
            // Создаем смену
            const { error } = await supabase
                .from('shifts')
                .insert({
                    employee_id: employee.id,
                    store_id: storeId,
                    shift_date: date,
                    started_at: new Date(`${date}T09:00:00`).toISOString()
                });
            
            if (error) {
                if (error.code === '23505') {
                    console.log(`Смена уже существует: ${employeeName} - ${date}`);
                } else {
                    console.error(`Ошибка создания смены: ${error.message}`);
                    errorCount++;
                }
            } else {
                console.log(`✓ Смена добавлена: ${employeeName} - ${date}`);
                successCount++;
            }
            
        } catch (err) {
            console.error(`Ошибка обработки: ${err.message}`);
            errorCount++;
        }
        
        // Задержка между запросами
        await new Promise(r => setTimeout(r, 200));
    }
    
    console.log(`\nИтого: успешно ${successCount}, ошибок ${errorCount}`);
}

// Запуск
uploadShifts('missed_shifts.csv');
```

### Формат CSV файла для загрузки:
```csv
employee_name,date,store_address
Иванов Иван,2025-08-29,Магазин №1
Петров Петр,2025-08-29,Магазин №2
Сидоров Сидор,2025-08-30,Старший продавец
```

## Мониторинг и диагностика:

### SQL запросы для проверки проблем:

```sql
-- Найти дубликаты смен
SELECT employee_id, shift_date, COUNT(*) as count
FROM shifts
GROUP BY employee_id, shift_date
HAVING COUNT(*) > 1;

-- Найти смены без магазина
SELECT s.*, e.fullname
FROM shifts s
JOIN employees e ON s.employee_id = e.id
WHERE s.store_id IS NULL
AND NOT e.id LIKE 'SProd%'
ORDER BY s.shift_date DESC;

-- Статистика по дням
SELECT 
    shift_date,
    COUNT(*) as total_shifts,
    COUNT(DISTINCT store_id) as stores_count,
    COUNT(CASE WHEN store_id IS NULL THEN 1 END) as no_store_count
FROM shifts
WHERE shift_date >= '2025-08-01'
GROUP BY shift_date
ORDER BY shift_date DESC;
```

## Рекомендации по предотвращению проблем:

### 1. Организационные меры:
- Назначьте ответственного в каждом магазине
- Введите график авторизации (первая смена в 8:00, вторая в 8:30)
- Создайте чек-лист для открытия магазина

### 2. Технические улучшения:
- Установите локальный кэширующий прокси
- Используйте автоматическую синхронизацию
- Внедрите SMS/Email уведомления об успешной регистрации

### 3. Резервные варианты:
- Google Forms для записи смен
- Telegram бот для регистрации
- Excel файл с макросом для отправки

## Контакты для помощи:

При возникновении проблем:
1. Запустите `START_APP_DEBUG.bat`
2. Сохраните скриншот ошибки
3. Запишите время и имя сотрудника
4. Отправьте администратору

---

**Важно:** После применения исправлений обязательно протестируйте систему в тестовом окружении перед развертыванием в продакшн!