// --- Подключение модулей и настройка ---
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require('cors');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// --- Подключение к Supabase ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// =================================================================
// --- СУЩЕСТВУЮЩИЕ API ЭНДПОИНТЫ (БЕЗ ИЗМЕНЕНИЙ) ---
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

// 2. API для авторизации и фиксации смены (с защитой от дубликатов)
app.post("/login", async (req, res) => {
  const { username, password, deviceKey } = req.body;
  let storeId = null;
  let storeAddress = null;

  // Шаг 1: Проверяем, существует ли такой сотрудник с таким паролем
  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('id, fullname')
    .filter('fullname', 'ilike', username)
    .eq('password', password)
    .single();

  if (employeeError || !employee) {
    return res.status(401).json({ success: false, message: "Неверное имя или пароль" });
  }

  // Шаг 2: Определяем магазин
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
  
  // Шаг 3: Проверяем, не была ли уже зафиксирована смена сегодня
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();
  
  const { data: existingShift, error: shiftCheckError } = await supabase
    .from('shifts')
    .select('id')
    .eq('employee_id', employee.id)
    .gte('started_at', startOfDay)
    .lte('started_at', endOfDay);
  
  if (shiftCheckError) {
    return res.status(500).json({ success: false, message: "Ошибка проверки смены в базе." });
  }

  // Шаг 4: Если смены сегодня ещё не было, создаём её
  if (existingShift.length === 0) {
    const today = new Date();
    const shiftDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    const { error: shiftInsertError } = await supabase.from('shifts').insert({ 
      employee_id: employee.id, 
      store_id: storeId,
      shift_date: shiftDate // Добавляем дату смены
    });
    if (shiftInsertError) {
      console.error("Ошибка фиксации смены:", shiftInsertError);
      return res.status(500).json({ success: false, message: "Ошибка на сервере при фиксации смены." });
    }
  }

  return res.json({
    success: true,
    message: `Добро пожаловать, ${employee.fullname}!`,
    store: storeAddress
  });
});

// 3. API для генерации отчёта по сменам
app.get("/report/shifts", async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "Параметр 'date' обязателен." });

  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  const { data, error } = await supabase
    .from('shifts')
    .select(`started_at, employee_id, employees ( fullname ), store_id, stores ( address )`)
    .gte('started_at', startOfDay)
    .lte('started_at', endOfDay);

  if (error) {
    console.error("Ошибка получения отчёта по сменам:", error);
    return res.status(500).json({ error: error.message });
  }

  if (!data || data.length === 0) {
    return res.status(404).send("За указанную дату смен не найдено.");
  }
  
  const headers = "employee_id;fullname;store_id;store_address;shift_date";
  const bom = "\uFEFF";
  
  const rows = data.map(s => {
    const shiftDate = new Date(s.started_at).toISOString().split('T')[0];
    const address = s.stores ? s.stores.address : 'Старший продавец (без привязки)';
    return `${s.employee_id};${s.employees.fullname};${s.store_id || 'N/A'};"${address}";${shiftDate}`;
  });
  const csvContent = `${headers}\n${rows.join("\n")}`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="shifts_report_${date}.csv"`);
  res.status(200).send(bom + csvContent);
});

// 4. Эндпоинт для "проверки здоровья"
app.get("/", (req, res) => {
  res.status(200).send("Server is healthy and running.");
});

// =================================================================
// --- НОВЫЕ API ЭНДПОИНТЫ ДЛЯ РАСЧЕТА ЗАРПЛАТ ---
// =================================================================

// 5. API для получения списка всех магазинов
app.get("/stores", async (req, res) => {
  const { data, error } = await supabase
    .from('stores')
    .select('id, address')
    .eq('active', true);
  
  if (error) {
    console.error("Ошибка получения магазинов:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// 6. API для загрузки выручки из CSV файла
app.post('/upload-revenue-file', upload.single('file'), async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Файл не загружен' });
    }
    
    const fileContent = req.file.buffer.toString('utf-8');
    
    // Парсим CSV (разделитель точка с запятой)
    const lines = fileContent.split('\n');
    const revenues = [];
    
    for (let i = 1; i < lines.length; i++) { // Пропускаем заголовок
      const line = lines[i].trim();
      if (!line) continue;
      
      const columns = line.split(';');
      // Структура: Торговая точка | Выторг | ...
      if (columns.length >= 2) {
        const storeAddress = columns[0].trim();
        const revenueStr = columns[1].replace(/\s/g, '').replace(',', '.');
        const revenue = parseFloat(revenueStr);
        
        if (storeAddress && !isNaN(revenue)) {
          revenues.push({ store_address: storeAddress, revenue });
        }
      }
    }
    
    // Сохраняем выручку в БД
    const matched = [];
    const unmatched = [];
    
    for (const item of revenues) {
      // Находим store_id по адресу
      const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('address', item.store_address)
        .single();
      
      if (store) {
        await supabase
          .from('daily_revenue')
          .upsert({
            store_id: store.id,
            revenue_date: date,
            revenue: item.revenue
          }, { onConflict: 'store_id,revenue_date' });
        matched.push(item.store_address);
      } else {
        unmatched.push(item.store_address);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Выручка загружена',
      revenues: revenues,
      matched: matched,
      unmatched: unmatched
    });
  } catch (error) {
    console.error('Ошибка загрузки выручки:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. API для расчета зарплат за день
app.post('/calculate-payroll', async (req, res) => {
  try {
    const { date } = req.body;
    
    // Получаем все смены за дату
    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;
    
    const { data: shifts } = await supabase
      .from('shifts')
      .select(`
        employee_id,
        employees (fullname),
        store_id,
        stores (address)
      `)
      .gte('started_at', startOfDay)
      .lte('started_at', endOfDay);
    
    // Группируем по магазинам
    const storeShifts = {};
    shifts.forEach(shift => {
      const address = shift.stores?.address || 'Старший продавец';
      if (!storeShifts[address]) {
        storeShifts[address] = [];
      }
      storeShifts[address].push({
        employee_id: shift.employee_id,
        employee_name: shift.employees.fullname,
        store_id: shift.store_id
      });
    });
    
    const calculations = [];
    
    for (const [storeAddress, storeEmployees] of Object.entries(storeShifts)) {
      let revenue = 0;
      
      // Получаем выручку магазина
      if (storeAddress !== 'Старший продавец') {
        const { data: storeData } = await supabase
          .from('stores')
          .select('id')
          .eq('address', storeAddress)
          .single();
          
        if (storeData) {
          const { data: revenueData } = await supabase
            .from('daily_revenue')
            .select('revenue')
            .eq('store_id', storeData.id)
            .eq('revenue_date', date)
            .single();
          
          revenue = revenueData?.revenue || 0;
        }
      }
      
      const numSellers = storeEmployees.length;
      
      // Рассчитываем зарплату для каждого сотрудника
      for (const employee of storeEmployees) {
        const isSenior = employee.employee_id.startsWith('SProd');
        const payDetails = calculateDailyPay(revenue, numSellers, isSenior);
        
        const calculation = {
          employee_id: employee.employee_id,
          employee_name: employee.employee_name,
          store_address: storeAddress,
          work_date: date,
          revenue: revenue,
          num_sellers: numSellers,
          is_senior: isSenior,
          base_rate: payDetails.baseRate,
          bonus: payDetails.bonus,
          total_pay: payDetails.totalPay
        };
        
        // Сохраняем в БД
        await supabase
          .from('payroll_calculations')
          .upsert(calculation, { onConflict: 'employee_id,work_date' });
        
        calculations.push(calculation);
      }
    }
    
    res.json({ 
      success: true, 
      calculations: calculations,
      summary: {
        date: date,
        total_employees: calculations.length,
        total_payroll: calculations.reduce((sum, c) => sum + c.total_pay, 0)
      }
    });
  } catch (error) {
    console.error('Ошибка расчета зарплат:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 8. API для получения накопительной зарплаты сотрудника за месяц
app.get('/payroll/employee/:id/month', async (req, res) => {
  try {
    const { id } = req.params;
    const { month, year } = req.query;
    
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    
    const { data: calculations } = await supabase
      .from('payroll_calculations')
      .select('*')
      .eq('employee_id', id)
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date');
    
    const totalGross = calculations.reduce((sum, c) => sum + c.total_pay, 0);
    const tax = totalGross * 0.23;
    const netPay = totalGross - tax;
    
    res.json({
      employee_id: id,
      month: `${month}/${year}`,
      days_worked: calculations.length,
      details: calculations,
      summary: {
        total_gross: totalGross.toFixed(2),
        tax_23: tax.toFixed(2),
        net_pay: netPay.toFixed(2)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =================================================================
// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
// =================================================================

// Функция расчета зарплаты (из вашего Google Script)
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
  return { 
    baseRate: baseRatePerPerson, 
    bonus: bonusPerPerson, 
    totalPay: baseRatePerPerson + bonusPerPerson 
  };
}

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер запущен на http://localhost:${PORT}`));