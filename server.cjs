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

// --- КОНСТАНТЫ ДЛЯ РАСЧЕТОВ (перенесены на сервер для единства) ---
const FIXED_CARD_PAYMENT = 8600; // Фиксированная выплата на карту
const ADVANCE_PERCENTAGE = 0.9; // Процент аванса от фиксированной выплаты
const MAX_ADVANCE = FIXED_CARD_PAYMENT * ADVANCE_PERCENTAGE; // Максимальный аванс = 7740
const ADVANCE_PERIOD_DAYS = 15; // Дней в авансовом периоде
const ASSUMED_WORK_DAYS_IN_FIRST_HALF = 12; // Предполагаемое кол-во рабочих дней для расчета пропорции аванса

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
// --- ОСНОВНЫЕ API ЭНДПОИНТЫ ---
// =================================================================

// 1. Список сотрудников
app.get("/employees", async (req, res) => {
  const { data, error } = await supabase.from('employees').select('fullname').eq('active', true);
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data.map(e => e.fullname));
});

// 2. Авторизация
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

// 3. Выход
app.post('/logout', (req, res) => {
  res.cookie('token', '', { expires: new Date(0), httpOnly: true, secure: true, sameSite: 'strict' });
  res.status(200).json({ success: true, message: 'Выход выполнен успешно' });
});

// 4. НОВЫЙ ЭНДПОИНТ для проверки статуса аутентификации
app.get('/check-auth', checkAuth, (req, res) => {
  // Если мидлвэр checkAuth прошел, пользователь аутентифицирован.
  // req.user заполняется данными из токена.
  res.json({ success: true, user: req.user });
});


// =================================================================
// --- ЗАЩИЩЕННЫЕ API ЭНДПОИНТЫ ---
// =================================================================
const canManagePayroll = checkRole(['admin', 'accountant']);

// 5. Загрузка выручки
app.post('/upload-revenue-file', checkAuth, canManagePayroll, upload.single('file'), async (req, res) => {
    try {
        const { date } = req.body;
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

// 6. Расчет зарплаты за день
app.post('/calculate-payroll', checkAuth, canManagePayroll, async (req, res) => {
    const { date } = req.body;
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

// 7. Получение месячных корректировок
app.get('/payroll/adjustments/:year/:month', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month } = req.params;
    const { data, error } = await supabase.from('monthly_adjustments').select('*').eq('year', year).eq('month', month);
    if (error) {
        console.error("Ошибка получения корректировок:", error);
        return res.status(500).json({ success: false, error: error.message });
    };
    res.json(data);
});

// 8. Сохранение месячных корректировок
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

// 9. Расчет аванса (за первые 15 дней месяца)
app.post('/calculate-advance', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month } = req.body;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${ADVANCE_PERIOD_DAYS}`;

    try {
        const { data: shifts, error: shiftsError } = await supabase
            .from('shifts')
            .select('employee_id')
            .gte('shift_date', startDate)
            .lte('shift_date', endDate);

        if (shiftsError) throw shiftsError;

        const employeeShiftsCount = shifts.reduce((acc, shift) => {
            acc[shift.employee_id] = (acc[shift.employee_id] || 0) + 1;
            return acc;
        }, {});

        const results = {};
        for (const [employeeId, shiftsCount] of Object.entries(employeeShiftsCount)) {
            const advanceRatio = Math.min(shiftsCount / ASSUMED_WORK_DAYS_IN_FIRST_HALF, 1);
            const calculatedAdvance = Math.round(MAX_ADVANCE * advanceRatio);
            results[employeeId] = {
                advance_payment: calculatedAdvance
            };
        }

        res.json({ success: true, results });

    } catch (error) {
        console.error('Ошибка расчета аванса:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 10. Окончательный расчет за месяц
app.post('/calculate-final-payroll', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, reportEndDate } = req.body;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

    try {
        const { data: dailyCalculations, error: calcError } = await supabase
            .from('payroll_calculations')
            .select('employee_id, total_pay')
            .gte('work_date', startDate)
            .lte('work_date', reportEndDate);
        
        if (calcError) throw calcError;

        const { data: adjustments, error: adjError } = await supabase
            .from('monthly_adjustments')
            .select('*')
            .eq('year', year)
            .eq('month', month);

        if (adjError) throw adjError;
        const adjustmentsMap = new Map(adjustments.map(adj => [adj.employee_id, adj]));

        const advanceEndDate = `${year}-${String(month).padStart(2, '0')}-${ADVANCE_PERIOD_DAYS}`;
        const { data: shifts, error: shiftsError } = await supabase
            .from('shifts')
            .select('employee_id')
            .gte('shift_date', startDate)
            .lte('shift_date', advanceEndDate);

        if (shiftsError) throw shiftsError;
        const employeeShiftsCount = shifts.reduce((acc, shift) => {
            acc[shift.employee_id] = (acc[shift.employee_id] || 0) + 1;
            return acc;
        }, {});

        const totalBasePayMap = dailyCalculations.reduce((acc, calc) => {
            acc[calc.employee_id] = (acc[calc.employee_id] || 0) + calc.total_pay;
            return acc;
        }, {});

        const finalResults = {};
        for (const employeeId in totalBasePayMap) {
            const basePay = totalBasePayMap[employeeId];
            const adj = adjustmentsMap.get(employeeId) || { manual_bonus: 0, penalty: 0, shortage: 0 };
            
            const shiftsCount = employeeShiftsCount[employeeId] || 0;
            const advanceRatio = Math.min(shiftsCount / ASSUMED_WORK_DAYS_IN_FIRST_HALF, 1);
            const advancePayment = Math.round(MAX_ADVANCE * advanceRatio);
            
            const totalGross = basePay + adj.manual_bonus;
            const cardRemainder = FIXED_CARD_PAYMENT - advancePayment;
            const cashPayout = totalGross - FIXED_CARD_PAYMENT - adj.penalty - adj.shortage;

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


// =================================================================
// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
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

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер запущен на http://localhost:${PORT}`));
