// --- Подключение модулей и настройка ---
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require('cors');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx'); // <--- Для работы с Excel

// --- Подключение к Supabase ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// =================================================================
// --- СУЩЕСТВУЮЩИЕ API ЭНДПОИНТЫ ---
// =================================================================

// 1. API для получения списка сотрудников
app.get("/employees", async (req, res) => {
  const { data, error } = await supabase.from('employees').select('fullname').eq('active', true);
  if (error) {
    console.error("Ошибка получения сотрудников:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data.map(e => e.fullname));
});

// 2. API для авторизации и фиксации смены
app.post("/login", async (req, res) => {
  const { username, password, deviceKey } = req.body;
  let storeId = null;
  let storeAddress = null;

  const { data: employee, error: employeeError } = await supabase
    .from('employees').select('id, fullname').filter('fullname', 'ilike', username).eq('password', password).single();

  if (employeeError || !employee) {
    return res.status(401).json({ success: false, message: "Неверное имя или пароль" });
  }

  const isSeniorSeller = employee.id.startsWith('SProd');
  if (!isSeniorSeller) {
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
  } else {
    storeId = null;
    storeAddress = "Старший продавец";
  }
  
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

  const { data: existingShift, error: shiftCheckError } = await supabase
    .from('shifts').select('id').eq('employee_id', employee.id).gte('started_at', startOfDay).lte('started_at', endOfDay);
    
  if (shiftCheckError) {
    return res.status(500).json({ success: false, message: "Ошибка проверки смены в базе." });
  }

  if (existingShift.length === 0) {
    const shiftDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const { error: shiftInsertError } = await supabase.from('shifts').insert({ employee_id: employee.id, store_id: storeId, shift_date: shiftDate });
    if (shiftInsertError) {
      console.error("Ошибка фиксации смены:", shiftInsertError);
      return res.status(500).json({ success: false, message: "Ошибка на сервере при фиксации смены." });
    }
  }

  return res.json({ success: true, message: `Добро пожаловать, ${employee.fullname}!`, store: storeAddress });
});

// 3. Эндпоинт для "проверки здоровья"
app.get("/", (req, res) => {
  res.status(200).send("Server is healthy and running.");
});

// =================================================================
// --- НОВЫЕ API ЭНДПОИНТЫ ДЛЯ РАСЧЕТА ЗАРПЛАТ ---
// =================================================================

// 4. API для загрузки выручки из EXCEL (версия с диагностикой)
app.post('/upload-revenue-file', upload.single('file'), async (req, res) => {
  try {
    const { date } = req.body;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Файл не загружен' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    let headerRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.includes('Торговая точка') && row.includes('Выторг')) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      return res.status(400).json({ success: false, error: 'В файле не найдены обязательные столбцы "Торговая точка" и "Выторг".' });
    }

    const rawData = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex });

    // ======================= ДИАГНОСТИКА =======================
    console.log("--- ДАННЫЕ СРАЗУ ПОСЛЕ ЧТЕНИЯ ИЗ EXCEL ---");
    console.log(rawData);
    // =========================================================

    const revenues = rawData.map(row => ({
      store_address: row['Торговая точка'],
      revenue: row['Выторг']
    })).filter(item => 
      item.store_address && typeof item.revenue === 'number'
    );
    
    // Остальная часть кода без изменений...
    const matched = [];
    const unmatched = [];
    for (const item of revenues) {
      const { data: store } = await supabase.from('stores').select('id').eq('address', item.store_address.trim()).single();
      if (store) {
        await supabase.from('daily_revenue').upsert({ store_id: store.id, revenue_date: date, revenue: item.revenue }, { onConflict: 'store_id,revenue_date' });
        matched.push(item.store_address);
      } else {
        unmatched.push(item.store_address);
      }
    }
    
    res.json({ success: true, message: 'Выручка успешно загружена', revenues, matched, unmatched });

  } catch (error) {
    console.error('Ошибка загрузки выручки из Excel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. API для расчета зарплат за день
app.post('/calculate-payroll', async (req, res) => {
  try {
    const { date } = req.body;
    const { data: shifts } = await supabase.from('shifts').select(`employee_id, employees (fullname), store_id, stores (address)`).eq('shift_date', date);
    
    if (!shifts) {
        return res.json({ success: true, calculations: [], summary: {} });
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
          employee_id: employee.employee_id, employee_name: employee.employee_name,
          store_address: storeAddress, work_date: date, revenue, num_sellers: numSellers,
          is_senior: isSenior, base_rate: payDetails.baseRate, bonus: payDetails.bonus,
          total_pay: payDetails.totalPay
        };
        await supabase.from('payroll_calculations').upsert(calculation, { onConflict: 'employee_id,work_date' });
        calculations.push(calculation);
      }
    }
    
    res.json({ 
      success: true, calculations,
      summary: { date, total_employees: calculations.length, total_payroll: calculations.reduce((sum, c) => sum + c.total_pay, 0) }
    });
  } catch (error) {
    console.error('Ошибка расчета зарплат:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================================================================
// --- ЭНДПОИНТЫ ДЛЯ МЕСЯЧНЫХ КОРРЕКТИРОВОК ---
// =================================================================

// 6. API для получения месячных корректировок
app.get('/payroll/adjustments/:year/:month', async (req, res) => {
  const { year, month } = req.params;
  try {
    const { data, error } = await supabase.from('monthly_adjustments').select('*').eq('year', year).eq('month', month);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. API для сохранения месячных корректировок
app.post('/payroll/adjustments', async (req, res) => {
  const { employee_id, month, year, manual_bonus, penalty, paid_cash, paid_card } = req.body;
  try {
    await supabase.from('monthly_adjustments').upsert({ employee_id, month, year, manual_bonus, penalty, paid_cash, paid_card }, { onConflict: 'employee_id,month,year' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =================================================================
// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
// =================================================================

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

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер запущен на http://localhost:${PORT}`));