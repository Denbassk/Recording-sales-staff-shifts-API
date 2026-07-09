# mem:business_logic — ФОРМУЛЫ (ядро смысла проекта)

Источник: `server.cjs`. Все суммы в гривнах. Это самый важный блок — менять только
осознанно и с тестами (см. `mem:maintenance_checklist`).

## 1. Дневная зарплата продавца — `calculateDailyPay(revenue, numSellers, isSenior, fixedRate)`
Приоритеты (первый сработавший побеждает):
1. `fixedRate > 0` → totalPay = fixedRate (фикс. ставка грн/день), bonus = 0.
2. `isSenior === true` (старший продавец, id начинается с `SProd`) → фикс **1300 грн/день**, bonus = 0.
3. `numSellers === 0` → 0.
4. Иначе: базовая ставка на человека = **975 грн** если в смене 1 продавец, иначе **825 грн**.

### Бонус (добавляется к базовой ставке, на каждого продавца):
- Начисляется только если `revenue > 13000`.
- `bonusBase = revenue - 13000`; `wholeThousands = floor(bonusBase / 1000)`.
- Ставка за тысячу зависит от диапазона выручки магазина:
  - 13000–20000 → 5
  - 20000–25000 → 6
  - 25000–30000 → 7
  - 30000–35000 → 8
  - 35000–40000 → 9
  - 40000–45000 → 10
  - 45000–50000 → 11
  - ≥ 50000 → 12
- `bonusPerPerson = wholeThousands * ratePerThousand`.
- totalPay = baseRate + bonusPerPerson.
ВАЖНО: бонус считается на КАЖДОГО продавца (не делится). Хранится в `payroll_calculations.total_pay`.

## 2. ФОТ (фонд оплаты труда) — `buildFotReport({startDate, endDate})`
- `COMPANY_TAX_RATE = 0.22` (22% налог сверху на выплату на карту).
- Считается ТОЛЬКО за дни, по которым реально загружена выручка (`daily_revenue`),
  и только по начислениям с `total_pay > 0`.
- Налог берётся НЕ со всей выплаты, а только с суммы, попавшей НА КАРТУ в пределах
  лимита (в `buildFotReport` жёстко `cardLimit = 16000` — отдельный трекер
  `employeeCardTracker[employee_id].paid_to_card` на период).
- На каждую запись: `paidToCardToday = min(total_pay, остаток лимита карты)`;
  `tax = paidToCardToday * 0.22`; `payoutWithTax = total_pay + tax`.
- По магазину: `total_payout_with_tax = Σ payoutWithTax`.
- `fot_percentage = total_payout_with_tax / total_revenue * 100` (0 если выручка 0).
- README-формула для понимания: `ФОТ% = (выплаты + 22% налог) / выручка магазина`.
ГРАБЛИ: в `buildFotReport` лимит карты захардкожен 16000, НЕ берётся из
`card_limit_types` — расходится с индивидуальными лимитами (см. `mem:gotchas`).

## 3. Лимиты карт — `getEmployeeCardLimit(employee_id)` + `DEFAULT_LIMITS`
Берёт из `employees.card_limit_type_id → card_limit_types`. Поля результата:
`cardLimit`, `maxAdvance`, `advancePercentage` (дефолт 0.9), `limitName`, `limitTypeId`.
Дефолты-фоллбэки (`DEFAULT_LIMITS`, на случай ошибки/отсутствия связи):
- **STANDARD** (typeId 1, «Обычная карта»): cardLimit 8700, maxAdvance 7900, 90%.
- **PREMIUM** (typeId 2, «Повышенная карта»): cardLimit 16000, maxAdvance 11500, 90%.
ВАЖНО: при ЛЮБОЙ ошибке/отсутствии связки → возвращается STANDARD (безопасный минимум).
`cardLimit` = лимит зачисления на карту за МЕСЯЦ. `maxAdvance` = потолок аванса (фикс. сумма).

## 4. Аванс — `POST /calculate-advance` (период с 1-го по advanceEndDate; cutoff день = 15)
Приоритет источника суммы аванса:
1. Ручная корректировка (`final_payroll_calculations.is_manual_adjustment = true`) — берётся как есть.
2. Зафиксированный аванс (`payroll_payments`, type='advance', не отменён) — берётся как есть.
3. **Новый сотрудник**: первая смена ПОЗЖЕ 15-го числа (`firstShiftDate > advanceCutoffDate`)
   → аванс = 0.
4. Авторасчёт:
   - `calculatedAdvance = totalEarned * advancePercentage` (90% от НАЧИСЛЕНИЙ, не от лимита).
   - `roundedAdvance = floor(calculatedAdvance / 100) * 100` (округление ВНИЗ до 100 грн).
   - `advanceAmount = min(roundedAdvance, maxAdvance)`.
- Из расчёта исключаются роли admin/accountant и пустые fullname.

## 5. Окончательный расчёт — `POST /calculate-final-payroll` (в `withLock`)
- `basePay` = Σ `payroll_calculations.total_pay` за месяц (1-е … reportEndDate).
- `totalGross = basePay + manual_bonus`.
- `totalDeductions = penalty + shortage`.
- `totalAfterDeductions = totalGross - totalDeductions`.
- Аванс: если запись помечена manual/fixed — сохраняется; иначе авторасчёт (как §4:
  90% от basePay, округл. вниз до 100, не больше maxAdvance), весь аванс на карту.
- `remainingToPay = max(0, totalAfterDeductions - advancePayment)`.
- `remainingCardCapacity = max(0, cardLimit - advanceCard)`.
- Распределение остатка:
  - `is_termination` → cardRemainder = 0, cashPayout = 0 (увольнение обнуляет остатки).
  - `is_remainder_adjusted` → сохраняет ручное распределение карта/наличные; при росте
    суммы разницу добавляет В НАЛИЧНЫЕ; при уменьшении — пропорционально; следит, чтобы
    cardRemainder ≤ remainingCardCapacity, излишек → в наличные.
  - иначе: `cardRemainder = min(remainingCardCapacity, remainingToPay)`,
    `cashPayout = max(0, remainingToPay - cardRemainder)` (сначала максимум на карту,
    остальное — наличными в кассу).
- Финальная сверка: `|（totalAfterDeductions - advancePayment) - (cardRemainder + cashPayout)| ≤ 1`,
  иначе корректируется cashPayout. Результат upsert в `final_payroll_calculations`
  (onConflict employee_id,month,year). Логируется в `financial_logs`.

## 6. Корректировки месяца — `POST /payroll/adjustments`
Поля: `manual_bonus` (≤ MAX_MANUAL_BONUS=10000), `penalty` (≤ MAX_PENALTY=5000),
`shortage` (≤ MAX_SHORTAGE=10000). Перед перезаписью делается бэкап старой строки в
`monthly_adjustments_backup`. Хранится в `monthly_adjustments` (employee_id,month,year).
