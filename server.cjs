// --- Подключение модулей и настройка ---
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
require('dotenv').config(); [cite: 79]
const { createClient } = require('@supabase/supabase-js'); [cite: 80]

// --- Подключение к Supabase ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey); [cite: 81]

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// =================================================================
// --- API ЭНДПОИНТЫ ---
// =================================================================

// 1. API для получения списка сотрудников
app.get("/employees", async (req, res) => {
  const { data, error } = await supabase.from('employees').select('fullname').eq('active', true);
  if (error) {
    console.error("Ошибка получения сотрудников:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json(data.map(e => e.fullname));
}); [cite: 82]

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
  const isSeniorSeller = employee.id.startsWith('SProd'); [cite: 84]
  if (!isSeniorSeller) {
    if (deviceKey) {
      const { data: device } = await supabase.from('devices').select('store_id').eq('device_key', deviceKey).single();
      if (device) storeId = device.store_id;
    }
    if (!storeId) {
      const { data: storeLink } = await supabase.from('employee_store').select('store_id').eq('employee_id', employee.id).single();
      if (storeLink) storeId = storeLink.store_id; [cite: 85]
    }
    if (!storeId) {
      return res.status(404).json({ success: false, message: "Для этого сотрудника не удалось определить магазин." }); [cite: 86]
    }
    const { data: store, error: storeError } = await supabase.from('stores').select('address').eq('id', storeId).single();
    if (storeError || !store) return res.status(404).json({ success: false, message: "Магазин не найден" }); [cite: 87]
    storeAddress = store.address;
  } else {
    storeId = null; [cite: 88]
    storeAddress = "Старший продавец"; [cite: 89]
  }
  
  // --- НОВЫЙ ШАГ 3: Проверяем, не была ли уже зафиксирована смена сегодня ---
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
    const { error: shiftInsertError } = await supabase.from('shifts').insert({ employee_id: employee.id, store_id: storeId });
    if (shiftInsertError) {
      console.error("Ошибка фиксации смены:", shiftInsertError);
      return res.status(500).json({ success: false, message: "Ошибка на сервере при фиксации смены." }); [cite: 92]
    }
  }
  // Если смена уже есть, мы просто пропускаем этот шаг и сразу отдаём успешный ответ.

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
    return res.status(500).json({ error: error.message }); [cite: 95]
  }

  if (!data || data.length === 0) {
    return res.status(404).send("За указанную дату смен не найдено.");
  }
  
  const headers = "employee_id;fullname;store_id;store_address;shift_date";
  const bom = "\uFEFF";
  
  const rows = data.map(s => {
    const shiftDate = new Date(s.started_at).toISOString().split('T')[0];
    const address = s.stores ? s.stores.address : 'Старший продавец (без привязки)'; [cite: 96]
    return `${s.employee_id};${s.employees.fullname};${s.store_id || 'N/A'};"${address}";${shiftDate}`;
  });
  const csvContent = `${headers}\n${rows.join("\n")}`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="shifts_report_${date}.csv"`); [cite: 97]
  res.status(200).send(bom + csvContent);
});

// 4. Эндпоинт для "проверки здоровья"
app.get("/", (req, res) => {
  res.status(200).send("Server is healthy and running.");
});

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер запущен на http://localhost:${PORT}`)); [cite: 98]