# mem:core — Family Market / Shifts API

## Назначение
Финансовое приложение для розничной сети «Family Market»: учёт смен продавцов,
автоматический расчёт зарплаты/аванса/ФОТ, учёт возвратов товара и поиск товара
по штрихкоду через BigQuery. Деньги людей — цена ошибки высокая, относиться к
расчётам и авторизации с максимальной осторожностью.

## Карта памяти (читать по необходимости)
- `mem:architecture` — стек, файлы, точки входа, клиент↔сервер.
- `mem:business_logic` — ФОРМУЛЫ (зарплата, бонус, ФОТ, аванс, лимиты, остаток). Главное.
- `mem:payroll_new_rules_2026` — НОВЫЕ правила ЗП с 16.07.2026 (плавающая ставка, % от кассы
  минус ДЛ Солюшн, доп.бонусы кулинария/пакеты/кофе). Рефакторинг в работе — читать вместе с business_logic.
- `mem:database_schema` — таблицы Supabase и связи.
- `mem:auth_and_roles` — JWT, роли, матрица доступа.
- `mem:financial_safety` — withLock, financial_logs, валидации, лимиты констант.
- `mem:api_endpoints` — полный список эндпоинтов.
- `mem:known_issues_and_tech_debt` — техдолг и риски (читать перед рефакторингом).
- `mem:conventions` — стиль кода и формат ответов.
- `mem:gotchas` — грабли (даты, NULL, fallback лимитов, ё/е, дубли роутов).
- `mem:maintenance_checklist` — что проверять перед коммитом в расчёты.

## ГЛАВНЫЕ ИНВАРИАНТЫ (не нарушать)
1. **Ни один эндпоинт не должен пропускать `checkAuth` + `checkRole`.**
   Уже есть нарушения (см. `mem:known_issues_and_tech_debt`): `/employees` без auth;
   `/api/employees-with-limits`, `/api/get-employee-card-limit/:id` без проверки роли;
   дубль `POST /save-universal-corrections` без auth (строка ~2408).
2. **`SUPABASE_SERVICE_ROLE_KEY` обходит RLS Postgres.** Сервер — единственный страж
   доступа к данным. Любая дыра в роутере = прямой доступ ко всем строкам всех таблиц.
3. **Любой расчёт/изменение денег должен логироваться в `financial_logs`** через
   `logFinancialOperation(operation, data, userId)`. Сейчас логируется не везде — при
   добавлении/правке финансовых операций ОБЯЗАТЕЛЬНО добавить лог.
4. **Финансовые операции с конкурентным доступом оборачивать в `withLock(key, fn)`**
   (например, `calculate-final-payroll`).
5. **Ручные корректировки (`is_manual_adjustment`, `is_fixed`, `is_remainder_adjusted`,
   `is_termination`) при пересчёте НЕ перезатирать автоматикой.**

## Контекст проекта
Прод: `shifts-api.fly.dev` (Fly.io), CI/CD GitHub Actions. БД: Supabase Postgres +
Google BigQuery (`family-market-analytics.returns_system`). Документация — `PROJECT_MEMORY/`.
