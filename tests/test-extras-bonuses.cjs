'use strict';
// Тесты Блока 3 (пакеты/кофе). Запуск: node tests/test-extras-bonuses.cjs

const {
  flatBonusPerSeller,
  PACKAGE_BONUS_PER_UNIT,
  COFFEE_BONUS_PER_UNIT,
} = require('../payroll/extras.cjs');

let passed = 0, failed = 0;
function approx(a, b) { return Math.abs(a - b) < 0.001; }
function check(cond, label, got) {
  if (cond) { passed++; console.log(`  ✅ ${label}` + (got !== undefined ? ` → ${got}` : '')); }
  else { failed++; console.log(`  ❌ ${label}: получено ${got}`); }
}

console.log('=== Ставки из конфига ===');
check(PACKAGE_BONUS_PER_UNIT === 0.5, 'пакет 0.50 грн/шт', PACKAGE_BONUS_PER_UNIT);
check(COFFEE_BONUS_PER_UNIT === 2.0, 'кофе 2.00 грн/стакан', COFFEE_BONUS_PER_UNIT);

console.log('\n=== Пакеты: qty × 0.50, делится на N ===');
let r = flatBonusPerSeller(10, PACKAGE_BONUS_PER_UNIT, 2);
check(approx(r.pool, 5) && approx(r.perSeller, 2.5), '10 шт, 2 продавца → пул 5, по 2.5', JSON.stringify(r));
r = flatBonusPerSeller(7, PACKAGE_BONUS_PER_UNIT, 1);
check(approx(r.perSeller, 3.5), '7 шт, 1 продавец → 3.5', r.perSeller);

console.log('\n=== Кофе: qty × 2.00, делится на N ===');
r = flatBonusPerSeller(30, COFFEE_BONUS_PER_UNIT, 1);
check(approx(r.perSeller, 60), '30 стаканов, 1 продавец → 60', r.perSeller);
r = flatBonusPerSeller(30, COFFEE_BONUS_PER_UNIT, 3);
check(approx(r.perSeller, 20), '30 стаканов, 3 продавца → по 20', r.perSeller);

console.log('\n=== Крайние случаи ===');
r = flatBonusPerSeller(0, COFFEE_BONUS_PER_UNIT, 2);
check(r.pool === 0 && r.perSeller === 0, 'нет продаж → 0', JSON.stringify(r));
r = flatBonusPerSeller(15, PACKAGE_BONUS_PER_UNIT, 0);
check(r.perSeller === 0, 'нет продавцов → 0', r.perSeller);

console.log(`\n=== ИТОГ: пройдено ${passed}, провалено ${failed} ===`);
if (failed > 0) { console.log('❌ ЕСТЬ ПРОВАЛЫ'); process.exit(1); }
console.log('✅ Все тесты пройдены.');
