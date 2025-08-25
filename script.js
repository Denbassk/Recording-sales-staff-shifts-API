document.addEventListener("DOMContentLoaded", async () => {
  const loginForm = document.getElementById("loginForm");
  const message = document.getElementById("message");
  const usernameInput = document.getElementById("username");
  const usernameHint = document.getElementById("username-hint");
  const clearButton = document.getElementById("clearButton");
  
  let allNames = [];
  let deviceKey = null;

  // --- Загружаем ключ устройства ---
  try {
    const res = await fetch("/device.json");
    if (res.ok) {
      const data = await res.json();
      deviceKey = data.device_key;
    }
  } catch (err) {
    console.warn("Файл device.json не найден.");
  }

  // --- Загружаем и сохраняем список сотрудников ---
  try {
    const res = await fetch("/employees");
    allNames = await res.json();
  } catch (err) {
    console.error("Ошибка загрузки сотрудников:", err);
    // В офлайн-режиме можно попробовать загрузить из кеша, если он есть
  }

  // --- НОВАЯ ЛОГИКА ОФЛАЙН-РЕЖИМА ---

  /**
   * Пытается отправить на сервер все смены, сохранённые локально.
   */
  async function syncOfflineShifts() {
    const offlineShifts = JSON.parse(localStorage.getItem('offlineShifts') || '[]');
    if (offlineShifts.length === 0) {
      return; // Нет сохранённых смен
    }

    console.log(`Найдено ${offlineShifts.length} смен для синхронизации.`);
    message.textContent = `Синхронизация ${offlineShifts.length} сохранённых смен...`;
    message.style.color = "orange";

    const failedShifts = [];
    for (const shift of offlineShifts) {
      try {
        const res = await fetch("/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(shift) // Отправляем сохранённые данные
        });
        const data = await res.json();
        if (!data.success) {
          failedShifts.push(shift); // Если сервер отклонил, сохраняем обратно
        }
      } catch (err) {
        failedShifts.push(shift); // Если нет сети, сохраняем обратно
        console.error("Ошибка синхронизации, интернет всё ещё недоступен.", err);
        message.textContent = "Ошибка синхронизации. Попробуем позже.";
        message.style.color = "red";
        localStorage.setItem('offlineShifts', JSON.stringify(failedShifts));
        return; // Прерываем, если нет сети
      }
    }
    
    // Обновляем хранилище только теми сменами, которые не удалось отправить
    localStorage.setItem('offlineShifts', JSON.stringify(failedShifts));
    if (failedShifts.length === 0) {
      message.textContent = "Все офлайн-смены успешно синхронизированы!";
      message.style.color = "green";
    }
  }
  
  // --- КОНЕЦ НОВОЙ ЛОГИКИ ---


  // При загрузке страницы сразу пытаемся синхронизировать старые смены
  syncOfflineShifts();

  const normalizeString = (str) => {
    return str.toLowerCase().replace(/і/g, 'и').replace(/ї/g, 'и').replace(/є/g, 'е').replace(/ґ/g, 'г');
  };

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
    }
  });

  clearButton.addEventListener("click", () => {
    loginForm.reset();
    usernameHint.value = "";
    message.textContent = "";
  });

  // --- ОБНОВЛЁННАЯ ОБРАБОТКА АВТОРИЗАЦИИ ---
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = document.getElementById("password").value.trim();
    const shiftData = { username, password, deviceKey };

    try {
      // Пытаемся отправить на сервер
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shiftData)
      });

      const data = await res.json();

      if (data.success) {
        message.style.color = "green";
        message.textContent = `${data.message} Магазин: ${data.store}`;
        loginForm.reset();
        usernameHint.value = "";
        // После успешной отправки пытаемся синхронизировать старые смены, если они есть
        syncOfflineShifts();
      } else {
        message.style.color = "red";
        message.textContent = data.message;
      }
    } catch (err) {
      // ЛОВИМ ОШИБКУ, ЕСЛИ НЕТ ИНТЕРНЕТА
      console.error("Ошибка отправки, сохраняем локально:", err);
      
      // Сохраняем смену в локальное хранилище
      const offlineShifts = JSON.parse(localStorage.getItem('offlineShifts') || '[]');
      offlineShifts.push(shiftData);
      localStorage.setItem('offlineShifts', JSON.stringify(offlineShifts));

      message.style.color = "orange";
      message.textContent = "Нет интернета. Смена сохранена локально.";
      loginForm.reset();
      usernameHint.value = "";
    }
  });
});