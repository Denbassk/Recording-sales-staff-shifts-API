// Standalone скрипт еженедельного бэкапа возвратов в Google Drive
const ExcelJS = require('exceljs');
const { google } = require('googleapis');
const { Readable } = require('stream');
const { createClient } = require('@supabase/supabase-js');

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GCP_SA_KEY', 'DRIVE_BACKUP_FOLDER_ID'];
for (const k of REQUIRED) {
  if (!process.env[k]) { console.error(`Missing env: ${k}`); process.exit(1); }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const FOLDER_ID = process.env.DRIVE_BACKUP_FOLDER_ID;
const KEEP_COPIES = 10;

async function getDrive() {
  const creds = JSON.parse(process.env.GCP_SA_KEY);
  console.log('[Diag] client_email:', creds.client_email);
  console.log('[Diag] private_key length:', creds.private_key?.length);
  console.log('[Diag] private_key_id:', creds.private_key_id);

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key,
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const authClient = await auth.getClient();
  const token = await authClient.getAccessToken();
  console.log('[Diag] Access token obtained:', token.token ? 'YES' : 'NO');

  return google.drive({ version: 'v3', auth: authClient });
}

async function buildXlsx(returns) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Shifts API Backup';
  wb.created = new Date();

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  const b = { style: 'thin', color: { argb: 'FFCCCCCC' } };
  const borders = { top: b, left: b, bottom: b, right: b };
  const center = { vertical: 'middle', horizontal: 'center', wrapText: true };
  const left = { vertical: 'middle', horizontal: 'left', wrapText: true };

  const styleHeader = (row) => row.eachCell(c => { c.fill = headerFill; c.font = headerFont; c.alignment = center; c.border = borders; });
  const styleData = (sheet, startRow, numCols = []) => {
    for (let r = startRow; r <= sheet.rowCount; r++) {
      sheet.getRow(r).eachCell((c, col) => {
        c.border = borders;
        c.alignment = numCols.includes(col) ? center : left;
      });
    }
  };

  const allItems = [];
  for (const ret of returns) {
    for (const it of (ret.return_items || [])) {
      allItems.push({ ...it, return_number: ret.return_number, store_address: ret.store_address, created_at: ret.created_at });
    }
  }
  const totalSum = returns.reduce((s, r) => s + parseFloat(r.total_cost || 0), 0);
  const totalQty = allItems.reduce((s, i) => s + parseFloat(i.quantity || 0), 0);

  const supplierMap = {}, storeMap = {}, skuMap = {};
  for (const it of allItems) {
    const supplier = (it.product_name || '').split(' ')[0] || '—';
    const sum = parseFloat(it.quantity || 0) * parseFloat(it.cost_price || 0);
    (supplierMap[supplier] ||= { qty: 0, sum: 0, returns: new Set() });
    supplierMap[supplier].qty += parseFloat(it.quantity || 0);
    supplierMap[supplier].sum += sum;
    supplierMap[supplier].returns.add(it.return_number);

    (storeMap[it.store_address] ||= { qty: 0, sum: 0, returns: new Set() });
    storeMap[it.store_address].qty += parseFloat(it.quantity || 0);
    storeMap[it.store_address].sum += sum;
    storeMap[it.store_address].returns.add(it.return_number);

    const k = it.barcode + '|' + (it.product_name || '');
    (skuMap[k] ||= { barcode: it.barcode, name: it.product_name, qty: 0, sum: 0, returns: new Set() });
    skuMap[k].qty += parseFloat(it.quantity || 0);
    skuMap[k].sum += sum;
    skuMap[k].returns.add(it.return_number);
  }

  // 1. Зведення
  const s1 = wb.addWorksheet('Зведення');
  s1.columns = [{ width: 28 }, { width: 24 }];
  s1.addRow(['Звіт по поверненнях', '']);
  s1.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF1E40AF' } };
  s1.addRow(['Дата формування', new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })]);
  s1.addRow(['Усього повернень', returns.length]);
  s1.addRow(['Усього позицій', allItems.length]);
  s1.addRow(['Усього одиниць', totalQty]);
  s1.addRow(['Сума, ₴', totalSum]);
  s1.getCell('B6').numFmt = '#,##0.00';
  s1.addRow([]);
  s1.addRow(['ТОП-10 постачальників', '']); s1.getRow(s1.rowCount).font = { bold: true };
  s1.addRow(['Постачальник', 'Сума ₴']); styleHeader(s1.getRow(s1.rowCount));
  Object.entries(supplierMap).sort((a,b) => b[1].sum - a[1].sum).slice(0,10).forEach(([k,v]) => {
    const r = s1.addRow([k, v.sum]); r.getCell(2).numFmt = '#,##0.00';
  });
  s1.addRow([]);
  s1.addRow(['ТОП-10 магазинів', '']); s1.getRow(s1.rowCount).font = { bold: true };
  s1.addRow(['Магазин', 'Сума ₴']); styleHeader(s1.getRow(s1.rowCount));
  Object.entries(storeMap).sort((a,b) => b[1].sum - a[1].sum).slice(0,10).forEach(([k,v]) => {
    const r = s1.addRow([k, v.sum]); r.getCell(2).numFmt = '#,##0.00';
  });

  // 2. Возвраты
  const s2 = wb.addWorksheet('Возвраты');
  s2.columns = [
    { header: 'Номер', key: 'num', width: 18 }, { header: 'Магазин', key: 'store', width: 24 },
    { header: 'Дата', key: 'dt', width: 18 }, { header: 'Співробітник', key: 'emp', width: 16 },
    { header: 'Позицій', key: 'cnt', width: 10 }, { header: 'Сума ₴', key: 'sum', width: 12 },
    { header: 'Статус', key: 'st', width: 14 }, { header: 'Архів', key: 'arch', width: 18 }
  ];
  styleHeader(s2.getRow(1));
  returns.forEach(r => s2.addRow({
    num: r.return_number, store: r.store_address, dt: new Date(r.created_at),
    emp: r.employee_id, cnt: r.items_count, sum: parseFloat(r.total_cost || 0),
    st: r.status, arch: r.archived_at ? new Date(r.archived_at) : ''
  }));
  s2.getColumn('dt').numFmt = 'dd.mm.yyyy hh:mm';
  s2.getColumn('arch').numFmt = 'dd.mm.yyyy hh:mm';
  s2.getColumn('sum').numFmt = '#,##0.00';
  s2.views = [{ state: 'frozen', ySplit: 1 }];
  s2.autoFilter = { from: 'A1', to: 'H1' };
  styleData(s2, 2, [3, 5, 6, 8]);

  // 3. Позиції
  const s3 = wb.addWorksheet('Позиції');
  s3.columns = [
    { header: 'Номер', width: 18 }, { header: 'Магазин', width: 24 }, { header: 'Дата', width: 18 },
    { header: 'ШК', width: 18 }, { header: 'Назва', width: 36 }, { header: 'К-сть', width: 10 },
    { header: 'Ціна ₴', width: 12 }, { header: 'Сума ₴', width: 12 }, { header: 'Статус ШК', width: 14 }
  ];
  styleHeader(s3.getRow(1));
  allItems.forEach(it => {
    const qty = parseFloat(it.quantity || 0); const price = parseFloat(it.cost_price || 0);
    const row = s3.addRow([it.return_number, it.store_address, new Date(it.created_at),
      it.barcode, it.product_name, qty, price, qty * price, it.lookup_status || '']);
    row.getCell(4).numFmt = '@';
  });
  s3.getColumn(3).numFmt = 'dd.mm.yyyy hh:mm';
  s3.getColumn(6).numFmt = '#,##0.00';
  s3.getColumn(7).numFmt = '#,##0.00';
  s3.getColumn(8).numFmt = '#,##0.00';
  s3.views = [{ state: 'frozen', ySplit: 1 }];
  s3.autoFilter = { from: 'A1', to: 'I1' };
  styleData(s3, 2, [3, 4, 6, 7, 8, 9]);

  // 4. По постачальнику
  const s4 = wb.addWorksheet('По постачальнику');
  s4.columns = [
    { header: 'Постачальник', width: 28 }, { header: 'К-сть', width: 12 },
    { header: 'Сума ₴', width: 14 }, { header: 'Повернень', width: 12 }
  ];
  styleHeader(s4.getRow(1));
  Object.entries(supplierMap).sort((a,b) => b[1].sum - a[1].sum).forEach(([k,v]) => {
    s4.addRow([k, v.qty, v.sum, v.returns.size]);
  });
  s4.getColumn(3).numFmt = '#,##0.00';
  s4.views = [{ state: 'frozen', ySplit: 1 }];
  s4.autoFilter = { from: 'A1', to: 'D1' };
  styleData(s4, 2, [2, 3, 4]);

  // 5. По магазину
  const s5 = wb.addWorksheet('По магазину');
  s5.columns = [
    { header: 'Магазин', width: 28 }, { header: 'К-сть', width: 12 },
    { header: 'Сума ₴', width: 14 }, { header: 'Повернень', width: 12 }
  ];
  styleHeader(s5.getRow(1));
  Object.entries(storeMap).sort((a,b) => b[1].sum - a[1].sum).forEach(([k,v]) => {
    s5.addRow([k, v.qty, v.sum, v.returns.size]);
  });
  s5.getColumn(3).numFmt = '#,##0.00';
  s5.views = [{ state: 'frozen', ySplit: 1 }];
  s5.autoFilter = { from: 'A1', to: 'D1' };
  styleData(s5, 2, [2, 3, 4]);

  // 6. По SKU
  const s6 = wb.addWorksheet('По SKU');
  s6.columns = [
    { header: 'ШК', width: 18 }, { header: 'Назва', width: 36 },
    { header: 'К-сть', width: 12 }, { header: 'Сума ₴', width: 14 }, { header: 'Повернень', width: 12 }
  ];
  styleHeader(s6.getRow(1));
  Object.values(skuMap).sort((a,b) => b.sum - a.sum).forEach(v => {
    const row = s6.addRow([v.barcode, v.name, v.qty, v.sum, v.returns.size]);
    row.getCell(1).numFmt = '@';
  });
  s6.getColumn(4).numFmt = '#,##0.00';
  s6.views = [{ state: 'frozen', ySplit: 1 }];
  s6.autoFilter = { from: 'A1', to: 'E1' };
  styleData(s6, 2, [1, 3, 4, 5]);

  // 7. Не з бази
  const s7 = wb.addWorksheet('Не з бази');
  s7.columns = [
    { header: 'Дата', width: 18 }, { header: 'Магазин', width: 24 },
    { header: 'ШК', width: 18 }, { header: 'Назва', width: 36 },
    { header: 'К-сть', width: 10 }, { header: 'Ціна ₴', width: 12 }
  ];
  styleHeader(s7.getRow(1));
  allItems.filter(i => i.lookup_status === 'yellow').forEach(it => {
    const row = s7.addRow([new Date(it.created_at), it.store_address, it.barcode, it.product_name,
      parseFloat(it.quantity || 0), parseFloat(it.cost_price || 0)]);
    row.getCell(3).numFmt = '@';
  });
  s7.getColumn(1).numFmt = 'dd.mm.yyyy hh:mm';
  s7.getColumn(6).numFmt = '#,##0.00';
  s7.views = [{ state: 'frozen', ySplit: 1 }];
  s7.autoFilter = { from: 'A1', to: 'F1' };
  styleData(s7, 2, [1, 3, 5, 6]);

  return await wb.xlsx.writeBuffer();
}

(async () => {
  try {
    console.log('[Backup] Fetching returns from Supabase...');
    const { data: returns, error } = await supabase
      .from('returns').select('*, return_items(*)')
      .order('created_at', { ascending: false }).limit(5000);
    if (error) throw error;
    console.log(`[Backup] Got ${returns?.length || 0} returns`);

    const buffer = await buildXlsx(returns || []);
    const dateStr = new Date().toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' }).replace(/\./g, '-');
    const fileName = `Возвраты_backup_${dateStr}.xlsx`;
    console.log(`[Backup] Built XLSX: ${fileName} (${buffer.byteLength} bytes)`);

    const drive = getDrive();
    const drive = await getDrive();

    // === ДИАГНОСТИКА ===
try {
  const folderInfo = await drive.files.get({
    fileId: FOLDER_ID,
    fields: 'id, name, mimeType, driveId, owners, permissions',
    supportsAllDrives: true
  });
  console.log('[Diag] Folder info:', JSON.stringify(folderInfo.data, null, 2));
} catch (e) {
  console.log('[Diag] Folder access error:', e.message);
}
// === КОНЕЦ ДИАГНОСТИКИ ===

    const uploaded = await drive.files.create({
      requestBody: { name: fileName, parents: [FOLDER_ID] },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Readable.from(Buffer.from(buffer))
      },
      fields: 'id, name, createdTime'
    });
    console.log(`[Backup] Uploaded: ${uploaded.data.name} (id: ${uploaded.data.id})`);

    const list = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name contains 'Возвраты_backup_' and trashed = false`,
      orderBy: 'createdTime desc',
      fields: 'files(id, name, createdTime)',
      pageSize: 50
    });
    const files = list.data.files || [];
    const toDelete = files.slice(KEEP_COPIES);
    for (const f of toDelete) {
      await drive.files.delete({ fileId: f.id });
      console.log(`[Backup] Deleted old: ${f.name}`);
    }
    console.log(`[Backup] Done. Total files in folder: ${Math.min(files.length, KEEP_COPIES)}`);
    process.exit(0);
  } catch (e) {
    console.error('[Backup] FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
