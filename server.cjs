// --- Подключение модулей и настройка ---
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// --- Подключение к Supabase ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Используем сервисный ключ
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// =================================================================
// --- API ЭНДПОИНТЫ ---
// =================================================================

// 1. API для получения списка сотрудников
app.get("/employees", async (req, res) => {
  const { data, error } = await supabase
    .from('employees')
    .select('fullname')
    .eq('active', true);

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

  // Шаг 1: Проверить сотрудника по имени и паролю (без учёта регистра имени)
  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('id, fullname')
    .filter('fullname', 'ilike', username) // ИСПРАВЛЕННЫЙ СИНТАКСИС
    .eq('password', password)
    .single();

  if (employeeError || !employee) {
    return res.status(401).json({ success: false, message: "Неверное имя или пароль" });
  }

  // Шаг 2: Определяем магазин
  if (deviceKey) {
    const { data: device } = await supabase.from('devices').select('store_id').eq('device_key', deviceKey).single();
    if (device) storeId = device.store_id;
  }

  if (!storeId) {
    const { data: storeLink } = await supabase.from('employee_store').select('store_id').eq('employee_id', employee.id).single();
    if (storeLink) storeId = storeLink.store_id;
  }

  if (!storeId) {
    return res.status(404).json({ success: false, message: "Не удалось определить магазин." });
  }

  // Шаг 3: Получить адрес магазина
  const { data: store, error: storeError } = await supabase.from('stores').select('address').eq('id', storeId).single();
  if (storeError || !store) return res.status(404).json({ success: false, message: "Магазин не найден" });
  
  // Шаг 4: Зафиксировать смену
  const { error: shiftError } = await supabase.from('shifts').insert({ employee_id: employee.id, store_id: storeId });
  if (shiftError) {
    console.error("Ошибка фиксации смены:", shiftError);
    return res.status(500).json({ success: false, message: "Ошибка на сервере при фиксации смены." });
  }

  return res.json({
    success: true,
    message: `Добро пожаловать, ${employee.fullname}!`,
    store: store.address
  });
});

// 3. API для генерации отчёта по сменам
app.get("/report/shifts", async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "Параметр 'date' обязателен." });

  const { data, error } = await supabase
    .from('shifts')
    .select(`shift_date, employee_id, employees(fullname), store_id, stores(address)`)
    .eq('shift_date', date);

  if (error) {
    console.error("Ошибка получения отчёта по сменам:", error);
    return res.status(500).json({ error: error.message });
  }

  if (!data || data.length === 0) {
    return res.status(404).send("За указанную дату смен не найдено.");
  }
  
  const headers = "employee_id;fullname;store_id;store_address;shift_date";
  const rows = data.map(s => `${s.employee_id};${s.employees.fullname};${s.store_id};"${s.stores.address}";${s.shift_date}`);
  const csvContent = `${headers}\n${rows.join("\n")}`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="shifts_report_${date}.csv"`);
  res.status(200).send(csvContent);
});

// 4. Эндпоинт для "проверки здоровья" (health check) от Fly.io
app.get("/", (req, res) => {
  res.status(200).send("Server is healthy and running.");
});

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер запущен на http://localhost:${PORT}`));