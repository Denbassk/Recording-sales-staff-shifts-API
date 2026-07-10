'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Блок 2 (процент от продаж) новых правил (с 16.07.2026), Вариант Б — BigQuery в Node.
// Процент на смену = 3% от (касса магазина − продажи ДЛ Солюшн за день), делится на N продавцов.
// Данные ДЛ Солюшн: продажи по чекам (turnover_transactions) по накопительному набору
// штрих-кодов поставщика из приходов (incoming_transactions, вся история).
//
// Чистые функции (sellerSalesPercent, normalizeAddr) тестируются без БД.
// BigQuery подключается лениво (только при вызове), чтобы модуль грузился без креда в тестах.
// ─────────────────────────────────────────────────────────────────────────────

const {
  SALES_PERCENT,
  DL_SUPPLIER_NAME,
  PACKAGE_BARCODES,
  COFFEE_BARCODES,
  PACKAGE_BONUS_PER_UNIT,
  COFFEE_BONUS_PER_UNIT,
  COFFEE_EXCLUDE_NAME_SUBSTR,
  CULINARY_BARCODES,
  CULINARY_BONUS_RATE,
  CULINARY_EXCLUDE_NAME_PREFIX,
  CULINARY_WRITEOFF_REASON,
} = require('./bonus-config.cjs');

const BQ_PROJECT = 'family-market-analytics';
const BQ_DATASET = 'family_market';

let _bqClient = null;

// Клиент BigQuery: в проде креды из секрета GCP_SA_JSON, локально — GOOGLE_APPLICATION_CREDENTIALS.
function getBigQuery() {
  if (_bqClient) return _bqClient;
  const { BigQuery } = require('@google-cloud/bigquery');
  const opts = { projectId: BQ_PROJECT };
  if (process.env.GCP_SA_JSON) {
    opts.credentials = JSON.parse(process.env.GCP_SA_JSON);
  }
  _bqClient = new BigQuery(opts);
  return _bqClient;
}

// Нормализация адреса магазина для матчинга BQ(store) ↔ Supabase(stores.address/aliases).
function normalizeAddr(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Map(нормализованный адрес → store_id) из stores + актуальных на dateStr store_address_aliases.
async function getStoreMapping(supabase, dateStr) {
  const map = new Map();
  const { data: stores, error: e1 } = await supabase.from('stores').select('id, address');
  if (e1) throw e1;
  (stores || []).forEach((s) => {
    if (s.address) map.set(normalizeAddr(s.address), s.id);
  });
  const { data: aliases, error: e2 } = await supabase
    .from('store_address_aliases')
    .select('store_id, alias_address, valid_from, valid_to');
  if (e2) throw e2;
  (aliases || []).forEach((a) => {
    const okFrom = !a.valid_from || String(a.valid_from) <= dateStr;
    const okTo = !a.valid_to || String(a.valid_to) >= dateStr;
    if (a.alias_address && okFrom && okTo) map.set(normalizeAddr(a.alias_address), a.store_id);
  });
  return map;
}

// Продажи ДЛ Солюшн по магазину/дню за период [from..to] (строки 'YYYY-MM-DD').
// Возвращает { rows: [{date, store_id, dl_sales}], unmatched: [адреса без store_id] }.
async function getDlSalesByStoreDay(from, to, storeMapping) {
  const bq = getBigQuery();
  const sql = `
    WITH dl AS (
      SELECT DISTINCT barcode
      FROM \`${BQ_PROJECT}.${BQ_DATASET}.incoming_transactions\`
      WHERE supplier = @supplier
    )
    SELECT DATE(transaction_datetime) AS d, TRIM(store) AS store, SUM(check_amount) AS dl_sales
    FROM \`${BQ_PROJECT}.${BQ_DATASET}.turnover_transactions\`
    WHERE DATE(transaction_datetime) BETWEEN DATE(@from) AND DATE(@to)
      AND barcode IN (SELECT barcode FROM dl)
    GROUP BY d, store`;
  const [rows] = await bq.query({
    query: sql,
    params: { supplier: DL_SUPPLIER_NAME, from, to },
  });
  const out = [];
  const unmatched = new Set();
  for (const r of rows) {
    const store_id = storeMapping.get(normalizeAddr(r.store));
    if (store_id == null) { unmatched.add(r.store); continue; }
    const d = r.d && r.d.value ? r.d.value : String(r.d);
    out.push({ date: d, store_id, dl_sales: Number(r.dl_sales) || 0 });
  }
  return { rows: out, unmatched: [...unmatched] };
}

// Продажи пакетов и кофе (штук) по магазину/дню за период. Кофе исключает позиции со словом «чай».
// Возвращает { rows: [{date, store_id, bag_qty, coffee_qty}], unmatched: [...] }.
async function getFlatBonusByStoreDay(from, to, storeMapping) {
  const bq = getBigQuery();
  const sql = `
    WITH t AS (
      SELECT DATE(transaction_datetime) AS d, TRIM(store) AS store, barcode, product_name, quantity
      FROM \`${BQ_PROJECT}.${BQ_DATASET}.turnover_transactions\`
      WHERE DATE(transaction_datetime) BETWEEN DATE(@from) AND DATE(@to)
        AND (barcode IN UNNEST(@bags) OR barcode IN UNNEST(@coffee))
    )
    SELECT d, store,
      SUM(IF(barcode IN UNNEST(@bags), quantity, 0)) AS bag_qty,
      SUM(IF(barcode IN UNNEST(@coffee) AND NOT LOWER(product_name) LIKE @teaLike, quantity, 0)) AS coffee_qty
    FROM t
    GROUP BY d, store`;
  const [rows] = await bq.query({
    query: sql,
    params: {
      from, to,
      bags: PACKAGE_BARCODES,
      coffee: COFFEE_BARCODES,
      teaLike: `%${COFFEE_EXCLUDE_NAME_SUBSTR}%`,
    },
  });
  const out = [];
  const unmatched = new Set();
  for (const r of rows) {
    const store_id = storeMapping.get(normalizeAddr(r.store));
    if (store_id == null) { unmatched.add(r.store); continue; }
    const d = r.d && r.d.value ? r.d.value : String(r.d);
    out.push({
      date: d,
      store_id,
      bag_qty: Number(r.bag_qty) || 0,
      coffee_qty: Number(r.coffee_qty) || 0,
    });
  }
  return { rows: out, unmatched: [...unmatched] };
}

// Доля продавца от «плоского» бонуса (пакеты/кофе): пул = qty × ставка_за_штуку, делится на N.
function flatBonusPerSeller(qty, ratePerUnit, numSellers) {
  const pool = (Number(qty) || 0) * ratePerUnit;
  const perSeller = numSellers > 0 ? pool / numSellers : 0;
  return { pool, perSeller };
}

// Чистая функция: доля продавца от процента за смену.
// cash — касса магазина за день; dlSales — продажи ДЛ Солюшн за день; numSellers — продавцов на смене.
function sellerSalesPercent(cash, dlSales, numSellers) {
  const adjusted = Math.max(0, (Number(cash) || 0) - (Number(dlSales) || 0));
  const pool = adjusted * SALES_PERCENT;
  const perSeller = numSellers > 0 ? pool / numSellers : 0;
  return { adjusted, pool, perSeller };
}

// Кулинария: бонус за товар = 10% × max(0, себестоимость_проданного − списания_«в счёт зп»).
function culinaryBonusForItem(soldCost, writeoffCost) {
  return CULINARY_BONUS_RATE * Math.max(0, (Number(soldCost) || 0) - (Number(writeoffCost) || 0));
}

// Общее деление пула на продавцов смены.
function splitPerSeller(pool, numSellers) {
  return numSellers > 0 ? (Number(pool) || 0) / numSellers : 0;
}

// Кулинарный бонус по магазину/дню за период.
// sold_cost из turnover (price_purchase×qty, кроме «Випічка») минус списания culinary_writeoffs
// со статусом «Продавцам в счёт зп», матчинг по (дата, магазин, штрих-код). Возвращает
// { rows: [{date, store_id, culinary_pool}], unmatched: [...] }.
async function getCulinaryByStoreDay(from, to, storeMapping) {
  const bq = getBigQuery();
  const soldSql = `
    SELECT DATE(transaction_datetime) AS d, TRIM(store) AS store, barcode,
           SUM(price_purchase * quantity) AS sold_cost
    FROM \`${BQ_PROJECT}.${BQ_DATASET}.turnover_transactions\`
    WHERE DATE(transaction_datetime) BETWEEN DATE(@from) AND DATE(@to)
      AND barcode IN UNNEST(@cul) AND NOT STARTS_WITH(product_name, @excl)
    GROUP BY d, store, barcode`;
  const woSql = `
    SELECT writeoff_date AS d, TRIM(store) AS store, barcode, SUM(cost) AS wo_cost
    FROM \`${BQ_PROJECT}.${BQ_DATASET}.culinary_writeoffs\`
    WHERE writeoff_date BETWEEN DATE(@from) AND DATE(@to) AND reason = @reason
    GROUP BY d, store, barcode`;
  const [[soldRows], [woRows]] = await Promise.all([
    bq.query({ query: soldSql, params: { from, to, cul: CULINARY_BARCODES, excl: CULINARY_EXCLUDE_NAME_PREFIX } }),
    bq.query({ query: woSql, params: { from, to, reason: CULINARY_WRITEOFF_REASON } }),
  ]);

  const dv = (x) => (x && x.value ? x.value : String(x));
  const items = new Map(); // date|store_id|barcode → {date, store_id, sold, wo}
  const unmatched = new Set();
  const put = (r, field, val) => {
    const store_id = storeMapping.get(normalizeAddr(r.store));
    if (store_id == null) { unmatched.add(r.store); return; }
    const key = `${dv(r.d)}|${store_id}|${r.barcode}`;
    const it = items.get(key) || { date: dv(r.d), store_id, sold: 0, wo: 0 };
    it[field] += Number(val) || 0;
    items.set(key, it);
  };
  for (const r of soldRows) put(r, 'sold', r.sold_cost);
  for (const r of woRows) put(r, 'wo', r.wo_cost);

  const byStoreDay = new Map(); // date|store_id → {date, store_id, culinary_pool}
  for (const it of items.values()) {
    const bonus = culinaryBonusForItem(it.sold, it.wo);
    const k = `${it.date}|${it.store_id}`;
    const cur = byStoreDay.get(k) || { date: it.date, store_id: it.store_id, culinary_pool: 0 };
    cur.culinary_pool += bonus;
    byStoreDay.set(k, cur);
  }
  return { rows: [...byStoreDay.values()], unmatched: [...unmatched] };
}

function round2(x) {
  return Math.round(((Number(x) || 0) + Number.EPSILON) * 100) / 100;
}

const POLEVAYA_STORE_ID = 38;

// Кандидат на новые правила (extras начисляются): обычный продавец, не старший, не фикс, не Полевая.
function isEligibleSeller(emp, storeId) {
  if (!emp) return false;
  if (emp.role === 'admin' || emp.role === 'accountant') return false;
  if (!(emp.fullname || '').trim()) return false;
  if (String(emp.id).startsWith('SProd')) return false;      // старший продавец
  if (emp.fixed_rate && emp.fixed_rate > 0) return false;     // фикс-ставка
  if (storeId === POLEVAYA_STORE_ID) return false;            // Полевая — по-старому
  return true;
}

// Собирает extras по каждому продавцу-смене за период [from..to] (строки 'YYYY-MM-DD').
// Тянет BigQuery (ДЛ/пакеты/кофе/кулинария) + Supabase (касса, смены, base_rate).
// НЕ пишет в БД — возвращает массив строк для upsert. Клампинг по дате новых правил делает вызывающий.
async function buildExtrasRows({ supabase, from, to }) {
  const mapping = await getStoreMapping(supabase, to);
  const [dl, flat, cul] = await Promise.all([
    getDlSalesByStoreDay(from, to, mapping),
    getFlatBonusByStoreDay(from, to, mapping),
    getCulinaryByStoreDay(from, to, mapping),
  ]);
  const key = (d, s) => `${d}|${s}`;
  const dlMap = new Map(dl.rows.map((r) => [key(r.date, r.store_id), r.dl_sales]));
  const flatMap = new Map(flat.rows.map((r) => [key(r.date, r.store_id), r]));
  const culMap = new Map(cul.rows.map((r) => [key(r.date, r.store_id), r.culinary_pool]));

  const { data: rev } = await supabase
    .from('daily_revenue').select('store_id, revenue, revenue_date')
    .gte('revenue_date', from).lte('revenue_date', to);
  const cashMap = new Map((rev || []).map((r) => [key(r.store_id, r.revenue_date), Number(r.revenue) || 0]));

  const { data: shiftsRaw } = await supabase
    .from('shifts').select('store_id, employee_id, shift_date')
    .gte('shift_date', from).lte('shift_date', to);
  const empIds = [...new Set((shiftsRaw || []).map((s) => s.employee_id))];
  let empMap = new Map();
  if (empIds.length) {
    const { data: emps } = await supabase
      .from('employees').select('id, fullname, role, fixed_rate').in('id', empIds);
    empMap = new Map((emps || []).map((e) => [e.id, e]));
  }

  const groups = new Map(); // date|store_id → { date, store_id, sellers: [employee_id] }
  for (const s of shiftsRaw || []) {
    const emp = empMap.get(s.employee_id);
    if (!isEligibleSeller(emp, s.store_id)) continue;
    const k = key(s.shift_date, s.store_id);
    const g = groups.get(k) || { date: s.shift_date, store_id: s.store_id, sellers: [] };
    g.sellers.push(s.employee_id);
    groups.set(k, g);
  }

  const { data: pcs } = await supabase
    .from('payroll_calculations').select('employee_id, work_date, base_rate')
    .gte('work_date', from).lte('work_date', to);
  const baseRateMap = new Map((pcs || []).map((p) => [key(p.employee_id, p.work_date), Number(p.base_rate) || 0]));

  const out = [];
  for (const g of groups.values()) {
    const k = key(g.date, g.store_id);
    const cash = cashMap.get(key(g.store_id, g.date)) || 0;
    const dlSales = dlMap.get(k) || 0;
    const fb = flatMap.get(k) || { bag_qty: 0, coffee_qty: 0 };
    const culPool = culMap.get(k) || 0;
    const n = g.sellers.length;
    if (n === 0) continue;

    const adjusted = Math.max(0, cash - dlSales);
    const spShare = (adjusted * SALES_PERCENT) / n;
    const bagShare = (fb.bag_qty * PACKAGE_BONUS_PER_UNIT) / n;
    const coffeeShare = (fb.coffee_qty * COFFEE_BONUS_PER_UNIT) / n;
    const culShare = culPool / n;

    for (const empId of g.sellers) {
      const hasBase = baseRateMap.has(key(empId, g.date));
      const base = hasBase ? baseRateMap.get(key(empId, g.date)) : null;
      const extrasSum = spShare + bagShare + coffeeShare + culShare;
      out.push({
        employee_id: empId,
        work_date: g.date,
        store_id: g.store_id,
        num_sellers: n,
        sales_percent: round2(spShare),
        bag_bonus: round2(bagShare),
        coffee_bonus: round2(coffeeShare),
        culinary_bonus: round2(culShare),
        dl_sales_deducted: round2(dlSales),
        adjusted_cash: round2(adjusted),
        base_rate: base,
        total_pay: hasBase ? round2(base + extrasSum) : null, // null → ставка ещё не посчитана /calculate-payroll
      });
    }
  }
  return { rows: out, unmatched: { dl: dl.unmatched, flat: flat.unmatched, cul: cul.unmatched } };
}

module.exports = {
  BQ_PROJECT,
  BQ_DATASET,
  getBigQuery,
  normalizeAddr,
  getStoreMapping,
  getDlSalesByStoreDay,
  sellerSalesPercent,
  getFlatBonusByStoreDay,
  flatBonusPerSeller,
  getCulinaryByStoreDay,
  culinaryBonusForItem,
  splitPerSeller,
  isEligibleSeller,
  buildExtrasRows,
  PACKAGE_BONUS_PER_UNIT,
  COFFEE_BONUS_PER_UNIT,
  CULINARY_BONUS_RATE,
};
