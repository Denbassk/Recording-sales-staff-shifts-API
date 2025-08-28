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

// --- КОНСТАНТЫ ДЛЯ РАСЧЕТОВ ---
const FIXED_CARD_PAYMENT = 8600;
const ADVANCE_PERCENTAGE = 0.9;
const MAX_ADVANCE = FIXED_CARD_PAYMENT * ADVANCE_PERCENTAGE;
const ADVANCE_PERIOD_DAYS = 15;
const ASSUMED_WORK_DAYS_IN_FIRST_HALF = 12;

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

app.get("/employees", async (req, res) => { /* ... без изменений ... */ });
app.post("/login", async (req, res) => { /* ... без изменений ... */ });
app.post('/logout', (req, res) => { /* ... без изменений ... */ });
app.get('/check-auth', checkAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

// =================================================================
// --- ЗАЩИЩЕННЫЕ API ЭНДПОИНТЫ ---
// =================================================================
const canManagePayroll = checkRole(['admin', 'accountant']);

app.post('/upload-revenue-file', checkAuth, canManagePayroll, upload.single('file'), async (req, res) => { /* ... без изменений ... */ });

app.post('/calculate-payroll', checkAuth, canManagePayroll, async (req, res) => {
    const { date } = req.body;
    if (!date) {
        return res.status(400).json({ success: false, error: 'Дата не указана' });
    }
    // ... остальная логика без изменений
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

// *** ИЗМЕНЕНИЕ: Новый эндпоинт для получения данных для месячного отчета ***
app.post('/get-monthly-data', checkAuth, canManagePayroll, async (req, res) => {
    const { year, month, reportEndDate } = req.body;
    if (!year || !month || !reportEndDate) {
        return res.status(400).json({ success: false, error: 'Не все параметры указаны' });
    }
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

    try {
        // Запрос 1: Получаем все дневные расчеты за период
        const { data: dailyData, error: dailyError } = await supabase
            .from('payroll_calculations')
            .select('*, employees(fullname)') // Добавляем fullname сотрудника
            .gte('work_date', startDate)
            .lte('work_date', reportEndDate);

        if (dailyError) throw dailyError;

        // Запрос 2: Получаем все корректировки за месяц
        const { data: adjustments, error: adjError } = await supabase
            .from('monthly_adjustments')
            .select('*')
            .eq('year', year)
            .eq('month', month);

        if (adjError) throw adjError;

        res.json({ success: true, dailyData, adjustments });

    } catch (error) {
        console.error('Ошибка получения данных за месяц:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


app.post('/payroll/adjustments', checkAuth, canManagePayroll, async (req, res) => { /* ... без изменений ... */ });
app.post('/calculate-advance', checkAuth, canManagePayroll, async (req, res) => { /* ... без изменений ... */ });
app.post('/calculate-final-payroll', checkAuth, canManagePayroll, async (req, res) => { /* ... без изменений ... */ });

// =================================================================
// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
// =================================================================
function calculateDailyPay(revenue, numSellers, isSenior = false) { /* ... без изменений ... */ }

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер запущен на http://localhost:${PORT}`));
