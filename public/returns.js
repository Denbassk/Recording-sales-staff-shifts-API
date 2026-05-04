// === Returns frontend ===
const API = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : '';  // относительный путь — тот же сервер

let user = null;
let store = null;
let cart = [];
let isSubmitting = false;
let pendingScan = null;  // для модалок

// === Инициализация ===
document.addEventListener('DOMContentLoaded', async () => {
  // Восстановим корзину из localStorage
  try {
    const saved = JSON.parse(localStorage.getItem('returnsCart') || '[]');
    if (Array.isArray(saved)) cart = saved;
  } catch (e) { cart = []; }

  await loadUserAndStore();
  setupEventListeners();
  renderCart();
  focusInput();
});

// === Загрузка контекста ===
async function loadUserAndStore() {
  try {
    const r = await fetch(`${API}/me-with-store`, { credentials: 'include' });
    const data = await r.json();

    if (!r.ok || !data.success) {
      showAuthError(data.error || 'Помилка авторизації');
      return;
    }

    user = data.employee;
    store = data.store;

    if (!store) {
      showAuthError('Для оформлення повернення потрібно бути на зміні в магазині. Адміністратори не можуть оформлювати повернення.');
      return;
    }

    document.getElementById('employeeName').textContent = user.fullname;
    document.getElementById('storeAddress').textContent = store.address;
    document.getElementById('mainArea').style.display = 'block';
  } catch (err) {
    console.error(err);
    showAuthError('Немає зв\'язку з сервером. Перевірте інтернет та спробуйте знову.');
  }
}

function showAuthError(msg) {
  const errorTextEl = document.getElementById('authErrorText');
  const errorBlockEl = document.getElementById('authError');
  const mainAreaEl = document.getElementById('mainArea');

  if (errorTextEl) errorTextEl.textContent = msg;
  if (errorBlockEl) errorBlockEl.style.display = 'block';
  if (mainAreaEl) mainAreaEl.style.display = 'none';

  // Если на странице нет специального блока ошибки — выведем alert
  if (!errorTextEl && !errorBlockEl) {
    alert(msg);
  }
}

// === Обработчики ===
function setupEventListeners() {
  const input = document.getElementById('barcodeInput');
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = input.value.trim();
      if (code) handleScan(code);
      input.value = '';
    }
  });

  // Возврат фокуса в поле — продавец сканирует один за другим
  input.addEventListener('blur', () => {
    setTimeout(() => {
      const modalOpen = document.querySelector('.modal[style*="flex"]') 
                     || document.querySelector('.modal[style="display: flex;"]');
      if (!modalOpen && document.activeElement.tagName !== 'INPUT') {
        focusInput();
      }
    }, 100);
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    if (cart.length === 0) return;
    if (!confirm('Очистити кошик?')) return;
    cart = [];
    saveCart();
    renderCart();
    focusInput();
  });

  document.getElementById('submitBtn').addEventListener('click', submitReturn);

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (cart.length > 0 && !confirm('У кошику є товари. Вийти без відправлення?')) return;
    await fetch(`${API}/logout`, { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  });

  // Модалка ручного ввода (жёлтая)
  document.getElementById('manualOkBtn').addEventListener('click', addManualItem);
  document.getElementById('manualCancelBtn').addEventListener('click', closeManualModal);

  // Модалка подтверждения (оранж/синяя)
  document.getElementById('confirmOkBtn').addEventListener('click', addConfirmedItem);
  document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirmModal);
  // Модалка количества (зелёный)
  document.getElementById('qtyOkBtn').addEventListener('click', addQtyItem);
  document.getElementById('qtyCancelBtn').addEventListener('click', closeQtyModal);
  document.getElementById('qtyMinusBtn').addEventListener('click', () => adjustQty(-1));
  document.getElementById('qtyPlusBtn').addEventListener('click', () => adjustQty(1));
  document.getElementById('qtyValue').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addQtyItem(); }
  });

// Поиск по названию (inline)
const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchDebounceTimer);
  const q = e.target.value;
  searchDebounceTimer = setTimeout(() => performSearch(q), 300);
});
// Очистка результатов при потере фокуса с пустым полем
searchInput.addEventListener('blur', () => {
  setTimeout(() => {
    if (!searchInput.value.trim()) {
      document.getElementById('searchResults').innerHTML = '';
    }
  }, 200);
});

  // Допомога
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpCloseBtn = document.getElementById('helpCloseBtn');
  if (helpBtn) helpBtn.addEventListener('click', () => {
    helpModal.style.display = 'flex';
  });
  if (helpCloseBtn) helpCloseBtn.addEventListener('click', () => {
    helpModal.style.display = 'none';
    focusInput();
  });
  // Закриття по кліку на фон
  if (helpModal) helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
      helpModal.style.display = 'none';
      focusInput();
    }
  });
}

function focusInput() {
  document.getElementById('barcodeInput').focus();
}

// === Скан штрих-кода ===
async function handleScan(barcode) {
  // Валидация формата
  if (!/^\d{6,14}$/.test(barcode)) {
    showFeedback({
      color: 'red',
      icon: '⚠️',
      title: 'Невірний штрих-код',
      meta: `"${barcode}" — очікується 6-14 цифр`
    });
    playSound('error');
    return;
  }

  showFeedback({ color: 'gray', icon: '⏳', title: 'Шукаємо...', meta: barcode });

  try {
    const url = `${API}/lookup?barcode=${encodeURIComponent(barcode)}&store_address=${encodeURIComponent(store.address)}`;
    const r = await fetch(url, { credentials: 'include' });
    const data = await r.json();

    if (!r.ok || !data.success) {
      showFeedback({
        color: 'red',
        icon: '⚠️',
        title: 'Помилка пошуку',
        meta: data.error || 'Невідома помилка'
      });
      playSound('error');
      return;
    }

    handleLookupResult(data);
  } catch (err) {
    console.error(err);
    showFeedback({
      color: 'red',
      icon: '⚠️',
      title: 'Немає зв\'язку',
      meta: 'Спробуйте ще раз'
    });
    playSound('error');
  }
}

// === Обработка результата поиска ===
function handleLookupResult(data) {
  const { color, barcode, product_name, cost, stock_in_store, stock_in_network, stores_count } = data;

  if (color === 'green') {
  pendingScan = {
    barcode, product_name,
    cost_price: cost,
    lookup_status: 'green',
    stock_at_scan: stock_in_store
  };
  openQtyModal({
    title: '✅ В наявності',
    productHtml: `<div><strong>${escapeHtml(product_name)}</strong></div>
                  <div>Залишок: ${stock_in_store} • Собівартість: ${cost.toFixed(2)} ₴</div>`,
    barcode
  });
  showFeedback({
    color: 'green', icon: '✅', title: product_name,
    meta: `Залишок: ${stock_in_store} • Собівартість: ${cost.toFixed(2)} ₴`
  });
  playSound('green');
  return;
}

  if (color === 'orange') {
    // Подтверждение: товар в сети, не у нас
    pendingScan = {
      barcode, product_name,
      cost_price: cost,
      lookup_status: 'orange',
      stock_at_scan: 0
    };
    document.getElementById('confirmTitle').textContent = '⚠️ Не на залишку магазину';
    document.getElementById('confirmText').textContent = 'Товар є у мережі, але не на залишку вашого магазину. Оформити «хвостом»?';
    document.getElementById('confirmProduct').innerHTML = 
      `<div><strong>${product_name}</strong></div>
       <div>Собівартість: ${cost.toFixed(2)} ₴</div>
       <div>В мережі: ${stock_in_network} шт у ${stores_count} магазинах</div>`;
    document.getElementById('confirmQty').value = 1;
    document.getElementById('confirmModal').style.display = 'flex';
    document.getElementById('confirmQty').focus();
    document.getElementById('confirmQty').select();

    showFeedback({
      color: 'orange',
      icon: '⚠️',
      title: product_name,
      meta: `Не на залишку — ${stock_in_network} шт у ${stores_count} магазинах мережі`
    });
    playSound('orange');
    return;
  }

  if (color === 'blue') {
    // Подтверждение: известный, но нигде нет на остатках
    pendingScan = {
      barcode, product_name,
      cost_price: cost,
      lookup_status: 'blue',
      stock_at_scan: 0
    };
    document.getElementById('confirmTitle').textContent = 'ℹ️ «Хвіст» з минулих залишків';
    document.getElementById('confirmText').textContent = 'Товар відомий системі, але зараз ніде немає на залишках.';
    document.getElementById('confirmProduct').innerHTML = 
      `<div><strong>${product_name}</strong></div>
       <div>Остання собівартість: ${(cost || 0).toFixed(2)} ₴</div>`;
    document.getElementById('confirmQty').value = 1;
    document.getElementById('confirmModal').style.display = 'flex';
    document.getElementById('confirmQty').focus();
    document.getElementById('confirmQty').select();

    showFeedback({
      color: 'blue',
      icon: 'ℹ️',
      title: product_name,
      meta: 'У базі є, на залишках — немає'
    });
    playSound('blue');
    return;
  }

  if (color === 'yellow') {
    // Открываем модалку ручного ввода
    pendingScan = { barcode, lookup_status: 'yellow' };
    document.getElementById('manualBarcode').textContent = barcode;
    document.getElementById('manualName').value = '';
    document.getElementById('manualCost').value = '';
    document.getElementById('manualQty').value = 1;
    document.getElementById('manualModal').style.display = 'flex';
    document.getElementById('manualName').focus();

    showFeedback({
      color: 'yellow',
      icon: '❓',
      title: 'Невідомий штрих-код',
      meta: barcode + ' — введіть дані вручну'
    });
    playSound('yellow');
    return;
  }
}

function addConfirmedItem() {
  if (!pendingScan) return;
  const qty = parseFloat(document.getElementById('confirmQty').value);
  if (!qty || qty <= 0) {
    alert('Введіть кількість більше 0');
    return;
  }
  addToCart({ ...pendingScan, quantity: qty });
  closeConfirmModal();
}

function closeConfirmModal() {
  document.getElementById('confirmModal').style.display = 'none';
  pendingScan = null;
  focusInput();
}

function addManualItem() {
  if (!pendingScan) return;
  const name = document.getElementById('manualName').value.trim();
  const costStr = document.getElementById('manualCost').value;
  const qty = parseFloat(document.getElementById('manualQty').value);

  if (!name) {
    alert('Введіть назву товару');
    document.getElementById('manualName').focus();
    return;
  }
  if (!qty || qty <= 0) {
    alert('Введіть кількість більше 0');
    document.getElementById('manualQty').focus();
    return;
  }

  addToCart({
    barcode: pendingScan.barcode,
    product_name: name,
    cost_price: costStr ? parseFloat(costStr) : 0,
    quantity: qty,
    lookup_status: 'yellow',
    stock_at_scan: 0
  });
  closeManualModal();
}

function closeManualModal() {
  document.getElementById('manualModal').style.display = 'none';
  pendingScan = null;
  focusInput();
}
// === Модалка количества (универсальная для green/orange/blue) ===
function openQtyModal({ title, productHtml, barcode }) {
  document.getElementById('qtyModalTitle').textContent = title;
  document.getElementById('qtyProduct').innerHTML = productHtml;
  
  const isWeight = isWeightBarcode(barcode);
  const qtyInput = document.getElementById('qtyValue');
  qtyInput.value = isWeight ? '0.100' : '1';
  qtyInput.step = isWeight ? '0.001' : '1';
  
  const hint = document.getElementById('qtyHint');
  hint.textContent = isWeight 
    ? '⚖️ Ваговий товар — введіть кілограми (напр. 0.350)' 
    : 'Натисніть + або − для зміни. Можна ввести вручну.';
  
  document.getElementById('qtyModal').style.display = 'flex';
  setTimeout(() => { qtyInput.focus(); qtyInput.select(); }, 50);
}

function closeQtyModal() {
  document.getElementById('qtyModal').style.display = 'none';
  pendingScan = null;
  focusInput();
}

function addQtyItem() {
  if (!pendingScan) return;
  const qty = parseFloat(document.getElementById('qtyValue').value);
  if (!qty || qty <= 0) {
    alert('Введіть кількість більше 0');
    return;
  }
  addToCart({ ...pendingScan, quantity: qty });
  closeQtyModal();
}

function isWeightBarcode(bc) {
  // Внутренние весовые EAN-13 в Украине обычно начинаются на "2" 
  // или содержат 13 цифр и начинаются на 20-29
  return typeof bc === 'string' && bc.length === 13 && bc.startsWith('2');
}

function adjustQty(delta) {
  const input = document.getElementById('qtyValue');
  const step = parseFloat(input.step) || 1;
  const current = parseFloat(input.value) || 0;
  const next = Math.max(step, current + delta);
  input.value = step < 1 ? next.toFixed(3) : Math.round(next).toString();
}

// === Поиск по названию ===
let searchDebounceTimer = null;



async function performSearch(query) {
  const resultsEl = document.getElementById('searchResults');
  if (query.trim().length < 3) {
    resultsEl.innerHTML = '<div class="search-empty">Введіть мінімум 3 символи</div>';
    return;
  }
  resultsEl.innerHTML = '<div class="search-loading">⏳ Шукаємо...</div>';
  try {
    const url = `${API}/search-product?q=${encodeURIComponent(query)}&store_address=${encodeURIComponent(store.address)}`;
    const r = await fetch(url, { credentials: 'include' });
    const data = await r.json();
    if (!r.ok || !data.success) {
      resultsEl.innerHTML = `<div class="search-empty">Помилка: ${escapeHtml(data.error || 'невідома')}</div>`;
      return;
    }
    if (data.results.length === 0) {
      resultsEl.innerHTML = '<div class="search-empty">Нічого не знайдено</div>';
      return;
    }
    resultsEl.innerHTML = data.results.map((item, idx) => `
      <div class="search-result-item" data-idx="${idx}">
        <div>
          <div class="search-result-name">
            <span class="search-result-color ${item.color}">${tagLabel(item.color)}</span>
            ${escapeHtml(item.product_name)}
          </div>
          <div class="search-result-meta">
            ${item.barcode}
            ${item.color === 'green' ? ` • Залишок: ${item.stock}` : ''}
            ${item.color === 'orange' ? ` • В мережі: ${item.stock} шт у ${item.stores_count} магазинах` : ''}
          </div>
        </div>
        <div class="search-result-price">${(item.cost || 0).toFixed(2)} ₴</div>
      </div>
    `).join('');
    // Привязываем клики
    resultsEl.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        const item = data.results[idx];
        selectSearchResult(item);
      });
    });
  } catch (err) {
    console.error(err);
    resultsEl.innerHTML = '<div class="search-empty">Помилка з\'єднання</div>';
  }
}

function selectSearchResult(item) {
  // Очищаем поле поиска и результаты
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
  // Эмулируем результат /lookup и прокидываем в обычный обработчик
  handleLookupResult({
    color: item.color,
    barcode: item.barcode,
    product_name: item.product_name,
    cost: item.cost,
    retail_price: item.retail_price,
    stock_in_store: item.color === 'green' ? item.stock : 0,
    stock_in_network: item.color === 'orange' ? item.stock : 0,
    stores_count: item.stores_count || 0
  });
}

// === Корзина ===
function addToCart(item) {
  cart.push({ ...item, _id: Date.now() + Math.random() });
  saveCart();
  renderCart();
}

function saveCart() {
  localStorage.setItem('returnsCart', JSON.stringify(cart));
}

function removeFromCart(id) {
  cart = cart.filter(x => x._id !== id);
  saveCart();
  renderCart();
}

function updateQty(id, qty) {
  const item = cart.find(x => x._id === id);
  if (!item) return;
  const n = parseFloat(qty);
  if (!n || n <= 0) return;
  item.quantity = n;
  saveCart();
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');
  const badge = document.getElementById('cartBadge');
  const count = document.getElementById('cartCount');

  badge.textContent = cart.length;
  count.textContent = `(${cart.length})`;

  if (cart.length === 0) {
    container.innerHTML = '<p class="empty">Кошик порожній. Скануйте перший товар.</p>';
    footer.style.display = 'none';
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div>
        <div class="cart-item-name">
          ${escapeHtml(item.product_name)}
          <span class="cart-item-tag ${item.lookup_status}">${tagLabel(item.lookup_status)}</span>
        </div>
        <div class="cart-item-meta">${item.barcode}</div>
      </div>
      <input type="number" class="cart-item-qty" value="${item.quantity}" 
             step="0.001" min="0.001" onchange="updateQty(${item._id}, this.value)">
      <div class="cart-item-cost">${(item.cost_price * item.quantity).toFixed(2)} ₴</div>
      <button class="cart-item-remove" onclick="removeFromCart(${item._id})" title="Видалити">✕</button>
    </div>
  `).join('');

  footer.style.display = 'flex';
  document.getElementById('totalCount').textContent = cart.length;
  const total = cart.reduce((s, x) => s + (x.cost_price * x.quantity), 0);
  document.getElementById('totalCost').textContent = total.toFixed(2);
  
  const notInBase = cart.filter(x => x.lookup_status === 'yellow').length;
  if (notInBase > 0) {
    document.getElementById('notInBaseInfo').style.display = 'block';
    document.getElementById('notInBaseCount').textContent = notInBase;
  } else {
    document.getElementById('notInBaseInfo').style.display = 'none';
  }
}

window.removeFromCart = removeFromCart;
window.updateQty = updateQty;

function tagLabel(status) {
  return { green: 'Залишок', orange: 'Не у нас', blue: 'Хвіст', yellow: 'Не з бази' }[status] || status;
}

// === Отправка ===
async function submitReturn() {
  if (isSubmitting) return;
  if (cart.length === 0) return;

  isSubmitting = true;
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Відправка...';

  const items = cart.map(x => ({
    barcode: x.barcode,
    product_name: x.product_name,
    quantity: x.quantity,
    cost_price: x.cost_price,
    lookup_status: x.lookup_status
  }));

  try {
    const r = await fetch(`${API}/returns`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
    const data = await r.json();

    if (!r.ok || !data.success) {
      throw new Error(data.error || 'Помилка відправки');
    }
    playSubmitted();
  toast(`✅ Повернення ${data.return_number} відправлено`);
  cart = [];
  saveCart();
  renderCart();
  document.getElementById('scanFeedback').innerHTML = '';  // ← очистить плашку
  focusInput();

  } catch (err) {
    console.error(err);
    playSound('error');
    toast('❌ ' + err.message, true);
  } finally {
    isSubmitting = false;
    btn.disabled = false;
    btn.textContent = 'Відправити повернення';
  }
}

// === Утилиты ===
function showFeedback({ color, icon, title, meta }) {
  const el = document.getElementById('scanFeedback');
  const cls = color === 'red' || color === 'gray' ? `plate plate-${color === 'red' ? 'yellow' : 'blue'}` 
                                                  : `plate plate-${color}`;
  el.innerHTML = `
    <div class="${cls}">
      <div class="plate-icon">${icon}</div>
      <div>
        <div class="plate-title">${escapeHtml(title)}</div>
        <div class="plate-meta">${escapeHtml(meta || '')}</div>
      </div>
    </div>
  `;
}

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// === Звуки (Web Audio API, без файлов) ===
let _audioCtx = null;
function _getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e) { return null; }
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playSound(type) {
  const ctx = _getAudioCtx();
  if (!ctx) return;

  const presets = {
    green:  { freq: 880, dur: 0.12, type: 'sine',     vol: 0.18 },
    orange: { freq: 660, dur: 0.18, type: 'sine',     vol: 0.18 },
    blue:   { freq: 660, dur: 0.18, type: 'sine',     vol: 0.18 },
    yellow: { freq: 330, dur: 0.30, type: 'square',   vol: 0.15 },
    error:  { freq: 200, dur: 0.40, type: 'sawtooth', vol: 0.18 }
  };
  const p = presets[type] || { freq: 440, dur: 0.15, type: 'sine', vol: 0.15 };

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = p.type;
    osc.frequency.value = p.freq;
    gain.gain.setValueAtTime(p.vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + p.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + p.dur);
  } catch(e) { console.warn('Sound error:', e); }
}

// Звук відправки повернення (дві ноти підряд)
function playSubmitted() {
  playSound('green');
  setTimeout(() => {
    const ctx = _getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1175;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.15);
  }, 130);
}
