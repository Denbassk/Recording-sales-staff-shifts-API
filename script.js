document.addEventListener("DOMContentLoaded", async () => {
  const loginForm = document.getElementById("loginForm");
  const message = document.getElementById("message");
  const usernameInput = document.getElementById("username");
  const usernameHint = document.getElementById("username-hint");
  const clearButton = document.getElementById("clearButton"); // Находим новую кнопку
  
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
  }

  // --- Логика автодополнения ---
  const normalizeString = (str) => {
    return str
      .toLowerCase()
      .replace(/і/g, 'и')
      .replace(/ї/g, 'и')
      .replace(/є/g, 'е')
      .replace(/ґ/g, 'г');
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

  // --- НОВАЯ ЛОГИКА ДЛЯ КНОПКИ ОЧИСТКИ ---
  clearButton.addEventListener("click", () => {
    loginForm.reset();
    usernameHint.value = "";
    message.textContent = "";
  });

  // --- Обработка авторизации ---
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = document.getElementById("password").value.trim();
    try {
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, deviceKey })
      });
      const data = await res.json();
      if (data.success) {
        message.style.color = "green";
        message.textContent = `${data.message} Магазин: ${data.store}`;
        loginForm.reset();
        usernameHint.value = "";
      } else {
        message.style.color = "red";
        message.textContent = data.message;
      }
    } catch (err) {
      console.error("Ошибка авторизации:", err);
      message.style.color = "red";
      message.textContent = "Ошибка сервера";
    }
  });
});