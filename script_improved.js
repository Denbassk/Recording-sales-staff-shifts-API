// УЛУЧШЕННАЯ ВЕРСИЯ script.js с retry логикой и лучшей обработкой ошибок

document.addEventListener("DOMContentLoaded", async () => {
  const API_BASE_URL = "https://shifts-api.fly.dev";
  
  const loginForm = document.getElementById("loginForm");
  const message = document.getElementById("message");
  const usernameInput = document.getElementById("username");
  const usernameHint = document.getElementById("username-hint");
  const clearButton = document.getElementById("clearButton");
  
  let allNames = [];
  let deviceKey = null;
  let isProcessing = false; // Флаг для предотвращения двойных отправок

  // Функция для проверки подключения к серверу с retry
  async function checkServerConnection(retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const res = await fetch(`${API_BASE_URL}/employees`, {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        clearTimeout(timeoutId);
        
        if (res.ok) return true;
      } catch (err) {
        console.error(`Попытка ${i + 1} из ${retries} не удалась:`, err);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Ждем 1 сек перед повтором
        }
      }
    }
    return false;
  }

  // Загружаем ключ устройства
  async function loadDeviceKey() {
    // Сначала пробуем локально
    try {
      const res = await fetch("device.json", { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        deviceKey = data.device_key;
        console.log("Ключ устройства загружен локально:", deviceKey);
        return;
      }
    } catch (err) {
      console.warn("Локальный device.json не найден");
    }
    
    // Затем с сервера
    try {
      const res = await fetch(`${API_BASE_URL}/device.json`, { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        deviceKey = data.device_key;
        console.log("Ключ устройства загружен с сервера:", deviceKey);
      }
    } catch (err) {
      console.warn("device.json не найден на сервере");
    }
  }

  // Загружаем список сотрудников с retry
  async function loadEmployees(retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(`${API_BASE_URL}/employees`, {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (res.ok) {
          allNames = await res.json();
          console.log("Список сотрудников загружен:", allNames.length);
          return true;
        }
      } catch (err) {
        console.error(`Ошибка загрузки сотрудников (попытка ${i + 1}):`, err);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    message.textContent = "⚠ Не удалось загрузить список сотрудников. Работа в ограниченном режиме.";
    message.style.color = "orange";
    return false;
  }

  // Улучшенная синхронизация офлайн смен
  async function syncOfflineShifts() {
    const offlineShifts = JSON.parse(localStorage.getItem('offlineShifts') || '[]');
    if (offlineShifts.length === 0) return;

    const isOnline = await checkServerConnection(2);
    if (!isOnline) {
      console.log("Сервер недоступен, отложена синхронизация");
      return;
    }

    message.textContent = `Синхронизация ${offlineShifts.length} сохранённых смен...`;
    message.style.color = "orange";

    const failedShifts = [];
    let successCount = 0;

    for (const shift of offlineShifts) {
      // Пропускаем слишком старые записи (более 7 дней)
      const savedDate = new Date(shift.savedAt);
      const now = new Date();
      const daysDiff = (now - savedDate) / (1000 * 60 * 60 * 24);
      
      if (daysDiff > 7) {
        console.log(`Пропуск устаревшей записи от ${shift.savedAt}`);
        continue;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/login`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-Sync-Mode": "true" // Маркер для сервера, что это синхронизация
          },
          body: JSON.stringify(shift)
        });
        
        if (res.ok) {
          successCount++;
        } else {
          // Если смена уже существует, не считаем это ошибкой
          const data = await res.json();
          if (data.message && data.message.includes("уже была зафиксирована")) {
            successCount++;
          } else {
            failedShifts.push(shift);
          }
        }
      } catch (err) {
        console.error("Ошибка при синхронизации смены:", err);
        failedShifts.push(shift);
      }
    }
    
    localStorage.setItem('offlineShifts', JSON.stringify(failedShifts));
    
    if (successCount > 0) {
      message.textContent = `✓ Синхронизировано смен: ${successCount}`;
      message.style.color = "green";
    }
    if (failedShifts.length > 0) {
      console.log(`Не удалось синхронизировать ${failedShifts.length} смен`);
    }
    
    setTimeout(() => { message.textContent = ""; }, 3000);
  }

  // Инициализация
  await loadDeviceKey();
  await loadEmployees();
  
  // Синхронизация при загрузке
  const offlineCount = JSON.parse(localStorage.getItem('offlineShifts') || '[]').length;
  if (offlineCount > 0) {
    console.log(`Найдено ${offlineCount} офлайн смен`);
    setTimeout(() => syncOfflineShifts(), 2000); // Отложенная синхронизация
  }

  // Автодополнение (без изменений)
  const normalizeString = (str) => str.toLowerCase()
    .replace(/і/g, 'и')
    .replace(/ї/g, 'и')
    .replace(/є/g, 'е')
    .replace(/ґ/g, 'г');

  usernameInput.addEventListener("input", (e) => {
    const userInput = e.target.value;
    const normalizedInput = normalizeString(userInput);
    if (!normalizedInput) {
      usernameHint.value = "";
      return;
    }
    const match = allNames.find(name => 
      normalizeString(name).startsWith(normalizedInput)
    );
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

  // УЛУЧШЕННАЯ ОБРАБОТКА АВТОРИЗАЦИИ с retry логикой
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Предотвращаем двойную отправку
    if (isProcessing) {
      console.log("Уже обрабатывается предыдущий запрос");
      return;
    }
    
    isProcessing = true;
    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    
    const username = usernameInput.value.trim();
    const password = document.getElementById("password").value.trim();
    const shiftData = { 
      username, 
      password, 
      deviceKey,
      timestamp: new Date().toISOString()
    };

    message.textContent = "Отправка данных...";
    message.style.color = "blue";

    let retries = 3;
    let success = false;

    while (retries > 0 && !success) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 секунд таймаут
        
        const res = await fetch(`${API_BASE_URL}/login`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Cache-Control": "no-cache"
          },
          body: JSON.stringify(shiftData),
          signal: controller.signal,
          credentials: 'include' // Важно для cookies
        });
        
        clearTimeout(timeoutId);

        const data = await res.json();

        if (res.ok && data.success) {
          // Успешная авторизация
          if (data.token) {
            localStorage.setItem('jwt_token', data.token);
            localStorage.setItem('userRole', data.role);
          }
          
          message.style.color = "green";
          message.textContent = `✓ ${data.message}${data.store ? ` Магазин: ${data.store}` : ''}`;
          loginForm.reset();
          usernameHint.value = "";
          
          // Для админов показываем ссылку
          if (data.role === 'admin' || data.role === 'accountant') {
            setTimeout(() => {
              message.innerHTML = message.textContent + 
                '<br><a href="/payroll.html" style="color: blue;">Перейти к расчету зарплат →</a>';
            }, 500);
          }
          
          // Синхронизация после успешного входа
          setTimeout(() => syncOfflineShifts(), 2000);
          success = true;
          
        } else if (res.status === 401) {
          // Неверный логин/пароль
          message.style.color = "red";
          message.textContent = data.message || "Неверное имя или пароль";
          success = true; // Не повторяем при ошибке авторизации
          
        } else if (res.status === 404) {
          // Магазин не найден
          message.style.color = "red";
          message.textContent = data.message || "Магазин не найден";
          success = true; // Не повторяем
          
        } else {
          // Другие ошибки - пробуем повторить
          throw new Error(`HTTP ${res.status}: ${data.message || 'Ошибка сервера'}`);
        }
        
      } catch (err) {
        console.error(`Ошибка при отправке (попытка ${4 - retries}):`, err);
        retries--;
        
        if (retries > 0) {
          message.textContent = `Ошибка подключения. Повторная попытка... (${retries})`;
          message.style.color = "orange";
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          // Все попытки исчерпаны - сохраняем офлайн
          const offlineShifts = JSON.parse(localStorage.getItem('offlineShifts') || '[]');
          shiftData.savedAt = new Date().toISOString();
          offlineShifts.push(shiftData);
          localStorage.setItem('offlineShifts', JSON.stringify(offlineShifts));
          
          message.style.color = "orange";
          message.textContent = `⚠ Нет связи с сервером. Данные сохранены локально (${offlineShifts.length})`;
          
          loginForm.reset();
          usernameHint.value = "";
        }
      }
    }
    
    isProcessing = false;
    submitButton.disabled = false;
  });

  // Обработчики сетевых событий
  window.addEventListener('online', () => {
    console.log('Сеть восстановлена');
    message.textContent = "✓ Подключение восстановлено";
    message.style.color = "green";
    setTimeout(() => { 
      message.textContent = ""; 
      syncOfflineShifts();
    }, 2000);
  });

  window.addEventListener('offline', () => {
    console.log('Сеть потеряна');
    message.textContent = "✗ Нет подключения к сети";
    message.style.color = "red";
  });

  // Периодическая проверка и синхронизация (каждые 5 минут)
  setInterval(async () => {
    const offlineCount = JSON.parse(localStorage.getItem('offlineShifts') || '[]').length;
    if (offlineCount > 0) {
      console.log(`Автоматическая попытка синхронизации ${offlineCount} записей`);
      await syncOfflineShifts();
    }
  }, 5 * 60 * 1000);
});