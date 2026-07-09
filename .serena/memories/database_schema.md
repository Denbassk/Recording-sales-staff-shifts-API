# mem:database_schema — таблицы Supabase (Postgres)

Схема выведена из обращений `supabase.from('...')` в `server.cjs` и `routes/lookup.js`.
Точные типы/ограничения столбцов НЕ проверены по DDL — см. TODO внизу. Доступ идёт
под service_role (RLS обходится).

## Сотрудники, магазины, смены
- **employees**: `id` (string, напр. `SProd...` = старший продавец), `fullname`,
  `role` (seller/admin/accountant/curator), `password` (⚠ хранится в открытом виде,
  сравнение по равенству), `active` (bool), `card_limit_type_id` (FK → card_limit_types).
- **stores**: `id`, `name`, `address`, `active`.
- **store_address_aliases**: `store_id`, `alias_address`, `valid_from`, `valid_to`
  (исторические адреса магазина для сопоставления со складом в BigQuery).
- **employee_store**: постоянная привязка `employee_id` → `store_id`.
- **devices**: `device_key` → `store_id` (привязка терминала к магазину при логине).
- **substitutions**: `employee_id`, `substitution_date`, `worked_store_id` (подмены).
- **shifts**: `id`, `employee_id`, `store_id`, `shift_date`, `started_at` (фиксация смены при логине).
- **sessions**: `token` (первые 50 символов), `employee_id` (unique/onConflict),
  `employee_role`, `last_activity`, `expires_at` (апсерт в `checkAuth`).

## Выручка и расчёты
- **daily_revenue**: `store_id`, `revenue_date`, `revenue` (onConflict store_id,revenue_date).
- **payroll_calculations**: `employee_id`, `work_date`, `total_pay`, `store_id`,
  `store_address`. Дневные начисления — основа всех сумм.
- **monthly_adjustments**: `employee_id`, `month`, `year`, `manual_bonus`, `penalty`,
  `shortage`, `bonus_reason`, `penalty_reason`, `updated_at`, `updated_by`
  (onConflict employee_id,month,year).
- **monthly_adjustments_backup**: бэкап строк adjustments (original_id, *, backup_date,
  backup_reason, backup_by).
- **final_payroll_calculations**: итог месяца на сотрудника. Ключ employee_id,month,year.
  Поля: `total_gross`, `total_deductions`, `total_after_deductions`, `advance_payment`,
  `advance_card`, `advance_cash`, `advance_payment_method` (card/cash/mixed),
  `card_remainder`, `cash_payout`, `total_card_payment`, `calculation_date`,
  флаги `is_fixed`, `is_manual_adjustment`, `is_termination`, `is_remainder_adjusted`,
  `remainder_adjusted_by`, `adjustment_reason`, `updated_at`.
- **final_payroll_calculations_backup**: бэкапы перед изменениями/откатами.
- **payroll_payments**: фактические выплаты. `employee_id`, `amount`, `payment_type`
  (`advance` и др.), `payment_method`, `payment_period_month`, `payment_period_year`,
  `is_cancelled`.
- **employee_shortages**: недостачи (`employee_id`, сумма, дата; синхронизируется с
  `monthly_adjustments.shortage`).
- **table_state_snapshots**: автосохранение состояния таблицы фронта (бэкап UI).

## Лимиты карт
- **card_limit_types**: `id`, `limit_name`, `card_limit`, `max_advance`,
  `advance_percentage`. Базовые: 1=STANDARD, 2=PREMIUM (см. `mem:business_logic`).
- **card_limit_changes**: история изменений лимита у конкретного сотрудника.
- **card_limit_types_history**: история изменений самих типов лимитов (для отката).

## Логи
- **financial_logs**: `operation_type`, `data` (JSON-строка), `user_id`. Аудит финопераций.

## Возвраты (routes/lookup.js)
- **returns**: `id`, `return_number` (через RPC `generate_return_number`), `employee_id`,
  `store_id`, `store_address`, `status` (active/archived), `items_count`, `total_cost`,
  `notes`, `archived_at`, `processed_by`, `processed_at`, `created_at`.
- **return_items**: `return_id`, `barcode`, `product_name`, `quantity`, `cost_price`,
  `lookup_status`, `reason`.

## BigQuery (не Supabase)
`family-market-analytics.returns_system.stock_current` (остатки по магазинам),
`...barcode_catalog` (каталог штрихкодов). Только чтение, локация EU.

## TODO (не подтверждено из кода)
- Точные DDL: типы, NOT NULL, индексы, FK, дефолты — не читались (нет доступа к sql/ здесь;
  есть папки `sql/`, `sql-migrations/`, файлы `migration_*.sql` — проверить при необходимости).
- Есть ли таблица `payroll_payments` всегда (в коде ловится `code 42P01` = relation
  does not exist для `final_payroll_calculations`/manual — часть таблиц может отсутствовать).
