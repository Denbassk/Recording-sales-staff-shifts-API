# mem:financial_safety — безопасность денежных операций

## Константы-лимиты (server.cjs, верх)
- `COMPANY_TAX_RATE = 0.22` — налог на ФОТ.
- `MAX_MANUAL_BONUS = 10000` — потолок ручной премии.
- `MAX_PENALTY = 5000` — потолок штрафа.
- `MAX_SHORTAGE = 10000` — потолок недостачи.
- `MIN_YEAR = 2024` — минимально допустимый год даты.
- `DEFAULT_LIMITS.STANDARD/PREMIUM` — фоллбэк лимитов карт.

## Блокировки (race conditions)
- `withLock(key, operation)` — in-memory `Map` operationLocks, busy-wait по 100мс.
- Применяется в `calculate-final-payroll` (ключ `final_payroll_${year}_${month}`).
- ⚠ In-memory → НЕ работает между процессами/инстансами Fly.io. См.
  `mem:known_issues_and_tech_debt`. При добавлении конкурентных финопераций оборачивать,
  но помнить об ограничении.

## Логирование — `logFinancialOperation(operation, data, userId)`
Пишет в `financial_logs` (operation_type, data=JSON, user_id). Ошибки логирования
глушатся (try/catch, только console.error). Сейчас вызывается, например, в
`payroll/adjustments` и `calculate-final-payroll`. ⚠ Логируется НЕ во всех денежных
эндпоинтах (аванс-фиксации, корректировки лимитов и пр.) — при правках ОБЯЗАТЕЛЬНО
добавлять вызов.

## Валидации
- `validateDate(dateStr, allowFuture=false)`: невалидная дата / будущее (если не разрешено)
  / год < MIN_YEAR → отказ. Используется в upload-revenue-file, calculate-advance и т.д.
- `validateAmount(amount, max, fieldName)`: не число / отрицательное / > max → отказ.
  Возвращает `{valid, value}`. Применяется к bonus/penalty/shortage в `payroll/adjustments`.
- `validatePayrollCalculation(data)`: сверка `total_after_deductions - advance_payment`
  против `card_remainder + cash_payout` (допуск 0.01), запрет отрицательных остатков.
  ⚠ Проверка лимита карты ЗАКОММЕНТИРОВАНА (жёсткий лимит 8700 убран, т.к. лимиты разные)
  — функция больше НЕ ловит превышение лимита карты. См. `mem:known_issues_and_tech_debt`.
- В `calculate-final-payroll` есть собственная финальная сверка математики (допуск 1 грн)
  с авто-коррекцией cashPayout.

## Защита ручных правок при пересчёте
Флаги в `final_payroll_calculations`: `is_manual_adjustment`, `is_fixed`,
`is_remainder_adjusted`, `is_termination`. Авто-пересчёт обязан их уважать (не затирать
суммы аванса и распределение остатка). Перед перезаписью adjustments — бэкап в
`monthly_adjustments_backup`; для final — `final_payroll_calculations_backup`.

## Прочее
- `clear-transactional-data` (admin) физически удаляет payroll_calculations, shifts,
  daily_revenue, monthly_adjustments — крайне опасная операция, только admin.
- service_role_key обходит RLS — серверная авторизация единственная защита (см. `mem:core`).
