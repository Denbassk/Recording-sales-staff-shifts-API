# mem:architecture

## Стек
- **Backend:** Node.js + Express, CommonJS (`require`/`module.exports`). Точка входа `server.cjs`.
- **БД:** Supabase (PostgreSQL) через `@supabase/supabase-js` v2, клиент создаётся с
  `SUPABASE_SERVICE_ROLE_KEY` (обходит RLS).
- **Аналитика/склад/возвраты:** Google BigQuery `@google-cloud/bigquery`, проект
  `family-market-analytics`, датасет `returns_system` (таблицы `stock_current`,
  `barcode_catalog`). Локация запросов `EU`. Креды — `process.env.GCP_SA_KEY` (JSON).
- **Фронтенд:** vanilla HTML/CSS/JS из папки `public/` (раздаётся `express.static`).
- **Деплой:** Fly.io (`fly.toml`, `Dockerfile`), CI/CD GitHub Actions (`.github/`).

## Ключевые файлы
- `server.cjs` — ~4150 строк, МОНОЛИТ: весь payroll/смены/ФОТ/лимиты карт/бэкапы.
- `routes/lookup.js` — Express Router: возвраты (`/returns*`), поиск товара
  (`/lookup`, `/search-product`), `/me-with-store`, `/stores`. Свой BigQuery-клиент
  и СВОИ middleware (`checkAuthCookie`, `requireAdmin`) — НЕ те же, что в server.cjs.
- `public/payroll.html` + `payroll.js` — интерфейс расчёта зарплаты (админ/бухгалтер).
- `public/returns.html` + `returns.js` — интерфейс продавца (сканирование возвратов).
- `public/admin-returns.html` + `admin-returns.js` — админ-интерфейс возвратов.
- `public/card-limits.js`, `universal-corrections.js` — модули админки.
- `public/index.html` + `script.js` — экран логина.
- `scripts/backup-returns.js` — еженедельный бэкап (Google Drive, см. CLAUDE.md).

## Точки входа / порядок middleware (server.cjs верх)
1. `app.use('/script.js', ...)` — отключение кэша для файла логина.
2. `cors({ origin: true, credentials: true })` — отражает Origin, разрешает cookie.
3. `bodyParser.json()`, `cookieParser()`.
4. `express.static('public')`.
5. `app.use('/', require('./routes/lookup'))` — роутер возвратов подключён на корень.
6. Дальше — определения хелперов, middleware auth, эндпоинты.
- Сервер слушает `PORT`/`HOST` (env). Загрузка файлов — `multer` memoryStorage.

## Клиент ↔ сервер
- Аутентификация: JWT в httpOnly-cookie `token` (см. `mem:auth_and_roles`).
- Фронт шлёт `fetch` с `credentials: 'include'`; ответы в форме `{ success, ... }`.
- Загрузка выручки — multipart (`upload.single('file')`), парсинг XLSX (`xlsx`).
- Поиск товара/возвраты идут в BigQuery; зарплата/смены — в Supabase.

## Дубликаты/мусор в репо (НЕ трогать как актуальный код)
`server_backup_*.cjs`, `server_original.cjs`, `server_working.cjs`,
`public/payroll_backup*.js`, `script_backup.js` и т.п. — старые копии. Актуальны
только `server.cjs` и `public/payroll.js`.
