# mem:maintenance_checklist — чек-лист для будущих изменений

## Перед ЛЮБЫМ коммитом в финансовую логику
1. Не нарушены ли инварианты `mem:core`? (CA+роль на эндпоинте; лог в financial_logs;
   withLock на конкурентных операциях; не затёрты ручные флаги).
2. Если добавлен/изменён эндпоинт — проверь: есть `checkAuth` И корректный `checkRole`?
   Сверься с матрицей в `mem:auth_and_roles`. Не плодить дубли путей.
3. Если операция меняет деньги — добавлен ли вызов `logFinancialOperation(...)`?
4. Если операция конкурентная (пересчёт месяца) — обёрнута в `withLock`?
   Помни про in-memory ограничение на нескольких инстансах.
5. Уважаются ли флаги `is_manual_adjustment`/`is_fixed`/`is_remainder_adjusted`/
   `is_termination` (не перезатираются автоматикой)?
6. Сделан ли бэкап перед перезаписью (monthly_adjustments_backup /
   final_payroll_calculations_backup)?

## При правке формул (см. `mem:business_logic`)
- `calculateDailyPay`: проверить пороги бонуса (13000 минимум; ставки 5–12 по диапазонам;
  ставка базы 975 за одного / 825 за нескольких; старший 1300; fixedRate приоритет).
- Аванс: 90% от начислений, floor до 100, не больше maxAdvance; новый сотрудник (>15 числа)=0.
- Final-payroll: gross=base+bonus; deductions=penalty+shortage; остаток сначала на карту в
  пределах cardLimit, потом наличными; увольнение обнуляет остаток.
- ФОТ: налог 22% только с части на карту; помни про хардкод 16000 в buildFotReport.
- Проверить лимиты-константы: MAX_MANUAL_BONUS=10000, MAX_PENALTY=5000, MAX_SHORTAGE=10000.

## Ручное тестирование (минимум) после изменений payroll
1. `POST /login` (seller и admin) — cookie ставится, смена фиксируется 1 раз/день.
2. `POST /upload-revenue-file` — выручка попадает в daily_revenue (дата из имени файла).
3. `POST /calculate-payroll` — корректные total_pay (одиночная/групповая смена, бонусы).
4. `POST /calculate-advance` — авто, новый сотрудник=0, fixed/manual не пересчитываются.
5. `POST /calculate-final-payroll` — математика сходится; ручные флаги сохранены; есть
   запись в financial_logs.
6. `POST /get-fot-report` (admin) — fot_percentage адекватный; пустой период → rows:[].
7. Проверить роли: seller НЕ получает доступ к payroll/ФОТ/лимитам (ожидать 401/403).
8. Возвраты: `GET /lookup`, `POST /returns` (seller), `GET /returns` (admin).

## Что записать/проверить в financial_logs
operation_type + полезная нагрузка (year, month, суммы, employeesCount, кто — req.user.id).
После изменения проверить, что новые операции реально пишут лог.

## Регрессионные риски (держать в голове)
- Изменение порядка роутов может «оживить» незащищённый дубль /save-universal-corrections.
- Изменение лимитов карт влияет и на аванс, и на распределение остатка, и (частично) на ФОТ.
- Очистка через /clear-transactional-data необратима — только admin, с подтверждением.

## Перед серьёзным рефактором — сначала прочитать
`PROJECT_MEMORY/`, `sql/`, `sql-migrations/`, `migration_*.sql`; затем `mem:known_issues_and_tech_debt`.
Идеально — сначала покрыть тестами `calculateDailyPay`/аванс/final/ФОТ (сейчас тестов нет).
