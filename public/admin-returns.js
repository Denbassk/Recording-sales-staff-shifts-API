let currentReturns = [];
let stores = [];

async function init() {
  // Перевірка авторизації
  const me = await fetch('/me-with-store', {credentials:'include'}).then(r=>r.json()).catch(()=>null);
  if (!me || !me.success) {
    document.getElementById('auth-error').style.display = 'flex';
    return;
  }
  if (!['admin','accountant','curator'].includes(me.employee.role)) {
    document.getElementById('auth-error').style.display = 'flex';
    return;
  }
  document.getElementById('user-name').textContent = me.employee.fullname + ' (' + me.employee.role + ')';
  document.getElementById('main').style.display = 'block';

  // Початкові дати: останні 30 днів
  const today = new Date().toISOString().slice(0,10);
  const monthAgo = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
  document.getElementById('filter-from').value = monthAgo;
  document.getElementById('filter-to').value = today;

  // Обробники
  document.getElementById('apply-filters').addEventListener('click', loadAll);
  document.getElementById('refresh-btn').addEventListener('click', loadAll);
  document.getElementById('export-btn').addEventListener('click', exportXlsx);
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  await loadAll();
  setInterval(loadAll, 30000); // автооновлення
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + name));
}

async function loadAll() {
  await Promise.all([loadReturns(), loadSummary('supplier'), loadSummary('sku'), loadSummary('store')]);
}

function buildQuery() {
  const p = new URLSearchParams();
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const store = document.getElementById('filter-store').value;
  const archived = document.getElementById('filter-archived').value;
  const lookup = document.getElementById('filter-lookup').value;
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  if (store) p.set('store_id', store);
  if (archived !== '') p.set('archived', archived);
  if (lookup) p.set('lookup_status', lookup);
  return p.toString();
}

async function loadReturns() {
  const r = await fetch('/returns?' + buildQuery(), {credentials:'include'}).then(r=>r.json());
  if (!r.success) return toast('Помилка: ' + r.error, 'error');
  currentReturns = r.returns;

  // Статистика
  const totalItems = currentReturns.reduce((s,ret)=>s + ret.return_items.length, 0);
  const totalSum = currentReturns.reduce((s,ret)=>s + parseFloat(ret.total_cost||0), 0);
  document.getElementById('stat-count').textContent = currentReturns.length;
  document.getElementById('stat-items').textContent = totalItems;
  document.getElementById('stat-total').textContent = totalSum.toFixed(2) + ' ₴';

  // Список
  const list = document.getElementById('returns-list');
  list.innerHTML = currentReturns.map(ret => `
    <div class="return-card">
      <div class="return-header" onclick="toggleItems(${ret.id})">
        <div>
          <span class="return-number">${ret.return_number}</span>
          ${ret.archived_at ? '<span class="badge badge-archived">Архів</span>' : ''}
        </div>
        <div class="return-meta">
          <span>${ret.store_address}</span>
          <span>${new Date(ret.created_at).toLocaleString('uk-UA')}</span>
          <span>Позицій: ${ret.items_count}</span>
          <span><b>${parseFloat(ret.total_cost||0).toFixed(2)} ₴</b></span>
        </div>
        <div class="return-actions" onclick="event.stopPropagation()">
          ${!ret.archived_at ? `<button class="btn-archive" onclick="archiveReturn(${ret.id})">В архів</button>` : ''}
        </div>
      </div>
      <div class="return-items" id="items-${ret.id}">
        ${ret.return_items.map(it => `
          <div class="return-item">
            <span class="barcode">${it.barcode}</span>
            <span>${it.product_name}</span>
            <span>${parseFloat(it.quantity).toFixed(2)}</span>
            <span>${parseFloat(it.cost_price||0).toFixed(2)} ₴</span>
            <span class="badge badge-${it.lookup_status||'gray'}">${it.lookup_status||'?'}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('') || '<p style="text-align:center;color:#9ca3af;padding:40px;">Немає повернень за обраний період</p>';

  // Вкладка «Не з бази»
  const mismatch = [];
  for (const ret of currentReturns) {
    for (const it of ret.return_items) {
      if (it.lookup_status === 'yellow') {
        mismatch.push({date: ret.created_at, store: ret.store_address, ...it});
      }
    }
  }
  document.getElementById('mismatch-tbody').innerHTML = mismatch.map(m => `
    <tr>
      <td>${new Date(m.date).toLocaleDateString('uk-UA')}</td>
      <td>${m.store}</td>
      <td><code>${m.barcode}</code></td>
      <td>${m.product_name}</td>
      <td>${parseFloat(m.quantity).toFixed(2)}</td>
      <td>${parseFloat(m.cost_price||0).toFixed(2)}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;color:#9ca3af;">Немає невідповідностей</td></tr>';
}

async function loadSummary(groupBy) {
  const p = new URLSearchParams();
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  p.set('group_by', groupBy);
  const r = await fetch('/returns/summary?' + p.toString(), {credentials:'include'}).then(r=>r.json());
  if (!r.success) return;
  const tbody = document.getElementById(groupBy + '-tbody');
  tbody.innerHTML = r.summary.map(g => `
    <tr>
      <td>${g.key}</td>
      <td>${g.qty}</td>
      <td>${g.total.toFixed(2)}</td>
      <td>${g.returns_count}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:#9ca3af;">Немає даних</td></tr>';
}

async function archiveReturn(id) {
  if (!confirm('Перемістити в архів?')) return;
  const r = await fetch('/returns/' + id + '/archive', {method:'POST', credentials:'include'}).then(r=>r.json());
  if (r.success) { toast('Заархівовано', 'success'); loadAll(); }
  else toast('Помилка: ' + r.error, 'error');
}

function toggleItems(id) {
  document.getElementById('items-' + id).classList.toggle('open');
}

function exportXlsx() {
  // CSV-експорт (простий варіант, XLSX додамо пізніше)
  const rows = [['Номер','Магазин','Дата','ШК','Назва','К-сть','Ціна','Сума','Статус']];
  for (const ret of currentReturns) {
    for (const it of ret.return_items) {
      rows.push([
        ret.return_number,
        ret.store_address,
        new Date(ret.created_at).toLocaleString('uk-UA'),
        it.barcode,
        it.product_name,
        parseFloat(it.quantity).toFixed(2),
        parseFloat(it.cost_price||0).toFixed(2),
        (parseFloat(it.quantity)*parseFloat(it.cost_price||0)).toFixed(2),
        it.lookup_status || ''
      ]);
    }
  }
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], {type: 'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'returns_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  toast('Експорт CSV готовий', 'success');
}

function toast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.className = 'toast', 3000);
}

window.archiveReturn = archiveReturn;
window.toggleItems = toggleItems;

init();
