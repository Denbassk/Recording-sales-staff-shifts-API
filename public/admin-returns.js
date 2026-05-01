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
  if (!currentReturns.length) return toast('Немає даних для експорту', 'error');

  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const wb = XLSX.utils.book_new();

  const fmtDate = d => {
    const dt = new Date(d);
    return dt.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const fmtDateOnly = d => new Date(d).toLocaleDateString('uk-UA');

  // ===== АРКУШ 1: ЗВЕДЕННЯ =====
  const allItems = currentReturns.flatMap(r => r.return_items.map(it => ({...it, store: r.store_address, date: r.created_at, return_number: r.return_number})));
  const totalSum = currentReturns.reduce((s,r)=>s+parseFloat(r.total_cost||0), 0);
  const totalItems = allItems.length;

  // Топ-10 постачальників
  const supplierMap = {};
  for (const it of allItems) {
    const k = (it.product_name||'').split(' ')[0] || 'Невідомо';
    if (!supplierMap[k]) supplierMap[k] = { qty: 0, sum: 0 };
    supplierMap[k].qty += parseFloat(it.quantity||0);
    supplierMap[k].sum += parseFloat(it.quantity||0) * parseFloat(it.cost_price||0);
  }
  const topSuppliers = Object.entries(supplierMap).map(([k,v])=>[k, v.qty, v.sum]).sort((a,b)=>b[2]-a[2]).slice(0,10);

  // Топ-10 магазинів
  const storeMap = {};
  for (const r of currentReturns) {
    if (!storeMap[r.store_address]) storeMap[r.store_address] = { qty: 0, sum: 0, count: 0 };
    storeMap[r.store_address].sum += parseFloat(r.total_cost||0);
    storeMap[r.store_address].count += 1;
    storeMap[r.store_address].qty += r.return_items.reduce((s,it)=>s+parseFloat(it.quantity||0), 0);
  }
  const topStores = Object.entries(storeMap).map(([k,v])=>[k, v.qty, v.sum, v.count]).sort((a,b)=>b[2]-a[2]).slice(0,10);

  // Кольори
  const colorMap = { green: 0, orange: 0, blue: 0, yellow: 0 };
  for (const it of allItems) if (colorMap[it.lookup_status] !== undefined) colorMap[it.lookup_status]++;

  const summaryData = [
    ['ЗВЕДЕННЯ ПО ПОВЕРНЕННЯХ'],
    [],
    ['Період', `${from || '—'} — ${to || '—'}`],
    ['Повернень', currentReturns.length],
    ['Позицій', totalItems],
    ['Сума, ₴', totalSum.toFixed(2)],
    [],
    ['РОЗПОДІЛ ПО СТАТУСАХ ШК'],
    ['🟢 В наявності', colorMap.green],
    ['🟠 У мережі', colorMap.orange],
    ['🔵 У каталозі', colorMap.blue],
    ['🟡 Не з бази', colorMap.yellow],
    [],
    ['ТОП-10 ПОСТАЧАЛЬНИКІВ'],
    ['Постачальник', 'К-сть', 'Сума ₴'],
    ...topSuppliers,
    [],
    ['ТОП-10 МАГАЗИНІВ'],
    ['Магазин', 'К-сть', 'Сума ₴', 'Повернень'],
    ...topStores
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{wch: 35}, {wch: 15}, {wch: 15}, {wch: 12}];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Зведення');

  // ===== АРКУШ 2: ВОЗВРАТЫ =====
  const returnsHeader = ['Номер', 'Магазин', 'Сотрудник', 'Дата', 'Позицій', 'Сума ₴', 'Статус', 'Архів', 'Примітка'];
  const returnsRows = currentReturns.map(r => [
    r.return_number,
    r.store_address,
    r.employee_id,
    fmtDate(r.created_at),
    r.items_count,
    parseFloat(r.total_cost||0),
    r.status,
    r.archived_at ? fmtDate(r.archived_at) : '',
    r.notes || ''
  ]);
  const wsReturns = XLSX.utils.aoa_to_sheet([returnsHeader, ...returnsRows]);
  wsReturns['!cols'] = [{wch:18},{wch:25},{wch:14},{wch:18},{wch:9},{wch:11},{wch:12},{wch:18},{wch:25}];
  wsReturns['!freeze'] = { ySplit: 1 };
  wsReturns['!autofilter'] = { ref: `A1:I${returnsRows.length+1}` };
  // формат суми
  for (let i = 2; i <= returnsRows.length+1; i++) {
    const cell = wsReturns[`F${i}`];
    if (cell) cell.z = '#,##0.00';
  }
  XLSX.utils.book_append_sheet(wb, wsReturns, 'Возвраты');

  // ===== АРКУШ 3: ПОЗИЦІЇ =====
  const itemsHeader = ['Номер', 'Магазин', 'Дата', 'ШК', 'Назва', 'К-сть', 'Ціна ₴', 'Сума ₴', 'Статус ШК'];
  const itemsRows = [];
  const colorRowsMap = { green: [], orange: [], blue: [], yellow: [] };
  for (const r of currentReturns) {
    for (const it of r.return_items) {
      const qty = parseFloat(it.quantity||0);
      const price = parseFloat(it.cost_price||0);
      itemsRows.push([
        r.return_number,
        r.store_address,
        fmtDate(r.created_at),
        it.barcode,
        it.product_name,
        qty,
        price,
        qty * price,
        it.lookup_status || ''
      ]);
      if (colorRowsMap[it.lookup_status]) colorRowsMap[it.lookup_status].push(itemsRows.length + 1);
    }
  }
  const wsItems = XLSX.utils.aoa_to_sheet([itemsHeader, ...itemsRows]);
  wsItems['!cols'] = [{wch:18},{wch:22},{wch:18},{wch:18},{wch:45},{wch:9},{wch:11},{wch:11},{wch:14}];
  wsItems['!freeze'] = { ySplit: 1 };
  wsItems['!autofilter'] = { ref: `A1:I${itemsRows.length+1}` };
  // ШК як текст, числа
  for (let i = 2; i <= itemsRows.length+1; i++) {
    const bc = wsItems[`D${i}`];
    if (bc) { bc.t = 's'; bc.z = '@'; }
    ['F','G','H'].forEach(col => {
      const c = wsItems[`${col}${i}`];
      if (c) c.z = '#,##0.00';
    });
  }
  XLSX.utils.book_append_sheet(wb, wsItems, 'Позиції');

  // ===== АРКУШ 4: ПО ПОСТАЧАЛЬНИКУ =====
  const supplierAll = Object.entries(supplierMap).map(([k,v])=>{
    const returnsCount = new Set(allItems.filter(it=>(it.product_name||'').split(' ')[0]===k).map(it=>it.return_number)).size;
    return [k, v.qty, v.sum, returnsCount];
  }).sort((a,b)=>b[2]-a[2]);
  const wsSup = XLSX.utils.aoa_to_sheet([['Постачальник','К-сть','Сума ₴','Повернень'], ...supplierAll]);
  wsSup['!cols'] = [{wch:30},{wch:12},{wch:14},{wch:12}];
  wsSup['!freeze'] = { ySplit: 1 };
  wsSup['!autofilter'] = { ref: `A1:D${supplierAll.length+1}` };
  XLSX.utils.book_append_sheet(wb, wsSup, 'По постачальнику');

  // ===== АРКУШ 5: ПО МАГАЗИНУ =====
  const storeAll = Object.entries(storeMap).map(([k,v])=>[k, v.qty, v.sum, v.count]).sort((a,b)=>b[2]-a[2]);
  const wsStore = XLSX.utils.aoa_to_sheet([['Магазин','К-сть','Сума ₴','Повернень'], ...storeAll]);
  wsStore['!cols'] = [{wch:30},{wch:12},{wch:14},{wch:12}];
  wsStore['!freeze'] = { ySplit: 1 };
  wsStore['!autofilter'] = { ref: `A1:D${storeAll.length+1}` };
  XLSX.utils.book_append_sheet(wb, wsStore, 'По магазину');

  // ===== АРКУШ 6: ПО SKU =====
  const skuMap = {};
  for (const it of allItems) {
    const k = it.barcode + '|' + it.product_name;
    if (!skuMap[k]) skuMap[k] = { barcode: it.barcode, name: it.product_name, qty: 0, sum: 0, returns: new Set() };
    skuMap[k].qty += parseFloat(it.quantity||0);
    skuMap[k].sum += parseFloat(it.quantity||0) * parseFloat(it.cost_price||0);
    skuMap[k].returns.add(it.return_number);
  }
  const skuRows = Object.values(skuMap).map(s=>[s.barcode, s.name, s.qty, s.sum, s.returns.size]).sort((a,b)=>b[3]-a[3]);
  const wsSku = XLSX.utils.aoa_to_sheet([['ШК','Назва','К-сть','Сума ₴','Повернень'], ...skuRows]);
  wsSku['!cols'] = [{wch:18},{wch:45},{wch:12},{wch:14},{wch:12}];
  wsSku['!freeze'] = { ySplit: 1 };
  wsSku['!autofilter'] = { ref: `A1:E${skuRows.length+1}` };
  for (let i = 2; i <= skuRows.length+1; i++) {
    const bc = wsSku[`A${i}`];
    if (bc) { bc.t = 's'; bc.z = '@'; }
  }
  XLSX.utils.book_append_sheet(wb, wsSku, 'По SKU');

  // ===== АРКУШ 7: НЕ З БАЗИ =====
  const mismatchRows = allItems
    .filter(it => it.lookup_status === 'yellow')
    .map(it => [fmtDateOnly(it.date), it.store, it.barcode, it.product_name, parseFloat(it.quantity||0), parseFloat(it.cost_price||0)]);
  const wsMis = XLSX.utils.aoa_to_sheet([['Дата','Магазин','ШК','Назва','К-сть','Ціна ₴'], ...mismatchRows]);
  wsMis['!cols'] = [{wch:12},{wch:25},{wch:18},{wch:45},{wch:9},{wch:11}];
  wsMis['!freeze'] = { ySplit: 1 };
  if (mismatchRows.length) wsMis['!autofilter'] = { ref: `A1:F${mismatchRows.length+1}` };
  for (let i = 2; i <= mismatchRows.length+1; i++) {
    const bc = wsMis[`C${i}`];
    if (bc) { bc.t = 's'; bc.z = '@'; }
  }
  XLSX.utils.book_append_sheet(wb, wsMis, 'Не з бази');

  // Назва файлу з періодом
  const fname = `Возвраты_${from || 'all'}_${to || 'all'}.xlsx`;
  XLSX.writeFile(wb, fname);
  toast(`Експорт готовий: ${currentReturns.length} повернень`, 'success');
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
