'use strict';
// Тесты распределения остатка. Запуск: node tests/test-final-calc.cjs
const { distributeRemainder, reconcileRemainder } = require('../payroll/final-calc.cjs');

let passed = 0, failed = 0;
function check(cond, label, got) {
  if (cond) { passed++; console.log(`  ✅ ${label}` + (got !== undefined ? ` → ${got}` : '')); }
  else { failed++; console.log(`  ❌ ${label}: получено ${got}`); }
}
const eq = (a, b) => Math.abs(a - b) < 0.001;

console.log('=== Распределение остатка (карта в пределах лимита, остальное нал) ===');
let r = distributeRemainder({ afterDeductions: 10000, advancePayment: 5000, advanceCard: 5000, cardLimit: 8700 });
check(eq(r.cardRemainder, 3700) && eq(r.cashPayout, 1300), 'лимит 8700: карта 3700 + нал 1300', JSON.stringify(r));

r = distributeRemainder({ afterDeductions: 20000, advancePayment: 5000, advanceCard: 5000, cardLimit: 16000 });
check(eq(r.cardRemainder, 11000) && eq(r.cashPayout, 4000), 'лимит 16000: карта 11000 + нал 4000', JSON.stringify(r));

r = distributeRemainder({ afterDeductions: 5000, advancePayment: 6000, advanceCard: 6000, cardLimit: 8700 });
check(r.remainingToPay === 0 && r.cardRemainder === 0 && r.cashPayout === 0, 'аванс больше начисления → 0', JSON.stringify(r));

r = distributeRemainder({ afterDeductions: 12000, advancePayment: 0, advanceCard: 0, cardLimit: 16000 });
check(eq(r.cardRemainder, 12000) && eq(r.cashPayout, 0), 'всё влезает на карту', JSON.stringify(r));

console.log('\n=== Сверка (показать расхождение, а не «тихо» править) ===');
let rc = reconcileRemainder({ afterDeductions: 10000, advancePayment: 5000, cardRemainder: 3700, cashPayout: 1300 });
check(rc.ok && rc.diff === 0, 'сходится', JSON.stringify(rc));
rc = reconcileRemainder({ afterDeductions: 10000, advancePayment: 5000, cardRemainder: 3700, cashPayout: 1000 });
check(!rc.ok && eq(rc.diff, 300), 'расхождение 300 → ok=false', JSON.stringify(rc));

console.log(`\n=== ИТОГ: пройдено ${passed}, провалено ${failed} ===`);
if (failed > 0) { console.log('❌ ЕСТЬ ПРОВАЛЫ'); process.exit(1); }
console.log('✅ Все тесты пройдены.');
