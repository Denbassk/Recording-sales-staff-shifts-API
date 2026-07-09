# STATE.md — Recording Sales Staff Shifts API

**Последнее обновление:** 2 мая 2026  
**Репозиторий:** https://github.com/Denbassk/Recording-sales-staff-shifts-API  
**Production URL:** https://shifts-api.fly.dev  
**Хостинг:** Fly.io (app: `shifts-api`)  
**БД:** Supabase (`pdiminbulbzlywvnowta.supabase.co`)  
**Аналитика:** BigQuery (`family-market-analytics.returns_system`)  
**Локальная папка проекта:** `D:\Shifts-api\Shifts-api`

---

## 1. Назначение проекта

Веб-приложение для учёта смен продавцов, выручки магазинов, возвратов и расчёта зарплаты. Используется внутри сети магазинов "Family Market".

**Основные модули:**
- Авторизация сотрудников (JWT в cookie).
- Учёт смен продавцов (открытие/закрытие смены, кассовые операции).
- Загрузка дневной выручки из Excel-файлов (cash register).
- Учёт возвратов товаров с архивацией и экспортом.
- Lookup штрихкодов через BigQuery (каталог из выгрузок 1С).
- Админ-панель для отчётов и управления.
- Расчёт зарплаты с учётом авансов, штрафов, недостач, бонусов.
- Автоматический еженедельный бекап возвратов в Google Drive.

---

## 2. Технологический стек

**Backend:**
- Node.js 20, Express
- `@supabase/supabase-js` — клиент Supabase
- `@google-cloud/bigquery` — lookup ШК
- `exceljs` — генерация XLSX
- `googleapis` — интеграция с Google Drive
- `xlsx` — парсинг входящих Excel-файлов
- JWT-аутентификация через `jsonwebtoken`, cookies через `cookie-parser`

**Frontend:**
- Чистый HTML/CSS/JS (без фреймворков)
- ExcelJS на клиенте для экспорта

**БД (Supabase / PostgreSQL):**
- `users` — сотрудники
- `stores` — магазины (id, address, ...)
- `store_address_aliases` — старые/новые названия магазинов с периодом действия (`valid_from`, `valid_to`)
- `daily_revenue` — выручка по дням (UNIQUE на `(store_id, revenue_date)`)
- `returns` — возвраты
- `return_items` — позиции возвратов
- `shifts`, `cash_operations`, `salary_*` — смены и зарплатная логика

**Аналитика и lookup:**
- BigQuery (`family-market-analytics.returns_system.stock_current` и `barcode_catalog`)
- Локальный Python-скрипт `upload_stock.py` для заливки выгрузок из 1С

**Деплой:**
- Production: Fly.io (`fly deploy --app shifts-api`)
- CI: GitHub Actions (`.github/workflows/fly-deploy.yml`)

---

## 3. Структура файлов

### Основной проект (Git)

```
D:\Shifts-api\Shifts-api\
├── server.cjs                  # Главный сервер (Express, все роуты)
├── routes/
│   └── lookup.js               # Lookup-роутер (поиск сотрудников/магазинов/ШК)
├── scripts/
│   └── backup-returns.js       # Standalone скрипт еженедельного бекапа
├── .github/workflows/
│   ├── fly-deploy.yml          # Авто-деплой на Fly при push в main
│   └── backup-returns.yml      # Еженедельный бекап (вс 23:30 Киев)
├── public/                     # Статика (HTML, CSS, JS, изображения)
│   ├── admin-returns.html
│   ├── returns.html
│   ├── script.js
│   └── ...
├── package.json
├── fly.toml
└── STATE.md                    # этот файл
```

### Локальные инструменты (НЕ в Git)

```
D:\Shifts-api\
├── upload_stock.py                                       # загрузка остатков в BigQuery
└── credentials/
    └── family-market-analytics-23fbcbcee571c.json        # ключ service account
```

⚠️ Папка `credentials/` и `upload_stock.py` лежат **снаружи Git-проекта** и не должны попасть в репозиторий. Проверить `.gitignore`.

---

## 4. Переменные окружения

### Fly.io secrets (production сервер)

| Имя | Назначение |
|---|---|
| `SUPABASE_URL` | URL проекта Supabase |
| `SUPABASE_ANON_KEY` | Публичный ключ Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role ключ (полный доступ) |
| `JWT_SECRET` | Подпись JWT-токенов |
| `PORT` | 3000 |
| `NODE_ENV` | production |
| `GCP_SA_KEY` | JSON service account (для BigQuery lookup ШК) |

Просмотр: `fly secrets list --app shifts-api`  
Установка: `fly secrets set KEY="value" --app shifts-api`

### GitHub Actions secrets (для бекапа)

| Имя | Назначение |
|---|---|
| `SUPABASE_URL` | Тот же что в Fly |
| `SUPABASE_SERVICE_ROLE_KEY` | Тот же что в Fly |
| `GOOGLE_CLIENT_ID` | OAuth Client ID (Web app `backup-script-web`) |
| `GOOGLE_CLIENT_SECRET` | OAuth Client secret |
| `GOOGLE_REFRESH_TOKEN` | Refresh token владельца папки `femelimarket6@gmail.com` |
| `DRIVE_BACKUP_FOLDER_ID` | `1qnNKBm35wA_TPTuGd0HcSyz9r1ieDdg2` |

Управление: https://github.com/Denbassk/recording-sales-staff-shifts-API/settings/secrets/actions

---

## 5. Этапы (статус)

| Этап | Описание | Статус |
|---|---|---|
| 1–9 | Базовый функционал (авторизация, смены, выручка, зарплата) | ✅ Готово |
| 10 | Возвраты (CRUD, нумерация, архив) | ✅ Готово |
| 10.5 | Help-modal на странице `returns.html` | ✅ Готово |
| 11 | Еженедельный бекап возвратов в Google Drive | ✅ Готово (2 мая 2026) |
| — | Очистка тестовых данных в Supabase | ✅ Готово (2 мая 2026) |
| 7 | Админ-панель: фильтры, сводка, архивирование, экспорт, автообновление | ⏳ В работе |
| — | Проверка корректности нумерации возвратов | ⏳ TODO |
| — | Автоматизация `upload_stock.py` | ⏳ TODO |

---

## 6. Ключевые бизнес-константы

```js
const COMPANY_TAX_RATE = 0.22;
const MAX_MANUAL_BONUS = 10000;
const MAX_PENALTY = 5000;
const MAX_SHORTAGE = 10000;
const MIN_YEAR = 2024;

// Лимиты карт (примеры)
// STANDARD: cardLimit 8700, maxAdvance 7900, advancePercentage 0.9
// PREMIUM:  cardLimit 16000, maxAdvance 11500
```

---

## 7. Схема алиасов магазинов (важно!)

Магазин может менять название/адрес со временем. Чтобы выручка из старых Excel-файлов корректно матчилась, используется таблица `store_address_aliases`.

**Структура:**

```sql
CREATE TABLE store_address_aliases (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES stores(id),
  alias_address TEXT,
  valid_from DATE,
  valid_to DATE,
  CONSTRAINT uniq_store_alias UNIQUE (store_id, alias_address)
);
```

**Пример (store_id = 38):**

| alias_address | valid_from | valid_to |
|---|---|---|
| Полевая 83 | NULL | 2026-04-30 |
| Полевая-магазин | 2026-05-01 | NULL |
| Полевая-Магазин | 2026-05-01 | NULL |

**Логика поиска (в `server.cjs`, эндпоинт `/upload-revenue-file`):**

1. Прямой матч по `stores.address`.
2. Если не найдено — поиск в `store_address_aliases` с учётом `valid_from`/`valid_to`.
3. Адреса нормализуются: `trim()` + замена `\u00A0` на пробел + замена тире `‑–—` на `-`.

**Важно:** при добавлении алиасов следить, чтобы периоды действия не пересекались для одного `store_id`, иначе при upsert в `daily_revenue` возникнет ошибка `ON CONFLICT DO UPDATE command cannot affect row a second time`.

---

## 8. Бекап возвратов в Google Drive (Этап 11)

### Архитектура

- Скрипт `scripts/backup-returns.js` запускается через GitHub Actions.
- НЕ работает на Fly.io сервере — отдельный процесс, не влияет на production.

### Расписание

- Cron в `.github/workflows/backup-returns.yml`: `30 20 * * 0` = **воскресенье 20:30 UTC = 23:30 Киев**.
- Ручной запуск: GitHub Actions → Weekly Returns Backup → Run workflow.

### Авторизация

- **OAuth refresh token** от аккаунта `femelimarket6@gmail.com` (владелец папки).
- Service account `promo-analysis@family-market-analytics.iam.gserviceaccount.com` НЕ используется для Drive (нет storage quota в обычном Gmail). Но используется для BigQuery (см. раздел 9).
- OAuth client: `backup-script-web` (Web application) в проекте `family-market-analytics`.
- OAuth consent screen: **In production** (refresh_token не истекает через 7 дней).
- Authorized redirect URI: `https://developers.google.com/oauthplayground`

### Хранение

- Папка Drive: **БЭКАПЫ Возвраты по магазинам** (ID: `1qnNKBm35wA_TPTuGd0HcSyz9r1ieDdg2`).
- Хранится **10 последних копий**, старые удаляются автоматически.
- Имя файла: `Возвраты_backup_DD-MM-YYYY.xlsx`.
- Содержимое: 7 листов (Зведення, Возвраты, Позиції, По постачальнику, По магазину, По SKU, Не з бази).

### Проверка работы

1. Зайти на https://github.com/Denbassk/Recording-sales-staff-shifts-API/actions.
2. Открыть последний запуск **Weekly Returns Backup**.
3. В логах должны быть строки:
   ```
   [Backup] Got N returns
   [Backup] Built XLSX: Возвраты_backup_DD-MM-YYYY.xlsx
   [Diag] OAuth access token obtained: YES
   [Backup] Uploaded: ... (id: ...)
   [Backup] Done. Total files in folder: N
   ```
4. Проверить, что файл появился в Drive-папке.

---

## 9. Загрузка остатков склада в BigQuery

### Назначение

Скрипт `upload_stock.py` загружает Excel-файлы "Состояние склада" (выгрузка из 1С) в BigQuery. На основе этих данных в приложении работает **lookup штрихкодов** при оформлении возврата — когда сотрудник сканирует ШК, система подтягивает название товара, себестоимость и розничную цену.

### Расположение

```
D:\Shifts-api\upload_stock.py
D:\Shifts-api\credentials\family-market-analytics-23fbcbcee571c.json
```

⚠️ Скрипт лежит вне основной папки проекта (`D:\Shifts-api\`, а не `D:\Shifts-api\Shifts-api\`) — это локальный инструмент, в Git не коммитится.

### Технологический стек

- Python 3 с `tkinter` (GUI выбор файлов)
- `pandas` + `openpyxl` — чтение XLSX
- `google-cloud-bigquery` + `pyarrow` + `db-dtypes` — заливка в BQ

Установка зависимостей (один раз):
```bash
pip install pandas openpyxl google-cloud-bigquery pyarrow db-dtypes
```

### Куда грузит

- **Project:** `family-market-analytics`
- **Dataset:** `returns_system` (location: EU)
- **Таблицы:**
  - `stock_current` — снимок остатков на момент загрузки. Поля: `barcode`, `product_name`, `qty_in_stock`, `store_address`, `cost_price`, `total_cost`, `retail_price`, `total_retail`, `qty_sold`, `loaded_at`.
  - `barcode_catalog` — накопительный справочник всех штрихкодов с историей. Поля: `barcode`, `product_name`, `first_seen_at`, `last_seen_at`, `last_cost_price`, `last_retail_price`. Обновляется автоматически через MERGE после каждой загрузки.

При первом запуске скрипт сам создаёт датасет и обе таблицы (`ensure_infrastructure`).

### Авторизация

- Service account: `promo-analysis@family-market-analytics.iam.gserviceaccount.com`
- Ключ JSON: `D:\Shifts-api\credentials\family-market-analytics-23fbcbcee571c.json`
- Переменная окружения `GOOGLE_APPLICATION_CREDENTIALS` устанавливается прямо в скрипте.

⚠️ **Не удаляйте этот ключ из Google Cloud** — он используется и тут, и для BigQuery lookup из `server.cjs` (через секрет `GCP_SA_KEY` в Fly).

### Запуск

```powershell
cd D:\Shifts-api
python upload_stock.py
```

### Сценарии работы

После запуска показывается текущая статистика и предлагается выбор:

1. **Новый срез (truncate)** — удаляет всё содержимое `stock_current` и загружает свежие файлы. Используется при еженедельной/ежемесячной полной выгрузке.
2. **Дозагрузка (append)** — добавляет к существующим данным.
3. **Только статистика** — просто показывает что сейчас в БД.

Если таблица пустая — режим автоматически `truncate`.

### Логика чтения Excel

- Открывается окно выбора файлов (Tkinter, можно несколько за раз).
- Скрипт автоматически ищет строку с заголовками в первых 10 строках листа (нужно из-за "шапок" в 1С-отчётах).
- Заголовки маппятся через `COLUMN_MAP` (например `Кол-во на складе` → `qty_in_stock`).
- Читаются все листы файла, объединяются в один DataFrame.
- Фильтруются строки без штрихкода.
- Штрихкоды приводятся к строке и зачищаются от `.0`.

### Что делать, если в файле новые названия колонок

Если в логах видно:
```
📋 Первые 3 строки barcode: [None, None, None]
📋 Строк после фильтрации: 0
```
— значит маппинг не сработал. Откройте файл, посмотрите названия колонок, добавьте новый паттерн в `COLUMN_MAP` в начале скрипта:

```python
COLUMN_MAP = {
    ...
    'новое название': 'barcode',
}
```

Поиск идёт по подстроке в нижнем регистре.

### Как проверить, что данные доехали

В Google Cloud Console: https://console.cloud.google.com/bigquery?project=family-market-analytics

SQL-запрос (в BQ console):
```sql
SELECT store_address, COUNT(*) AS positions, COUNT(DISTINCT barcode) AS unique_skus
FROM `family-market-analytics.returns_system.stock_current`
GROUP BY store_address
ORDER BY store_address;
```

### Связь с приложением

Когда сотрудник на странице `returns.html` сканирует штрихкод, бекенд (`server.cjs` → роут lookup) делает запрос в **`barcode_catalog`** (а не в `stock_current`). Каталог — сводный справочник всех ШК с последней известной ценой. Это удобнее, чем `stock_current`:
- товара может уже не быть на складе, но возврат всё равно нужно оформить;
- не нужно фильтровать по магазину;
- одна запись на один ШК.

`stock_current` используется для аналитики "что сейчас на складе по магазинам".

### Когда запускать

- **После каждой выгрузки остатков из 1С** (обычно раз в неделю).
- В `truncate`-режиме, чтобы `stock_current` отражал актуальную картину.
- `barcode_catalog` обновится автоматически.

### Известные нюансы

1. **Скрипт интерактивный** — требует ввода с клавиатуры. Без модификации в cron не пойдёт.
2. **GUI Tkinter** — на серверах без display не запустится. Только локально.
3. **Service account ключ хранится локально** — при переустановке Windows скопируйте папку `credentials/` или создайте новый ключ в Google Cloud Console: IAM → Service Accounts → `promo-analysis@...` → Keys → Add Key → JSON.

---

## 10. Известные проблемы и их решения

### 10.1. Выручка магазина = 0.00 после переименования

**Симптом:** в `daily_revenue` записан 0.00 для дня, хотя касса была сдана.

**Причина:** название магазина в Excel-файле не совпадает с `stores.address` И отсутствует в `store_address_aliases`. Чаще всего — разница в регистре букв или в типе тире.

**Решение:**

```sql
-- Посмотреть существующие алиасы
SELECT * FROM store_address_aliases WHERE store_id = <ID> ORDER BY valid_from NULLS FIRST;

-- Добавить новый алиас
INSERT INTO store_address_aliases (store_id, alias_address, valid_from, valid_to)
VALUES (<ID>, '<точное_название_из_Excel>', '<дата_с>', NULL);

-- Перезалить кассу за нужный день
```

После добавления алиаса значение в `daily_revenue` обновится при повторной загрузке (UPSERT по `store_id, revenue_date`).

### 10.2. Ошибка `ON CONFLICT DO UPDATE command cannot affect row a second time`

**Симптом:** загрузка кассы падает с этой ошибкой.

**Причина:** в `store_address_aliases` для одного `store_id` есть несколько активных алиасов с пересекающимися периодами `valid_from`/`valid_to`, и оба матчатся в одном файле → две строки upsert на один `(store_id, revenue_date)`.

**Решение:**

```sql
-- Найти пересекающиеся алиасы
SELECT store_id, alias_address, valid_from, valid_to
FROM store_address_aliases
WHERE store_id = <ID>
ORDER BY valid_from NULLS FIRST;

-- Ограничить старый алиас датой
UPDATE store_address_aliases
SET valid_to = '<дата_окончания>'
WHERE store_id = <ID> AND alias_address = '<старое_название>';

-- ИЛИ удалить лишний алиас
DELETE FROM store_address_aliases
WHERE store_id = <ID> AND alias_address = '<лишнее_название>';
```

### 10.3. Сервер не стартует на Fly.io ("instance refused connection")

**Симптом:** `fly deploy` проходит, но сайт не открывается, в логах прокси:  
`error.message="instance refused connection. is your app listening on 0.0.0.0:3000?"`

**Причины и проверки:**

1. **Crash при старте сервера** — `node server.cjs` падает до `app.listen()`.
   ```bash
   fly logs --app shifts-api
   ```
   Искать строки `Error`, `throw`, `at Object.<anonymous>` выше `> node server.cjs`.

2. **Отсутствуют npm-пакеты** — добавили `require()`, но не сделали `npm install --save`.
   ```bash
   cat package.json
   npm install <package> --save
   git add package.json package-lock.json
   git commit -m "Add missing dependency"
   git push
   ```

3. **Синтаксическая ошибка:**
   ```powershell
   cd D:\Shifts-api\Shifts-api
   node -c server.cjs
   node -c routes/lookup.js
   ```

4. **Откат последнего деплоя (если нужно срочно):**
   ```powershell
   cd D:\Shifts-api\Shifts-api
   git log --oneline -5
   git revert HEAD --no-edit
   git push
   fly deploy --app shifts-api
   ```

5. **Проверка работы production:**
   ```powershell
   Invoke-WebRequest -Uri https://shifts-api.fly.dev/ -Method Head
   ```
   Должен вернуться `200 OK` или `302`.

### 10.4. Бекап падает с `Service Accounts do not have storage quota`

**Симптом:** в логах GitHub Actions при запуске backup workflow.

**Причина:** код использует service account для загрузки в обычный Gmail Drive, что Google запрещает с 2021 года.

**Решение:** переключить авторизацию на OAuth refresh token (УЖЕ СДЕЛАНО). Если случайно вернётся к service account — см. функцию `getDrive()` в `scripts/backup-returns.js`, она должна использовать `OAuth2` + `setCredentials({ refresh_token })`, а НЕ `GoogleAuth({ credentials })`.

### 10.5. Бекап падает с `invalid_grant` или `Token has been expired or revoked`

**Симптом:** в логах GitHub Actions при попытке получить access_token.

**Причины:**
- Сменился пароль `femelimarket6@gmail.com`.
- Доступ отозван в https://myaccount.google.com/permissions.
- OAuth consent screen вернули в Testing.

**Решение — перегенерировать refresh_token:**

1. Открыть https://developers.google.com/oauthplayground/
2. Шестерёнка ⚙️ → ✅ Use your own OAuth credentials → вставить `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET`.
3. В Step 1 → Input your own scopes → `https://www.googleapis.com/auth/drive` → Authorize APIs.
4. Войти как `femelimarket6@gmail.com`, дать разрешение.
5. Step 2 → Exchange authorization code for tokens → скопировать `refresh_token`.
6. На GitHub: Settings → Secrets → `GOOGLE_REFRESH_TOKEN` → Update → вставить новое значение.
7. Запустить workflow вручную, проверить.

### 10.6. Ошибка `redirect_uri_mismatch` в OAuth Playground

**Причины:**
1. В OAuth client тип **Desktop app** вместо **Web application** — у Desktop нет поля Authorized redirect URIs.
2. В Authorized redirect URIs не добавлен `https://developers.google.com/oauthplayground` (без слэша на конце).
3. Галочка "Use your own OAuth credentials" в шестерёнке Playground не включена → подставляется дефолтный client_id.

**Решение:**

- Проверить в https://console.cloud.google.com/apis/credentials, что `backup-script-web` имеет тип **Web application**.
- Добавить redirect URI: `https://developers.google.com/oauthplayground`.
- Подождать 1–5 минут после Save.
- В Playground убедиться, что в адресной строке после Authorize APIs стоит **ваш** `client_id`.

### 10.7. Lookup штрихкода в `returns.html` ничего не находит

**Симптом:** при сканировании ШК товар не подтягивается, статус "не з бази" (yellow).

**Причины и решения:**

1. **ШК ещё не загружен в `barcode_catalog`** — товар никогда не был в выгрузках 1С. Решение: ничего не делать, `lookup_status: yellow` — нормальная ситуация для редких/новых товаров. Сотрудник вводит название и цену вручную.

2. **`barcode_catalog` пуст или устарел** — давно не запускали `upload_stock.py`. Проверить:
   ```sql
   SELECT COUNT(*) FROM `family-market-analytics.returns_system.barcode_catalog`;
   SELECT MAX(last_seen_at) FROM `family-market-analytics.returns_system.barcode_catalog`;
   ```
   Если пусто или давно — запустить `upload_stock.py`.

3. **На Fly не настроен `GCP_SA_KEY`** — сервер не может ходить в BigQuery. Проверить:
   ```bash
   fly secrets list --app shifts-api | findstr GCP_SA_KEY
   ```
   В логах при попытке lookup будет ошибка `Could not load default credentials`.

### 10.8. `upload_stock.py` загружает 0 строк

**Симптом:** в выводе скрипта:
```
📋 Первые 3 строки barcode: [None, None, None]
📋 Строк после фильтрации: 0
```

**Причина:** заголовки в Excel-файле не маппятся на стандартные имена.

**Решение:** открыть файл, посмотреть точные названия колонок, добавить в `COLUMN_MAP` в `upload_stock.py`:

```python
COLUMN_MAP = {
    ...
    'новый_заголовок': 'barcode',
    'другое_название': 'qty_in_stock',
}
```

### 10.9. Возвраты выгружаются неправильно (нумерация)

**Статус:** требует проверки.

**Что проверить:**

```sql
-- Дубликаты номеров
SELECT return_number, COUNT(*)
FROM returns
WHERE status != 'archived'
GROUP BY return_number
HAVING COUNT(*) > 1;

-- Все номера за конкретный день
SELECT return_number FROM returns
WHERE created_at::date = '2026-05-02'
ORDER BY return_number;
```

**Известный факт:** были случаи пропусков в нумерации (`RET-260501-001`, `RET-260501-003` без `002`). Скорее всего, удалили промежуточный возврат, а счётчик считается по `MAX(NNN)+1` по дню — пропуск остаётся. Если для бухгалтерии нужна строгая последовательность — нужно править логику в `server.cjs`.

### 10.10. Браузерные ошибки от расширений (Zotero, SingleFile и т.п.)

**Симптом:** в DevTools Console куча красных строк типа `Identifier 'X' has already been declared` от файлов `zotero_config.js`, `inject.js`, `singlefile.js`.

**Причина:** ошибки браузерных расширений, к приложению отношения не имеют.

**Решение:** игнорировать. Для чистой проверки открывать сайт в режиме инкогнито (Ctrl+Shift+N).

### 10.11. Заблокированные запросы `play.google.com/log`

**Причина:** AdBlock блокирует телеметрию Google. К приложению отношения не имеет.

**Решение:** игнорировать.

---

## 11. Типовые операции

### Деплой нового кода на Fly

```powershell
cd D:\Shifts-api\Shifts-api
node -c server.cjs                    # синтаксис-чек
git add <files>
git commit -m "<message>"
git push                              # триггерит fly-deploy.yml автоматически
# ИЛИ вручную:
fly deploy --app shifts-api
```

После деплоя проверить:
```powershell
Invoke-WebRequest -Uri https://shifts-api.fly.dev/ -Method Head   # должен 200
fly logs --app shifts-api                                          # ищем "Server is running on http://0.0.0.0:3000"
```

### Откат

```powershell
cd D:\Shifts-api\Shifts-api
git log --oneline -5                  # найти стабильный коммит
git revert HEAD --no-edit             # или git revert <hash> --no-edit
git push
fly deploy --app shifts-api
```

### Запуск бекапа возвратов вручную

1. https://github.com/Denbassk/Recording-sales-staff-shifts-API/actions
2. Слева → **Weekly Returns Backup** → справа **Run workflow** → **Run workflow**.
3. Подождать 30–60 секунд.
4. Проверить логи (зелёная галочка) и папку Drive.

### Загрузка остатков в BigQuery

```powershell
cd D:\Shifts-api
python upload_stock.py
# выбрать файлы в окне → выбрать режим (1=truncate, 2=append) → готово
```

### Просмотр Fly secrets

```powershell
fly secrets list --app shifts-api
fly secrets set KEY="value" --app shifts-api
fly secrets unset KEY --app shifts-api
```

### Проверка Supabase данных

```sql
-- Выручка магазина 38
SELECT revenue_date, revenue, updated_at
FROM daily_revenue
WHERE store_id = 38
ORDER BY revenue_date DESC LIMIT 10;

-- Все возвраты за месяц
SELECT return_number, store_address, total_cost, status, created_at
FROM returns
WHERE created_at >= '2026-05-01'
ORDER BY created_at DESC;
```

### Проверка BigQuery

```sql
-- Размер каталога
SELECT COUNT(*) AS total_skus,
       MAX(last_seen_at) AS latest_update
FROM `family-market-analytics.returns_system.barcode_catalog`;

-- Остатки по магазинам
SELECT store_address, COUNT(*) AS positions
FROM `family-market-analytics.returns_system.stock_current`
GROUP BY store_address ORDER BY store_address;
```

---

## 12. Важные ссылки

- **Production:** https://shifts-api.fly.dev/
- **Admin returns:** https://shifts-api.fly.dev/admin-returns.html
- **GitHub:** https://github.com/Denbassk/Recording-sales-staff-shifts-API
- **GitHub Actions:** https://github.com/Denbassk/Recording-sales-staff-shifts-API/actions
- **GitHub Secrets:** https://github.com/Denbassk/Recording-sales-staff-shifts-API/settings/secrets/actions
- **Supabase Dashboard:** https://supabase.com/dashboard/project/pdiminbulbzlywvnowta
- **Fly Dashboard:** https://fly.io/apps/shifts-api
- **Google Cloud (OAuth):** https://console.cloud.google.com/apis/credentials?project=family-market-analytics
- **Google Cloud (Service Accounts):** https://console.cloud.google.com/iam-admin/serviceaccounts?project=family-market-analytics
- **BigQuery (остатки и каталог ШК):** https://console.cloud.google.com/bigquery?project=family-market-analytics
- **Google Drive (бекапы):** https://drive.google.com/drive/folders/1qnNKBm35wA_TPTuGd0HcSyz9r1ieDdg2
- **OAuth Playground:** https://developers.google.com/oauthplayground/

---

## 13. Контакты и доступы

- **Разработчик:** Denbassk (GitHub)
- **Владелец Drive-папки бекапов:** `femelimarket6@gmail.com` (Фэмэли Маркет)
- **Google Cloud проект:** `family-market-analytics`
- **Service account:** `promo-analysis@family-market-analytics.iam.gserviceaccount.com`
  - Используется для: BigQuery (lookup ШК + загрузка остатков из `upload_stock.py`).
  - НЕ используется для: Drive backup (там OAuth refresh token).

---

## 14. TODO / Roadmap

- [ ] **Этап 7** — доработать админ-панель: фильтры по дате/магазину/постачальнику, сводка по периоду, архивирование возвратов, экспорт XLSX, автообновление каждые N минут.
- [ ] Проверить нумерацию возвратов (см. раздел 10.9).
- [ ] Автоматизировать `upload_stock.py` — сделать неинтерактивную версию для Windows Task Scheduler или перенести в Cloud Run + Cloud Scheduler.
- [ ] Добавить мониторинг — уведомление в Telegram/email при падении бекапа (workflow notify on failure).
- [ ] Документация по расчёту зарплаты (отдельный файл `SALARY_LOGIC.md`).
- [ ] Удалить service account `promo-analysis@...` из шеринга папки Drive-бекапов (опционально, не используется там).

---

## 15. История значимых изменений

| Дата | Что |
|---|---|
| 2026-04-30 | Магазин 38 переименован: "Полевая 83" → "Полевая-Магазин". Добавлены алиасы. |
| 2026-05-01 | Исправлена ошибка `ON CONFLICT` (дубликат алиаса "Полевая-Склад"). Выручка 30.04 = 299 384,17 ✅ |
| 2026-05-01 | Попытка добавить backup-роут в `server.cjs` → откачено (не запускался). |
| 2026-05-02 | Этап 11 завершён: бекап работает через GitHub Actions + OAuth refresh token. Первый успешный файл `Возвраты_backup_02-05-2026.xlsx` в Drive. |
| 2026-05-02 | OAuth consent screen опубликован (In Production). |
| 2026-05-02 | Удалены тестовые возвраты (id 6, 7) и их позиции из Supabase. БД готова к боевому использованию. |

---

*Файл поддерживается вручную. Обновлять при значимых изменениях архитектуры или решении новых проблем.*
# STATE.md — Recording Sales Staff Shifts API

**Последнее обновление:** 04.05.2026
**Репозиторий:** https://github.com/Denbassk/Recording-sales-staff-shifts-API
**Production URL:** https://shifts-api.fly.dev
**Хостинг:** Fly.io (app: `shifts-api`, org: `personal`, region: `otp`)
**Supabase DB:** pdiminbulbzlywvnowta.supabase.co
**Локальная папка:** `D:\Shifts-api\Shifts-api`
**Разработчик:** Denbassk (denbassk@gmail.com)
**Drive folder owner:** femelimarket6@gmail.com

---

## 1. Назначение проекта

Веб-приложение для управления сетью магазинов "Family Market":
- Учёт смен сотрудников (продавцы, старшие продавцы, админы, бухгалтеры, кураторы).
- Загрузка ежедневной выручки магазинов из Excel-файлов.
- Оформление возвратов товара продавцами (со сканером штрих-кода или поиском по названию).
- Расчёт зарплат, бонусов, штрафов, недостач.
- Админ-панель: фильтры, сводки, экспорт XLSX, архивация.
- Еженедельный автоматический бэкап возвратов в Google Drive.

---

## 2. Технологический стек

**Backend:** Node.js 20, Express, jsonwebtoken, cookie-parser, exceljs, xlsx, googleapis, @google-cloud/bigquery, @supabase/supabase-js.

**Frontend:** plain HTML/CSS/JS (без фреймворков), Web Audio API для звуков сканирования.

**Базы данных:**
- **Supabase (Postgres)** — основная БД: employees, stores, store_address_aliases, daily_revenue, shifts, substitutions, employee_store, returns, return_items, devices, salary_*, cash_operations, card_limit_*, advance_manual_adjustments.
- **BigQuery** (`family-market-analytics.returns_system`) — товарный каталог: `stock_current` (текущие остатки по магазинам), `barcode_catalog` (исторический каталог SKU).

**Аутентификация:** JWT в httpOnly cookie. Вход — логин/пароль + опциональный device_key.

**Хостинг и CI/CD:**
- Fly.io (production deploy).
- GitHub Actions (`fly-deploy.yml` — деплой при push в main; `backup-returns.yml` — еженедельный бэкап).

---

## 3. Структура файлов

Copy
D:\Shifts-api\Shifts-api\ (Git-репозиторий) ├── server.cjs Главный сервер Express ├── routes/ │ └── lookup.js /lookup, /search-product, /me-with-store, /returns, /returns/summary, /returns/:id/archive, /stores ├── scripts/ │ └── backup-returns.js Еженедельный бэкап → Google Drive (OAuth) ├── public/ │ ├── index.html, script.js Логин, отметка смены │ ├── returns.html, returns.js, returns.css Страница продавца │ ├── admin-returns.html Админ-панель возвратов │ ├── favicon.svg │ └── ... ├── .github/workflows/ │ ├── fly-deploy.yml Деплой при push в main │ └── backup-returns.yml cron 30 20 * * 0 (Sun 23:30 Kyiv) ├── package.json, package-lock.json ├── fly.toml app=shifts-api, port=3000, region=otp ├── Dockerfile └── STATE.md (этот файл)

D:\Shifts-api\ (вне Git) ├── upload_stock.py Загрузка остатков → BigQuery (Tkinter, ручной запуск) └── credentials/ └── family-market-analytics-23fbcbcee571c.json Service-account ключ для BigQuery (НЕ коммитить)

D:\Shifts-api\Shifts-api\Returns.bat (untracked, локальный) Открывает Chrome на /returns.html с device_key из device.json

Copy
---

## 4. Переменные окружения

### Fly.io secrets (production)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `GCP_SA_KEY` — JSON service-account для BigQuery (НЕ для Drive — Drive переехал на OAuth).
- `PORT=3000`, `NODE_ENV=production`

Управление: `flyctl secrets list -a shifts-api`, `flyctl secrets set KEY=value -a shifts-api`.

### GitHub Actions secrets
- `FLY_API_TOKEN` — токен для деплоя на Fly (см. раздел 12 — может протухать!).
- Для backup-returns.yml: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `DRIVE_BACKUP_FOLDER_ID = 1qnNKBm35wA_TPTuGd0HcSyz9r1ieDdg2`.

---

## 5. Бизнес-константы

```js
const COMPANY_TAX_RATE = 0.22;   // ЕСВ
const MAX_MANUAL_BONUS = 10000;
const MAX_PENALTY = 5000;
const MAX_SHORTAGE = 10000;
const MIN_YEAR = 2024;
6. Аутентификация и device-flow
Роли (employees.role)
seller — продавец (доступ к /returns.html через device).
admin, accountant, curator — офис (без store, доступ к /admin-returns.html).
Логика смены (server.cjs /login)
Найти сотрудника по fullname + password + active=true (с нормализацией ё/е).
Для seller: получить store_id через device_key (из таблицы devices) → employee_store (постоянная привязка) → если ничего, ошибка.
Старшие продавцы (id начинается на SProd) могут работать без device_key → магазин определяется в день смены.
Если за сегодня нет смены в shifts — создать. Если есть — вернуть сообщение «Смена уже зафиксирована».
Выдать JWT в httpOnly cookie (срок жизни долгий — пока пользователь не разлогинится).
Device-authorization flow (КРИТИЧНО для понимания)
device.json рядом с Returns.bat содержит:

Copy{ "device_key": "dev_e40d41637125c0e24f2d43e5bfd3d943" }
Сам по себе device.json НЕ логинит. Это просто параметр, который передаётся в ?device=KEY при открытии главной страницы. Цепочка:

Returns.bat открывает https://shifts-api.fly.dev/returns.html?device=KEY (если у device.json есть ключ) или просто /returns.html (если нет).
Скрипт script.js (на главной странице, НЕ на returns.html!) читает ?device=KEY из URL и сохраняет в localStorage.
Когда продавец вводит логин/пароль — script.js отправляет device_key вместе с формой логина на /login.
Сервер находит магазин по device_key → создаёт смену → выдаёт JWT-cookie.
После этого Returns.bat может открывать /returns.html напрямую — cookie уже есть, страница загрузится.
На рабочих ПК продавцов cookie живёт месяцами, поэтому Returns.bat "просто работает". Но на свежем ПК без cookie /returns.html вернёт 401 — нужно сначала зайти на главную страницу с ?device=KEY и ввести пароль.

Таблица devices
39 записей (по одной на магазин). Поля: id, device_key, store_id, name, active. Магазин 19 (Качановская): dev_e40d41637125c0e24f2d43e5bfd3d943.

Запрос для просмотра:

CopySELECT d.id, d.device_key, d.store_id, s.address, d.name, d.active
FROM devices d LEFT JOIN stores s ON s.id = d.store_id ORDER BY d.id;
7. Алиасы адресов магазинов
Таблица store_address_aliases: store_id, alias_address, valid_from, valid_to.

Используется когда магазин переезжает или меняет название — старые названия из Excel-файлов выручки и BigQuery должны корректно мапиться на текущий store_id.

Пример (store_id=38, Полевая):

alias_address	valid_from	valid_to
Полевая 83	NULL	2026-04-30
Полевая-магазин	2026-05-01	NULL
Полевая-Магазин	2026-05-01	NULL
Логика lookup в /upload-revenue-file и /lookup:

Прямое сравнение с stores.address.
Если не совпало — поиск в store_address_aliases с учётом valid_from <= today <= valid_to.
Нормализация: trim, замена non-breaking spaces, унификация дефисов.
⚠️ Не должно быть пересекающихся периодов для одного store_id — иначе ON CONFLICT DO UPDATE упадёт с ошибкой.

8. Возвраты — продавец (Stage 7.1, 7.2)
Страница /returns.html
Два независимых поля для поиска товара (одинаковый размер):

Сканер штрих-кода — verbose поле, фокус всегда здесь по умолчанию. Сканер эмулирует клавиатуру + Enter. Также можно ввести цифры вручную.
🔍 Пошук за назвою — inline-поле под сканером. Минимум 3 символа, debounce 300мс, до 25 результатов в выпадающем списке прямо под полем.
Цвета результатов поиска (lookup_status)
🟢 green — товар на остатке текущего магазина (с учётом алиасов). Показывается название, себестоимость, остаток.
🟠 orange — товара нет в магазине, но есть в сети. Усреднённая себестоимость, кол-во магазинов сети.
🔵 blue — товар известен системе (из barcode_catalog), но нигде нет на остатках. Последняя зафиксированная цена.
🟡 yellow — товар не найден нигде. Открывается модалка ручного ввода названия и цены.
Модалка количества (Stage 7.1)
После успешного поиска (любой цвет, кроме yellow) открывается модалка:

Название товара, цена, остаток.
Поле «Кількість» с кнопками + / −.
Шаг ввода: 1 для штучных товаров, 0.001 для весовых (штрих-код длиной 13 цифр и начинается на 2).
Кнопки «Скасувати» / «Додати в кошик».
Enter в поле количества = добавление в корзину.
Корзина
Сохраняется в localStorage (восстанавливается после перезагрузки).
Можно менять количество прямо в строке.
Кнопка ✕ удаляет позицию.
При отправке POST /returns создаётся возврат в Supabase: получает номер RET-YYMMDD-NNN через RPC generate_return_number().
Returns.bat
Copy@echo off
chcp 65001 >nul
title Family Market - Повернення
... читает device.json → открывает Chrome с ?device=KEY
Файл лежит на ПК продавца, не в Git (untracked).

9. Возвраты — админ-панель
Страница /admin-returns.html. Доступ для ролей admin, accountant, curator.

Фильтры: период (з / по), магазин, статус (Активні / Архів / Всі), колір (lookup_status), пошук.

Вкладки:

Список повернень — табличный вид всех возвратов с позициями.
Зведення: постачальник / SKU / магазин — агрегированная статистика.
Не з бази — отдельный фильтр для yellow-позиций (требуют донабивания в каталог).
Действия: «В архів» (статус=archived, archived_at=now), «Експорт» (XLSX).

Endpoints (см. routes/lookup.js):

GET /returns — список с фильтрами.
GET /returns/summary?group_by=supplier|sku|store — сводки.
POST /returns/:id/archive — архивация.
GET /stores — список активных магазинов для фильтров.
10. Еженедельный бэкап возвратов
Скрипт: scripts/backup-returns.js Workflow: .github/workflows/backup-returns.yml Расписание: cron 30 20 * * 0 → воскресенье 20:30 UTC = 23:30 Kyiv. Drive folder: "БЭКАПЫ Возвраты по магазинам" (ID 1qnNKBm35wA_TPTuGd0HcSyz9r1ieDdg2). Имена файлов: Возвраты_backup_DD-MM-YYYY.xlsx. Хранится последние 10 копий, остальные удаляются автоматически. Авторизация: OAuth refresh token аккаунта femelimarket6@gmail.com. Токен живёт долго (после publish app → In production), но может протухнуть при смене пароля или revoke.

Ручной запуск: Actions → Weekly Returns Backup → Run workflow.

Если бэкап упал с invalid_grant: значит refresh_token инвалидирован, нужно пересоздать через OAuth Playground (см. историю чата 1-2 мая 2026).

11. Загрузка остатков склада в BigQuery
Скрипт: D:\Shifts-api\upload_stock.py (вне Git!) Зависимости: pip install pandas openpyxl google-cloud-bigquery pyarrow db-dtypes Service-account: promo-analysis@family-market-analytics.iam.gserviceaccount.com, ключ в D:\Shifts-api\credentials\family-market-analytics-23fbcbcee571c.json.

Запуск:

Copycd D:\Shifts-api
python upload_stock.py
Tkinter-диалог → выбор Excel → режим (truncate / append / stats) → загрузка в BigQuery dataset family-market-analytics.returns_system:

stock_current — barcode, product_name, qty_in_stock, store_address, cost_price, total_cost, retail_price, total_retail, qty_sold, loaded_at.
barcode_catalog — barcode, product_name, first_seen_at, last_seen_at, last_cost_price, last_retail_price.
MERGE на каждой загрузке (incremental update).

Маппинг колонок: в скрипте константа COLUMN_MAP (case-insensitive substring). Если в новом Excel колонки названы иначе — править этот словарь.

Используется в: /lookup и /search-product (для поиска по названию). В barcode_catalog обращается lookup для blue-статусов (товар известен, но нет на остатках).

12. ⚠️ КРИТИЧНО: Обновление FLY_API_TOKEN
Симптом: все деплои на Fly падают с ошибкой:

CopyError: no access token available. Please login with 'flyctl auth login'
Причина: токен в GitHub secret FLY_API_TOKEN истёк, удалён или инвалидирован сменой пароля. По умолчанию Fly создаёт токены на 1 год.

⚠️ Особенность аккаунта: в Fly наш аккаунт привязан к организации с SSO, поэтому personal access tokens создавать через веб-интерфейс нельзя — будет ошибка "Access Tokens cannot be created for your account because an organization you are a member of requires SSO".

Решение — создать org-token через flyctl:

Copyflyctl auth login                                    # SSO в браузере
flyctl orgs list                                     # узнать slug организации (у нас 'personal')
flyctl tokens create org personal --name "github-actions-deploy" --expiry 8760h
Параметр --expiry 8760h = 1 год. Можно поставить больше (87600h = 10 лет) или убрать совсем.

Команда выведет в консоль строку, начинающуюся с FlyV1 fm2_.... Скопировать целиком и вставить в GitHub secret FLY_API_TOKEN: https://github.com/Denbassk/Recording-sales-staff-shifts-API/settings/secrets/actions → найти FLY_API_TOKEN → Update value.

После обновления — Re-run упавший workflow или сделать пустой коммит:

Copygit commit --allow-empty -m "Trigger redeploy"
git push
13. ⚠️ Принудительный передеплой (если кеш не обновляется)
Симптом: GitHub Actions показывает зелёный деплой, но в production старая версия файлов (например, кнопка/модалка не появляется после изменений).

Решение — задеплоить локально с --no-cache:

Copycd D:\Shifts-api\Shifts-api
flyctl deploy --remote-only --no-cache
--remote-only = билд на серверах Fly (Docker локально не нужен). --no-cache = игнорирует все закешированные Docker layer'ы.

После деплоя — обязательно проверить браузер с Ctrl+F5 или в инкогнито:

Copy// в DevTools Console
fetch('/returns.html', {cache: 'no-cache'}).then(r=>r.text()).then(t =>
  console.log(t.includes('searchByNameBtn') ? 'YES ✅' : 'NO ❌'));
Если YES — значит файл на сервере свежий, проблема была в кеше браузера. Очистить через DevTools → Application → Clear site data.

14. Известные проблемы и решения
Проблема	Причина	Решение
Все деплои падают no access token	FLY_API_TOKEN протух	Раздел 12
Деплой зелёный, но изменений нет	Кеш Fly или браузера	Раздел 13 + Ctrl+F5
/returns.html — белая страница	Нет JWT cookie	Залогиниться на /?device=KEY или RDP в магазин
/me-with-store 401	Cookie протух/удалён	Залогиниться заново
Магазин получил 0 выручки после переименования	Нет алиаса в store_address_aliases	Добавить алиас с valid_from
ON CONFLICT DO UPDATE при добавлении алиаса	Пересекающиеся периоды	Закрыть старый алиас (valid_to = ...), потом открывать новый
Бэкап упал invalid_grant	refresh_token инвалидирован	Пересоздать в OAuth Playground (см. историю 1.05.2026)
upload_stock.py загружает 0 строк	Изменились названия колонок в Excel	Поправить COLUMN_MAP
Поиск по названию медленный (1-2 сек)	LIKE без индекса по миллиону строк	Норма. Для ускорения — кластеризация product_name_lower (см. TODO)
Дубли возвратов RET-YYMMDD-NNN	Race condition при одновременной отправке	Использует sequence в generate_return_number() — теоретически безопасно
15. Типовые операции
Деплой
Copygit add -A
git commit -m "..."
git push                          # GitHub Actions автоматически
# Или принудительно:
flyctl deploy --remote-only --no-cache
Откат
Copygit revert HEAD
git push
# Или прямой rollback на Fly:
flyctl releases -a shifts-api
flyctl releases rollback <version>
Ручной бэкап возвратов
GitHub Actions → Weekly Returns Backup → Run workflow.

Ручная загрузка остатков
Copycd D:\Shifts-api && python upload_stock.py
Просмотр Fly secrets
Copyflyctl secrets list -a shifts-api
SQL-чистка тестовых данных
CopyBEGIN;
DELETE FROM return_items WHERE return_id IN (...);
DELETE FROM returns WHERE id IN (...);
DELETE FROM shifts WHERE id IN (...);
SELECT COUNT(*) FROM ...;  -- проверка
COMMIT;
Создать тестовую смену для админа
CopyINSERT INTO shifts (employee_id, store_id, shift_date)
VALUES ('ADMIN_DB', 19, CURRENT_DATE)
RETURNING id;
16. Важные ссылки
Production: https://shifts-api.fly.dev/
Returns (продавец): https://shifts-api.fly.dev/returns.html
Admin returns: https://shifts-api.fly.dev/admin-returns.html
GitHub repo: https://github.com/Denbassk/Recording-sales-staff-shifts-API
GitHub Actions: https://github.com/Denbassk/Recording-sales-staff-shifts-API/actions
GitHub Secrets: https://github.com/Denbassk/Recording-sales-staff-shifts-API/settings/secrets/actions
Supabase: https://supabase.com/dashboard/project/pdiminbulbzlywvnowta
Fly.io app: https://fly.io/apps/shifts-api
Fly.io tokens: https://fly.io/user/personal_access_tokens
Google Cloud Console: https://console.cloud.google.com/apis/credentials?project=family-market-analytics
BigQuery: https://console.cloud.google.com/bigquery?project=family-market-analytics
OAuth Playground: https://developers.google.com/oauthplayground/
Drive backup folder: https://drive.google.com/drive/folders/1qnNKBm35wA_TPTuGd0HcSyz9r1ieDdg2
17. Прогресс этапов
✅ Stage 1-6: базовый функционал (auth, смены, выручка, зарплаты).
✅ Stage 7 (returns — продавец): сканер, lookup, корзина, отправка.
✅ Stage 7.1: модалка количества с +/−, поддержка весовых.
✅ Stage 7.2: inline-поиск по названию, обновлённая «Допомога».
✅ Stage 8: админ-панель возвратов (фильтры, сводки, экспорт, архивация).
✅ Stage 10.5: help-modal на странице продавца.
✅ Stage 11: еженедельный бэкап в Google Drive (OAuth refresh token).
✅ STATE.md: документация проекта.
18. TODO / Roadmap
🔜 Проверить нумерацию возвратов на пропуски (например, RET-260501-002 был пропущен).
🔜 Удалить из Fly secrets неиспользуемый GCP_SA_KEY для Drive (BigQuery-ключ оставить!).
🔜 Удалить service-account promo-analysis@… из sharing Drive folder (после теста — больше не нужен).
🔜 Ускорить поиск по названию: добавить колонку product_name_lower в stock_current + кластеризация в BigQuery (3-5x speedup).
🔜 Реализовать настоящий device-only login (без пароля): сейчас device_key только привязывает магазин при стандартном логине. Полезно для kiosk-режима.
🔜 Документировать payroll calculation в STATE.md (сейчас не описан).
🔜 Non-interactive версия upload_stock.py для Cloud Scheduler / cron.
🔜 Мониторинг: Fly logs alerts, Supabase usage, BigQuery costs.
🔜 Ротация JWT secret (раз в год).
19. История изменений
Дата	Событие
2026-04-30	Переименование магазина 38 (Полевая 83 → Полевая-магазин). Добавлен алиас.
2026-05-01	Конфликт пересекающихся периодов алиасов — исправлено.
2026-05-01	Тестовые возвраты RET-260501-001/003 (на ПК продавца через RDP).
2026-05-02	Stage 11 завершён: бэкап через OAuth refresh token.
2026-05-02	Тестовые возвраты удалены, sequence не сбрасывался.
2026-05-02	OAuth consent screen переведён в "In production" — refresh_token long-lived.
2026-05-02	Создан STATE.md, добавлено описание upload_stock.py.
2026-05-04	Все деплои упали — диагностика → FLY_API_TOKEN протух.
2026-05-04	FLY_API_TOKEN восстановлен через flyctl tokens create org personal.
2026-05-04	Принудительный передеплой flyctl deploy --remote-only --no-cache.
2026-05-04	Stage 7.1: модалка количества + кнопки +/− + весовые товары.
2026-05-04	Stage 7.2: inline-поиск по названию (endpoint /search-product), обновлённая Допомога.
2026-05-04	Багфиксы: showAuthError (null safety), scanFeedback clear after submit.
2026-05-04	Полное тестирование цепочки сканер→lookup→quantity→cart→submit→admin.
2026-05-04	STATE.md полностью переписан (этот файл).
20. Контакты
Разработчик: Denbassk (denbassk@gmail.com)
Drive owner / Google account: femelimarket6@gmail.com
Google Cloud project: family-market-analytics
Fly organization: personal (Фома Бурма)
Copy
---

После замены — закоммитьте:

```powershell
cd D:\Shifts-api\Shifts-api
git add STATE.md
git commit -m "Update STATE.md: Stage 7.1+7.2, FLY_API_TOKEN, device-flow, force redeploy"
git push