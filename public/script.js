document.addEventListener("DOMContentLoaded", async () => {
  const API_BASE_URL = "https://shifts-api.fly.dev";
  
  const loginForm = document.getElementById("loginForm");
  const message = document.getElementById("message");
  const usernameInput = document.getElementById("username");
  const usernameHint = document.getElementById("username-hint");
  const clearButton = document.getElementById("clearButton");
  
  let allNames = [];
  let deviceKey = null;

  async function checkServerConnection() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_BASE_URL}/employees`, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res.ok;
    } catch (err) {
      console.error("Сервер недоступен:", err);
      return false;
    }
  }

  try {
    const res = await fetch("device.json");
    if (res.ok) {
      const data = await res.json();
      deviceKey = data.device_key;
    }
  } catch (err) {
    console.warn("Файл device.json не найден");
  }

  try {
    const res = await fetch(`${API_BASE_URL}/employees`);
    if (res.ok) {
      allNames = await res.json();
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.error("Ошибка загрузки сотрудников:", err);
    message.textContent = "Нет подключения к серверу. Работа в офлайн режиме.";
    message.style.color = "orange";
  }

  async function syncOfflineShifts() {
    const offlineShifts = JSON.parse(localStorage.getItem('offlineShifts') || '[]');
    if (offlineShifts.length === 0) return;

    const isOnline = await checkServerConnection();
    if (!isOnline) return;

    message.textContent = `Синхронизация ${offlineShifts.length} сохранённых смен...`;
    message.style.color = "orange";

    const failedShifts = [];
    let successCount = 0;

    for (const shift of offlineShifts) {
      try {
        const res = await fetch(`${API_BASE_URL}/login`, {
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
        failedShifts.push(shift);
      }
    }
    
    localStorage.setItem('offlineShifts', JSON.stringify(failedShifts));
    
    if (successCount > 0 && failedShifts.length === 0) {
      message.textContent = `✓ Синхронизировано смен: ${successCount}`;
      message.style.color = "green";
      setTimeout(() => { message.textContent = ""; }, 3000);
    } else if (successCount > 0 && failedShifts.length > 0) {
      message.textContent = `Синхронизировано: ${successCount}, осталось: ${failedShifts.length}`;
      message.style.color = "orange";
    } else if (failedShifts.length > 0) {
      message.textContent = "Не удалось синхронизировать смены. Попробуем позже.";
      message.style.color = "orange";
    }
  }
  
  const offlineShiftsCount = JSON.parse(localStorage.getItem('offlineShifts') || '[]').length;
  if (offlineShiftsCount > 0) {
    syncOfflineShifts();
  }

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

  clearButton.addEventListener("click", () => {
    loginForm.reset();
    usernameHint.value = "";
    message.textContent = "";
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    const password = document.getElementById("password").value.trim();
    const shiftData = { username, password, deviceKey };

    message.textContent = "Отправка данных...";
    message.style.color = "blue";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shiftData),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      // --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
      // Сначала получаем ответ, чтобы проверить статус
      const data = await res.json();

      if (!res.ok) {
        // Если сервер ответил ошибкой, используем сообщение от сервера
        throw new Error(data.message || `HTTP ${res.status}`);
      }

      if (data.success) {
        message.style.color = "green";
        message.textContent = `✓ ${data.message}`;
        
        // --- НОВАЯ ЛОГИКА ПЕРЕНАПРАВЛЕНИЯ ---
        if (data.role === 'admin' || data.role === 'accountant') {
          message.textContent += ". Перенаправление...";
          setTimeout(() => {
            window.location.href = '/payroll.html';
          }, 1000); // Небольшая задержка, чтобы успеть прочитать сообщение
        } else {
          loginForm.reset();
          usernameHint.value = "";
          setTimeout(() => syncOfflineShifts(), 1000);
        }

      } else {
        message.style.color = "red";
        message.textContent = data.message || "Ошибка авторизации";
      }
    } catch (err) {
      console.error("Ошибка при отправке:", err);
      
      const offlineShifts = JSON.parse(localStorage.getItem('offlineShifts') || '[]');
      shiftData.savedAt = new Date().toISOString();
      offlineShifts.push(shiftData);
      localStorage.setItem('offlineShifts', JSON.stringify(offlineShifts));
      
      message.style.color = "orange";
      message.textContent = `⚠ Нет подключения к серверу. Смена сохранена локально (${offlineShifts.length})`;
      
      loginForm.reset();
      usernameHint.value = "";
    }
  });

  window.addEventListener('online', () => {
    message.textContent = "Подключение восстановлено";
    message.style.color = "green";
    setTimeout(() => { 
      message.textContent = ""; 
      syncOfflineShifts();
    }, 2000);
  });

  window.addEventListener('offline', () => {
    message.textContent = "Нет подключения к интернету";
    message.style.color = "red";
  });
});