'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Каноничное распределение остатка зарплаты между картой и наличными.
// Единый источник правды: используется бэкендом (/calculate-final-payroll) и
// должен использоваться фронтендом для предпросмотра, чтобы числа не расходились.
//
// Правило: сначала максимум на карту в пределах индивидуального лимита,
// остальное — наличными. Остаток к выплате не может быть отрицательным.
// ─────────────────────────────────────────────────────────────────────────────

// afterDeductions — к выплате после вычетов (gross − штрафы − недостачи)
// advancePayment  — уже выплаченный аванс (всего)
// advanceCard     — часть аванса, ушедшая на карту (занимает лимит карты за месяц)
// cardLimit       — индивидуальный месячный лимит карты сотрудника
function distributeRemainder({ afterDeductions, advancePayment, advanceCard, cardLimit }) {
  const remainingToPay = Math.max(0, (Number(afterDeductions) || 0) - (Number(advancePayment) || 0));
  const remainingCardCapacity = Math.max(0, (Number(cardLimit) || 0) - (Number(advanceCard) || 0));
  const cardRemainder = Math.min(remainingCardCapacity, remainingToPay);
  const cashPayout = Math.max(0, remainingToPay - cardRemainder);
  return { remainingToPay, remainingCardCapacity, cardRemainder, cashPayout };
}

// Сверка: карта_остаток + нал = остаток_к_выплате (в пределах 1 грн).
// Возвращает { ok, diff }. Использовать, чтобы ПОКАЗАТЬ расхождение, а не «тихо» править.
function reconcileRemainder({ afterDeductions, advancePayment, cardRemainder, cashPayout }) {
  const expected = Math.max(0, (Number(afterDeductions) || 0) - (Number(advancePayment) || 0));
  const actual = (Number(cardRemainder) || 0) + (Number(cashPayout) || 0);
  const diff = Math.round((expected - actual) * 100) / 100;
  return { ok: Math.abs(diff) <= 1, diff, expected, actual };
}

module.exports = { distributeRemainder, reconcileRemainder };
