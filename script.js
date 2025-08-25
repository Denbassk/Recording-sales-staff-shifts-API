document.addEventListener("DOMContentLoaded", async () => {
  const loginForm = document.getElementById("loginForm");
  const message = document.getElementById("message");
  const usernameInput = document.getElementById("username");
  const usernameHint = document.getElementById("username-hint");
  const clearButton = document.getElementById("clearButton");
  
  let allNames = [];
  let deviceKey = null;

  // --- ЭТАП 1: Загружаем ключ устройства ---
  try {
    const res = await fetch("/device.json");
    if (res.ok) {
      const data = await res.json();
      deviceKey = data.device_key;
      console.log("Ключ устройства загружен:", deviceKey);
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
  }

  // --- Логика офлайн-режима ---
  async function syncOfflineShifts() {
    const offlineShifts = JSON.parse(localStorage.getItem('offlineShifts') || '[]');
    if (offlineShifts.length === 0) return;

    message.textContent = `Синхронизация ${offlineShifts.length} сохранённых смен...`;
    message.style.color = "orange";

    const failedShifts = [];
    for (const shift of offlineShifts) {
      try {
        const res = await fetch("/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(shift)
        });
        if (!res.ok) failedShifts.push(shift);
      } catch (err) {
        failedShifts.push(shift);
        message.textContent = "Ошибка синхронизации. Попробуем позже.";
        localStorage.setItem('offlineShifts', JSON.stringify(failedShifts));
        return;
      }
    }
    
    localStorage.setItem('offlineShifts', JSON.stringify(failedShifts));
    if (failedShifts.length === 0) {
      message.textContent = "Все офлайн-смены успешно синхронизированы!";
      setTimeout(() => { message.textContent = ""; }, 3000);
    }
  }
  
  syncOfflineShifts();

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
    }
  });

  clearButton.addEventListener("click", () => {
    loginForm.reset();
    usernameHint.value = "";
    message.textContent = "";
  });

  // --- ЭТАП 2: ОБНОВЛЁННАЯ ОБРАБОТКА АВТОРИЗАЦИИ ---
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = document.getElementById("password").value.trim();
    // Включаем deviceKey в отправляемые данные
    const shiftData = { username, password, deviceKey }; 

    try {
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
        syncOfflineShifts();
      } else {
        message.style.color = "red";
        message.textContent = data.message;
      }
    } catch (err) {
      // Логика сохранения в офлайн
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