# mem:api_endpoints — полный список (метод, путь, роль, вход → выход/эффекты)

Роль: «—» = без проверки (см. `mem:known_issues_and_tech_debt`); CA=checkAuth;
P=admin+accountant; F=admin; V=admin+accountant+curator. Все защищённые требуют CA.
Формат ответа — `{success, ...}` (см. `mem:conventions`).

## server.cjs — публичные/auth
- GET `/employees` — **—** → массив fullname активных сотрудников. ⚠ без auth.
- POST `/login` — публ. {username,password,deviceKey} → ставит cookie token; для seller
  фиксирует смену (shifts), апсерт sessions. {success,message,store,role}.
- POST `/logout` — публ. → чистит cookie token.
- GET `/check-auth` — CA → {success,user}.

## server.cjs — payroll (P = admin+accountant)
- POST `/upload-revenue-file` — P, multipart file+date → парсит XLSX, upsert daily_revenue.
- POST `/calculate-payroll` — P, {date,...} → дневной расчёт по сменам, пишет payroll_calculations.
- POST `/payroll/adjustments` — P, {employee_id,month,year,manual_bonus,penalty,shortage,reasons}
  → бэкап в monthly_adjustments_backup, upsert monthly_adjustments, financial_logs.
- POST `/get-monthly-data` — P, {year,month} → агрегированные данные месяца.
- POST `/calculate-advance` — P, {year,month,advanceEndDate} → расчёт аванса (см. business_logic §4).
- POST `/fix-advance-payment` — P → фиксация аванса в payroll_payments / final_payroll_calculations.
- POST `/cancel-advance-payment` — P → отмена аванса (is_cancelled), бэкапы.
- POST `/fix-manual-advances` — P → правка ручных авансов.
- POST `/check-new-employees` — P → выявление новых сотрудников за период.
- POST `/process-new-employees-advances` — P → обработка авансов новых сотрудников.
- POST `/adjust-advance-manually` — P → ручная корректировка аванса.
- GET `/advance-adjustments-history` — P → история ручных корректировок аванса.
- POST `/calculate-final-payroll` — P, {year,month,reportEndDate} → ОКОНЧАТЕЛЬНЫЙ расчёт
  (withLock), upsert final_payroll_calculations, financial_logs. См. business_logic §5.
- POST `/adjust-final-payment` — P → правка распределения остатка карта/наличные
  (is_remainder_adjusted), бэкап final_*_backup.
- GET `/get-shortages` — P → список недостач (employee_shortages).
- POST `/add-shortage` — P → добавить недостачу (employee_shortages + monthly_adjustments).
- DELETE `/remove-shortage/:id` — P → удалить недостачу.
- POST `/get-employee-full-data` — P → полные данные сотрудника за период.
- POST `/save-universal-corrections` — P (стр.~2349, основной) → массовые корректировки.
- POST `/save-universal-corrections` — **—** (стр.~2408, ДУБЛЬ без auth, затенён). ⚠
- POST `/fix-universal-calculations` — P → правка/пересчёт.
- POST `/validate-all-calculations` — P → сверка всех расчётов месяца.
- POST `/backup-payroll-state` — P → бэкап в final_payroll_calculations_backup.
- POST `/restore-from-backup` — P → восстановление из бэкапа.
- POST `/autosave-table-state` — P → table_state_snapshots.
- POST `/create-backup` — P → создать бэкап.

## server.cjs — ФОТ / опасные (F = только admin)
- POST `/get-fot-report` — F, {startDate,endDate}→ buildFotReport, по магазинам + summary.
- POST `/export-fot-report` — F → экспорт ФОТ в XLSX.
- POST `/clear-transactional-data` — F → ⚠ УДАЛЯЕТ payroll_calculations, shifts,
  daily_revenue, monthly_adjustments.

## server.cjs — лимиты карт
- GET `/api/card-limit-types` — P → список типов лимитов.
- GET `/api/employees-with-limits` — **CA без роли** ⚠ → сотрудники с их лимитами.
- POST `/api/update-employee-card-limit` — P → сменить тип лимита сотруднику + card_limit_changes.
- POST `/api/bulk-update-card-limits` — P → массовая смена лимитов.
- GET `/api/card-limit-history/:employee_id` — P → история лимитов сотрудника.
- GET `/api/get-employee-card-limit/:employee_id` — **CA без роли** ⚠ → текущий лимит.
- POST `/api/get-employee-full-data` — P → полные данные (api-версия).
- POST `/api/save-universal-corrections` — P → корректировки (api-версия).
- POST `/api/update-card-limit-types` — admin+accountant → правка типов + history.
- GET `/api/card-limit-types-history` — admin+accountant → история типов.
- POST `/api/rollback-card-limit-type` — admin+accountant → откат типа.
- POST `/api/add-card-limit-type` — admin+accountant → новый тип.
- DELETE `/api/delete-card-limit-type/:id` — admin+accountant → удалить тип.

## server.cjs — детали (V = admin+accountant+curator)
- GET `/api/get-employees-list` — V → список сотрудников.
- POST `/api/get-calculation-details` — V → детализация расчёта.
- POST `/api/export-calculation-details` — V → экспорт деталей в XLSX.

## routes/lookup.js (checkAuthCookie; requireAdmin=admin/accountant/curator)
- GET `/lookup` — CA, ?barcode&store_address → BigQuery: цвет(green/orange/blue/yellow),
  цена/остаток (учитывает store_address_aliases).
- GET `/me-with-store` — CA → кто я и магазин на сегодня (substitution→shift→permanent→office).
- POST `/returns` — CA, {items[],notes} → RPC generate_return_number, insert returns + return_items.
- GET `/search-product` — CA, ?q&store_address → BigQuery поиск товара по названию.
- GET `/returns` — CA+requireAdmin, фильтры → список возвратов с позициями (limit 500).
- GET `/returns/summary` — CA+requireAdmin, ?group_by=supplier|sku|store → агрегаты.
- POST `/returns/:id/archive` — CA+requireAdmin → архивировать возврат.
- GET `/stores` — CA+requireAdmin → активные магазины.
