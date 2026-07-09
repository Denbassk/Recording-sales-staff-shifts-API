'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Плавающая ставка продавца (Блок 1 новых правил, действуют С 16.07.2026).
// Ставка определяется по СРЕДНЕДНЕВНОМУ выторгу магазина за ПРЕДЫДУЩИЙ месяц.
// Сигареты входят в выторг (daily_revenue.revenue = полная касса).
// Чистый модуль без побочных эффектов — используется и сервером, и тестами,
// чтобы логика не расходилась между копиями.
//
// ВАЖНО: старый расчёт (calculateDailyPay: 975/825 + бонус 5–12 грн/тыс) НЕ трогается.
// Новые правила применяются ТОЛЬКО к сменам с датой >= NEW_RULES_START и только к
// обычным продавцам (не старшие, не Полевая, не с фикс-ставкой).
// ─────────────────────────────────────────────────────────────────────────────

// Дата включения новых правил (включительно). До 15.07.2026 — старый расчёт.
const NEW_RULES_START = '2026-07-16';

// Маппинг среднедневного выторга магазина (за пред. месяц) на дневную ставку, грн/смена.
//   выторг <= 40000            → 800
//   40000 < выторг <= 50000    → 900   (ровно 40000 → 800; ровно 50000 → 900)
//   выторг > 50000             → 1000
function rateFromAvgRevenue(avgDailyRevenue) {
  const avg = Number(avgDailyRevenue) || 0;
  if (avg <= 40000) return 800;
  if (avg <= 50000) return 900;
  return 1000;
}

// Границы предыдущего месяца относительно даты смены 'YYYY-MM-DD'.
// Возвращает { start, end } строками 'YYYY-MM-DD' (первый и последний день пред. месяца).
function previousMonthBounds(dateStr) {
  const parts = String(dateStr).split('-').map(Number);
  const y = parts[0];
  const m = parts[1]; // 1-based месяц самой смены
  const startDate = new Date(Date.UTC(y, m - 2, 1)); // первый день пред. месяца
  const endDate = new Date(Date.UTC(y, m - 1, 0));   // день 0 месяца смены = послед. день пред.
  const fmt = (d) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { start: fmt(startDate), end: fmt(endDate) };
}

// Среднедневной выторг по строкам daily_revenue пред. месяца.
// Среднее = Σ revenue / число дней, где revenue > 0 (магазин работает каждый день,
// считаем только отработанные дни с кассой).
function averageDailyRevenue(rows) {
  let sum = 0;
  let days = 0;
  for (const r of rows || []) {
    const rev = Number(r && r.revenue) || 0;
    if (rev > 0) {
      sum += rev;
      days += 1;
    }
  }
  return { avg: days > 0 ? sum / days : 0, days, sum };
}

// Действуют ли новые правила для этой даты смены? (лексикографическое сравнение
// строк 'YYYY-MM-DD' корректно для одинакового формата ISO).
function isNewRulesDate(dateStr) {
  return String(dateStr) >= NEW_RULES_START;
}

module.exports = {
  NEW_RULES_START,
  rateFromAvgRevenue,
  previousMonthBounds,
  averageDailyRevenue,
  isNewRulesDate,
};
