// --- Подключение модулей и настройка ---
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const upload = multer({ storage: multer.memoryStorage() });
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

// --- Подключение к Supabase ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();

// --- Настройка middleware ---
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// --- НОВЫЕ КОНСТАНТЫ ДЛЯ РАСЧЕТОВ ---
const MAX_CARD_PAYMENT = 8600; // Максимальная сумма выплаты на карту
const ADVANCE_PERCENTAGE = 0.9; // Процент для расчета аванса от заработанного
const MAX_ADVANCE_AMOUNT = 7900; // Максимальная сумма аванса
const COMPANY_TAX_RATE = 0.22; // Ставка налога компании (22%)
// Константа для старой логики в отчете для бухгалтера
const FIXED_CARD_PAYMENT_FOR_REPORT = 8600; 

// --- MIDDLEWARE ДЛЯ ПРОВЕРКИ АВТОРИЗАЦИИ И РОЛЕЙ ---
const checkAuth = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ success: false, message: "Нет токена." });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
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

// =================================================================
// --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ РАСЧЕТА ДНЕВНОЙ ЗАРПЛАТЫ ---
// =================================================================

function calculateDailyPay(revenue, numSellers, isSenior = false) {
  if (isSenior) {
    return { baseRate: 1300, bonus: 0, totalPay: 1300 };
  }
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


// =================================================================
// --- ОСНОВНЫЕ API ЭНДПОИНТЫ ---
// =================================================================

app.get("/employees", async (req, res) => {
  const { data, error } = await supabase.from('employees').select('fullname').eq('active', true);
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data.map(e => e.fullname));
});

app.post("/login", async (req, res) => {
  const { username, password, deviceKey } = req.body;
  
  const { data: employee, error } = await supabase
    .from('employees')
    .select('id, fullname, role')
    .ilike('fullname', username.trim())
    .eq('password', password)
    .single();

  if (error || !employee) {
    return res.status(401).json({ success: false, message: "Неверное имя или пароль" });
  }

  let storeId = null;
  let storeAddress = null;
  let responseMessage = '';
  const isSeniorSeller = employee.id.startsWith('SProd');

  if (employee.role === 'seller') {
    if (isSeniorSeller) {
        storeAddress = "Старший продавец";
    } else {
        if (deviceKey) {
          const { data: device } = await supabase.from('devices').select('store_id').eq('device_key', deviceKey).single();
          if (device) storeId = device.store_id;
        }
        if (!storeId) {
          const { data: storeLink } = await supabase.from('employee_store').select('store_id').eq('employee_id', employee.id).single();
          if (storeLink) storeId = storeLink.store_id;
        }
        if (!storeId) {
          return res.status(404).json({ success: false, message: "Для этого сотрудника не удалось определить магазин." });
        }
        const { data: store, error: storeError } = await supabase.from('stores').select('address').eq('id', storeId).single();
        if (storeError || !store) return res.status(404).json({ success: false, message: "Магазин не найден" });
        storeAddress = store.address;
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

  return res.json({
    success: true,
    message: responseMessage,
    store: storeAddress,
    role: employee.role
  });
});

app.post('/logout', (req, res) => {
  res.cookie('token', '', { expires: new Date(0), httpOnly: true, secure: true, sameSite: 'strict' });
  res.status(200).json({ success: true, message: 'Выход выполнен успешно' });
});

app.get('/check-auth', checkAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

// =================================================================
// --- ЗАЩИЩЕННЫЕ API ЭНДПОИНТЫ ---
// =================================================================
const canManagePayroll = checkRole(['admin', 'accountant']);
const canManageFot = checkRole(['admin']);

app.post('/upload-revenue-file', checkAuth, canManagePayroll, upload.single('file'), async (req, res) => {
    try {
        const { date } = req.body;
        if (!date) { return res.status(400).json({ success: false, error: 'Дата не указана' }); }
        if (!req.file) { return res.status(400).json({ success: false, error: 'Файл не загружен' }); }

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
        if (headerRowIndex === -1) { return res.status(400).json({ success: false, error: 'В файле не найдены столбцы "Торговая точка" и "Выторг".' }); }
        const rawData = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });
        const revenues = rawData.map(row => {
        const revenueStr = String(row['Выторг'] || '0');
        const cleanedStr = revenueStr.replace(/\s/g, '').replace(',', '.');
        const revenueNum = parseFloat(cleanedStr);
        return { store_address: row['Торговая точка'], revenue: revenueNum };
        }).filter(item => item.store_address && !isNaN(item.revenue) && !String(item.store_address).startsWith('* Себестоимость'));

        const addressesFromFile = [...new Set(revenues.map(r => r.store_address.trim()))];
        
        const { data: stores, error: storeError } = await supabase
            .from('stores')
            .select('id, address')
            .in('address', addressesFromFile);

        if (storeError) throw storeError;

        const storeAddressToIdMap = new Map(stores.map(s => [s.address, s.id]));
        const dataToUpsert = [];
        const matched = [];
        const unmatched = [];

        for (const item of revenues) {
            const storeId = storeAddressToIdMap.get(item.store_address.trim());
            if (storeId) {
                dataToUpsert.push({
                    store_id: storeId,
                    revenue_date: date,
                    revenue: item.revenue
                });
                matched.push(item.store_address);
            } else {
                unmatched.push(item.store_address);
            }
        }

        if (dataToUpsert.length > 0) {
            const { error: upsertError } = await supabase
                .from('daily_revenue')
                .upsert(dataToUpsert, { onConflict: 'store_id,revenue_date' });

            if (upsertError) throw upsertError;
        }

        const totalRevenue = revenues.reduce((sum, current) => sum + current.revenue, 0);
        res.json({ success: true, message: 'Выручка успешно и быстро загружена', revenues, matched, unmatched, totalRevenue });

    } catch (error) {
        console.error('Ошибка загрузки выручки из Excel:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/calculate-payroll', checkAuth, canManagePayroll, async (req, res) => {
    const { date } = req.body;
    if (!date) {
        return res.status(400).json({ success: false, error: 'Дата не указана' });
    }
    const { data: shifts } = await supabase.from('shifts').select(`employee_id, employees (fullname), store_id, stores (address)`).eq('shift_date', date);
    if (!shifts || shifts.length === 0) {
        return res.json({ success: true, calculations: [], summary: { date, total_employees: 0, total_payroll: 0 } });
    }
    const storeShifts = {};
    shifts.forEach(shift => {
      const address = shift.stores?.address || 'Старший продавец';
      if (!storeShifts[address]) storeShifts[address] = [];
      storeShifts[address].push({ employee_id: shift.employee_id, employee_name: shift.employees.fullname, store_id: shift.store_id });
    });
    const calculations = [];
    for (const [storeAddress, storeEmployees] of Object.entries(storeShifts)) {
      let revenue = 0;
      if (storeAddress !== 'Старший продавец') {
        const { data: storeData } = await supabase.from('stores').select('id').eq('address', storeAddress).single();
        if (storeData) {
          const { data: revenueData } = await supabase.from('daily_revenue').select('revenue').eq('store_id', storeData.id).eq('revenue_date', date).single();
          revenue = revenueData?.revenue || 0;
        }
      }
      const numSellers = storeEmployees.length;
      for (const employee of storeEmployees) {
        const isSenior = employee.employee_id.startsWith('SProd');
        const payDetails = calculateDailyPay(revenue, numSellers, isSenior);
        const calculation = {
          employee_id: employee.employee_id, 
          employee_name: employee.employee_name,
          store_address: storeAddress, 
          work_date: date, 
          revenue, 
          num_sellers: numSellers,
          is_senior: isSenior,
          base_rate: payDetails.baseRate, 
          bonus: payDetails.bonus,
          total_pay: payDetails.totalPay
        };
        await supabase.from('payroll_calculations').upsert(calculation, { onConflict: 'employee_id,work_date' });
        calculations.push(calculation);
      }
    }
    res.json({ 
      success: true, 
      calculations, 
      summary: { 
        date, 
        total_employees: calculations.length, 
        total_payroll: calculations.reduce((sum, c) => sum + c.total_pay, 0) 
      } 
    });
});

app.post('/get-monthly-data', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, reportEndDate } = req.body;
    if (!year || !month || !reportEndDate) {
        return res.status(400).json({ success: false, error: 'Не все параметры указаны' });
    }
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

    try {
        const { data: employees, error: empError } = await supabase
            .from('employees')
            .select('id, fullname');
        if (empError) throw empError;
        const employeeMap = new Map(employees.map(e => [e.id, e.fullname]));

        const { data: dailyData, error: dailyError } = await supabase
            .from('payroll_calculations')
            .select('*')
            .gte('work_date', startDate)
            .lte('work_date', reportEndDate);
        if (dailyError) throw dailyError;

        const enrichedDailyData = dailyData.map(calc => ({
            ...calc,
            employee_name: employeeMap.get(calc.employee_id) || 'Неизвестный сотрудник'
        }));

        const { data: adjustments, error: adjError } = await supabase
            .from('monthly_adjustments')
            .select('*')
            .eq('year', year)
            .eq('month', month);
        if (adjError) throw adjError;

        res.json({ success: true, dailyData: enrichedDailyData, adjustments });

    } catch (error) {
        console.error('Ошибка получения данных за месяц:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/payroll/adjustments', checkAuth, canManagePayroll, async (req, res) => {
    const { employee_id, month, year, manual_bonus, penalty, shortage, bonus_reason, penalty_reason } = req.body;
    try {
        await supabase.from('monthly_adjustments').upsert({ 
            employee_id, month, year, manual_bonus, penalty, shortage, bonus_reason, penalty_reason
        }, { onConflict: 'employee_id,month,year' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- ЭНДПОИНТЫ ДЛЯ РАСЧЕТА АВАНСА И ЗАРПЛАТЫ ---

app.post('/calculate-advance', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, advanceEndDate } = req.body;
    if (!year || !month || !advanceEndDate) {
        return res.status(400).json({ success: false, error: 'Не указана дата для расчета аванса' });
    }
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

    try {
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

        const results = {};
        for (const [employeeId, totalEarned] of Object.entries(earnedInPeriod)) {
            const potentialAdvance = totalEarned * ADVANCE_PERCENTAGE;
            const finalAdvance = Math.min(potentialAdvance, MAX_ADVANCE_AMOUNT);
            results[employeeId] = {
                advance_payment: Math.round(finalAdvance)
            };
        }

        res.json({ success: true, results });

    } catch (error) {
        console.error('Ошибка расчета аванса:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/calculate-final-payroll', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, reportEndDate, advanceFinalDate } = req.body;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

    try {
        // --- Шаг 1: Рассчитываем аванс (как и раньше) ---
        const { data: calculationsInAdvancePeriod, error: advError } = await supabase
            .from('payroll_calculations')
            .select('employee_id, total_pay')
            .gte('work_date', startDate)
            .lte('work_date', advanceFinalDate);
        if (advError) throw advError;
        
        const earnedInAdvancePeriod = calculationsInAdvancePeriod.reduce((acc, calc) => {
            acc[calc.employee_id] = (acc[calc.employee_id] || 0) + calc.total_pay;
            return acc;
        }, {});

        const advancePayments = {};
        for (const [employeeId, totalEarned] of Object.entries(earnedInAdvancePeriod)) {
            const potentialAdvance = totalEarned * ADVANCE_PERCENTAGE;
            advancePayments[employeeId] = Math.round(Math.min(potentialAdvance, MAX_ADVANCE_AMOUNT));
        }

        // --- Шаг 2: Получаем все начисления за полный месяц ---
        const { data: allCalculations, error: totalError } = await supabase
            .from('payroll_calculations')
            .select('employee_id, total_pay')
            .gte('work_date', startDate)
            .lte('work_date', reportEndDate);
        if (totalError) throw totalError;

        const totalBasePayMap = allCalculations.reduce((acc, calc) => {
            acc[calc.employee_id] = (acc[calc.employee_id] || 0) + calc.total_pay;
            return acc;
        }, {});

        // --- Шаг 3: Получаем корректировки ---
        const { data: adjustments, error: adjError } = await supabase
            .from('monthly_adjustments')
            .select('*')
            .eq('year', year)
            .eq('month', month);
        if (adjError) throw adjError;
        const adjustmentsMap = new Map(adjustments.map(adj => [adj.employee_id, adj]));

        // --- Шаг 4: Собираем итоговый результат по СТАРОЙ логике ---
        const finalResults = {};
        for (const employeeId in totalBasePayMap) {
            const basePay = totalBasePayMap[employeeId];
            const adj = adjustmentsMap.get(employeeId) || { manual_bonus: 0, penalty: 0, shortage: 0 };
            
            const totalGross = basePay + adj.manual_bonus;
            const advancePayment = advancePayments[employeeId] || 0;
            
            // Используем фиксированную выплату на карту для этого отчета
            const cardRemainder = FIXED_CARD_PAYMENT_FOR_REPORT - advancePayment;
            const cashPayout = totalGross - FIXED_CARD_PAYMENT_FOR_REPORT - adj.penalty - adj.shortage;

            finalResults[employeeId] = {
                total_gross: totalGross,
                advance_payment: advancePayment,
                card_remainder: cardRemainder,
                cash_payout: cashPayout
            };
        }

        res.json({ success: true, results: finalResults });

    } catch (error) {
        console.error('Ошибка окончательного расчета:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- ЭНДПОИНТ ДЛЯ ОТЧЕТА ФОТ (с НОВОЙ логикой) ---
app.post('/get-fot-report', checkAuth, canManageFot, async (req, res) => {
    const { year, month, reportEndDate } = req.body;
    if (!year || !month || !reportEndDate) {
        return res.status(400).json({ success: false, error: 'Не все параметры указаны' });
    }
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

    try {
        // 1. Получаем имена всех сотрудников
        const { data: employees, error: empError } = await supabase.from('employees').select('id, fullname');
        if (empError) throw empError;
        const employeeMap = new Map(employees.map(e => [e.id, e.fullname]));

        // 2. Получаем все начисления за период
        const { data: allCalculations, error: totalError } = await supabase
            .from('payroll_calculations')
            .select('employee_id, total_pay')
            .gte('work_date', startDate)
            .lte('work_date', reportEndDate);
        if (totalError) throw totalError;

        const totalBasePayMap = allCalculations.reduce((acc, calc) => {
            acc[calc.employee_id] = (acc[calc.employee_id] || 0) + calc.total_pay;
            return acc;
        }, {});

        // 3. Получаем корректировки
        const { data: adjustments, error: adjError } = await supabase
            .from('monthly_adjustments')
            .select('*')
            .eq('year', year)
            .eq('month', month);
        if (adjError) throw adjError;
        const adjustmentsMap = new Map(adjustments.map(adj => [adj.employee_id, adj]));
        
        // 4. Получаем всю выручку за период
        const { data: revenues, error: revError } = await supabase
            .from('daily_revenue')
            .select('revenue')
            .gte('revenue_date', startDate)
            .lte('revenue_date', reportEndDate);
        if (revError) throw revError;
        const totalRevenue = revenues.reduce((sum, item) => sum + item.revenue, 0);

        // 5. Собираем отчет по НОВОЙ, гибкой логике
        const reportData = [];
        for (const employeeId of Object.keys(totalBasePayMap)) {
            const basePay = totalBasePayMap[employeeId];
            const adj = adjustmentsMap.get(employeeId) || { manual_bonus: 0, penalty: 0, shortage: 0 };
            
            // Определяем фактическую выплату на карту
            const actualCardPayment = Math.min(basePay, MAX_CARD_PAYMENT);
            
            // Налог считается от фактической выплаты на карту
            const taxAmount = actualCardPayment * COMPANY_TAX_RATE;
            const cardPaymentWithTax = actualCardPayment + taxAmount;

            // Наличные = (Остаток от заработка) + Премии - Штрафы
            const cashPayout = (basePay - actualCardPayment) + adj.manual_bonus - adj.penalty - adj.shortage;
            
            const fot = cardPaymentWithTax + cashPayout;
            const totalPayoutToEmployee = actualCardPayment + cashPayout;

            reportData.push({
                employee_id: employeeId,
                employee_name: employeeMap.get(employeeId) || 'Неизвестный',
                card_payment_with_tax: cardPaymentWithTax,
                cash_payout: cashPayout,
                total_payout_to_employee: totalPayoutToEmployee,
                tax_amount: taxAmount,
                fot: fot
            });
        }
        
        const totalFot = reportData.reduce((sum, item) => sum + item.fot, 0);
        const fotPercentage = totalRevenue > 0 ? (totalFot / totalRevenue) * 100 : 0;

        res.json({
            success: true,
            reportData: reportData.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
            summary: {
                total_revenue: totalRevenue,
                total_fot: totalFot,
                fot_percentage: fotPercentage
            }
        });

    } catch (error) {
        console.error('Ошибка формирования отчета ФОТ:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
