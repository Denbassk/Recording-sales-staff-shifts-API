// --- Подключение модулей и настройка ---
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// --- Подключение к Supabase ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
});

// 2. API для авторизации и фиксации смены (с логикой для старших продавцов)
app.post("/login", async (req, res) => {
  const { username, password, deviceKey } = req.body;
  let storeId = null;
  let storeAddress = null;

  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('id, fullname')
    .filter('fullname', 'ilike', username)
    .eq('password', password)
    .single();

  if (employeeError || !employee) {
    return res.status(401).json({ success: false, message: "Неверное имя или пароль" });
  }

  // --- НОВАЯ ЛОГИКА ОПРЕДЕЛЕНИЯ МАГАЗИНА ---
  let isSeniorSeller = employee.id.startsWith('SProd');

  // Обычный продавец: определяем магазин по устройству или привязке
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
    // Старший продавец: магазин не определён, но это нормально
    storeId = null; // Явно указываем, что магазина нет
    storeAddress = "Старший продавец"; // Текст для отображения
  }
  
  // Фиксируем смену (для старшего продавца store_id будет NULL)
  const { error: shiftError } = await supabase.from('shifts').insert({ employee_id: employee.id, store_id: storeId });
  if (shiftError) {
    console.error("Ошибка фиксации смены:", shiftError);
    return res.status(500).json({ success: false, message: "Ошибка на сервере при фиксации смены." });
  }

  return res.json({
    success: true,
    message: `Добро пожаловать, ${employee.fullname}!`,
    store: storeAddress // Отправляем адрес или статус "Старший продавец"
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
    // Для старшего продавца адрес будет null, заменяем его на понятный текст
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

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер запущен на http://localhost:${PORT}`));