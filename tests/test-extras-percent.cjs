'use strict';
// Тесты Блока 2 (процент). Запуск: node tests/test-extras-percent.cjs
// Ненулевой код выхода при провале.

const { sellerSalesPercent, normalizeAddr } = require('../payroll/extras.cjs');

let passed = 0, failed = 0;
function approx(a, b) { return Math.abs(a - b) < 0.01; }
function check(cond, label, got) {
  if (cond) { passed++; console.log(`  ✅ ${label}` + (got !== undefined ? ` → ${got}` : '')); }
  else { failed++; console.log(`  ❌ ${label}: получено ${got}`); }
}

console.log('=== 1. Процент: доля продавца = (касса − ДЛ) × 3% / N ===');
let r = sellerSalesPercent(55109, 20294, 2); // Іскрінський 19, 20.06 (проверено на данных)
check(approx(r.adjusted, 34815) && approx(r.pool, 1044.45) && approx(r.perSeller, 522.225),
  '1 маг., 2 продавца', JSON.stringify(r));

r = sellerSalesPercent(27270, 7225, 1); // 1 продавец → весь пул ему
check(approx(r.perSeller, 601.35), '1 продавец получает весь 3%-пул', r.perSeller.toFixed(2));

r = sellerSalesPercent(30000, 0, 3); // 3 продавца → делим на 3
check(approx(r.perSeller, 300) && approx(r.pool, 900), '3 продавца: 900/3 = 300', r.perSeller);

r = sellerSalesPercent(30000, 0, 2); // 2 продавца → 1.5% каждому
check(approx(r.perSeller, 450), '2 продавца: 1.5% = 450', r.perSeller);

console.log('\n=== 2. Защита: ДЛ ≥ кассы → 0 (не уходим в минус) ===');
r = sellerSalesPercent(10000, 15000, 2);
check(r.adjusted === 0 && r.perSeller === 0, 'ДЛ больше кассы → 0', JSON.stringify(r));

r = sellerSalesPercent(50000, 20000, 0);
check(r.perSeller === 0, 'нет продавцов → 0', r.perSeller);

console.log('\n=== 3. Нормализация адресов (матчинг BQ ↔ Supabase) ===');
check(normalizeAddr('  Байрона   156 ') === 'байрона 156', 'trim + collapse + lower', normalizeAddr('  Байрона   156 '));
check(normalizeAddr('Пр-т Ювілейний 67') === normalizeAddr('пр-т ювілейний 67'), 'регистронезависимо', 'ok');

console.log(`\n=== ИТОГ: пройдено ${passed}, провалено ${failed} ===`);
if (failed > 0) { console.log('❌ ЕСТЬ ПРОВАЛЫ'); process.exit(1); }
console.log('✅ Все тесты пройдены.');
