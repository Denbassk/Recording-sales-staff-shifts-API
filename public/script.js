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
  // Динамическое определение базового URL
  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://shifts-api.fly.dev';
  
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
  let isSubmitting = false; // Флаг для предотвращения повторных отправок

  // Получаем device_key из URL параметров
  const urlParams = new URLSearchParams(window.location.search);
  const urlDeviceKey = urlParams.get('device');
  if (urlDeviceKey) {
    deviceKey = urlDeviceKey;
    localStorage.setItem('deviceKey', deviceKey);
  } else {
    deviceKey = localStorage.getItem('deviceKey');
  }

  // Функция для показа статуса с автоматическим скрытием
  function showMessage(text, color, duration = null) {
    message.textContent = text;
    message.style.color = color;
    message.style.display = 'block';
    
    // Добавляем визуальный индикатор успешной регистрации
    if (color === 'green') {
      message.style.backgroundColor = '#d4edda';
      message.style.border = '1px solid #c3e6cb';
      message.style.padding = '10px';
      message.style.borderRadius = '5px';
    } else if (color === 'red') {
      message.style.backgroundColor = '#f8d7da';
      message.style.border = '1px solid #f5c6cb';
      message.style.padding = '10px';
      message.style.borderRadius = '5px';
    } else {
      message.style.backgroundColor = 'transparent';
      message.style.border = 'none';
      message.style.padding = '0';
    }
    
    if (duration) {
      setTimeout(() => {
        message.style.display = 'none';
        message.style.backgroundColor = 'transparent';
        message.style.border = 'none';
        message.style.padding = '0';
      }, duration);
    }
  }

  // Улучшенная проверка подключения к серверу
  async function checkServerConnection() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const res = await fetch(`${API_BASE_URL}/employees`, { 
        signal: controller.signal,
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      clearTimeout(timeoutId);
      return res.ok;
    } catch (err) {
      console.warn("Проверка подключения:", err.message);
      return false;
    }
  }

  // Загрузка списка сотрудников с улучшенной обработкой ошибок
  async function loadEmployees() {
    try {
      const res = await fetch(`${API_BASE_URL}/employees`, {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (res.ok) {
        allNames = await res.json();
        return true;
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      console.error("Ошибка загрузки сотрудников:", err);
      showMessage("Внимание: список сотрудников не загружен. Проверьте интернет-соединение.", "orange");
      return false;
    }
  }

  // Загружаем список сотрудников при старте
  await loadEmployees();

  // Периодическая проверка соединения и попытка загрузить список сотрудников
  setInterval(async () => {
    if (allNames.length === 0) {
      const isOnline = await checkServerConnection();
      if (isOnline) {
        await loadEmployees();
      }
    }
  }, 30000); // Каждые 30 секунд

  // Синхронизация офлайн смен
  async function syncOfflineShifts() {
    const offlineShifts = JSON.parse(localStorage.getItem('offlineShifts') || '[]');
    if (offlineShifts.length === 0) return;

    const isOnline = await checkServerConnection();
    if (!isOnline) return;

    showMessage(`Синхронизация ${offlineShifts.length} сохранённых смен...`, "orange");

    const failedShifts = [];
    let successCount = 0;

    for (const shift of offlineShifts) {
      try {
        const res = await fetch(`${API_BASE_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(shift),
          credentials: 'include'
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
      showMessage(`✓ Синхронизировано смен: ${successCount}`, "green", 3000);
    } else if (successCount > 0 && failedShifts.length > 0) {
      showMessage(`Синхронизировано: ${successCount}, осталось: ${failedShifts.length}`, "orange");
    } else if (failedShifts.length > 0) {
      showMessage("Не удалось синхронизировать смены. Попробуем позже.", "orange");
    }
  }
  
  // Проверяем офлайн смены при загрузке
  const offlineShiftsCount = JSON.parse(localStorage.getItem('offlineShifts') || '[]').length;
  if (offlineShiftsCount > 0) {
    setTimeout(syncOfflineShifts, 2000); // Отложенный запуск для лучшего UX
  }

  // Автодополнение имени
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
    message.style.display = 'none';
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "Войти";
  });

  // Обработка отправки формы с улучшенной обработкой ошибок
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Предотвращаем повторные нажатия
    if (isSubmitting) return;
    isSubmitting = true;
    
    const username = usernameInput.value.trim();
    const password = document.getElementById("password").value.trim();
    
    if (!username || !password) {
      showMessage("Пожалуйста, заполните все поля", "red");
      isSubmitting = false;
      return;
    }
    
    const shiftData = { username, password, deviceKey };

    // Блокируем кнопку и меняем текст
    submitButton.disabled = true;
    const originalButtonText = submitButton.textContent;
    submitButton.textContent = "Подключение...";
    
    showMessage("Проверка данных...", "blue");

    try {
      // Создаем несколько попыток подключения для надежности
      let attempts = 0;
      const maxAttempts = 3;
      let lastError = null;
      let response = null;

      while (attempts < maxAttempts && !response) {
        attempts++;
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 секунд на попытку
          
          response = await fetch(`${API_BASE_URL}/login`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Cache-Control": "no-cache"
            },
            body: JSON.stringify(shiftData),
            signal: controller.signal,
            credentials: 'include'
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok && response.status >= 500) {
            // Серверная ошибка - пробуем еще раз
            response = null;
            lastError = new Error(`Сервер вернул ошибку ${response.status}`);
            if (attempts < maxAttempts) {
              showMessage(`Ошибка сервера. Попытка ${attempts + 1} из ${maxAttempts}...`, "orange");
              await new Promise(resolve => setTimeout(resolve, 2000)); // Ждем 2 секунды перед повтором
            }
          }
        } catch (err) {
          lastError = err;
          if (attempts < maxAttempts && err.name === 'AbortError') {
            showMessage(`Сервер не отвечает. Попытка ${attempts + 1} из ${maxAttempts}...`, "orange");
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      if (!response) {
        throw lastError || new Error('Не удалось подключиться к серверу');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Ошибка сервера: ${response.status}`);
      }

      if (data.success) {
        // Успешный вход
        showMessage(`✓ ${data.message}`, "green");
        
        // Для продавцов - показываем подтверждение и очищаем форму
        if (data.role === 'seller') {
          // Добавляем дополнительное визуальное подтверждение
          submitButton.style.backgroundColor = '#28a745';
          submitButton.textContent = "✓ Смена записана!";
          
          // Показываем детали
          if (data.store) {
            showMessage(`✓ ${data.message}\nМагазин: ${data.store}`, "green");
          }
          
          // Очищаем форму через 10 секунд (как требовалось)
          setTimeout(() => {
            loginForm.reset();
            usernameHint.value = "";
            message.style.display = 'none';
            submitButton.style.backgroundColor = '';
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
            isSubmitting = false;
          }, 10000);
          
          // Синхронизация офлайн смен в фоне
          setTimeout(syncOfflineShifts, 2000);
        } else if (data.role === 'admin' || data.role === 'accountant') {
          // Для админов и бухгалтеров - перенаправление
          showMessage(`✓ ${data.message} Перенаправление...`, "green");
          setTimeout(() => {
            window.location.href = '/payroll.html';
          }, 1000);
        }

      } else {
        throw new Error(data.message || "Ошибка авторизации");
      }
    } catch (err) {
      console.error("Ошибка при входе:", err);
      
      // Восстанавливаем кнопку
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
      isSubmitting = false;
      
      // Определяем тип ошибки
      if (err.message.includes('Неверное имя или пароль')) {
        showMessage("Неверное имя пользователя или пароль", "red");
      } else if (err.message.includes('Магазин не найден')) {
        showMessage("Ошибка: магазин не найден. Обратитесь к администратору.", "red");
      } else if (err.name === 'AbortError' || err.message.includes('Не удалось подключиться')) {
        // Сохраняем смену локально при проблемах с сетью
        const offlineShifts = JSON.parse(localStorage.getItem('offlineShifts') || '[]');
        shiftData.savedAt = new Date().toISOString();
        offlineShifts.push(shiftData);
        localStorage.setItem('offlineShifts', JSON.stringify(offlineShifts));
        
        showMessage(`⚠ Нет связи с сервером. Смена сохранена локально и будет отправлена позже.`, "orange");
        
        // Очищаем форму через 5 секунд
        setTimeout(() => {
          loginForm.reset();
          usernameHint.value = "";
          message.style.display = 'none';
        }, 5000);
      } else {
        showMessage(`Ошибка: ${err.message}`, "red");
      }
    }
  });

  // Обработчики событий сети
  window.addEventListener('online', () => {
    showMessage("Подключение к интернету восстановлено", "green", 3000);
    setTimeout(() => {
      syncOfflineShifts();
      if (allNames.length === 0) {
        loadEmployees();
      }
    }, 2000);
  });

  window.addEventListener('offline', () => {
    showMessage("Нет подключения к интернету. Смены будут сохранены локально.", "orange");
  });

  // Периодическая синхронизация офлайн смен
  setInterval(() => {
    const offlineCount = JSON.parse(localStorage.getItem('offlineShifts') || '[]').length;
    if (offlineCount > 0 && navigator.onLine) {
      syncOfflineShifts();
    }
  }, 60000); // Каждую минуту
});