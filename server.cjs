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

        // Проверяем зафиксированные авансы
        const { data: existingAdvances, error: advanceError } = await supabase
            .from('payroll_payments')
            .select('employee_id, amount')
            .eq('payment_type', 'advance')
            .eq('payment_period_month', month)
            .eq('payment_period_year', year)
            .eq('is_cancelled', false);
        
        if (advanceError) throw advanceError;
        
        const fixedAdvances = new Map();
        if (existingAdvances) {
            existingAdvances.forEach(adv => {
                fixedAdvances.set(adv.employee_id, adv.amount);
            });
        }

        const results = {};
        for (const [employeeId, totalEarned] of Object.entries(earnedInPeriod)) {
    // ИСПРАВЛЕНО: Аванс = минимум из (заработано, 7900), округленный до сотен вниз
    let finalAdvance = Math.min(totalEarned, MAX_ADVANCE_AMOUNT);
    finalAdvance = Math.floor(finalAdvance / 100) * 100;
    
    if (finalAdvance > 0) {
        paymentsToInsert.push({
            employee_id: employeeId,
            payment_type: 'advance',
            payment_date: paymentDate,
            payment_period_month: month,
            payment_period_year: year,
            amount: finalAdvance,
            payment_method: 'card',
            card_amount: finalAdvance,
            cash_amount: 0,
            calculation_date: advanceEndDate,
            notes: `Аванс рассчитан по ${advanceEndDate}`,
            created_by: req.user.id
        });
        totalFixedAmount += finalAdvance;
        employeesCount++;
    }
}

// --- НОВЫЙ ЭНДПОИНТ: Фиксация выплаты аванса ---
app.post('/fix-advance-payment', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, advanceEndDate, paymentDate } = req.body;
    
    if (!year || !month || !advanceEndDate || !paymentDate) {
        return res.status(400).json({ success: false, error: 'Не все параметры указаны' });
    }
    
    const dateValidation = validateDate(advanceEndDate);
    if (!dateValidation.valid) return res.status(400).json({ success: false, error: dateValidation.error });
    
    const paymentDateValidation = validateDate(paymentDate);
    if (!paymentDateValidation.valid) return res.status(400).json({ success: false, error: 'Некорректная дата выплаты' });

    return withLock(`fix_advance_${year}_${month}`, async () => {
        try {
            // Сначала получаем расчет аванса
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            
            const { data: calculationsInPeriod, error } = await supabase
                .from('payroll_calculations')
                .select('employee_id, total_pay')
                .gte('work_date', startDate)
                .lte('work_date', advanceEndDate);
            if (error) throw error;

            const earnedInPeriod = calculationsInPeriod.reduce((acc, calc) => {
                acc[calc.employee_id] = (acc[calc.employee_id] || 0) + calc.total_pay;
                return acc;
            }, {});

            // Проверяем, нет ли уже зафиксированного аванса
            const { data: existingAdvances, error: checkError } = await supabase
                .from('payroll_payments')
                .select('employee_id')
                .eq('payment_type', 'advance')
                .eq('payment_period_month', month)
                .eq('payment_period_year', year)
                .eq('is_cancelled', false);
            
            if (checkError) throw checkError;
            
            if (existingAdvances && existingAdvances.length > 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Аванс за ${month}/${year} уже зафиксирован. Необходимо сначала отменить предыдущую фиксацию.` 
                });
            }

            // Готовим данные для вставки
            const paymentsToInsert = [];
            let totalFixedAmount = 0;
            let employeesCount = 0;
            
            for (const [employeeId, totalEarned] of Object.entries(earnedInPeriod)) {
                const potentialAdvance = totalEarned * ADVANCE_PERCENTAGE;
                let finalAdvance = Math.min(potentialAdvance, MAX_ADVANCE_AMOUNT);
                finalAdvance = Math.floor(finalAdvance / 100) * 100;
                
                if (finalAdvance > 0) {
                    paymentsToInsert.push({
                        employee_id: employeeId,
                        payment_type: 'advance',
                        payment_date: paymentDate,
                        payment_period_month: month,
                        payment_period_year: year,
                        amount: finalAdvance,
                        payment_method: 'card',
                        card_amount: finalAdvance,
                        cash_amount: 0,
                        calculation_date: advanceEndDate,
                        notes: `Аванс рассчитан по ${advanceEndDate}`,
                        created_by: req.user.id
                    });
                    totalFixedAmount += finalAdvance;
                    employeesCount++;
                }
            }

            // Фиксируем авансы в базе
            if (paymentsToInsert.length > 0) {
                const { error: insertError } = await supabase
                    .from('payroll_payments')
                    .insert(paymentsToInsert);
                
                if (insertError) throw insertError;
            }

            await logFinancialOperation('fix_advance_payment', {
                year, month, advanceEndDate, paymentDate,
                employeesCount, totalFixedAmount
            }, req.user.id);

            res.json({ 
                success: true, 
                message: `Аванс успешно зафиксирован для ${employeesCount} сотрудников на общую сумму ${totalFixedAmount} грн`,
                employeesCount,
                totalAmount: totalFixedAmount
            });

        } catch (error) {
            console.error('Ошибка фиксации аванса:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
});

// --- НОВЫЙ ЭНДПОИНТ: Отмена зафиксированного аванса ---
// Обновленная функция отмены фиксации аванса в server.cjs (с обнулением)
app.post('/cancel-advance-payment', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, cancellationReason } = req.body;
    
    if (!year || !month || !cancellationReason) {
        return res.status(400).json({ success: false, error: 'Не все параметры указаны' });
    }

    try {
        // 1. Получаем список зафиксированных авансов
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

        // 2. Отмечаем все авансы как отмененные в payroll_payments
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

        // 3. ОБНУЛЯЕМ финальные расчеты (вместо удаления)
        const employeeIds = advances.map(a => a.employee_id);
        let finalCalcsReset = 0;
        
        // Проверяем существование таблицы
        const { data: tableExists } = await supabase
            .from('final_payroll_calculations')
            .select('id')
            .limit(1);
        
        if (tableExists !== null) {
            // Обнуляем поля в финальных расчетах
            const { data: resetData, error: resetError } = await supabase
                .from('final_payroll_calculations')
                .update({
                    advance_payment: 0,
                    card_remainder: 0,
                    cash_payout: 0,
                    total_card_payment: 0,
                    // Оставляем total_gross, total_deductions и total_after_deductions
                    // чтобы сохранить информацию о базовых начислениях
                    updated_at: new Date().toISOString()
                })
                .eq('month', month)
                .eq('year', year)
                .in('employee_id', employeeIds)
                .select('id');
            
            if (resetError) {
                console.error('Ошибка обнуления финальных расчетов:', resetError);
            } else {
                finalCalcsReset = resetData ? resetData.length : 0;
                console.log(`Обнулено ${finalCalcsReset} финальных расчетов`);
            }
        }

        await logFinancialOperation('cancel_advance_payment', {
            year, 
            month, 
            cancellationReason,
            cancelledCount: advances.length,
            finalCalcsReset: finalCalcsReset
        }, req.user.id);

        res.json({ 
            success: true, 
            message: `Фиксация аванса за ${month}/${year} успешно отменена. Обнулено расчетов: ${finalCalcsReset}`,
            cancelledCount: advances.length,
            finalCalcsReset: finalCalcsReset
        });

    } catch (error) {
        console.error('Ошибка отмены аванса:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


app.post('/calculate-final-payroll', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, reportEndDate } = req.body;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

    return withLock(`final_payroll_${year}_${month}`, async () => {
        try {
            // Получаем все расчеты за период
            const { data: allCalculations, error: totalError } = await supabase
                .from('payroll_calculations')
                .select('employee_id, total_pay')
                .gte('work_date', startDate)
                .lte('work_date', reportEndDate);
            
            if (totalError) throw totalError;

            // Суммируем базовые начисления
            const totalBasePayMap = allCalculations.reduce((acc, calc) => {
                acc[calc.employee_id] = (acc[calc.employee_id] || 0) + calc.total_pay;
                return acc;
            }, {});
            
            // Получаем зафиксированные авансы
            const { data: fixedAdvances, error: advanceError } = await supabase
                .from('payroll_payments')
                .select('employee_id, amount')
                .eq('payment_type', 'advance')
                .eq('payment_period_month', month)
                .eq('payment_period_year', year)
                .eq('is_cancelled', false);
            
            if (advanceError) throw advanceError;
            
            const advancePayments = {};
            
            if (fixedAdvances && fixedAdvances.length > 0) {
                fixedAdvances.forEach(adv => {
                    advancePayments[adv.employee_id] = adv.amount;
                });
                console.log(`Используются зафиксированные авансы для ${fixedAdvances.length} сотрудников`);
            } else {
                // Если авансы не зафиксированы, рассчитываем автоматически
                console.log(`Зафиксированных авансов нет, рассчитываем автоматически`);
                for (const [employeeId, totalEarned] of Object.entries(totalBasePayMap)) {
                    // ИСПРАВЛЕННАЯ ЛОГИКА для автоматического расчета
                    let finalAdvance = Math.min(totalEarned, MAX_ADVANCE_AMOUNT);
                    finalAdvance = Math.floor(finalAdvance / 100) * 100;
                    advancePayments[employeeId] = finalAdvance;
                }
            }

            // Получаем корректировки
            const { data: adjustments, error: adjError } = await supabase
                .from('monthly_adjustments')
                .select('*')
                .eq('year', year)
                .eq('month', month);
            
            if (adjError) throw adjError;
            
            const adjustmentsMap = new Map(adjustments.map(adj => [adj.employee_id, adj]));

            const finalResults = {};
            const dataToSave = [];
            
            for (const employeeId in totalBasePayMap) {
                const basePay = totalBasePayMap[employeeId];
                const adj = adjustmentsMap.get(employeeId) || { 
                    manual_bonus: 0, 
                    penalty: 0, 
                    shortage: 0 
                };
                
                // ПРАВИЛЬНАЯ ЛОГИКА РАСЧЕТА:
                
                // 1. Всего начислено = база + премия
                const totalGross = basePay + adj.manual_bonus;
                
                // 2. Всего вычетов = штрафы + недостачи
                const totalDeductions = adj.penalty + adj.shortage;
                
                // 3. К выплате после вычетов
                const totalAfterDeductions = totalGross - totalDeductions;
                
                // 4. Аванс (уже выплачен на карту)
                const advancePayment = advancePayments[employeeId] || 0;
                
                // 5. ИСПРАВЛЕНО: Определяем остаток на карту
                // Максимум на карту за месяц = 8600
                // Уже выплачено в аванс = advancePayment
                // Остаток места на карте = 8600 - advancePayment
                const remainingCardCapacity = FIXED_CARD_PAYMENT_FOR_REPORT - advancePayment;
                
                // 6. Остаток к выплате после аванса
                const remainingToPay = totalAfterDeductions - advancePayment;
                
                // 7. Остаток на карту = минимум из (остаток места на карте, остаток к выплате)
                const cardRemainder = Math.min(remainingCardCapacity, Math.max(0, remainingToPay));
                
                // 8. Наличными = всё что осталось после карты
                const cashPayout = Math.max(0, remainingToPay - cardRemainder);
                
                // Логирование для отладки
                console.log(`${employeeId}: Начислено=${totalGross}, Вычеты=${totalDeductions}, К выплате=${totalAfterDeductions}`);
                console.log(`  Аванс=${advancePayment}, Остаток на карту=${cardRemainder}, Наличные=${cashPayout}`);
                console.log(`  Проверка: ${advancePayment} + ${cardRemainder} + ${cashPayout} = ${advancePayment + cardRemainder + cashPayout} (должно быть ${totalAfterDeductions})`);
                
                finalResults[employeeId] = { 
                    total_gross: totalGross,
                    total_deductions: totalDeductions,
                    total_after_deductions: totalAfterDeductions,
                    advance_payment: advancePayment,
                    card_remainder: cardRemainder,
                    cash_payout: cashPayout,
                    total_card_payment: advancePayment + cardRemainder,
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
                    card_remainder: cardRemainder,
                    cash_payout: cashPayout,
                    total_card_payment: advancePayment + cardRemainder,
                    calculation_date: reportEndDate
                });
            }

            // Сохраняем финальные расчеты в базу данных
            if (dataToSave.length > 0) {
                const { error: saveError } = await supabase
                    .from('final_payroll_calculations')
                    .upsert(dataToSave, { onConflict: 'employee_id,month,year' });
                
                if (saveError) {
                    console.error('Ошибка сохранения финальных расчетов:', saveError);
                } else {
                    console.log(`Успешно сохранено ${dataToSave.length} финальных расчетов`);
                }
            }
            
            await logFinancialOperation('calculate_final_payroll', { 
                year, 
                month, 
                reportEndDate,
                employeesCount: Object.keys(finalResults).length,
                saved: dataToSave.length
            }, req.user.id);
            
            res.json({ success: true, results: finalResults });

        } catch (error) {
            console.error('Ошибка окончательного расчета:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });
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

