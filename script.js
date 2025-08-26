document.addEventListener("DOMContentLoaded", async () => {
  // ВАЖНО: Замените на ваш реальный URL приложения на Fly.io
  const API_BASE_URL = "https://shifts-api.fly.dev"; // <-- ЗАМЕНИТЕ НА ВАШ URL
  
  const loginForm = document.getElementById("loginForm");
  const message = document.getElementById("message");
  const usernameInput = document.getElementById("username");
  const usernameHint = document.getElementById("username-hint");
  const clearButton = document.getElementById("clearButton");
  
  let allNames = [];
  let deviceKey = null;

  // Функция для проверки подключения к серверу
  async function checkServerConnection() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд таймаут
      
      const res = await fetch(`${API_BASE_URL}/employees`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      return res.ok;
    } catch (err) {
      console.error("Сервер недоступен:", err);
      return false;
    }
  }

  // --- ЭТАП 1: Загружаем ключ устройства ---
  try {
    // Пробуем загрузить локальный файл device.json
    const res = await fetch("device.json");
    if (res.ok) {
      const data = await res.json();
      deviceKey = data.device_key;
      console.log("Ключ устройства загружен:", deviceKey);
    }
  } catch (err) {
    console.warn("Файл device.json не найден локально");
    // Если локально не найден, можно попробовать загрузить с сервера
    try {
      const res = await fetch(`${API_BASE_URL}/device.json`);
      if (res.ok) {
        const data = await res.json();
        deviceKey = data.device_key;
        console.log("Ключ устройства загружен с сервера:", deviceKey);
      }
    } catch (err2) {
      console.warn("Файл device.json не найден на сервере");
    }
  }

  // --- Загружаем список сотрудников ---
  try {
    const res = await fetch(`${API_BASE_URL}/employees`);
    if (res.ok) {
      allNames = await res.json();
      console.log("Список сотрудников загружен:", allNames.length);
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.error("Ошибка загрузки сотрудников:", err);
    message.textContent = "Нет подключения к серверу. Работа в офлайн режиме.";
    message.style.color = "orange";
  }

  // --- Логика офлайн-режима (исправленная) ---
  async function syncOfflineShifts() {
    const offlineShifts = JSON.parse(localStorage.getItem('offlineShifts') || '[]');
    if (offlineShifts.length === 0) return;

    // Сначала проверяем подключение к серверу
    const isOnline = await checkServerConnection();
    if (!isOnline) {
      console.log("Сервер недоступен, пропускаем синхронизацию");
      return;
    }

    message.textContent = `Синхронизация ${offlineShifts.length} сохранённых смен...`;
    message.style.color = "orange";

    const failedShifts = [];
    let successCount = 0;

    for (const shift of offlineShifts) {
      try {
        const res = await fetch(`${API_BASE_URL}/login`, {  // Используем полный URL
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(shift)
        });
        
        if (res.ok) {
          successCount++;
        } else {
          failedShifts.push(shift);
        }
      } catch (err) {
        console.error("Ошибка при синхронизации смены:", err);
        failedShifts.push(shift);
      }
    }
    
    // Сохраняем только неудачные попытки
    localStorage.setItem('offlineShifts', JSON.stringify(failedShifts));
    
    if (successCount > 0 && failedShifts.length === 0) {
      message.textContent = `✓ Синхронизировано смен: ${successCount}`;
      message.style.color = "green";
      setTimeout(() => { message.textContent = ""; }, 3000);
    } else if (successCount > 0 && failedShifts.length > 0) {
      message.textContent = `Синхронизировано: ${successCount}, осталось: ${failedShifts.length}`;
      message.style.color = "orange";
      setTimeout(() => { message.textContent = ""; }, 3000);
    } else if (failedShifts.length > 0) {
      message.textContent = "Не удалось синхронизировать смены. Попробуем позже.";
      message.style.color = "orange";
      setTimeout(() => { message.textContent = ""; }, 3000);
    }
  }
  
  // Запускаем синхронизацию только если есть что синхронизировать
  const offlineShiftsCount = JSON.parse(localStorage.getItem('offlineShifts') || '[]').length;
  if (offlineShiftsCount > 0) {
    console.log(`Найдено ${offlineShiftsCount} офлайн смен для синхронизации`);
    syncOfflineShifts();
  }

  // --- Автодополнение ---
  const normalizeString = (str) => str.toLowerCase().replace(/і/g, 'и').replace(/ї/g, 'и').replace(/є/g, 'е').replace(/ґ/g, 'г');

  usernameInput.addEventListener("input", (e) => {
    const userInput = e.target.value;
    const normalizedInput = normalizeString(userInput);
    if (!normalizedInput) {
      usernameHint.value = "";
      return;
    }
    const match = allNames.find(name => normalizeString(name).startsWith(normalizedInput));
    if (match) {
      usernameHint.value = userInput + match.substring(userInput.length);
    } else {
      usernameHint.value = "";
    }
  });

  usernameInput.addEventListener("keydown", (e) => {
    if ((e.key === "Tab" || e.key === "ArrowRight") && usernameHint.value) {
      e.preventDefault();
      usernameInput.value = usernameHint.value;
      usernameHint.value = "";
    }
  });

  // --- Кнопка очистки ---
  clearButton.addEventListener("click", () => {
    loginForm.reset();
    usernameHint.value = "";
    message.textContent = "";
  });

  // --- ОБРАБОТКА АВТОРИЗАЦИИ ---
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    const password = document.getElementById("password").value.trim();
    const shiftData = { username, password, deviceKey };

    message.textContent = "Отправка данных...";
    message.style.color = "blue";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 секунд таймаут
      
      const res = await fetch(`${API_BASE_URL}/login`, {  // Используем полный URL
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shiftData),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.success) {
        // Сохраняем токен и роль в localStorage
        if (data.token) {
          localStorage.setItem('authToken', data.token);
          localStorage.setItem('userRole', data.role);
        }
        
        message.style.color = "green";
        message.textContent = `✓ ${data.message}${data.store ? ` Магазин: ${data.store}` : ''}`;
        loginForm.reset();
        usernameHint.value = "";
        
        // Показываем ссылку на страницу зарплат только для админа и бухгалтера
        if (data.role === 'admin' || data.role === 'accountant') {
          setTimeout(() => {
            message.innerHTML = message.textContent + '<br><a href="/payroll.html" style="color: blue;">Перейти к расчету зарплат →</a>';
          }, 500);
        }
        
        // После успешной авторизации пробуем синхронизировать офлайн смены
        setTimeout(() => syncOfflineShifts(), 1000);
      } else {
        message.style.color = "red";
        message.textContent = data.message || "Ошибка авторизации";
      }
    } catch (err) {
      console.error("Ошибка при отправке:", err);
      
      // Сохраняем в офлайн режиме
      const offlineShifts = JSON.parse(localStorage.getItem('offlineShifts') || '[]');
      
      // Добавляем временную метку для отслеживания
      shiftData.savedAt = new Date().toISOString();
      offlineShifts.push(shiftData);
      
      localStorage.setItem('offlineShifts', JSON.stringify(offlineShifts));
      
      message.style.color = "orange";
      message.textContent = `⚠ Нет подключения к серверу. Смена сохранена локально (${offlineShifts.length})`;
      
      loginForm.reset();
      usernameHint.value = "";
    }
  });

  // --- Дополнительная проверка при загрузке страницы ---
  window.addEventListener('online', () => {
    console.log('Интернет подключен');
    message.textContent = "Подключение восстановлено";
    message.style.color = "green";
    setTimeout(() => { 
      message.textContent = ""; 
      syncOfflineShifts();
    }, 2000);
  });

  window.addEventListener('offline', () => {
    console.log('Интернет отключен');
    message.textContent = "Нет подключения к интернету";
    message.style.color = "red";
  });
});