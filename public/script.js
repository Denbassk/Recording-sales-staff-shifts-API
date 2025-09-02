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
  
  // ВАЖНО: Очищаем старые куки при загрузке страницы входа
  document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.fly.dev";
  document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
  
  const loginForm = document.getElementById("loginForm");
  const message = document.getElementById("message");
  const usernameInput = document.getElementById("username");
  const usernameHint = document.getElementById("username-hint");
  const clearButton = document.getElementById("clearButton");
  const submitButton = loginForm.querySelector('button[type="submit"]');
  
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

  // Не пытаемся загрузить device.json через fetch, чтобы не создавать ошибку 404
  // deviceKey должен приходить через URL параметры или localStorage

  async function checkServerConnection() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // Увеличиваем таймаут до 15 секунд
      const res = await fetch(`${API_BASE_URL}/employees`, { 
        signal: controller.signal,
        credentials: 'include' // Важно для куки
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch (err) {
      console.warn("Проверка подключения:", err.message);
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
    
    // Предотвращаем повторные нажатия
    if (submitButton.disabled) return;
    
    const username = usernameInput.value.trim();
    const password = document.getElementById("password").value.trim();
    const shiftData = { username, password, deviceKey };

    // Блокируем кнопку и меняем текст
    submitButton.disabled = true;
    const originalButtonText = submitButton.textContent;
    submitButton.textContent = "Вход...";
    
    message.textContent = "Подключение к серверу...";
    message.style.color = "blue";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // Увеличиваем до 20 секунд для медленных соединений
      
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shiftData),
        signal: controller.signal,
        credentials: 'include' // Важно для куки
      });
      
      clearTimeout(timeoutId);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || `HTTP ${res.status}`);
      }

      if (data.success) {
        message.style.color = "green";
        message.textContent = `✓ ${data.message}`;
        
        // Восстанавливаем кнопку
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
        
        if (data.role === 'admin' || data.role === 'accountant') {
          message.textContent += ". Перенаправление...";
          setTimeout(() => {
            window.location.href = '/payroll.html';
          }, 1000);
        } else {
          // Для продавцов: очищаем форму через 5 секунд
          setTimeout(() => {
            loginForm.reset();
            usernameHint.value = "";
            message.textContent = "";
          }, 5000); // Уменьшаем до 5 секунд для удобства

          // Синхронизация в фоне
          setTimeout(() => syncOfflineShifts(), 1000);
        }

      } else {
        message.style.color = "red";
        message.textContent = data.message || "Ошибка авторизации";
        // Восстанавливаем кнопку при ошибке
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    } catch (err) {
      console.error("Ошибка при отправке:", err);
      
      // Восстанавливаем кнопку
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
      
      // Определяем тип ошибки и показываем соответствующее сообщение
      if (err.name === 'AbortError') {
        message.style.color = "red";
        message.textContent = "Сервер не отвечает. Проверьте интернет-соединение и попробуйте снова.";
      } else {
        // Сохраняем смену локально
        const offlineShifts = JSON.parse(localStorage.getItem('offlineShifts') || '[]');
        shiftData.savedAt = new Date().toISOString();
        offlineShifts.push(shiftData);
        localStorage.setItem('offlineShifts', JSON.stringify(offlineShifts));
        
        message.style.color = "orange";
        message.textContent = `⚠ Нет подключения к серверу. Смена сохранена локально (${offlineShifts.length})`;
        
        // Очищаем форму через 3 секунды
        setTimeout(() => {
          loginForm.reset();
          usernameHint.value = "";
        }, 3000);
      }
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