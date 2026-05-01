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
// Завантажити список магазинів у фільтр
const storesResp = await fetch('/stores', {credentials:'include'}).then(r=>r.json()).catch(()=>null);
if (storesResp?.success) {
  const sel = document.getElementById('filter-store');
  storesResp.stores.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.address;
    sel.appendChild(opt);
  });
}

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

async function exportXlsx() {
  if (!currentReturns.length) return toast('Немає даних для експорту', 'error');

  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Family Market'; wb.created = new Date();

  const fmtDate = d => {
    const dt = new Date(d);
    return dt.toLocaleString('uk-UA', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  };
  const fmtDateOnly = d => new Date(d).toLocaleDateString('uk-UA');

  // ===== Стилі =====
  const HEADER_FILL = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1E40AF' } };
  const HEADER_FONT = { name:'Calibri', size:11, bold:true, color:{ argb:'FFFFFFFF' } };
  const TITLE_FONT  = { name:'Calibri', size:14, bold:true, color:{ argb:'FF1E40AF' } };
  const BORDER = {
    top:    { style:'thin', color:{ argb:'FFB0B7C3' } },
    left:   { style:'thin', color:{ argb:'FFB0B7C3' } },
    bottom: { style:'thin', color:{ argb:'FFB0B7C3' } },
    right:  { style:'thin', color:{ argb:'FFB0B7C3' } }
  };
  const CENTER = { vertical:'middle', horizontal:'center', wrapText:true };
  const LEFT   = { vertical:'middle', horizontal:'left',   wrapText:true };

  const STATUS_FILLS = {
    green:  { type:'pattern', pattern:'solid', fgColor:{ argb:'FFD1FAE5' } },
    orange: { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFED7AA' } },
    blue:   { type:'pattern', pattern:'solid', fgColor:{ argb:'FFDBEAFE' } },
    yellow: { type:'pattern', pattern:'solid', fgColor:{ argb:'FFFEF3C7' } }
  };

  // Помічник: оформити шапку з заданих колонок
  function styleHeader(ws, rowNumber, colCount) {
    const row = ws.getRow(rowNumber);
    row.height = 26;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = CENTER;
      cell.border = BORDER;
    }
  }

  // Помічник: межі + вирівнювання для рядків даних, з визначенням, які колонки числові
  function styleDataRows(ws, startRow, endRow, numericCols) {
    for (let r = startRow; r <= endRow; r++) {
      const row = ws.getRow(r);
      row.eachCell({ includeEmpty:true }, (cell, colNumber) => {
        cell.border = BORDER;
        if (numericCols.includes(colNumber)) {
          cell.alignment = { vertical:'middle', horizontal:'center' };
        } else {
          cell.alignment = LEFT;
        }
      });
    }
  }

  // Дані для зведень
  const allItems = currentReturns.flatMap(r => r.return_items.map(it => ({...it, store:r.store_address, date:r.created_at, return_number:r.return_number})));
  const totalSum = currentReturns.reduce((s,r)=>s+parseFloat(r.total_cost||0), 0);

  const supplierMap = {};
  for (const it of allItems) {
    const k = (it.product_name||'').split(' ')[0] || 'Невідомо';
    if (!supplierMap[k]) supplierMap[k] = { qty:0, sum:0, returns:new Set() };
    supplierMap[k].qty += parseFloat(it.quantity||0);
    supplierMap[k].sum += parseFloat(it.quantity||0) * parseFloat(it.cost_price||0);
    supplierMap[k].returns.add(it.return_number);
  }
  const storeMap = {};
  for (const r of currentReturns) {
    if (!storeMap[r.store_address]) storeMap[r.store_address] = { qty:0, sum:0, count:0 };
    storeMap[r.store_address].sum += parseFloat(r.total_cost||0);
    storeMap[r.store_address].count += 1;
    storeMap[r.store_address].qty += r.return_items.reduce((s,it)=>s+parseFloat(it.quantity||0),0);
  }
  const colorMap = { green:0, orange:0, blue:0, yellow:0 };
  for (const it of allItems) if (colorMap[it.lookup_status] !== undefined) colorMap[it.lookup_status]++;

  // ============ АРКУШ 1: ЗВЕДЕННЯ ============
  {
    const ws = wb.addWorksheet('Зведення');
    ws.columns = [{ width:35 },{ width:18 },{ width:18 },{ width:14 }];

    ws.getCell('A1').value = 'ЗВЕДЕННЯ ПО ПОВЕРНЕННЯХ';
    ws.getCell('A1').font = TITLE_FONT;
    ws.mergeCells('A1:D1');
    ws.getRow(1).height = 28;
    ws.getCell('A1').alignment = CENTER;

    const info = [
      ['Період', `${from || '—'} — ${to || '—'}`],
      ['Повернень', currentReturns.length],
      ['Позицій', allItems.length],
      ['Сума, ₴', Number(totalSum.toFixed(2))]
    ];
    info.forEach((row, i) => {
      const r = ws.getRow(3 + i);
      r.getCell(1).value = row[0]; r.getCell(2).value = row[1];
      r.getCell(1).alignment = LEFT;
      r.getCell(2).alignment = CENTER;
      r.getCell(1).border = BORDER; r.getCell(2).border = BORDER;
      r.getCell(1).font = { bold:true };
    });

    ws.getCell('A8').value = 'РОЗПОДІЛ ПО СТАТУСАХ ШК';
    ws.getCell('A8').font = TITLE_FONT;
    ws.mergeCells('A8:D8');
    ws.getCell('A8').alignment = CENTER;

    const statusRows = [
      ['🟢 В наявності','green', colorMap.green],
      ['🟠 У мережі','orange', colorMap.orange],
      ['🔵 У каталозі','blue', colorMap.blue],
      ['🟡 Не з бази','yellow', colorMap.yellow]
    ];
    statusRows.forEach((row, i) => {
      const r = ws.getRow(9 + i);
      r.getCell(1).value = row[0]; r.getCell(2).value = row[2];
      r.getCell(1).fill = STATUS_FILLS[row[1]];
      r.getCell(1).alignment = LEFT;
      r.getCell(2).alignment = CENTER;
      r.getCell(1).border = BORDER; r.getCell(2).border = BORDER;
    });

    // Топ-10 постачальників
    const topSupRow = 14;
    ws.getCell(`A${topSupRow}`).value = 'ТОП-10 ПОСТАЧАЛЬНИКІВ';
    ws.getCell(`A${topSupRow}`).font = TITLE_FONT;
    ws.mergeCells(`A${topSupRow}:D${topSupRow}`);
    ws.getCell(`A${topSupRow}`).alignment = CENTER;
    ws.getRow(topSupRow + 1).values = ['Постачальник','К-сть','Сума ₴','Повернень'];
    styleHeader(ws, topSupRow + 1, 4);
    const topSup = Object.entries(supplierMap).map(([k,v])=>[k, Number(v.qty.toFixed(2)), Number(v.sum.toFixed(2)), v.returns.size]).sort((a,b)=>b[2]-a[2]).slice(0,10);
    topSup.forEach((row,i) => ws.getRow(topSupRow + 2 + i).values = row);
    if (topSup.length) styleDataRows(ws, topSupRow + 2, topSupRow + 1 + topSup.length, [2,3,4]);

    // Топ-10 магазинів
    const topStoreRow = topSupRow + 2 + topSup.length + 1;
    ws.getCell(`A${topStoreRow}`).value = 'ТОП-10 МАГАЗИНІВ';
    ws.getCell(`A${topStoreRow}`).font = TITLE_FONT;
    ws.mergeCells(`A${topStoreRow}:D${topStoreRow}`);
    ws.getCell(`A${topStoreRow}`).alignment = CENTER;
    ws.getRow(topStoreRow + 1).values = ['Магазин','К-сть','Сума ₴','Повернень'];
    styleHeader(ws, topStoreRow + 1, 4);
    const topStore = Object.entries(storeMap).map(([k,v])=>[k, Number(v.qty.toFixed(2)), Number(v.sum.toFixed(2)), v.count]).sort((a,b)=>b[2]-a[2]).slice(0,10);
    topStore.forEach((row,i) => ws.getRow(topStoreRow + 2 + i).values = row);
    if (topStore.length) styleDataRows(ws, topStoreRow + 2, topStoreRow + 1 + topStore.length, [2,3,4]);

    // Формат чисел
    [topSupRow + 2, topStoreRow + 2].forEach(start => {
      const end = ws.rowCount;
      for (let r = start; r <= end; r++) {
        const c = ws.getRow(r).getCell(3);
        if (c.value !== null && c.value !== undefined) c.numFmt = '#,##0.00';
      }
    });
  }

  // ============ АРКУШ 2: ВОЗВРАТЫ ============
  {
    const ws = wb.addWorksheet('Возвраты');
    ws.columns = [
      { header:'Номер', key:'num', width:18 },
      { header:'Магазин', key:'store', width:25 },
      { header:'Сотрудник', key:'emp', width:14 },
      { header:'Дата', key:'date', width:18 },
      { header:'Позицій', key:'items', width:10 },
      { header:'Сума ₴', key:'sum', width:12 },
      { header:'Статус', key:'status', width:12 },
      { header:'Архів', key:'arch', width:18 },
      { header:'Примітка', key:'notes', width:25 }
    ];
    styleHeader(ws, 1, 9);
    ws.views = [{ state:'frozen', ySplit:1 }];
    ws.autoFilter = { from:{ row:1, column:1 }, to:{ row:1, column:9 } };

    currentReturns.forEach(r => {
      ws.addRow({
        num: r.return_number,
        store: r.store_address,
        emp: r.employee_id,
        date: fmtDate(r.created_at),
        items: r.items_count,
        sum: Number(parseFloat(r.total_cost||0).toFixed(2)),
        status: r.status,
        arch: r.archived_at ? fmtDate(r.archived_at) : '',
        notes: r.notes || ''
      });
    });
    if (currentReturns.length) {
      styleDataRows(ws, 2, currentReturns.length + 1, [4,5,6,7,8]);
      for (let r = 2; r <= currentReturns.length + 1; r++) {
        ws.getRow(r).getCell(6).numFmt = '#,##0.00';
      }
    }
  }

  // ============ АРКУШ 3: ПОЗИЦІЇ ============
  {
    const ws = wb.addWorksheet('Позиції');
    ws.columns = [
      { header:'Номер', width:18 },
      { header:'Магазин', width:22 },
      { header:'Дата', width:18 },
      { header:'ШК', width:18 },
      { header:'Назва', width:45 },
      { header:'К-сть', width:9 },
      { header:'Ціна ₴', width:11 },
      { header:'Сума ₴', width:11 },
      { header:'Статус ШК', width:14 }
    ];
    styleHeader(ws, 1, 9);
    ws.views = [{ state:'frozen', ySplit:1 }];

    let cnt = 0;
    for (const r of currentReturns) {
      for (const it of r.return_items) {
        const qty = parseFloat(it.quantity||0);
        const price = parseFloat(it.cost_price||0);
        const row = ws.addRow([
          r.return_number, r.store_address, fmtDate(r.created_at),
          it.barcode, it.product_name,
          Number(qty.toFixed(2)), Number(price.toFixed(2)), Number((qty*price).toFixed(2)),
          it.lookup_status || ''
        ]);
        row.getCell(4).numFmt = '@';
        row.getCell(6).numFmt = '#,##0.00';
        row.getCell(7).numFmt = '#,##0.00';
        row.getCell(8).numFmt = '#,##0.00';
        if (STATUS_FILLS[it.lookup_status]) row.getCell(9).fill = STATUS_FILLS[it.lookup_status];
        cnt++;
      }
    }
    if (cnt) {
      styleDataRows(ws, 2, cnt + 1, [3,4,6,7,8,9]);
      ws.autoFilter = { from:{ row:1, column:1 }, to:{ row:1, column:9 } };
    }
  }

  // ============ АРКУШ 4: ПО ПОСТАЧАЛЬНИКУ ============
  {
    const ws = wb.addWorksheet('По постачальнику');
    ws.columns = [
      { header:'Постачальник', width:30 },
      { header:'К-сть', width:12 },
      { header:'Сума ₴', width:14 },
      { header:'Повернень', width:12 }
    ];
    styleHeader(ws, 1, 4);
    ws.views = [{ state:'frozen', ySplit:1 }];
    const rows = Object.entries(supplierMap).map(([k,v])=>[k, Number(v.qty.toFixed(2)), Number(v.sum.toFixed(2)), v.returns.size]).sort((a,b)=>b[2]-a[2]);
    rows.forEach(r => ws.addRow(r));
    if (rows.length) {
      styleDataRows(ws, 2, rows.length + 1, [2,3,4]);
      for (let r = 2; r <= rows.length + 1; r++) ws.getRow(r).getCell(3).numFmt = '#,##0.00';
      ws.autoFilter = { from:{ row:1, column:1 }, to:{ row:1, column:4 } };
    }
  }

  // ============ АРКУШ 5: ПО МАГАЗИНУ ============
  {
    const ws = wb.addWorksheet('По магазину');
    ws.columns = [
      { header:'Магазин', width:30 },
      { header:'К-сть', width:12 },
      { header:'Сума ₴', width:14 },
      { header:'Повернень', width:12 }
    ];
    styleHeader(ws, 1, 4);
    ws.views = [{ state:'frozen', ySplit:1 }];
    const rows = Object.entries(storeMap).map(([k,v])=>[k, Number(v.qty.toFixed(2)), Number(v.sum.toFixed(2)), v.count]).sort((a,b)=>b[2]-a[2]);
    rows.forEach(r => ws.addRow(r));
    if (rows.length) {
      styleDataRows(ws, 2, rows.length + 1, [2,3,4]);
      for (let r = 2; r <= rows.length + 1; r++) ws.getRow(r).getCell(3).numFmt = '#,##0.00';
      ws.autoFilter = { from:{ row:1, column:1 }, to:{ row:1, column:4 } };
    }
  }

  // ============ АРКУШ 6: ПО SKU ============
  {
    const ws = wb.addWorksheet('По SKU');
    ws.columns = [
      { header:'ШК', width:18 },
      { header:'Назва', width:45 },
      { header:'К-сть', width:12 },
      { header:'Сума ₴', width:14 },
      { header:'Повернень', width:12 }
    ];
    styleHeader(ws, 1, 5);
    ws.views = [{ state:'frozen', ySplit:1 }];
    const skuMap = {};
    for (const it of allItems) {
      const k = it.barcode + '|' + it.product_name;
      if (!skuMap[k]) skuMap[k] = { barcode:it.barcode, name:it.product_name, qty:0, sum:0, returns:new Set() };
      skuMap[k].qty += parseFloat(it.quantity||0);
      skuMap[k].sum += parseFloat(it.quantity||0) * parseFloat(it.cost_price||0);
      skuMap[k].returns.add(it.return_number);
    }
    const rows = Object.values(skuMap).map(s=>[s.barcode, s.name, Number(s.qty.toFixed(2)), Number(s.sum.toFixed(2)), s.returns.size]).sort((a,b)=>b[3]-a[3]);
    rows.forEach(r => {
      const row = ws.addRow(r);
      row.getCell(1).numFmt = '@';
    });
    if (rows.length) {
      styleDataRows(ws, 2, rows.length + 1, [1,3,4,5]);
      for (let r = 2; r <= rows.length + 1; r++) ws.getRow(r).getCell(4).numFmt = '#,##0.00';
      ws.autoFilter = { from:{ row:1, column:1 }, to:{ row:1, column:5 } };
    }
  }

  // ============ АРКУШ 7: НЕ З БАЗИ ============
  {
    const ws = wb.addWorksheet('Не з бази');
    ws.columns = [
      { header:'Дата', width:12 },
      { header:'Магазин', width:25 },
      { header:'ШК', width:18 },
      { header:'Назва', width:45 },
      { header:'К-сть', width:9 },
      { header:'Ціна ₴', width:11 }
    ];
    styleHeader(ws, 1, 6);
    ws.views = [{ state:'frozen', ySplit:1 }];
    const rows = allItems.filter(it => it.lookup_status === 'yellow').map(it => [
      fmtDateOnly(it.date), it.store, it.barcode, it.product_name,
      Number(parseFloat(it.quantity||0).toFixed(2)), Number(parseFloat(it.cost_price||0).toFixed(2))
    ]);
    rows.forEach(r => {
      const row = ws.addRow(r);
      row.getCell(3).numFmt = '@';
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(6).numFmt = '#,##0.00';
    });
    if (rows.length) {
      styleDataRows(ws, 2, rows.length + 1, [1,3,5,6]);
      ws.autoFilter = { from:{ row:1, column:1 }, to:{ row:1, column:6 } };
    }
  }

  // Збереження
  const buf = await wb.xlsx.writeBuffer();
  const fname = `Возвраты_${from || 'all'}_${to || 'all'}.xlsx`;
  saveAs(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fname);
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
