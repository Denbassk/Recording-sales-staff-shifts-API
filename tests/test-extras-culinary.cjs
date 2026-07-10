'use strict';
// Тесты кулинарии (Блок 3). Запуск: node tests/test-extras-culinary.cjs

const { culinaryBonusForItem, splitPerSeller, CULINARY_BONUS_RATE } = require('../payroll/extras.cjs');

let passed = 0, failed = 0;
function approx(a, b) { return Math.abs(a - b) < 0.001; }
function check(cond, label, got) {
  if (cond) { passed++; console.log(`  ✅ ${label}` + (got !== undefined ? ` → ${got}` : '')); }
  else { failed++; console.log(`  ❌ ${label}: получено ${got}`); }
}

console.log('=== Кулинария: 10% × max(0, себест. − списания «в счёт зп») ===');
check(CULINARY_BONUS_RATE === 0.10, 'ставка 10%', CULINARY_BONUS_RATE);
check(approx(culinaryBonusForItem(100, 30), 7), 'продано 100, списано 30 → 10%×70 = 7', culinaryBonusForItem(100, 30));
check(approx(culinaryBonusForItem(200, 0), 20), 'продано 200, без списаний → 20', culinaryBonusForItem(200, 0));
check(culinaryBonusForItem(50, 80) === 0, 'списания больше продаж → 0 (не минус)', culinaryBonusForItem(50, 80));
check(culinaryBonusForItem(0, 40) === 0, 'списание без продажи → 0', culinaryBonusForItem(0, 40));

console.log('\n=== Деление пула на продавцов ===');
check(approx(splitPerSeller(90, 3), 30), 'пул 90 / 3 = 30', splitPerSeller(90, 3));
check(splitPerSeller(50, 0) === 0, 'нет продавцов → 0', splitPerSeller(50, 0));

console.log(`\n=== ИТОГ: пройдено ${passed}, провалено ${failed} ===`);
if (failed > 0) { console.log('❌ ЕСТЬ ПРОВАЛЫ'); process.exit(1); }
console.log('✅ Все тесты пройдены.');
