// Проверка браузера на совместимость
(function checkBrowserCompatibility() {
  const isIE = window.navigator.userAgent.indexOf("MSIE") > 0 || 
               window.navigator.userAgent.indexOf("Trident") > 0;
  
  if (isIE) {
    document.body.innerHTML = `
      <div style="text-align:center; padding:50px; font-family:Arial;">
        <h1 style="color:red;">⚠️ Браузер не поддерживается</h1>
        <p style="font-size:18px;">Internet Explorer не поддерживает это приложение.</p>
        <p style="font-size:16px;">Пожалуйста, используйте:</p>
        <ul style="list-style:none; font-size:16px;">
          <li>✅ Google Chrome (рекомендуется)</li>
          <li>✅ Microsoft Edge</li>
          <li>✅ Mozilla Firefox</li>
        </ul>
        <p style="margin-top:30px;">
          <a href="https://shifts-api.fly.dev" style="color:blue;">Откройте https://shifts-api.fly.dev в современном браузере</a>
        </p>
      </div>
    `;
    return;
  }
})();

document.addEventListener("DOMContentLoaded", async () => {
  const API_BASE_URL = "https://shifts-api.fly.dev";
  
  const loginForm = document.getElementById("loginForm");
  const message = document.getElementById("message");
  const usernameInput = document.getElementById("username");
  const usernameHint = document.getElementById("username-hint");
  const clearButton = document.getElementById("clearButton");
  
  let allNames = [];
  let deviceKey = null;

  // Получаем device_key из URL параметров
  const urlParams = new URLSearchParams(window.location.search);
  const urlDeviceKey = urlParams.get('device');
  if (urlDeviceKey) {
    deviceKey = urlDeviceKey;
    // Сохраняем в localStorage для последующего использования
    localStorage.setItem('deviceKey', deviceKey);
  } else {
    // Пробуем получить из localStorage
    deviceKey = localStorage.getItem('deviceKey');
  }

  // Если все еще нет deviceKey, пробуем загрузить device.json (для обратной совместимости)
  if (!deviceKey) {
    try {
      const res = await fetch("device.json");
      if (res.ok) {
        const data = await res.json();
        deviceKey = data.device_key;
        localStorage.setItem('deviceKey', deviceKey);
      }
    } catch (err) {
      console.warn("Файл device.json не найден");
    }
  }

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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || `HTTP ${res.status}`);
      }

      if (data.success) {
        message.style.color = "green";
        message.textContent = `✓ ${data.message}`;
        
        if (data.role === 'admin' || data.role === 'accountant') {
          message.textContent += ". Перенаправление...";
          setTimeout(() => {
            window.location.href = '/payroll.html';
          }, 1000);
        } else {
          // --- ИЗМЕНЕНИЕ ЗДЕСЬ ---
          // Надпись об успехе уже отображена, теперь мы ждем 10 секунд
          setTimeout(() => {
            // Этот код выполнится через 10 секунд
            loginForm.reset();
            usernameHint.value = "";
            message.textContent = ""; // Также очищаем само сообщение
          }, 10000); // 10000 миллисекунд = 10 секунд

          // Синхронизацию можно запустить в фоне, как и раньше
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