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

// 2. Авторизация (ОБНОВЛЕНА ДЛЯ СТАРШИХ ПРОДАВЦОВ)
app.post("/login", async (req, res) => {
  const { username, password, deviceKey } = req.body;
  
  const { data: employee, error } = await supabase.from('employees').select('id, fullname, role').eq('fullname', username.trim()).eq('password', password).single();

  if (error || !employee) {
    return res.status(401).json({ success: false, message: "Неверное имя или пароль" });
  }

  let storeId = null;
  let storeAddress = null;
  let responseMessage = '';
  const isSeniorSeller = employee.id.startsWith('SProd'); // <-- Определяем старшего продавца

  if (employee.role === 'seller') {
    // ---- ИЗМЕНЕНИЕ ЗДЕСЬ ----
    if (isSeniorSeller) {
        storeAddress = "Старший продавец";
        // storeId остается null
    } else { // Логика для обычных продавцов
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

// =================================================================
// --- ЗАЩИЩЕННЫЕ API ЭНДПОИНТЫ ---
// =================================================================
const canManagePayroll = checkRole(['admin', 'accountant']);

// 4. Загрузка выручки
app.post('/upload-revenue-file', checkAuth, canManagePayroll, upload.single('file'), async (req, res) => {
    // ... ваш полный код без изменений ...
});

// 5. Расчет зарплаты за день (ОБНОВЛЕН ДЛЯ СТАРШИХ ПРОДАВЦОВ)
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
        // ---- ИЗМЕНЕНИЕ ЗДЕСЬ ----
        const isSenior = employee.employee_id.startsWith('SProd');
        const payDetails = calculateDailyPay(revenue, numSellers, isSenior);
        const calculation = {
          employee_id: employee.employee_id, employee_name: employee.employee_name,
          store_address: storeAddress, work_date: date, revenue, num_sellers: numSellers,
          is_senior: isSenior, // <-- Добавляем флаг в ответ
          base_rate: payDetails.baseRate, bonus: payDetails.bonus,
          total_pay: payDetails.totalPay
        };
        await supabase.from('payroll_calculations').upsert(calculation, { onConflict: 'employee_id,work_date' });
        calculations.push(calculation);
      }
    }
    res.json({ success: true, calculations, summary: { date, total_employees: calculations.length, total_payroll: calculations.reduce((sum, c) => sum + c.total_pay, 0) } });
});

// 6. Получение месячных корректировок
app.get('/payroll/adjustments/:year/:month', checkAuth, canManagePayroll, async (req, res) => {
    // ... ваш полный код без изменений ...
});

// 7. Сохранение месячных корректировок
app.post('/payroll/adjustments', checkAuth, canManagePayroll, async (req, res) => {
    // ... ваш полный код без изменений ...
});

// =================================================================
// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
// =================================================================

// ОБНОВЛЕНА ДЛЯ СТАРШИХ ПРОДАВЦОВ
function calculateDailyPay(revenue, numSellers, isSenior = false) {
  // ---- ИЗМЕНЕНИЕ ЗДЕСЬ ----
  // Если это старший продавец, возвращаем фиксированную ставку и выходим
  if (isSenior) {
    return { baseRate: 1300, bonus: 0, totalPay: 1300 };
  }

  // Остальная логика для обычных продавцов без изменений
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