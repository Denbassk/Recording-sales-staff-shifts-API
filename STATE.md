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
