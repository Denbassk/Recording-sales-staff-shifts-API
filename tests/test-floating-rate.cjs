'use strict';
// Тесты плавающей ставки (Блок 1 новых правил, с 16.07.2026).
// Запуск: node tests/test-floating-rate.cjs
// Возвращает ненулевой код выхода при любом провале (для CI/preliminary-check).

const {
  NEW_RULES_START,
  rateFromAvgRevenue,
  previousMonthBounds,
  averageDailyRevenue,
  isNewRulesDate,
} = require('../payroll/floating-rate.cjs');

let passed = 0;
let failed = 0;

function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✅ ${label} → ${JSON.stringify(actual)}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  }
}

console.log('=== 1. Ставка по среднедневному выторгу (границы) ===');
eq(rateFromAvgRevenue(0), 800, 'avg 0');
eq(rateFromAvgRevenue(38000), 800, 'avg 38 000');
eq(rateFromAvgRevenue(39999.99), 800, 'avg 39 999.99');
eq(rateFromAvgRevenue(40000), 800, 'avg ровно 40 000 → 800');
eq(rateFromAvgRevenue(40000.01), 900, 'avg 40 000.01 → 900');
eq(rateFromAvgRevenue(41000), 900, 'avg 41 000');
eq(rateFromAvgRevenue(50000), 900, 'avg ровно 50 000 → 900');
eq(rateFromAvgRevenue(50000.01), 1000, 'avg 50 000.01 → 1000');
eq(rateFromAvgRevenue(65000), 1000, 'avg 65 000');

console.log('\n=== 2. Пример владельца (июнь 38т → июль 800; июль 41т → август 900) ===');
eq(rateFromAvgRevenue(38000), 800, 'июнь 38т → ставка в июле');
eq(rateFromAvgRevenue(41000), 900, 'июль 41т → ставка в августе');

console.log('\n=== 3. Границы предыдущего месяца ===');
eq(previousMonthBounds('2026-07-20'), { start: '2026-06-01', end: '2026-06-30' }, 'смена в июле → июнь');
eq(previousMonthBounds('2026-08-05'), { start: '2026-07-01', end: '2026-07-31' }, 'смена в августе → июль');
eq(previousMonthBounds('2026-03-10'), { start: '2026-02-01', end: '2026-02-28' }, 'смена в марте → февраль (28 дней)');
eq(previousMonthBounds('2026-01-10'), { start: '2025-12-01', end: '2025-12-31' }, 'смена в январе → декабрь пред. года');

console.log('\n=== 4. Среднедневной выторг (только дни с кассой > 0) ===');
eq(averageDailyRevenue([{ revenue: 40000 }, { revenue: 50000 }, { revenue: 0 }]),
   { avg: 45000, days: 2, sum: 90000 }, 'два дня с кассой, один нулевой');
eq(averageDailyRevenue([]), { avg: 0, days: 0, sum: 0 }, 'нет данных → avg 0');
// Проверка сцепки: средний 30 дней по 45000 → ставка 900
(() => {
  const rows = Array.from({ length: 30 }, () => ({ revenue: 45000 }));
  const { avg } = averageDailyRevenue(rows);
  eq(rateFromAvgRevenue(avg), 900, '30 дней × 45 000 → ставка 900');
})();

console.log('\n=== 5. Порог новых правил (16.07.2026) ===');
eq(NEW_RULES_START, '2026-07-16', 'константа порога');
eq(isNewRulesDate('2026-07-14'), false, '14 июля → старые правила');
eq(isNewRulesDate('2026-07-15'), false, '15 июля → старые правила');
eq(isNewRulesDate('2026-07-16'), true, '16 июля → новые правила');
eq(isNewRulesDate('2026-08-01'), true, 'август → новые правила');
eq(isNewRulesDate('2026-06-30'), false, 'июнь → старые правила');

console.log(`\n=== ИТОГ: пройдено ${passed}, провалено ${failed} ===`);
if (failed > 0) {
  console.log('❌ ЕСТЬ ПРОВАЛЫ — не деплоить.');
  process.exit(1);
}
console.log('✅ Все тесты пройдены.');
