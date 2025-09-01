// bulk-shifts-upload.js
// Скрипт для массовой загрузки пропущенных смен из CSV файла

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const readline = require('readline');
require('dotenv').config();

// Настройки подключения из .env файла
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Ошибка: Не найдены переменные окружения SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Статистика
let stats = {
    total: 0,
    success: 0,
    skipped: 0,
    errors: 0,
    duplicates: 0
};

// Кэш для оптимизации
const employeeCache = new Map();
const storeCache = new Map();

// Получение ID сотрудника с кэшированием
async function getEmployeeId(fullname) {
    const normalized = fullname.trim().toLowerCase();
    
    if (employeeCache.has(normalized)) {
        return employeeCache.get(normalized);
    }
    
    const { data, error } = await supabase
        .from('employees')
        .select('id, fullname')
        .ilike('fullname', fullname.trim())
        .single();
    
    if (data) {
        employeeCache.set(normalized, data.id);
        return data.id;
    }
    
    return null;
}

// Получение ID магазина с кэшированием
async function getStoreId(address) {
    if (!address || address === 'Старший продавец') {
        return null;
    }
    
    const normalized = address.trim();
    
    if (storeCache.has(normalized)) {
        return storeCache.get(normalized);
    }
    
    const { data, error } = await supabase
        .from('stores')
        .select('id, address')
        .eq('address', normalized)
        .single();
    
    if (data) {
        storeCache.set(normalized, data.id);
        return data.id;
    }
    
    return null;
}

// Проверка существования смены
async function shiftExists(employeeId, date) {
    const { data, error } = await supabase
        .from('shifts')
        .select('id')
        .eq('employee_id', employeeId)
        .eq('shift_date', date)
        .single();
    
    return !!data;
}

// Создание смены
async function createShift(employeeId, storeId, date) {
    // Определяем время начала смены (9:00 по умолчанию)
    const startTime = new Date(`${date}T09:00:00`).toISOString();
    
    const { data, error } = await supabase
        .from('shifts')
        .insert({
            employee_id: employeeId,
            store_id: storeId,
            shift_date: date,
            started_at: startTime
        })
        .select()
        .single();
    
    if (error) {
        if (error.code === '23505') {
            return { success: false, duplicate: true };
        }
        throw error;
    }
    
    return { success: true, data };
}

// Обработка одной строки
async function processLine(line, lineNumber) {
    const parts = line.split(',').map(s => s.trim());
    
    if (parts.length < 2) {
        console.error(`Строка ${lineNumber}: Неверный формат`);
        stats.errors++;
        return;
    }
    
    const [employeeName, date, storeAddress = ''] = parts;
    
    // Валидация даты
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.error(`Строка ${lineNumber}: Неверный формат даты: ${date}`);
        stats.errors++;
        return;
    }
    
    try {
        // Получаем ID сотрудника
        const employeeId = await getEmployeeId(employeeName);
        if (!employeeId) {
            console.error(`Строка ${lineNumber}: Сотрудник не найден: ${employeeName}`);
            stats.errors++;
            return;
        }
        
        // Проверяем существование смены
        if (await shiftExists(employeeId, date)) {
            console.log(`Строка ${lineNumber}: Смена уже существует: ${employeeName} - ${date}`);
            stats.duplicates++;
            stats.skipped++;
            return;
        }
        
        // Получаем ID магазина
        const storeId = await getStoreId(storeAddress);
        
        // Создаем смену
        const result = await createShift(employeeId, storeId, date);
        
        if (result.success) {
            console.log(`✓ Строка ${lineNumber}: Смена создана: ${employeeName} - ${date} - ${storeAddress || 'Без магазина'}`);
            stats.success++;
        } else if (result.duplicate) {
            console.log(`Строка ${lineNumber}: Дубликат: ${employeeName} - ${date}`);
            stats.duplicates++;
            stats.skipped++;
        }
        
    } catch (error) {
        console.error(`Строка ${lineNumber}: Ошибка: ${error.message}`);
        stats.errors++;
    }
}

// Основная функция
async function uploadShifts(csvFile) {
    console.log('========================================');
    console.log('МАССОВАЯ ЗАГРУЗКА СМЕН');
    console.log('========================================');
    console.log(`Файл: ${csvFile}`);
    console.log('');
    
    if (!fs.existsSync(csvFile)) {
        console.error(`Файл не найден: ${csvFile}`);
        return;
    }
    
    const fileStream = fs.createReadStream(csvFile);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    
    let lineNumber = 0;
    let isHeader = true;
    const lines = [];
    
    // Читаем все строки
    for await (const line of rl) {
        lineNumber++;
        
        // Пропускаем пустые строки
        if (!line.trim()) continue;
        
        // Пропускаем заголовок
        if (isHeader) {
            isHeader = false;
            console.log('Заголовок:', line);
            console.log('');
            continue;
        }
        
        lines.push({ line, number: lineNumber });
        stats.total++;
    }
    
    console.log(`Найдено строк для обработки: ${stats.total}`);
    console.log('Начинаем обработку...\n');
    
    // Обрабатываем строки последовательно
    for (const { line, number } of lines) {
        await processLine(line, number);
        
        // Небольшая задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Выводим статистику
    console.log('\n========================================');
    console.log('РЕЗУЛЬТАТЫ:');
    console.log('========================================');
    console.log(`Всего строк:     ${stats.total}`);
    console.log(`Успешно создано: ${stats.success}`);
    console.log(`Пропущено:       ${stats.skipped}`);
    console.log(`- Дубликаты:     ${stats.duplicates}`);
    console.log(`Ошибок:          ${stats.errors}`);
    console.log('========================================');
}

// Функция для создания примера CSV файла
function createSampleCSV() {
    const sample = `employee_name,date,store_address
Иванов Иван Иванович,2025-08-29,Магазин №1
Петров Петр Петрович,2025-08-29,Магазин №2
Сидоров Сидор Сидорович,2025-08-30,Старший продавец
Козлов Козел Козлович,2025-08-30,`;
    
    fs.writeFileSync('sample_shifts.csv', sample, 'utf8');
    console.log('Создан файл примера: sample_shifts.csv');
}

// Парсинг аргументов командной строки
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Использование:');
    console.log('  node bulk-shifts-upload.js <csv-file>  - Загрузить смены из CSV файла');
    console.log('  node bulk-shifts-upload.js --sample    - Создать пример CSV файла');
    console.log('');
    console.log('Формат CSV файла:');
    console.log('  employee_name,date,store_address');
    console.log('  Иванов Иван,2025-08-29,Магазин №1');
    console.log('');
    process.exit(0);
}

if (args[0] === '--sample') {
    createSampleCSV();
} else {
    uploadShifts(args[0]);
}