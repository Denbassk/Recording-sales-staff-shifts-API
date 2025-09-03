// --- Подключение модулей и настройка ---
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const upload = multer({ storage: multer.memoryStorage() });
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

// --- Подключение к Supabase ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();

// НОВЫЙ БЛОК: Отключаем кэширование для файла входа
app.use('/script.js', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// --- Настройка middleware ---
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// --- КОНСТАНТЫ ДЛЯ РАСЧЕТОВ И ВАЛИДАЦИИ ---
const MAX_CARD_PAYMENT = 8600; 
const ADVANCE_PERCENTAGE = 0.9; 
const MAX_ADVANCE_AMOUNT = 7900;
const COMPANY_TAX_RATE = 0.22; 
const FIXED_CARD_PAYMENT_FOR_REPORT = 8600;

const MAX_MANUAL_BONUS = 10000;
const MAX_PENALTY = 5000;
const MAX_SHORTAGE = 10000;
const MIN_YEAR = 2024;

// --- Блокировка для предотвращения race conditions ---
const operationLocks = new Map();

async function withLock(key, operation) {
    const lockKey = `lock_${key}`;
    while (operationLocks.get(lockKey)) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    operationLocks.set(lockKey, true);
    try {
        return await operation();
    } finally {
        operationLocks.delete(lockKey);
    }
}

// --- ФУНКЦИИ ВАЛИДАЦИИ ---
function validateDate(dateStr, allowFuture = false) {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    if (isNaN(date.getTime())) return { valid: false, error: 'Некорректная дата' };
    if (!allowFuture && date > today) return { valid: false, error: 'Дата не может быть в будущем' };
    if (date.getFullYear() < MIN_YEAR) return { valid: false, error: `Дата не может быть раньше ${MIN_YEAR} года` };
    return { valid: true };
}

function validateAmount(amount, max, fieldName) {
    const num = parseFloat(amount);
    if (isNaN(num)) return { valid: false, error: `${fieldName} должно быть числом` };
    if (num < 0) return { valid: false, error: `${fieldName} не может быть отрицательным` };
    if (num > max) return { valid: false, error: `${fieldName} не может быть больше ${max}` };
    return { valid: true, value: num };
}

// --- ЛОГИРОВАНИЕ ФИНАНСОВЫХ ОПЕРАЦИЙ ---
async function logFinancialOperation(operation, data, userId) {
    try {
        await supabase.from('financial_logs').insert({
            operation_type: operation,
            data: JSON.stringify(data),
            user_id: userId,
        });
    } catch (error) {
        console.error('Ошибка логирования операции:', error);
    }
}

// --- MIDDLEWARE ДЛЯ ПРОВЕРКИ АВТОРИЗАЦИИ И РОЛЕЙ ---
const checkAuth = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ success: false, message: "Нет токена." });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    
    supabase.from('sessions').upsert({
        token: token.substring(0, 50),
        employee_id: decoded.id,
        employee_role: decoded.role,
        last_activity: new Date().toISOString(),
        expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
    }, { onConflict: 'employee_id' }).then();
    
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Невалидный токе." });
  }
};

const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Недостаточно прав." });
    }
    next();
  };
};

// --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ РАСЧЕТА ДНЕВНОЙ ЗАРПЛАТЫ ---
function calculateDailyPay(revenue, numSellers, isSenior = false) {
  if (isSenior) return { baseRate: 1300, bonus: 0, totalPay: 1300 };
  if (numSellers === 0) return { baseRate: 0, bonus: 0, totalPay: 0 };
  
  let baseRatePerPerson = (numSellers === 1) ? 975 : 825;
  let totalBonus = 0;

  if (revenue > 13000) {
    const bonusBase = revenue - 13000;
    const wholeThousands = Math.floor(bonusBase / 1000);
    let ratePerThousand = 0;
    
    if (revenue > 50000) ratePerThousand = 12;
    else if (revenue > 45000) ratePerThousand = 11;
    else if (revenue > 40000) ratePerThousand = 10;
    else if (revenue > 35000) ratePerThousand = 9;
    else if (revenue > 30000) ratePerThousand = 8;
    else if (revenue > 25000) ratePerThousand = 7;
    else if (revenue > 20000) ratePerThousand = 6;
    else ratePerThousand = 5;
    
    totalBonus = wholeThousands * ratePerThousand;
  }
  
  const bonusPerPerson = (numSellers > 0) ? totalBonus / numSellers : 0;
  return { baseRate: baseRatePerPerson, bonus: bonusPerPerson, totalPay: baseRatePerPerson + bonusPerPerson };
}

// --- ОСНОВНЫЕ API ЭНДПОИНТЫ ---
app.get("/employees", async (req, res) => {
  const { data, error } = await supabase.from('employees').select('fullname').eq('active', true);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(e => e.fullname));
});

app.post("/login", async (req, res) => {
  const { username, password, deviceKey } = req.body;
  const { data: employee, error } = await supabase.from('employees')
    .select('id, fullname, role').ilike('fullname', username.trim())
    .eq('password', password).single();

  if (error || !employee) return res.status(401).json({ success: false, message: "Неверное имя или пароль" });

  let storeId = null, storeAddress = '', responseMessage = '';
  const isSeniorSeller = employee.id.startsWith('SProd');

  if (employee.role === 'seller') {
    // --- ИСПРАВЛЕННАЯ ЛОГИКА ---
    // Для ВСЕХ продавцов сначала пытаемся определить магазин по устройству
    if (deviceKey) {
      const { data: device } = await supabase.from('devices').select('store_id').eq('device_key', deviceKey).single();
      if (device) storeId = device.store_id;
    }

    // Если это старший продавец и магазин не определился, адрес будет "Старший продавец"
    if (isSeniorSeller && !storeId) {
        storeAddress = "Старший продавец";
    } 
    // Если это обычный продавец, и магазин не определился по устройству, ищем его основное место
    else if (!isSeniorSeller && !storeId) {
        const { data: storeLink } = await supabase.from('employee_store').select('store_id').eq('employee_id', employee.id).single();
        if (storeLink) storeId = storeLink.store_id;
    }
    
    // Получаем адрес магазина, если ID известен
    if (storeId) {
        const { data: store, error: storeError } = await supabase.from('stores').select('address').eq('id', storeId).single();
        if (storeError || !store) return res.status(404).json({ success: false, message: "Магазин не найден" });
        storeAddress = store.address;
    }
    
    // Если в итоге адрес не определен (даже для обычного продавца) - ошибка
    if (!storeAddress) {
        return res.status(404).json({ success: false, message: "Для этого сотрудника не удалось определить магазин." });
    }
    // --- КОНЕЦ ИСПРАВЛЕННОЙ ЛОГИКИ ---

    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();
    
    const { data: existingShift } = await supabase.from('shifts').select('id').eq('employee_id', employee.id).gte('started_at', startOfDay).lte('started_at', endOfDay);
    
    if (existingShift && existingShift.length === 0) {
      const shiftDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      await supabase.from('shifts').insert({ employee_id: employee.id, store_id: storeId, shift_date: shiftDate });
      responseMessage = `Добро пожаловать, ${employee.fullname}!`;
    } else {
        responseMessage = `Ваша смена на сегодня уже была зафиксирована. Хорошего дня, ${employee.fullname}!`;
    }
  } else if (employee.role === 'admin' || employee.role === 'accountant') {
    storeAddress = "Административная панель";
    responseMessage = `Добро пожаловать, ${employee.fullname}!`;
  }

  const token = jwt.sign({ id: employee.id, role: employee.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('token', token, { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'strict' : 'lax' });
  
  return res.json({ success: true, message: responseMessage, store: storeAddress, role: employee.role });
});

app.post('/logout', (req, res) => {
  res.cookie('token', '', { expires: new Date(0), httpOnly: true, secure: true, sameSite: 'strict' });
  res.status(200).json({ success: true, message: 'Выход выполнен успешно' });
});

app.get('/check-auth', checkAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

// --- ЗАЩИЩЕННЫЕ API ЭНДПОИНТЫ ---
const canManagePayroll = checkRole(['admin', 'accountant']);
const canManageFot = checkRole(['admin']);

// ИСПРАВЛЕННАЯ ФУНКЦИЯ ЗАГРУЗКИ ВЫРУЧКИ
// Замените функцию app.post('/upload-revenue-file'...) в server.cjs на эту:

app.post('/upload-revenue-file', checkAuth, canManagePayroll, upload.single('file'), async (req, res) => {
    try {
        const { date } = req.body; // Это дата когда загружаем (например, 02.09)
        const dateValidation = validateDate(date);
        if (!dateValidation.valid) return res.status(400).json({ success: false, error: dateValidation.error });
        if (!req.file) return res.status(400).json({ success: false, error: 'Файл не загружен' }); 

        const fileName = req.file.originalname;
        const dateMatch = fileName.match(/(\d{2})\.(\d{2})\.(\d{4}|\d{2})/);

        // КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ: Определяем дату кассы
        let revenueDate; // Дата, за которую эта выручка
        
        if (dateMatch) {
            // Если в имени файла есть дата - используем её как дату кассы
            let [, day, month, year] = dateMatch;
            if (year.length === 2) {
                year = "20" + year;
            }
            revenueDate = `${year}-${month}-${day}`;
            
            // Проверяем, что дата загрузки = дата из файла + 1 день
            const fileDateObj = new Date(revenueDate);
            const uploadDateObj = new Date(date);
            const dayDiff = Math.round((uploadDateObj - fileDateObj) / (1000 * 60 * 60 * 24));
            
            if (dayDiff !== 1) {
                // Предупреждаем, если загружаем не на следующий день
                console.warn(`Внимание: касса за ${revenueDate} загружается ${date} (разница ${dayDiff} дней)`);
            }
        } else {
            // Если в имени файла нет даты - считаем, что касса за предыдущий день
            const uploadDate = new Date(date);
            uploadDate.setDate(uploadDate.getDate() - 1);
            revenueDate = uploadDate.toISOString().split('T')[0];
            console.log(`Дата в имени файла не найдена. Считаем кассу за ${revenueDate}`);
        }
        
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        let headerRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].includes('Торговая точка') && rows[i].includes('Выторг')) {
                headerRowIndex = i;
                break;
            }
        }
        if (headerRowIndex === -1) return res.status(400).json({ success: false, error: 'В файле не найдены столбцы "Торговая точка" и "Выторг".' });

        const rawData = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });
        const revenues = rawData.map(row => {
            const revenueStr = String(row['Выторг'] || '0');
            const cleanedStr = revenueStr.replace(/\s/g, '').replace(',', '.');
            const revenueNum = parseFloat(cleanedStr);
            if (revenueNum < 0) throw new Error(`Отрицательная выручка для ${row['Торговая точка']}`);
            return { store_address: row['Торговая точка'], revenue: revenueNum };
        }).filter(item => item.store_address && !isNaN(item.revenue) && !String(item.store_address).startsWith('* Себестоимость'));

        const addressesFromFile = [...new Set(revenues.map(r => r.store_address.trim()))];
        const { data: stores, error: storeError } = await supabase.from('stores').select('id, address').in('address', addressesFromFile);
        if (storeError) throw storeError;

        const storeAddressToIdMap = new Map(stores.map(s => [s.address, s.id]));
        const dataToUpsert = [], matched = [], unmatched = [];
        
        for (const item of revenues) {
            const storeId = storeAddressToIdMap.get(item.store_address.trim());
            if (storeId) {
                // ВАЖНО: Сохраняем с датой КАССЫ (revenueDate), а не датой загрузки (date)
                dataToUpsert.push({ 
                    store_id: storeId, 
                    revenue_date: revenueDate,  // <-- ИСПОЛЬЗУЕМ ДАТУ КАССЫ!
                    revenue: item.revenue 
                });
                matched.push(item.store_address);
            } else {
                unmatched.push(item.store_address);
            }
        }

        if (dataToUpsert.length > 0) {
            await withLock(`revenue_${revenueDate}`, async () => {
                const { error: upsertError } = await supabase.from('daily_revenue').upsert(dataToUpsert, { onConflict: 'store_id,revenue_date' });
                if (upsertError) throw upsertError;
            });
        }

        const totalRevenue = revenues.reduce((sum, current) => sum + current.revenue, 0);
        await logFinancialOperation('upload_revenue', { 
            uploadDate: date,
            revenueDate: revenueDate, 
            totalRevenue, 
            storesCount: dataToUpsert.length 
        }, req.user.id);
        
        // В ответе сообщаем обе даты для ясности
        res.json({ 
            success: true, 
            message: `Выручка за ${revenueDate} успешно загружена (дата загрузки: ${date})`, 
            revenues, 
            matched, 
            unmatched, 
            totalRevenue,
            revenueDate: revenueDate,
            uploadDate: date
        });
    } catch (error) {
        console.error('Ошибка загрузки выручки из Excel:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/payroll/adjustments', checkAuth, canManagePayroll, async (req, res) => {
    const { employee_id, month, year, manual_bonus, penalty, shortage, bonus_reason, penalty_reason } = req.body;
    
    const bonusValidation = validateAmount(manual_bonus, MAX_MANUAL_BONUS, 'Премия');
    if (!bonusValidation.valid) return res.status(400).json({ success: false, error: bonusValidation.error });
    
    const penaltyValidation = validateAmount(penalty, MAX_PENALTY, 'Штраф');
    if (!penaltyValidation.valid) return res.status(400).json({ success: false, error: penaltyValidation.error });
    
    const shortageValidation = validateAmount(shortage, MAX_SHORTAGE, 'Недостача');
    if (!shortageValidation.valid) return res.status(400).json({ success: false, error: shortageValidation.error });
  
    try {
        const payload = { 
            employee_id, month, year, 
            manual_bonus: bonusValidation.value, penalty: penaltyValidation.value, 
            shortage: shortageValidation.value, bonus_reason, penalty_reason
        };
        await supabase.from('monthly_adjustments').upsert(payload, { onConflict: 'employee_id,month,year' });
        await logFinancialOperation('payroll_adjustment', payload, req.user.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/get-monthly-data', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, reportEndDate } = req.body;
    
    if (!year || !month || !reportEndDate) return res.status(400).json({ success: false, error: 'Не все параметры указаны' });
    if (month < 1 || month > 12) return res.status(400).json({ success: false, error: 'Некорректный месяц' });
    const dateValidation = validateDate(reportEndDate);
    if (!dateValidation.valid) return res.status(400).json({ success: false, error: dateValidation.error });
    
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

    try {
        const { data: employees, error: empError } = await supabase.from('employees').select('id, fullname');
        if (empError) throw empError;
        const employeeMap = new Map(employees.map(e => [e.id, e.fullname]));

        const { data: dailyData, error: dailyError } = await supabase.from('payroll_calculations')
            .select('*').gte('work_date', startDate).lte('work_date', reportEndDate);
        if (dailyError) throw dailyError;

        const enrichedDailyData = dailyData.map(calc => ({ ...calc, employee_name: employeeMap.get(calc.employee_id) || 'Неизвестный' }));
        
        const { data: adjustments, error: adjError } = await supabase.from('monthly_adjustments')
            .select('*').eq('year', year).eq('month', month);
        if (adjError) throw adjError;

        res.json({ success: true, dailyData: enrichedDailyData, adjustments });
    } catch (error) {
        console.error('Ошибка получения данных за месяц:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/calculate-advance', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, advanceEndDate } = req.body;
    
    if (!year || !month || !advanceEndDate) return res.status(400).json({ success: false, error: 'Не указана дата для расчета аванса' });
    const dateValidation = validateDate(advanceEndDate);
    if (!dateValidation.valid) return res.status(400).json({ success: false, error: dateValidation.error });
    
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

    try {
        const { data: calculationsInPeriod, error } = await supabase.from('payroll_calculations')
            .select('employee_id, total_pay').gte('work_date', startDate).lte('work_date', advanceEndDate);
        if (error) throw error;

        const earnedInPeriod = calculationsInPeriod.reduce((acc, calc) => {
            acc[calc.employee_id] = (acc[calc.employee_id] || 0) + calc.total_pay;
            return acc;
        }, {});

        const results = {};
        for (const [employeeId, totalEarned] of Object.entries(earnedInPeriod)) {
            const potentialAdvance = totalEarned * ADVANCE_PERCENTAGE;
            let finalAdvance = Math.min(potentialAdvance, MAX_ADVANCE_AMOUNT);
            // --- НОВОЕ: Округляем в меньшую сторону до десятков ---
            // Например: 6520 -> 6500, 5132 -> 5100
            finalAdvance = Math.floor(finalAdvance / 100) * 100;
            results[employeeId] = { advance_payment: finalAdvance };
        }
        res.json({ success: true, results });
    } catch (error) {
        console.error('Ошибка расчета аванса:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/calculate-final-payroll', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, reportEndDate } = req.body;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

    return withLock(`final_payroll_${year}_${month}`, async () => {
        try {
            const { data: allCalculations, error: totalError } = await supabase.from('payroll_calculations')
                .select('employee_id, total_pay').gte('work_date', startDate).lte('work_date', reportEndDate);
            if (totalError) throw totalError;

            const totalBasePayMap = allCalculations.reduce((acc, calc) => {
                acc[calc.employee_id] = (acc[calc.employee_id] || 0) + calc.total_pay;
                return acc;
            }, {});
            
            const advancePayments = {};
            for (const [employeeId, totalEarned] of Object.entries(totalBasePayMap)) {
                const potentialAdvance = totalEarned * ADVANCE_PERCENTAGE;
                let finalAdvance = Math.min(potentialAdvance, MAX_ADVANCE_AMOUNT);
                // Округляем аванс в меньшую сторону до сотен
                finalAdvance = Math.floor(finalAdvance / 100) * 100;
                advancePayments[employeeId] = finalAdvance;
            }

            const { data: adjustments, error: adjError } = await supabase.from('monthly_adjustments')
                .select('*').eq('year', year).eq('month', month);
            if (adjError) throw adjError;
            const adjustmentsMap = new Map(adjustments.map(adj => [adj.employee_id, adj]));

            const finalResults = {};
            for (const employeeId in totalBasePayMap) {
                const basePay = totalBasePayMap[employeeId];
                const adj = adjustmentsMap.get(employeeId) || { manual_bonus: 0, penalty: 0, shortage: 0 };
                const totalGross = basePay + adj.manual_bonus;
                const advancePayment = advancePayments[employeeId] || 0;
                const cardRemainder = FIXED_CARD_PAYMENT_FOR_REPORT - advancePayment;
                const cashPayout = totalGross - FIXED_CARD_PAYMENT_FOR_REPORT - adj.penalty - adj.shortage;
                
                finalResults[employeeId] = { 
                    total_gross: totalGross, 
                    advance_payment: advancePayment, 
                    card_remainder: cardRemainder, 
                    cash_payout: cashPayout 
                };
            }
            await logFinancialOperation('calculate_final_payroll', { year, month, reportEndDate }, req.user.id);
            res.json({ success: true, results: finalResults });

        } catch (error) {
            console.error('Ошибка окончательного расчета:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

// ====== ХЕЛПЕР: собираем ФОТ с "умным" налогом (только на карту) ======
async function buildFotReport({ startDate, endDate }) {
  // 1) Справочник сотрудников
  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('id, fullname');
  if (empError) throw empError;
  const employeeName = new Map(employees.map(e => [e.id, e.fullname]));

  // 2) Все начисления, отсортированные по дате для корректного накопления
  const { data: calcs, error: calcErr } = await supabase
    .from('payroll_calculations')
    .select('employee_id, work_date, total_pay, store_id, store_address')
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .order('work_date', { ascending: true }); // Важная сортировка для накопления
  if (calcErr) throw calcErr;

  // Если за период не было ни одной смены, возвращаем пустой отчет
  if (!calcs || calcs.length === 0) {
    return {
      rows: []
    };
  }
  
  const activeStoreIds = [...new Set(calcs.map(c => c.store_id).filter(id => id !== null))];

  // 3) Выручка магазинов по дням
  const { data: revs, error: revErr } = await supabase
    .from('daily_revenue')
    .select('store_id, revenue_date, revenue')
    .gte('revenue_date', startDate)
    .lte('revenue_date', endDate)
    .in('store_id', activeStoreIds);
  if (revErr) throw revErr;

  // Индекс выручки для быстрого доступа
  const revenueBy = {};
  for (const r of revs || []) {
    if (!revenueBy[r.store_id]) revenueBy[r.store_id] = {};
    revenueBy[r.store_id][r.revenue_date] = (revenueBy[r.store_id][r.revenue_date] || 0) + Number(r.revenue || 0);
  }

  // --- НОВАЯ ЛОГИКА РАСЧЕТА НАЛОГА ---
  const TAX = 0.22;
  const rows = [];
  const employeeCardTracker = {}; // Отслеживаем накопленные выплаты на карту для каждого сотрудника

  for (const c of calcs) {
    const payout = Number(c.total_pay || 0);
    const employeeId = c.employee_id;

    // Инициализируем трекер для нового сотрудника
    if (!employeeCardTracker[employeeId]) {
      employeeCardTracker[employeeId] = { paid_to_card: 0 };
    }

    let paidToCardToday = 0;
    // Считаем, сколько еще можно выплатить на карту в этом месяце (в рамках лимита 8600)
    const remainingCardCapacity = FIXED_CARD_PAYMENT_FOR_REPORT - employeeCardTracker[employeeId].paid_to_card;

    if (remainingCardCapacity > 0) {
      // На карту сегодня пойдет либо вся дневная ЗП, либо остаток до лимита
      paidToCardToday = Math.min(payout, remainingCardCapacity);
      // Обновляем счетчик выплат на карту для этого сотрудника
      employeeCardTracker[employeeId].paid_to_card += paidToCardToday;
    }

    // Налог начисляется ТОЛЬКО на ту часть, что пошла на карту
    const tax = paidToCardToday * TAX;
    // Общая стоимость для ФОТ = вся выплата сотруднику + налог с карточной части
    const payoutWithTax = payout + tax;

    const storeRevenueThatDay = (c.store_id && revenueBy[c.store_id] && revenueBy[c.store_id][c.work_date]) || 0;
    
    // Рассчитываем персональный процент ФОТ
    const fotPersonalPct = storeRevenueThatDay > 0 ? (payoutWithTax / storeRevenueThatDay) * 100 : 0;
    
    rows.push({
      employee_id: c.employee_id,
      employee_name: employeeName.get(c.employee_id) || 'Неизвестный',
      store_id: c.store_id || null,
      store_address: c.store_address || 'Старший продавец',
      work_date: c.work_date,
      daily_store_revenue: storeRevenueThatDay,
      payout: payout,
      tax_22: tax,
      payout_with_tax: payoutWithTax,
      fot_personal_pct: fotPersonalPct
    });
  }
  
  // Отдаем только детальные строки, итоги теперь считаются на фронтенде
  return {
    rows: rows
  };
}

app.post('/get-fot-report', checkAuth, canManageFot, async (req, res) => {
  try {
    const { year, month, reportEndDate } = req.body;
    if (!year || !month || !reportEndDate) {
      return res.status(400).json({ success: false, error: 'Не все параметры указаны' });
    }
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

    const dateValidation = validateDate(reportEndDate);
    if (!dateValidation.valid) {
      return res.status(400).json({ success: false, error: dateValidation.error });
    }

    const report = await buildFotReport({ startDate, endDate: reportEndDate });

    // Просто возвращаем строки, без обращения к summary
    res.json({ success: true, rows: report.rows });

  } catch (error) {
    console.error('Ошибка формирования отчёта ФОТ:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ====== ЭКСПОРТ ФОТ В EXCEL ======
app.post('/export-fot-report', checkAuth, canManageFot, async (req, res) => {
  try {
    const { year, month, reportEndDate } = req.body;
    if (!year || !month || !reportEndDate) {
      return res.status(400).json({ success: false, error: 'Не все параметры указаны' });
    }
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const dateValidation = validateDate(reportEndDate);
    if (!dateValidation.valid) {
      return res.status(400).json({ success: false, error: dateValidation.error });
    }

    const { rows } = await buildFotReport({ startDate, endDate: reportEndDate });

    // --- ИСПРАВЛЕНИЕ: Рассчитываем итоги на основе полученных строк ---
    let totalRevenue = 0;
    let totalPayoutWithTax = 0;
    
    // Подсчитываем итоги из строк
    for (const r of rows) {
      totalRevenue += Number(r.daily_store_revenue || 0);
      totalPayoutWithTax += Number(r.payout_with_tax || 0);
    }
    
    const fotPercentage = totalRevenue > 0 ? (totalPayoutWithTax / totalRevenue) * 100 : 0;

    // Подготовка данных в Excel
    const sheetRows = [
      ['Сотрудник', 'Дата', 'ID Магазина', 'Касса дня', 'Начисление', 'Налог 22%', 'Выплата + налог', 'ФОТ % (персонально)']
    ];
    for (const r of rows) {
      sheetRows.push([
        r.employee_name,
        r.work_date,
        r.store_id || '',
        Number(r.daily_store_revenue || 0),
        Number(r.payout || 0),
        Number(r.tax_22 || 0),
        Number(r.payout_with_tax || 0),
        Number(r.fot_personal_pct || 0)
      ]);
    }
    sheetRows.push([]);
    sheetRows.push(['ИТОГО по периоду']);
    sheetRows.push(['Общая выручка', totalRevenue]);
    sheetRows.push(['Общий ФОТ (выплаты + 22%)', totalPayoutWithTax]);
    sheetRows.push(['ФОТ % от выручки', fotPercentage.toFixed(2)]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, 'FOT');
    
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fileName = `fot_${year}-${String(month).padStart(2, '0')}_${reportEndDate}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    return res.status(200).send(buf);
  } catch (error) {
    console.error('Ошибка экспорта ФОТ в Excel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// ====== ОЧИСТКА ТЕСТОВЫХ ДАННЫХ (ТОЛЬКО ДЛЯ АДМИНОВ) ======
app.post('/clear-transactional-data', checkAuth, canManageFot, async (req, res) => {
  // canManageFot - это наша проверка на роль 'admin', используем её повторно
  
  try {
    // Выполняем удаление в правильном порядке, чтобы избежать ошибок связей
    await supabase.from('payroll_calculations').delete().neq('id', 0);
    await supabase.from('shifts').delete().neq('id', 0);
    await supabase.from('daily_revenue').delete().neq('id', 0);
    await supabase.from('monthly_adjustments').delete().neq('id', 0);
    
    // Логируем операцию
    await logFinancialOperation('clear_test_data', { status: 'success' }, req.user.id);
    
    res.json({ success: true, message: 'Все тестовые данные (смены, расчеты, выручка) были успешно удалены.' });

  } catch (error) {
    console.error('Ошибка при очистке данных:', error);
    res.status(500).json({ success: false, error: 'Произошла ошибка на сервере при удалении данных.' });
  }
});


// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});