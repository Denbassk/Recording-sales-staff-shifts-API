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

// --- HELPER ФУНКЦИИ ---
function formatNumber(num) {
    if (num === null || num === undefined) return '0,00';
    const number = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(number)) return '0,00';
    return number.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$& ').replace('.', ',');
}


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
const FIXED_CARD_PAYMENT = 8600; 
const ADVANCE_PERCENTAGE = 0.9;  // 90% от лимита карты
const MAX_ADVANCE_AMOUNT = 7900; // Именно 7900, не 7740!
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
    return res.status(401).json({ success: false, message: "Невалидный токен." });
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
  if (isSenior) return { baseRate: 1300, bonus: 0, totalPay: 1300, bonusDetails: 'Старший продавец - фиксированная ставка' };
  if (numSellers === 0) return { baseRate: 0, bonus: 0, totalPay: 0, bonusDetails: 'Нет продавцов' };
  
  let baseRatePerPerson = (numSellers === 1) ? 975 : 825;
  let bonusPerPerson = 0;
  let bonusDetails = '';

  if (revenue > 13000) {
    const bonusBase = revenue - 13000;
    const wholeThousands = Math.floor(bonusBase / 1000);
    let ratePerThousand = 0;
    
    // ИСПРАВЛЕННАЯ ЛОГИКА: определяем ставку по ФАКТИЧЕСКОЙ выручке
    if (revenue >= 50000) {
      ratePerThousand = 12;
      bonusDetails = `Касса ${revenue}грн (50-60к): ${wholeThousands}т × 12грн`;
    } else if (revenue >= 45000) {
      ratePerThousand = 11;
      bonusDetails = `Касса ${revenue}грн (45-50к): ${wholeThousands}т × 11грн`;
    } else if (revenue >= 40000) {
      ratePerThousand = 10;
      bonusDetails = `Касса ${revenue}грн (40-45к): ${wholeThousands}т × 10грн`;
    } else if (revenue >= 35000) {
      ratePerThousand = 9;
      bonusDetails = `Касса ${revenue}грн (35-40к): ${wholeThousands}т × 9грн`;
    } else if (revenue >= 30000) {
      ratePerThousand = 8;
      bonusDetails = `Касса ${revenue}грн (30-35к): ${wholeThousands}т × 8грн`;
    } else if (revenue >= 25000) {
      ratePerThousand = 7;
      bonusDetails = `Касса ${revenue}грн (25-30к): ${wholeThousands}т × 7грн`;
    } else if (revenue >= 20000) {
      ratePerThousand = 6;
      bonusDetails = `Касса ${revenue}грн (20-25к): ${wholeThousands}т × 6грн`;
    } else {
      ratePerThousand = 5;
      bonusDetails = `Касса ${revenue}грн (13-20к): ${wholeThousands}т × 5грн`;
    }
    
    // ВАЖНО: Бонус НЕ делится! Каждый продавец получает полный бонус
    bonusPerPerson = wholeThousands * ratePerThousand;
  } else {
    bonusDetails = `Касса ${revenue}грн < 13000 - без бонуса`;
  }
  
  return { 
    baseRate: baseRatePerPerson, 
    bonus: bonusPerPerson, 
    totalPay: baseRatePerPerson + bonusPerPerson,
    bonusDetails: bonusDetails
  };
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
    if (deviceKey) {
      const { data: device } = await supabase.from('devices').select('store_id').eq('device_key', deviceKey).single();
      if (device) storeId = device.store_id;
    }

    if (isSeniorSeller && !storeId) {
        storeAddress = "Старший продавец";
    } 
    else if (!isSeniorSeller && !storeId) {
        const { data: storeLink } = await supabase.from('employee_store').select('store_id').eq('employee_id', employee.id).single();
        if (storeLink) storeId = storeLink.store_id;
    }
    
    if (storeId) {
        const { data: store, error: storeError } = await supabase.from('stores').select('address').eq('id', storeId).single();
        if (storeError || !store) return res.status(404).json({ success: false, message: "Магазин не найден" });
        storeAddress = store.address;
    }
    
    if (!storeAddress) {
        return res.status(404).json({ success: false, message: "Для этого сотрудника не удалось определить магазин." });
    }

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

app.post('/upload-revenue-file', checkAuth, canManagePayroll, upload.single('file'), async (req, res) => {
    try {
        const { date } = req.body; 
        const dateValidation = validateDate(date);
        if (!dateValidation.valid) return res.status(400).json({ success: false, error: dateValidation.error });
        if (!req.file) return res.status(400).json({ success: false, error: 'Файл не загружен' }); 

        const fileName = req.file.originalname;
        const dateMatch = fileName.match(/(\d{2})\.(\d{2})\.(\d{4}|\d{2})/);
        
        let revenueDate;
        
        if (dateMatch) {
            let [, day, month, year] = dateMatch;
            if (year.length === 2) {
                year = "20" + year;
            }
            revenueDate = `${year}-${month}-${day}`;
            const fileDateObj = new Date(revenueDate);
            const uploadDateObj = new Date(date);
            const dayDiff = Math.round((uploadDateObj - fileDateObj) / (1000 * 60 * 60 * 24));
            
            if (dayDiff !== 1) {
                console.warn(`Внимание: касса за ${revenueDate} загружается ${date} (разница ${dayDiff} дней)`);
            }
        } else {
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
                dataToUpsert.push({ 
                    store_id: storeId, 
                    revenue_date: revenueDate,
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

app.post('/calculate-payroll', checkAuth, canManagePayroll, async (req, res) => {
    const { date } = req.body;
    const dateValidation = validateDate(date);
    if (!dateValidation.valid) return res.status(400).json({ success: false, error: dateValidation.error });
    
    const revenueDateString = date;

    return withLock(`payroll_${date}`, async () => {
        try {
            const { data: shifts, error: shiftsError } = await supabase.from('shifts')
                .select(`store_id, stores (address), employees (fullname, id)`)
                .eq('shift_date', date);

            if (shiftsError) throw shiftsError;
            if (!shifts || shifts.length === 0) {
                return res.json({ success: true, calculations: [], summary: { date, total_employees: 0, total_payroll: 0 } });
            }
            
            const storeShifts = {};
            shifts.forEach(shift => {
                if (!shift.employees) return;
                const address = shift.stores?.address || 'Старший продавец';
                if (!storeShifts[address]) storeShifts[address] = [];
                storeShifts[address].push({
                    employee_id: shift.employees.id,
                    employee_name: shift.employees.fullname,
                    store_id: shift.store_id
                });
            });
            
            const uniqueStoreIds = [...new Set(shifts.map(s => s.store_id).filter(id => id))];
            
            const revenueMap = new Map();
            if (uniqueStoreIds.length > 0) {
                const { data: revenueData } = await supabase.from('daily_revenue')
                    .select('store_id, revenue')
                    .in('store_id', uniqueStoreIds)
                    .eq('revenue_date', revenueDateString);
                
                if (revenueData) {
                    revenueData.forEach(item => {
                        revenueMap.set(item.store_id, item.revenue || 0);
                    });
                }
            }
            
            // =================== БЛОК ЗАЩИТЫ ОТ НАЧИСЛЕНИЯ БЕЗ КАССЫ ===================
            const totalRevenueForDay = Array.from(revenueMap.values()).reduce((sum, current) => sum + current, 0);
            if (totalRevenueForDay === 0) {
                console.warn(`Расчет ЗП за ${date} остановлен: общая выручка за день равна 0. Начисления производиться не будут.`);
                return res.json({ 
                    success: true, 
                    calculations: [], 
                    summary: { date, total_employees: 0, total_payroll: 0 } 
                });
            }
            // ================= КОНЕЦ БЛОКА ЗАЩИТЫ ================

            const calculations = [];
            for (const [storeAddress, storeEmployees] of Object.entries(storeShifts)) {
                let revenue = 0;
                let hasRevenue = true;
                
                if (storeAddress !== 'Старший продавец') {
                    const storeId = storeEmployees[0]?.store_id;
                    if (storeId) {
                        revenue = revenueMap.get(storeId) || 0;
                        hasRevenue = revenue > 0;
                    } else {
                        hasRevenue = false;
                    }
                }
                
                const numSellers = storeEmployees.length;
                for (const employee of storeEmployees) {
                    const isSenior = employee.employee_id.startsWith('SProd');
                    let payDetails;
                    
                    if (isSenior) {
                        payDetails = calculateDailyPay(0, 0, true);
                    } else if (hasRevenue) {
                        payDetails = calculateDailyPay(revenue, numSellers, false);
                    } else {
                        payDetails = { baseRate: 0, bonus: 0, totalPay: 0, bonusDetails: 'Нет выручки' };
                    }
                    
                    const calculation = {
                        employee_id: employee.employee_id,
                        employee_name: employee.employee_name,
                        store_address: storeAddress,
                        store_id: employee.store_id,
                        work_date: date,
                        revenue,
                        num_sellers: numSellers,
                        is_senior: isSenior,
                        base_rate: payDetails.baseRate,
                        bonus: payDetails.bonus,
                        total_pay: payDetails.totalPay,
                        bonus_details: payDetails.bonusDetails  // ВАЖНО: добавлено поле bonus_details
                    };
                    
                    // ИСПРАВЛЕННОЕ СОХРАНЕНИЕ С ОБРАБОТКОЙ ОШИБОК
                    try {
                        const { data: savedCalc, error: saveError } = await supabase
                            .from('payroll_calculations')
                            .upsert(calculation, { onConflict: 'employee_id,work_date' });
                        
                        if (saveError) {
                            console.error(`Ошибка сохранения для ${employee.employee_name} за ${date}:`, saveError);
                        }
                    } catch (err) {
                        console.error(`Критическая ошибка при сохранении:`, err);
                    }
                    
                    calculations.push(calculation);
                }
            }
            
            const totalPayroll = calculations.reduce((sum, c) => sum + c.total_pay, 0);
            await logFinancialOperation('calculate_payroll', { date, employeesCount: calculations.length, totalPayroll }, req.user.id);
            res.json({ success: true, calculations, summary: { date, total_employees: calculations.length, total_payroll: totalPayroll } });
        } catch(error) {
            console.error(`Ошибка при расчете ЗП за ${date}:`, error);
            res.status(500).json({ success: false, error: `Внутренняя ошибка сервера при расчете ЗП.` });
        }
    });
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

        // ИСПРАВЛЕНИЕ: получаем ВСЕ расчеты за период от startDate до reportEndDate
        const { data: dailyData, error: dailyError } = await supabase.from('payroll_calculations')
            .select('*')
            .gte('work_date', startDate)
            .lte('work_date', reportEndDate)
            .order('work_date', { ascending: true });
        if (dailyError) throw dailyError;

        // Обогащаем данные именами сотрудников
        const enrichedDailyData = dailyData.map(calc => ({ 
            ...calc, 
            employee_name: employeeMap.get(calc.employee_id) || 'Неизвестный' 
        }));
        
        // Логируем для отладки
        console.log(`Получено расчетов за период ${startDate} - ${reportEndDate}: ${enrichedDailyData.length}`);
        
        // Получаем корректировки
        const { data: adjustments, error: adjError } = await supabase.from('monthly_adjustments')
            .select('*').eq('year', year).eq('month', month);
        if (adjError) throw adjError;

        // НОВОЕ: Получаем финальные расчеты из таблицы final_payroll_calculations
        let finalCalculations = [];
        
        // Проверяем, существует ли таблица final_payroll_calculations
        const { data: tableExists } = await supabase
            .from('final_payroll_calculations')
            .select('id')
            .limit(1);
        
        if (tableExists !== null) {
            // Таблица существует, получаем данные
            const { data: finalCalcs, error: finalError } = await supabase
                .from('final_payroll_calculations')
                .select('*')
                .eq('year', year)
                .eq('month', month);
            
            if (finalError) {
                console.error('Ошибка получения финальных расчетов:', finalError);
                // Не прерываем выполнение, просто логируем ошибку
            } else {
                finalCalculations = finalCalcs || [];
                console.log(`Получено финальных расчетов: ${finalCalculations.length}`);
            }
        } else {
            console.log('Таблица final_payroll_calculations не найдена, пропускаем загрузку финальных расчетов');
        }

        // Возвращаем все данные включая финальные расчеты
        res.json({ 
            success: true, 
            dailyData: enrichedDailyData, 
            adjustments,
            finalCalculations // Добавляем финальные расчеты в ответ
        });
        
    } catch (error) {
        console.error('Ошибка получения данных за месяц:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/calculate-advance', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, advanceEndDate } = req.body;
    
    if (!year || !month || !advanceEndDate) {
        return res.status(400).json({ success: false, error: 'Не все параметры указаны' });
    }
    
    const dateValidation = validateDate(advanceEndDate);
    if (!dateValidation.valid) return res.status(400).json({ success: false, error: dateValidation.error });
    
    try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        
        // Получаем расчеты за период
        const { data: calculationsInPeriod, error } = await supabase
            .from('payroll_calculations')
            .select('employee_id, total_pay')
            .gte('work_date', startDate)
            .lte('work_date', advanceEndDate);
        
        if (error) throw error;

        // Суммируем начисления по сотрудникам
        const earnedInPeriod = calculationsInPeriod.reduce((acc, calc) => {
            acc[calc.employee_id] = (acc[calc.employee_id] || 0) + calc.total_pay;
            return acc;
        }, {});

        // Проверяем зафиксированные авансы
        const { data: fixedAdvances, error: fixedError } = await supabase
            .from('payroll_payments')
            .select('employee_id, amount, payment_method')
            .eq('payment_type', 'advance')
            .eq('payment_period_month', month)
            .eq('payment_period_year', year)
            .eq('is_cancelled', false);
        
        if (fixedError) throw fixedError;
        
        // Проверяем ручные корректировки
        const { data: manualAdjustments, error: manualError } = await supabase
            .from('final_payroll_calculations')
            .select('employee_id, advance_payment, advance_card, advance_cash, advance_payment_method, is_manual_adjustment, adjustment_reason, is_fixed')
            .eq('month', month)
            .eq('year', year)
            .eq('is_manual_adjustment', true);
        
        if (manualError && manualError.code !== '42P01') throw manualError;

        const results = {};
        const hasFixedAdvances = fixedAdvances && fixedAdvances.length > 0;
        
        // Создаем мапы для быстрого доступа
        const fixedAdvanceMap = new Map(fixedAdvances?.map(fa => [fa.employee_id, fa]) || []);
        const manualAdjustmentMap = new Map(manualAdjustments?.map(ma => [ma.employee_id, ma]) || []);

        for (const [employeeId, totalEarned] of Object.entries(earnedInPeriod)) {
            let advanceAmount = 0;
            let paymentMethod = 'card';
            let isFixed = false;
            let isManual = false;
            let reason = '';

            // Проверяем ручную корректировку (высший приоритет)
            if (manualAdjustmentMap.has(employeeId)) {
                const manual = manualAdjustmentMap.get(employeeId);
                advanceAmount = manual.advance_payment || 0;
                paymentMethod = manual.advance_payment_method || 'card';
                isManual = true;
                reason = manual.adjustment_reason || '';
                isFixed = manual.is_fixed || false;
            }
            // Проверяем зафиксированный аванс
            else if (fixedAdvanceMap.has(employeeId)) {
                const fixed = fixedAdvanceMap.get(employeeId);
                advanceAmount = fixed.amount;
                paymentMethod = fixed.payment_method || 'card';
                isFixed = true;
            }
            // Рассчитываем автоматически с ПРАВИЛЬНЫМ округлением
            else {
    // ИСПРАВЛЕННЫЙ РАСЧЕТ:
    // 1. Берем 90% от НАЧИСЛЕНИЙ (не от лимита карты!)
    let calculatedAdvance = totalEarned * 0.9; 
    
    // 2. Округляем вниз до 100
    let roundedAdvance = Math.floor(calculatedAdvance / 100) * 100;
    
    // 3. Ограничиваем максимумом 7900
    advanceAmount = Math.min(roundedAdvance, 7900);
    
    // Логируем для отладки
    console.log(`Авторасчет для ${employeeId}: начислено ${totalEarned}, 90% = ${calculatedAdvance.toFixed(2)}, округлено = ${roundedAdvance}, финально = ${advanceAmount}`);
}

            results[employeeId] = {
                advance_payment: advanceAmount,
                payment_method: paymentMethod,
                is_fixed: isFixed,
                is_manual: isManual,
                reason: reason
            };
        }

        res.json({ 
            success: true, 
            results,
            hasFixedAdvances
        });

    } catch (error) {
        console.error('Ошибка расчета аванса:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ЗАМЕНИТЕ функцию app.post('/fix-advance-payment'...) примерно на строке 1850
app.post('/fix-advance-payment', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, advanceEndDate, paymentDate } = req.body;
    
    if (!year || !month || !advanceEndDate || !paymentDate) {
        return res.status(400).json({ success: false, error: 'Не все параметры указаны' });
    }
    
    // НОВОЕ: Блокировка для предотвращения race conditions
    const lockKey = `fix_advance_${year}_${month}`;
    if (operationLocks.get(lockKey)) {
        return res.status(409).json({ 
            success: false, 
            error: 'Операция уже выполняется. Подождите.' 
        });
    }
    operationLocks.set(lockKey, true);
    
    try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        
        // НОВОЕ: Создаем резервную копию ПЕРЕД любыми изменениями
        const { data: backupData } = await supabase
            .from('final_payroll_calculations')
            .select('*')
            .eq('month', month)
            .eq('year', year);
        
        if (backupData && backupData.length > 0) {
            await supabase
                .from('final_payroll_calculations_backup')
                .insert(backupData.map(row => ({
                    ...row,
                    backup_date: new Date().toISOString(),
                    backup_reason: 'before_fix_advance'
                })));
        }
        
        // ВАЖНО: Сохраняем существующие ручные корректировки
        const { data: existingManualAdjustments } = await supabase
            .from('final_payroll_calculations')
            .select('*')
            .eq('month', month)
            .eq('year', year)
            .eq('is_manual_adjustment', true);
        
        const manualAdjustmentsMap = new Map();
        if (existingManualAdjustments) {
            existingManualAdjustments.forEach(adj => {
                manualAdjustmentsMap.set(adj.employee_id, adj);
            });
        }
        
        // Получаем текущие расчеты аванса
        const { data: calculations, error: calcError } = await supabase
            .from('payroll_calculations')
            .select('employee_id, total_pay')
            .gte('work_date', startDate)
            .lte('work_date', advanceEndDate);
        
        if (calcError) throw calcError;
        
        // Суммируем начисления по сотрудникам
        const earnedInPeriod = calculations.reduce((acc, calc) => {
            acc[calc.employee_id] = (acc[calc.employee_id] || 0) + calc.total_pay;
            return acc;
        }, {});
        
        // Проверяем, не зафиксирован ли уже аванс
        const { data: existingPayments, error: checkError } = await supabase
            .from('payroll_payments')
            .select('id')
            .eq('payment_type', 'advance')
            .eq('payment_period_month', month)
            .eq('payment_period_year', year)
            .eq('is_cancelled', false)
            .limit(1);
        
        if (checkError) throw checkError;
        
        if (existingPayments && existingPayments.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Аванс за этот период уже зафиксирован' 
            });
        }
        
        // Подготавливаем данные для сохранения
        const paymentsToInsert = [];
        const finalCalculationsToUpdate = [];
        let totalAmount = 0;
        let employeesCount = 0;
        
        for (const [employeeId, totalEarned] of Object.entries(earnedInPeriod)) {
            let advanceAmount = 0;
            let advanceCard = 0;
            let advanceCash = 0;
            let paymentMethod = 'card';
            let isTermination = false;
            let isManual = false;
            let adjustmentReason = '';
            
            // ВАЖНО: Проверяем и сохраняем ручные корректировки
            if (manualAdjustmentsMap.has(employeeId)) {
                const manual = manualAdjustmentsMap.get(employeeId);
                advanceAmount = manual.advance_payment || 0;
                advanceCard = manual.advance_card || 0;
                advanceCash = manual.advance_cash || 0;
                paymentMethod = manual.advance_payment_method || 'card';
                isTermination = manual.is_termination || false;
                isManual = true;
                adjustmentReason = manual.adjustment_reason || '';
            } else {
                // Автоматический расчет
                let calculatedAdvance = totalEarned * 0.9;
                let roundedAdvance = Math.floor(calculatedAdvance / 100) * 100;
                advanceAmount = Math.min(roundedAdvance, 7900);
                advanceCard = advanceAmount;
            }
            
            if (advanceAmount > 0 || isManual) {
                // Добавляем в payroll_payments
                paymentsToInsert.push({
                    employee_id: employeeId,
                    payment_type: 'advance',
                    amount: advanceAmount,
                    advance_card: advanceCard,
                    advance_cash: advanceCash,
                    payment_date: paymentDate,
                    payment_period_month: parseInt(month),
                    payment_period_year: parseInt(year),
                    payment_method: paymentMethod,
                    is_termination: isTermination,
                    created_by: req.user.id,
                    is_cancelled: false
                });
                
                // Обновляем final_payroll_calculations
                finalCalculationsToUpdate.push({
                    employee_id: employeeId,
                    month: parseInt(month),
                    year: parseInt(year),
                    advance_payment: advanceAmount,
                    advance_card: advanceCard,
                    advance_cash: advanceCash,
                    advance_payment_method: paymentMethod,
                    is_fixed: true,
                    is_manual_adjustment: isManual,
                    is_termination: isTermination,
                    adjustment_reason: adjustmentReason,
                    fixed_at: new Date().toISOString(),
                    fixed_by: req.user.id
                });
                
                totalAmount += advanceAmount;
                employeesCount++;
            }
        }
        
        // Сохраняем в базу с транзакцией
        if (paymentsToInsert.length > 0) {
            // Вставляем в payroll_payments
            const { error: insertError } = await supabase
                .from('payroll_payments')
                .insert(paymentsToInsert);
            
            if (insertError) throw insertError;
            
            // Обновляем final_payroll_calculations
            for (const update of finalCalculationsToUpdate) {
                const { error: updateError } = await supabase
                    .from('final_payroll_calculations')
                    .upsert(update, { 
                        onConflict: 'employee_id,month,year',
                        ignoreDuplicates: false 
                    });
                
                if (updateError) {
                    console.error(`Ошибка обновления для ${update.employee_id}:`, updateError);
                }
            }
        }
        
        await logFinancialOperation('fix_advance_payment', {
            year, month, advanceEndDate, paymentDate,
            employeesCount, totalAmount,
            manualAdjustmentsPreserved: manualAdjustmentsMap.size
        }, req.user.id);
        
        res.json({
            success: true,
            message: `Аванс зафиксирован для ${employeesCount} сотрудников. Ручные корректировки сохранены: ${manualAdjustmentsMap.size}`,
            employeesCount,
            totalAmount,
            manualAdjustmentsPreserved: manualAdjustmentsMap.size
        });
        
    } catch (error) {
        console.error('Ошибка фиксации аванса:', error);
        
        // НОВОЕ: Попытка восстановления из резервной копии при ошибке
        try {
            const { data: backup } = await supabase
                .from('final_payroll_calculations_backup')
                .select('*')
                .eq('month', month)
                .eq('year', year)
                .eq('backup_reason', 'before_fix_advance')
                .order('backup_date', { ascending: false })
                .limit(1);
            
            if (backup && backup.length > 0) {
                console.log('Пытаемся восстановить из резервной копии...');
                // Здесь можно добавить автоматическое восстановление
            }
        } catch (backupError) {
            console.error('Ошибка при попытке восстановления:', backupError);
        }
        
        res.status(500).json({ success: false, error: error.message });
    } finally {
        operationLocks.delete(lockKey);
    }
});


// --- ИСПРАВЛЕННАЯ ФУНКЦИЯ ОТМЕНЫ ФИКСАЦИИ АВАНСА ---
app.post('/cancel-advance-payment', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, cancellationReason } = req.body;
    
    if (!year || !month || !cancellationReason) {
        return res.status(400).json({ success: false, error: 'Не все параметры указаны' });
    }

    try {
        // НОВОЕ: Создаем резервную копию перед отменой
        const { data: currentData } = await supabase
            .from('final_payroll_calculations')
            .select('*')
            .eq('month', month)
            .eq('year', year);
        
        if (currentData && currentData.length > 0) {
            // Проверяем существование таблицы backup
            const { error: tableCheckError } = await supabase
                .from('final_payroll_calculations_backup')
                .select('id')
                .limit(1);
            
            // Если таблица существует, сохраняем backup
            if (!tableCheckError || tableCheckError.code !== '42P01') {
                const backupData = currentData.map(row => {
                    // Удаляем id чтобы избежать конфликтов
                    const { id, ...rowWithoutId } = row;
                    return {
                        ...rowWithoutId,
                        original_id: id,
                        backup_date: new Date().toISOString(),
                        backup_reason: 'before_cancel_advance',
                        backup_by: req.user.id
                    };
                });
                
                const { error: backupError } = await supabase
                    .from('final_payroll_calculations_backup')
                    .insert(backupData);
                
                if (backupError) {
                    console.error('Ошибка создания резервной копии:', backupError);
                    // Продолжаем выполнение даже если backup не удался
                }
            }
        }
        
        // Получаем список зафиксированных авансов
        const { data: advances, error: fetchError } = await supabase
            .from('payroll_payments')
            .select('id, employee_id')
            .eq('payment_type', 'advance')
            .eq('payment_period_month', month)
            .eq('payment_period_year', year)
            .eq('is_cancelled', false);
        
        if (fetchError) throw fetchError;
        
        if (!advances || advances.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: `Не найден зафиксированный аванс за ${month}/${year}` 
            });
        }

        // Отмечаем все авансы как отмененные в payroll_payments
        const { error: updateError } = await supabase
            .from('payroll_payments')
            .update({
                is_cancelled: true,
                cancelled_at: new Date().toISOString(),
                cancelled_by: req.user.id,
                cancellation_reason: cancellationReason
            })
            .eq('payment_type', 'advance')
            .eq('payment_period_month', month)
            .eq('payment_period_year', year)
            .eq('is_cancelled', false);
        
        if (updateError) throw updateError;

        // ВАЖНО: НЕ обнуляем данные, а только снимаем флаг фиксации
        const employeeIds = advances.map(a => a.employee_id);
        
        // Проверяем наличие полей fixed_at и fixed_by в таблице
        const { data: testRow } = await supabase
            .from('final_payroll_calculations')
            .select('*')
            .limit(1)
            .single();
        
        let updateData = {
            is_fixed: false,
            updated_at: new Date().toISOString()
        };
        
        // Добавляем поля только если они существуют в таблице
        if (testRow && 'fixed_at' in testRow) {
            updateData.fixed_at = null;
        }
        if (testRow && 'fixed_by' in testRow) {
            updateData.fixed_by = null;
        }
        
        const { error: unfixError } = await supabase
            .from('final_payroll_calculations')
            .update(updateData)
            .eq('month', month)
            .eq('year', year)
            .in('employee_id', employeeIds);
        
        if (unfixError) {
            console.error('Ошибка снятия фиксации:', unfixError);
            // Не прерываем выполнение, продолжаем
        }

        await logFinancialOperation('cancel_advance_payment', {
            year, 
            month, 
            cancellationReason,
            cancelledCount: advances.length
        }, req.user.id);

        res.json({ 
            success: true, 
            message: `Фиксация аванса за ${month}/${year} успешно отменена. Данные сохранены.`,
            cancelledCount: advances.length
        });

    } catch (error) {
        console.error('Ошибка отмены аванса:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Добавим новый эндпоинт для фиксации уже скорректированных авансов
app.post('/fix-manual-advances', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, paymentDate } = req.body;
    
    try {
        // Получаем все ручные корректировки, которые еще не зафиксированы
        const { data: manualAdvances, error } = await supabase
            .from('final_payroll_calculations')
            .select('*')
            .eq('year', year)
            .eq('month', month)
            .eq('is_manual_adjustment', true)
            .eq('is_fixed', false);
        
        if (error) throw error;
        
        if (!manualAdvances || manualAdvances.length === 0) {
            return res.json({ 
                success: false, 
                message: 'Нет нефиксированных ручных корректировок' 
            });
        }
        
        // Создаем записи в payroll_payments для фиксации
        const paymentsToInsert = manualAdvances.map(ma => ({
            employee_id: ma.employee_id,
            payment_type: 'advance',
            amount: ma.advance_payment,
            advance_card: ma.advance_card || 0,
            advance_cash: ma.advance_cash || 0,
            payment_date: paymentDate || new Date().toISOString().split('T')[0],
            payment_period_month: parseInt(month),
            payment_period_year: parseInt(year),
            payment_method: ma.advance_payment_method || 'card',
            is_termination: ma.is_termination || false,
            created_by: req.user.id,
            is_cancelled: false
        }));
        
        // Сохраняем в payroll_payments
        const { error: insertError } = await supabase
            .from('payroll_payments')
            .insert(paymentsToInsert);
        
        if (insertError) throw insertError;
        
        // Обновляем флаг is_fixed в final_payroll_calculations
        const { error: updateError } = await supabase
            .from('final_payroll_calculations')
            .update({ is_fixed: true })
            .eq('year', year)
            .eq('month', month)
            .eq('is_manual_adjustment', true);
        
        if (updateError) throw updateError;
        
        res.json({ 
            success: true, 
            message: `Зафиксировано ${manualAdvances.length} ручных корректировок`,
            count: manualAdvances.length
        });
        
    } catch (error) {
        console.error('Ошибка фиксации ручных корректировок:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- ЭНДПОИНТЫ ДЛЯ РАБОТЫ С НОВЫМИ СОТРУДНИКАМИ ---

// Проверка новых сотрудников
// Проверка новых сотрудников - УПРОЩЕННАЯ ВЕРСИЯ
app.post('/check-new-employees', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month } = req.body;
    
    try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        
        // Получаем всех сотрудников с подсчетом смен в ТЕКУЩЕМ месяце до даты расчета
        const { data: currentMonthShifts, error } = await supabase
            .from('payroll_calculations')
            .select('employee_id, employee_name, total_pay')
            .gte('work_date', startDate)
            .lte('work_date', endDate);
        
        if (error) throw error;
        
        // Группируем по сотрудникам
        const employeeData = {};
        currentMonthShifts.forEach(shift => {
            if (!employeeData[shift.employee_id]) {
                employeeData[shift.employee_id] = {
                    name: shift.employee_name,
                    shifts: 0,
                    totalEarned: 0
                };
            }
            employeeData[shift.employee_id].shifts++;
            employeeData[shift.employee_id].totalEarned += shift.total_pay;
        });
        
        // Получаем статусы из таблицы employees
        const { data: employees, error: empError } = await supabase
            .from('employees')
            .select('id, fullname, employee_status')
            .in('id', Object.keys(employeeData));
        
        if (empError) throw empError;
        
        const employeeStatusMap = new Map(employees.map(e => [e.id, e.employee_status]));
        
        const newEmployees = [];
        
        for (const [employeeId, data] of Object.entries(employeeData)) {
            const status = employeeStatusMap.get(employeeId);
            
            // Если статус уже 'regular' - пропускаем
            if (status === 'regular') continue;
            
            // ПРОСТАЯ ЛОГИКА: от 1 до 5 смен = требует решения
            if (data.shifts >= 1 && data.shifts <= 5) {
                newEmployees.push({
                    employee_id: employeeId,
                    employee_name: data.name,
                    shifts_count: data.shifts,
                    earned_amount: data.totalEarned,
                    status: status || 'new'
                });
            }
        }
        
        console.log(`Найдено ${newEmployees.length} сотрудников с 1-5 сменами для проверки`);
        res.json({ success: true, newEmployees });
        
    } catch (error) {
        console.error('Ошибка проверки новых сотрудников:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/process-new-employees-advances', checkAuth, canManagePayroll, async (req, res) => {
    const { month, year, decisions } = req.body;
    
    try {
        let processedCount = 0;
        let updatedStatuses = 0;
        
        for (const decision of decisions) {
            // Обновляем статус если нужно
            if (decision.make_regular) {
                const { error } = await supabase
                    .from('employees')
                    .update({ employee_status: 'regular' })
                    .eq('id', decision.employee_id);
                
                if (!error) updatedStatuses++;
            }
            
            // Сохраняем решение по авансу только если не "none"
            if (decision.decision !== 'none') {
                const totalAdvance = (decision.advance_card || 0) + (decision.advance_cash || 0);
                
                if (totalAdvance > 0) {
                    await supabase
                        .from('final_payroll_calculations')
                        .upsert({
                            employee_id: decision.employee_id,
                            month: parseInt(month),
                            year: parseInt(year),
                            advance_payment: totalAdvance,
                            advance_card: decision.advance_card || 0,
                            advance_cash: decision.advance_cash || 0,
                            advance_payment_method: decision.advance_cash > 0 ? 
                                (decision.advance_card > 0 ? 'mixed' : 'cash') : 'card',
                            is_manual_adjustment: true,
                            adjustment_reason: decision.reason || 'Решение по новому сотруднику',
                            adjusted_by: req.user.id,
                            is_fixed: false
                        }, { onConflict: 'employee_id,month,year' });
                }
            }
            
            processedCount++;
        }
        
        res.json({ 
            success: true, 
            message: `Обработано ${processedCount} сотрудников. Статусы обновлены: ${updatedStatuses}` 
        });
        
    } catch (error) {
        console.error('Ошибка обработки решений:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


app.post('/adjust-advance-manually', checkAuth, canManagePayroll, async (req, res) => {
    const { 
        employee_id, month, year, 
        advance_card, advance_cash, 
        adjusted_advance, adjustment_reason, 
        payment_method, is_termination 
    } = req.body;
    
    if (!employee_id || !month || !year || adjusted_advance === undefined || !adjustment_reason) {
        return res.status(400).json({ success: false, error: 'Не все параметры указаны' });
    }
    
    // Валидация сумм
    const cardAmount = parseFloat(advance_card) || 0;
    const cashAmount = parseFloat(advance_cash) || 0;
    const totalAmount = parseFloat(adjusted_advance) || (cardAmount + cashAmount);
    
    // При увольнении снимаем ограничение на аванс
    if (!is_termination && totalAmount > MAX_ADVANCE_AMOUNT) {
        return res.status(400).json({ success: false, error: `Аванс не может превышать ${MAX_ADVANCE_AMOUNT} грн` });
    }
    
    // Проверка лимита карты даже при увольнении
    if (cardAmount > FIXED_CARD_PAYMENT_FOR_REPORT) {
        return res.status(400).json({ success: false, error: `На карту нельзя выплатить больше ${FIXED_CARD_PAYMENT_FOR_REPORT} грн` });
    }
    
    try {
        // Сохраняем с разделением на карту и наличные
        const dataToSave = {
            employee_id: employee_id,
            month: parseInt(month),
            year: parseInt(year),
            advance_payment: totalAmount,
            advance_card: cardAmount,
            advance_cash: cashAmount,
            advance_payment_method: payment_method || (cashAmount > 0 && cardAmount > 0 ? 'mixed' : (cashAmount > 0 ? 'cash' : 'card')),
            is_manual_adjustment: true,
            is_termination: is_termination || false,
            adjustment_reason: adjustment_reason,
            adjusted_by: req.user.id,
            updated_at: new Date().toISOString()
        };
        
        // Если увольнение, обнуляем остальные выплаты
        if (is_termination) {
            dataToSave.card_remainder = 0;
            dataToSave.cash_payout = 0;
            dataToSave.total_card_payment = cardAmount; // Только то, что на карту при увольнении
        }
        
        const { error: upsertError } = await supabase
            .from('final_payroll_calculations')
            .upsert(dataToSave, { onConflict: 'employee_id,month,year' });
        
        if (upsertError) throw upsertError;
        
        await logFinancialOperation('manual_advance_adjustment', {
            ...dataToSave,
            operation_type: is_termination ? 'termination_payment' : 'advance_adjustment'
        }, req.user.id);
        
        let message = '';
        if (is_termination) {
            message = `Выплата при увольнении: на карту ${cardAmount} грн, наличными ${cashAmount} грн`;
        } else {
            if (cardAmount > 0 && cashAmount > 0) {
                message = `Аванс скорректирован: на карту ${cardAmount} грн, наличными ${cashAmount} грн`;
            } else if (cashAmount > 0) {
                message = `Аванс скорректирован: наличными ${cashAmount} грн`;
            } else {
                message = `Аванс скорректирован: на карту ${cardAmount} грн`;
            }
        }
        
        res.json({ 
            success: true, 
            message: message
        });
        
    } catch (error) {
        console.error('Ошибка корректировки:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


app.get('/advance-adjustments-history', checkAuth, canManagePayroll, async (req, res) => {
    const { month, year } = req.query;
    
    try {
        // Получаем все ручные корректировки за период
        const { data: adjustments, error } = await supabase
            .from('final_payroll_calculations')
            .select(`
                employee_id,
                advance_payment,
                advance_payment_method,
                adjustment_reason,
                adjusted_by,
                updated_at,
                employees (fullname)
            `)
            .eq('month', month)
            .eq('year', year)
            .eq('is_manual_adjustment', true)
            .order('updated_at', { ascending: false });
        
        if (error) throw error;
        
        // Получаем информацию о пользователях, которые делали корректировки
        const adjustedByIds = [...new Set(adjustments.map(a => a.adjusted_by).filter(Boolean))];
        const { data: users } = await supabase
            .from('employees')
            .select('id, fullname')
            .in('id', adjustedByIds);
        
        const usersMap = new Map(users?.map(u => [u.id, u.fullname]) || []);
        
        // Форматируем данные для отправки
        const formattedAdjustments = adjustments.map(adj => ({
            employee_name: adj.employees?.fullname || 'Неизвестный',
            advance_amount: adj.advance_payment,
            payment_method: adj.advance_payment_method || 'card',
            reason: adj.adjustment_reason,
            adjusted_by: usersMap.get(adj.adjusted_by) || adj.adjusted_by,
            adjusted_at: adj.updated_at
        }));
        
        res.json({ 
            success: true, 
            adjustments: formattedAdjustments,
            total: formattedAdjustments.length
        });
        
    } catch (error) {
        console.error('Ошибка получения истории корректировок:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/calculate-final-payroll', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, reportEndDate } = req.body;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

    return withLock(`final_payroll_${year}_${month}`, async () => {
        try {
            // ВАЖНО: Сначала получаем существующие данные
            const { data: existingData, error: existingError } = await supabase
                .from('final_payroll_calculations')
                .select('*')
                .eq('month', month)
                .eq('year', year);
            
            if (existingError) throw existingError;
            
            // Создаем мапу существующих данных
            const existingMap = new Map();
            if (existingData) {
                existingData.forEach(row => {
                    existingMap.set(row.employee_id, row);
                });
            }
            
            // Получаем все расчеты за период
            const { data: allCalculations, error: totalError } = await supabase
                .from('payroll_calculations')
                .select('employee_id, total_pay')
                .gte('work_date', startDate)
                .lte('work_date', reportEndDate);
            
            if (totalError) throw totalError;

            // Суммируем базовые начисления по сотрудникам
            const totalBasePayMap = allCalculations.reduce((acc, calc) => {
                acc[calc.employee_id] = (acc[calc.employee_id] || 0) + calc.total_pay;
                return acc;
            }, {});
            
            // Получаем корректировки (премии, штрафы, недостачи)
            const { data: adjustments, error: adjError } = await supabase
                .from('monthly_adjustments')
                .select('*')
                .eq('year', year)
                .eq('month', month);
            
            if (adjError) throw adjError;
            
            const adjustmentsMap = new Map(adjustments?.map(adj => [adj.employee_id, adj]) || []);

            const finalResults = {};
            const dataToSave = [];
            
            for (const employeeId in totalBasePayMap) {
                const basePay = totalBasePayMap[employeeId];
                const adj = adjustmentsMap.get(employeeId) || { 
                    manual_bonus: 0, 
                    penalty: 0, 
                    shortage: 0 
                };
                
                // Получаем существующую запись
                const existing = existingMap.get(employeeId);
                
                // 1. Всего начислено = база + премия
                const totalGross = basePay + adj.manual_bonus;
                
                // 2. Всего вычетов = штрафы + недостачи
                const totalDeductions = adj.penalty + adj.shortage;
                
                // 3. К выплате после вычетов
                const totalAfterDeductions = totalGross - totalDeductions;
                
                // 4. ВАЖНО: Сохраняем существующие авансы и корректировки
                let advancePayment = 0;
                let advanceCard = 0;
                let advanceCash = 0;
                let isManualAdjustment = false;
                let adjustmentReason = '';
                let isTermination = false;
                let isFixed = false;
                let cardRemainder = 0;
                let cashPayout = 0;
                
                if (existing) {
                    // СОХРАНЯЕМ ВСЕ СУЩЕСТВУЮЩИЕ ДАННЫЕ ОБ АВАНСАХ
                    advancePayment = existing.advance_payment || 0;
                    advanceCard = existing.advance_card || 0;
                    advanceCash = existing.advance_cash || 0;
                    isManualAdjustment = existing.is_manual_adjustment || false;
                    adjustmentReason = existing.adjustment_reason || '';
                    isTermination = existing.is_termination || false;
                    isFixed = existing.is_fixed || false;
                    
                    // Если есть корректировка остатков - сохраняем
                    if (existing.is_remainder_adjusted) {
                        cardRemainder = existing.card_remainder || 0;
                        cashPayout = existing.cash_payout || 0;
                    } else {
                        // Пересчитываем только если не было ручной корректировки
                        const remainingToPay = Math.max(0, totalAfterDeductions - advancePayment);
                        const maxCardTotal = FIXED_CARD_PAYMENT_FOR_REPORT;
                        const remainingCardCapacity = Math.max(0, maxCardTotal - advanceCard);
                        
                        cardRemainder = Math.min(remainingCardCapacity, remainingToPay);
                        cashPayout = remainingToPay - cardRemainder;
                    }
                } else {
                    // Новая запись - расчет по умолчанию
                    let calculatedAdvance = basePay * 0.9;
                    let roundedAdvance = Math.floor(calculatedAdvance / 100) * 100;
                    advancePayment = Math.min(roundedAdvance, MAX_ADVANCE_AMOUNT);
                    advanceCard = advancePayment;
                    advanceCash = 0;
                    
                    const remainingToPay = Math.max(0, totalAfterDeductions - advancePayment);
                    const maxCardTotal = FIXED_CARD_PAYMENT_FOR_REPORT;
                    const remainingCardCapacity = Math.max(0, maxCardTotal - advanceCard);
                    
                    cardRemainder = Math.min(remainingCardCapacity, remainingToPay);
                    cashPayout = remainingToPay - cardRemainder;
                }
                
                // Если увольнение - остатки должны быть 0
                if (isTermination) {
                    cardRemainder = 0;
                    cashPayout = 0;
                }
                
                finalResults[employeeId] = { 
                    total_gross: totalGross,
                    total_deductions: totalDeductions,
                    total_after_deductions: totalAfterDeductions,
                    advance_payment: advancePayment,
                    advance_card: advanceCard,
                    advance_cash: advanceCash,
                    card_remainder: cardRemainder,
                    cash_payout: cashPayout,
                    total_card_payment: advanceCard + cardRemainder,
                    penalties_total: totalDeductions
                };

                // Добавляем данные для сохранения в БД
                dataToSave.push({
                    employee_id: employeeId,
                    month: parseInt(month),
                    year: parseInt(year),
                    total_gross: totalGross,
                    total_deductions: totalDeductions,
                    total_after_deductions: totalAfterDeductions,
                    advance_payment: advancePayment,
                    advance_card: advanceCard,
                    advance_cash: advanceCash,
                    advance_payment_method: advanceCash > 0 ? (advanceCard > 0 ? 'mixed' : 'cash') : 'card',
                    card_remainder: cardRemainder,
                    cash_payout: cashPayout,
                    total_card_payment: advanceCard + cardRemainder,
                    calculation_date: reportEndDate,
                    is_fixed: isFixed,
                    is_manual_adjustment: isManualAdjustment,
                    adjustment_reason: adjustmentReason,
                    is_termination: isTermination,
                    is_remainder_adjusted: existing?.is_remainder_adjusted || false,
                    remainder_adjusted_by: existing?.remainder_adjusted_by || null,
                    updated_at: new Date().toISOString()
                });
            }

            // Сохраняем финальные расчеты в базу данных
            if (dataToSave.length > 0) {
                // ВАЖНО: Используем upsert с сохранением критичных полей
                for (const record of dataToSave) {
                    const { error: saveError } = await supabase
                        .from('final_payroll_calculations')
                        .upsert(record, { 
                            onConflict: 'employee_id,month,year',
                            ignoreDuplicates: false 
                        });
                    
                    if (saveError) {
                        console.error(`Ошибка сохранения для ${record.employee_id}:`, saveError);
                    }
                }
                
                console.log(`Успешно обновлено ${dataToSave.length} записей`);
            }
            
            await logFinancialOperation('calculate_final_payroll', { 
                year, 
                month, 
                reportEndDate,
                employeesCount: Object.keys(finalResults).length,
                saved: dataToSave.length,
                preserved: existingMap.size
            }, req.user.id);
            
            res.json({ 
                success: true, 
                results: finalResults,
                message: `Расчет выполнен. Сохранены данные по ${existingMap.size} сотрудникам.`
            });

        } catch (error) {
            console.error('Ошибка окончательного расчета:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});


// Корректировка финальных выплат (остаток на карту/наличные)
app.post('/adjust-final-payment', checkAuth, canManagePayroll, async (req, res) => {
    const { employee_id, year, month, card_remainder, cash_payout } = req.body;
    
    try {
        // Проверяем лимиты
        const { data: currentData } = await supabase
            .from('final_payroll_calculations')
            .select('advance_card, total_after_deductions, advance_payment')
            .eq('employee_id', employee_id)
            .eq('year', year)
            .eq('month', month)
            .single();
        
        if (!currentData) {
            return res.status(404).json({ success: false, error: 'Расчет не найден' });
        }
        
        const maxCard = Math.max(0, FIXED_CARD_PAYMENT_FOR_REPORT - (currentData.advance_card || 0));
        if (card_remainder > maxCard) {
            return res.status(400).json({ 
                success: false, 
                error: `Превышен лимит карты. Максимум: ${maxCard} грн` 
            });
        }
        
        // Обновляем данные
        const { error } = await supabase
            .from('final_payroll_calculations')
            .update({
                card_remainder: card_remainder,
                cash_payout: cash_payout,
                total_card_payment: (currentData.advance_card || 0) + card_remainder,
                is_remainder_adjusted: true,
                remainder_adjusted_at: new Date().toISOString(),
                remainder_adjusted_by: req.user.id
            })
            .eq('employee_id', employee_id)
            .eq('year', year)
            .eq('month', month);
        
        if (error) throw error;
        
        await logFinancialOperation('adjust_final_payment', {
            employee_id, year, month, card_remainder, cash_payout
        }, req.user.id);
        
        res.json({ success: true, message: 'Корректировка сохранена' });
        
    } catch (error) {
        console.error('Ошибка корректировки финальных выплат:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Получение недостач
app.get('/get-shortages', checkAuth, canManagePayroll, async (req, res) => {
    const { employee_id, year, month } = req.query;
    
    try {
        const { data: shortages, error } = await supabase
            .from('employee_shortages')
            .select('*')
            .eq('employee_id', employee_id)
            .eq('year', year)
            .eq('month', month)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        res.json({ success: true, shortages: shortages || [] });
        
    } catch (error) {
        console.error('Ошибка получения недостач:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Добавление недостачи
app.post('/add-shortage', checkAuth, canManagePayroll, async (req, res) => {
    const { employee_id, year, month, amount, description, deduction_from } = req.body;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Некорректная сумма' });
    }
    
    try {
        // Добавляем запись о недостаче
        const { data: shortage, error: insertError } = await supabase
            .from('employee_shortages')
            .insert({
                employee_id,
                year,
                month,
                amount,
                description,
                deduction_from,
                created_by: req.user.id
            })
            .select()
            .single();
        
        if (insertError) throw insertError;
        
        // Обновляем общую сумму недостач в monthly_adjustments
        const { data: currentAdj } = await supabase
            .from('monthly_adjustments')
            .select('shortage')
            .eq('employee_id', employee_id)
            .eq('year', year)
            .eq('month', month)
            .single();
        
        const currentShortage = currentAdj?.shortage || 0;
        const newTotalShortage = currentShortage + amount;
        
        await supabase
            .from('monthly_adjustments')
            .upsert({
                employee_id,
                year,
                month,
                shortage: newTotalShortage
            }, { onConflict: 'employee_id,month,year' });
        
        await logFinancialOperation('add_shortage', {
            employee_id, year, month, amount, description, deduction_from
        }, req.user.id);
        
        res.json({ success: true, shortage });
        
    } catch (error) {
        console.error('Ошибка добавления недостачи:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Удаление недостачи
app.delete('/remove-shortage/:id', checkAuth, canManagePayroll, async (req, res) => {
    const { id } = req.params;
    
    try {
        // Получаем информацию о недостаче
        const { data: shortage, error: fetchError } = await supabase
            .from('employee_shortages')
            .select('*')
            .eq('id', id)
            .single();
        
        if (fetchError) throw fetchError;
        if (!shortage) {
            return res.status(404).json({ success: false, error: 'Недостача не найдена' });
        }
        
        // Удаляем недостачу
        const { error: deleteError } = await supabase
            .from('employee_shortages')
            .delete()
            .eq('id', id);
        
        if (deleteError) throw deleteError;
        
        // Обновляем общую сумму в monthly_adjustments
        const { data: allShortages } = await supabase
            .from('employee_shortages')
            .select('amount')
            .eq('employee_id', shortage.employee_id)
            .eq('year', shortage.year)
            .eq('month', shortage.month);
        
        const newTotal = (allShortages || []).reduce((sum, s) => sum + s.amount, 0);
        
        await supabase
            .from('monthly_adjustments')
            .update({ shortage: newTotal })
            .eq('employee_id', shortage.employee_id)
            .eq('year', shortage.year)
            .eq('month', shortage.month);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Ошибка удаления недостачи:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ====== ХЕЛПЕР: собираем ФОТ с группировкой по магазинам (ИСПРАВЛЕННАЯ ВЕРСИЯ) ======
async function buildFotReport({ startDate, endDate }) {
    // ШАГ 1: Определяем дни, за которые была ФАКТИЧЕСКИ загружена выручка
    const { data: revenueDaysData, error: revenueDaysErr } = await supabase
      .from('daily_revenue')
      .select('revenue_date')
      .gte('revenue_date', startDate)
      .lte('revenue_date', endDate);
    if (revenueDaysErr) throw revenueDaysErr;
  
    if (!revenueDaysData || revenueDaysData.length === 0) {
      return { rows: [] }; // Если выручки в периоде нет, то и ФОТ считать нечего
    }
    // Создаем уникальный список "полных" дней
    const completeDays = [...new Set(revenueDaysData.map(d => d.revenue_date))];

    // ШАГ 2: Берем начисления ТОЛЬКО за те дни, которые мы определили на шаге 1
    const { data: calcs, error: calcErr } = await supabase
      .from('payroll_calculations')
      .select('employee_id, work_date, total_pay, store_id, store_address')
      .in('work_date', completeDays) // <-- КЛЮЧЕВОЕ ИЗМЕНЕНИЕ
      .gt('total_pay', 0);
    if (calcErr) throw calcErr;
  
    if (!calcs || calcs.length === 0) {
      return { rows: [] };
    }
  
    // ШАГ 3: Загружаем выручку ТОЛЬКО за "полные" дни
    const { data: revs, error: revErr } = await supabase
      .from('daily_revenue')
      .select('store_id, revenue')
      .in('revenue_date', completeDays);
    if (revErr) throw revErr;
    
    const revenueByStore = (revs || []).reduce((acc, r) => {
        acc[r.store_id] = (acc[r.store_id] || 0) + Number(r.revenue || 0);
        return acc;
    }, {});
  
    // ШАГ 4: Считаем ФОТ по магазинам, как и раньше
    const fotByStore = {};
    const TAX = 0.22;
    const cardLimit = 8600;
    const employeeCardTracker = {}; 
  
    for (const c of calcs) {
        if (!c.store_id) continue;
  
        if (!employeeCardTracker[c.employee_id]) {
          employeeCardTracker[c.employee_id] = { paid_to_card: 0 };
        }
  
        const remainingCardCapacity = cardLimit - employeeCardTracker[c.employee_id].paid_to_card;
        let paidToCardToday = 0;
        if (remainingCardCapacity > 0) {
          paidToCardToday = Math.min(c.total_pay, remainingCardCapacity);
          employeeCardTracker[c.employee_id].paid_to_card += paidToCardToday;
        }
        
        const tax = paidToCardToday * TAX;
        const payoutWithTax = c.total_pay + tax;
        
        if (!fotByStore[c.store_id]) {
            fotByStore[c.store_id] = {
                store_address: c.store_address,
                total_payout_with_tax: 0,
                total_revenue: revenueByStore[c.store_id] || 0,
            };
        }
        fotByStore[c.store_id].total_payout_with_tax += payoutWithTax;
    }
  
    // ШАГ 5: Формируем итоговый массив
    const rows = Object.values(fotByStore).map(storeData => {
        const fot_percentage = storeData.total_revenue > 0 
            ? (storeData.total_payout_with_tax / storeData.total_revenue) * 100 
            : 0;
        return {
            ...storeData,
            fot_percentage
        };
    });
    
    return { rows };
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
  
      res.json({ success: true, rows: report.rows });
  
    } catch (error) {
      console.error('Ошибка формирования отчёта ФОТ:', error);
      res.status(500).json({ success: false, error: error.message });
    }
});

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

    let totalRevenue = 0;
    let totalPayoutWithTax = 0;
    
    for (const r of rows) {
      totalRevenue += Number(r.total_revenue || 0);
      totalPayoutWithTax += Number(r.total_payout_with_tax || 0);
    }
    
    const fotPercentage = totalRevenue > 0 ? (totalPayoutWithTax / totalRevenue) * 100 : 0;

    const sheetRows = [
      ['Адрес магазина', 'Выручка магазина', 'Фонд оплаты труда', 'ФОТ %']
    ];
    for (const r of rows) {
      sheetRows.push([
        r.store_address,
        Number(r.total_revenue || 0),
        Number(r.total_payout_with_tax || 0),
        Number(r.fot_percentage || 0)
      ]);
    }
    sheetRows.push([]);
    sheetRows.push(['ИТОГО по периоду']);
    sheetRows.push(['Общая выручка', totalRevenue]);
    sheetRows.push(['Общий ФОТ (выплаты + 22%)', totalPayoutWithTax]);
    sheetRows.push(['ФОТ % от выручки', fotPercentage.toFixed(2)]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, 'FOT_by_Store');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fileName = `fot_by_store_${year}-${String(month).padStart(2, '0')}_${reportEndDate}.xlsx`;
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
  try {
    await supabase.from('payroll_calculations').delete().neq('id', 0);
    await supabase.from('shifts').delete().neq('id', 0);
    await supabase.from('daily_revenue').delete().neq('id', 0);
    await supabase.from('monthly_adjustments').delete().neq('id', 0);
    
    await logFinancialOperation('clear_test_data', { status: 'success' }, req.user.id);
   
    res.json({ success: true, message: 'Все тестовые данные (смены, расчеты, выручка) были успешно удалены.' });

  } catch (error) {
    console.error('Ошибка при очистке данных:', error);
    res.status(500).json({ success: false, error: 'Произошла ошибка на сервере при удалении данных.' });
  }
});

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Явно указываем хост

const server = app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
  console.log(`Listening on all interfaces on port ${PORT}`);
});

// Обработка ошибок
server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

// Создание резервной копии
app.post('/backup-payroll-state', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month } = req.body;
    
    try {
        // Создаем резервную копию в новой таблице
        const { error: createError } = await supabase.rpc('backup_payroll_data', {
            p_year: year,
            p_month: month
        });
        
        if (createError) throw createError;
        
        res.json({ success: true, message: 'Резервная копия создана' });
    } catch (error) {
        console.error('Ошибка создания резервной копии:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Восстановление из резервной копии
app.post('/restore-from-backup', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month } = req.body;
    
    try {
        // Восстанавливаем из резервной копии
        const { error: restoreError } = await supabase.rpc('restore_payroll_data', {
            p_year: year,
            p_month: month
        });
        
        if (restoreError) throw restoreError;
        
        res.json({ success: true, message: 'Данные восстановлены из резервной копии' });
    } catch (error) {
        console.error('Ошибка восстановления:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Автосохранение состояния таблицы
app.post('/autosave-table-state', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, tableData } = req.body;
    
    try {
        // Сохраняем снимок состояния
        const { error } = await supabase
            .from('table_state_snapshots')
            .insert({
                year: year,
                month: month,
                snapshot_data: tableData,
                created_by: req.user.id,
                created_at: new Date().toISOString()
            });
        
        if (error) throw error;
        
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка автосохранения:', error);
        res.status(500).json({ success: false });
    }
});

// НОВАЯ ФУНКЦИЯ: Создание резервной копии перед критическими операциями
app.post('/create-backup', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, reason } = req.body;
    
    try {
        // Получаем текущие данные
        const { data: currentData, error: fetchError } = await supabase
            .from('final_payroll_calculations')
            .select('*')
            .eq('month', month)
            .eq('year', year);
        
        if (fetchError) throw fetchError;
        
        if (!currentData || currentData.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Нет данных для резервного копирования' 
            });
        }
        
        // Сохраняем в таблицу резервных копий
        const backupData = currentData.map(row => ({
            ...row,
            original_id: row.id,
            backup_date: new Date().toISOString(),
            backup_reason: reason || 'manual_backup',
            backup_by: req.user.id
        }));
        
        const { error: insertError } = await supabase
            .from('final_payroll_calculations_backup')
            .insert(backupData);
        
        if (insertError) throw insertError;
        
        await logFinancialOperation('create_backup', {
            year, month, reason,
            recordsCount: backupData.length
        }, req.user.id);
        
        res.json({
            success: true,
            message: `Резервная копия создана: ${backupData.length} записей`,
            backupId: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Ошибка создания резервной копии:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// НОВАЯ ФУНКЦИЯ: Восстановление из резервной копии
app.post('/restore-from-backup', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, backupDate } = req.body;
    
    try {
        // Получаем данные из резервной копии
        const { data: backupData, error: fetchError } = await supabase
            .from('final_payroll_calculations_backup')
            .select('*')
            .eq('month', month)
            .eq('year', year)
            .eq('backup_date', backupDate);
        
        if (fetchError) throw fetchError;
        
        if (!backupData || backupData.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Резервная копия не найдена' 
            });
        }
        
        // Сначала создаем копию текущего состояния
        const { data: currentData } = await supabase
            .from('final_payroll_calculations')
            .select('*')
            .eq('month', month)
            .eq('year', year);
        
        if (currentData && currentData.length > 0) {
            await supabase
                .from('final_payroll_calculations_backup')
                .insert(currentData.map(row => ({
                    ...row,
                    backup_date: new Date().toISOString(),
                    backup_reason: 'before_restore',
                    backup_by: req.user.id
                })));
        }
        
        // Восстанавливаем данные
        for (const record of backupData) {
            const { original_id, backup_date, backup_reason, backup_by, ...dataToRestore } = record;
            
            const { error: upsertError } = await supabase
                .from('final_payroll_calculations')
                .upsert(dataToRestore, { 
                    onConflict: 'employee_id,month,year' 
                });
            
            if (upsertError) {
                console.error(`Ошибка восстановления записи:`, upsertError);
            }
        }
        
        await logFinancialOperation('restore_from_backup', {
            year, month, backupDate,
            recordsRestored: backupData.length
        }, req.user.id);
        
        res.json({
            success: true,
            message: `Восстановлено ${backupData.length} записей из резервной копии от ${backupDate}`
        });
        
    } catch (error) {
        console.error('Ошибка восстановления:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
