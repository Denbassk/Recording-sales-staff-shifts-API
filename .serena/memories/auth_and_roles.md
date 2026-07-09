# mem:auth_and_roles

## Механизм
- JWT в **httpOnly cookie `token`**. Подпись `process.env.JWT_SECRET`, `expiresIn: '8h'`.
  Payload: `{ id, role }`. Cookie maxAge = 7 дней (⚠ рассинхрон с TTL токена 8ч).
- Cookie флаги: `httpOnly: true`, `secure` = только в production (`NODE_ENV==='production'`),
  `sameSite` = 'strict' в prod, 'lax' иначе.
- Логин `POST /login`: поиск по `employees` где `password === password` (⚠ открытый
  пароль!) и `active=true`, затем точное сравнение имени с нормализацией ё→е.
  Для seller определяется магазин (deviceKey → devices, либо employee_store, либо
  "Старший продавец" для id `SProd*`) и фиксируется смена в `shifts` (1 раз в день).
- `checkAuth` (server.cjs): проверяет cookie, кладёт `req.user`, апсертит `sessions`.
- `checkRole(roles)` (server.cjs): 403 если `req.user.role` не входит в `roles`.
- `routes/lookup.js` ИМЕЕТ ОТДЕЛЬНЫЕ middleware: `checkAuthCookie` (аналог checkAuth, но
  БЕЗ записи в sessions) и `requireAdmin` (роли admin/accountant/curator). Дублирование —
  см. `mem:known_issues_and_tech_debt`.

## Роли
- **seller** — продавец: только свои смены и возвраты своего магазина. НЕ должен иметь
  доступа к payroll/ФОТ/лимитам.
- **admin** — полный доступ, включая ФОТ и очистку данных.
- **accountant** — расчёт зарплаты/аванса/корректировок (payroll), без ФОТ-эксклюзива.
- **curator** — только просмотр деталей расчётов (`canViewDetails`) и админ-возвраты.

## Группы доступа (server.cjs)
- `canManagePayroll = checkRole(['admin','accountant'])`
- `canManageFot = checkRole(['admin'])`
- `canViewDetails = checkRole(['admin','accountant','curator'])`
- В lookup.js `requireAdmin = ['admin','accountant','curator']`.

## МАТРИЦА ДОСТУПА (метод → путь → требуемая роль)
### Публичные / только checkAuth (⚠ потенциальные дыры)
- `GET /employees` — **БЕЗ checkAuth** (отдаёт fullname всех активных). ДЫРА.
- `POST /login`, `POST /logout` — публичные (по дизайну).
- `GET /check-auth` — только checkAuth.
- `GET /api/employees-with-limits` — checkAuth, БЕЗ роли. ДЫРА (seller увидит лимиты).
- `GET /api/get-employee-card-limit/:employee_id` — checkAuth, БЕЗ роли. ДЫРА.
- `POST /save-universal-corrections` — ДУБЛЬ на строке ~2408 БЕЗ checkAuth (затенён
  первым роутом со строки ~2349, но это бомба замедленного действия). ДЫРА.

### admin+accountant (canManagePayroll)
upload-revenue-file, calculate-payroll, payroll/adjustments, get-monthly-data,
calculate-advance, fix-advance-payment, cancel-advance-payment, fix-manual-advances,
check-new-employees, process-new-employees-advances, adjust-advance-manually,
advance-adjustments-history(GET), calculate-final-payroll, adjust-final-payment,
get-shortages(GET), add-shortage, remove-shortage/:id(DELETE), get-employee-full-data,
save-universal-corrections (основной, стр.2349), fix-universal-calculations,
validate-all-calculations, api/card-limit-types(GET), api/update-employee-card-limit,
api/bulk-update-card-limits, api/card-limit-history/:employee_id(GET),
api/get-employee-full-data, api/save-universal-corrections, backup-payroll-state,
restore-from-backup, autosave-table-state, create-backup,
api/update-card-limit-types, api/card-limit-types-history(GET),
api/rollback-card-limit-type, api/add-card-limit-type, api/delete-card-limit-type/:id(DELETE).

### только admin (canManageFot)
get-fot-report, export-fot-report, clear-transactional-data.

### admin+accountant+curator (canViewDetails)
api/get-employees-list(GET), api/get-calculation-details, api/export-calculation-details.

### lookup.js (checkAuthCookie [+ requireAdmin где указано])
- `GET /lookup` — любой авторизованный (продавец сканирует штрихкод).
- `GET /me-with-store` — любой авторизованный.
- `POST /returns` — любой авторизованный (продавец создаёт возврат).
- `GET /search-product` — любой авторизованный.
- `GET /returns`, `GET /returns/summary`, `POST /returns/:id/archive`, `GET /stores`
  — checkAuthCookie + requireAdmin (admin/accountant/curator).
