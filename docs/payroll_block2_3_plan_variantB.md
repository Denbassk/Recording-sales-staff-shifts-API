# План реализации — Вариант Б: Блоки 2 и 3 полностью в Node (интеграция BigQuery)

Цель: процент от продаж (Блок 2) и доп.бонусы (Блок 3) считаются внутри приложения,
BigQuery-клиент в Node. Действует с 16.07.2026. Приоритет — корректность, не скорость.

## Принцип: идемпотентный пересчёт, а не «один раз»
Данные продаж в BigQuery (`turnover_transactions`) грузятся с задержкой (есть `loaded_at`),
а списания кулинарии финальны только к концу месяца. Поэтому extras (процент + бонусы)
считаются **повторяемым пересчётом** (upsert per смена/день): можно гонять ночью, докручивая
вчерашний день, и разово за месяц на закрытии. `total_pay` всегда пересобирается из последних
данных → аванс/финал/ФОТ работают без переделок. Это «правильная» модель: одна формула — много прогонов.

Ставка (Блок 1) остаётся live в `/calculate-payroll` (уже сделано). Extras — отдельно.

## 1. Доступ к данным

### 1.1 BigQuery-клиент в Node
- Зависимость: `@google-cloud/bigquery`.
- Креды сервис-аккаунта НЕ коммитим (`credentials/` уже в `.gitignore`). На Fly — секретом:
  - `fly secrets set GCP_SA_JSON="$(cat credentials/family-market-analytics-*.json)"`
  - в коде: `new BigQuery({ projectId: 'family-market-analytics', credentials: JSON.parse(process.env.GCP_SA_JSON) })`.
  - Локально — как сейчас, через `GOOGLE_APPLICATION_CREDENTIALS`.

### 1.2 Маппинг магазинов (BQ ↔ Supabase)
В BQ магазин — строка-адрес (`turnover_transactions.store`), в Supabase — `store_id`.
Матчинг как в готовых Python-скриптах: `stores.address` + `store_address_aliases`,
нормализация (lower/trim/убрать лишние пробелы). Хелпер `getStoreMapping()` → Map(norm_addr → store_id).
Несматченные адреса — в лог диагностики (не терять деньги молча).

## 2. Схема БД (миграция `sql-migrations/00X_payroll_extras.sql`)
Доп. колонки в `payroll_calculations` (numeric, DEFAULT 0 — старые строки не трогаются):
- `sales_percent` — доля продавца от процента с кассы
- `bag_bonus`, `coffee_bonus`, `culinary_bonus` — доли продавца по доп.бонусам
- `dl_sales_deducted` — сколько вычли ДЛ Солюшн за день (аудит, на магазин)
- `adjusted_cash` — касса минус ДЛ (аудит)
- `extras_source` text, `extras_updated_at` timestamptz — метка пересчёта

Для новых правил: `total_pay = base_rate + sales_percent + bag_bonus + coffee_bonus + culinary_bonus`.
(`base_rate` = плавающая ставка Блока 1.)

## 3. Блок 2 — процент от продаж (на смену/день)
- `adjusted_cash = daily_revenue.revenue (Supabase) − dl_sales (BQ)`; если ДЛ > кассы → clamp 0 + лог.
- `dl_sales` = Σ `check_amount` по продажам, чей `barcode` ∈ приходам ДЛ Солюшн (вся история — набор
  накопительный автоматически, решает проблему «не потерять штрих-коды», см. память проекта).
- `pool = 3% × adjusted_cash`; каждому продавцу смены = `pool / N` (1→3%, 2→1.5%, 3→1%).

Запрос BQ (один заход):
```sql
WITH dl AS (
  SELECT DISTINCT barcode
  FROM `family-market-analytics.family_market.incoming_transactions`
  WHERE supplier = 'ДЛ Солюшн'
)
SELECT DATE(transaction_datetime) AS d, TRIM(store) AS store, SUM(check_amount) AS dl_sales
FROM `family-market-analytics.family_market.turnover_transactions`
WHERE DATE(transaction_datetime) BETWEEN @from AND @to
  AND barcode IN (SELECT barcode FROM dl)
GROUP BY d, store
```
Учесть `barcode_supplier_override` (12 ручных переопределений поставщика).

## 4. Блок 3 — доп.бонусы (на смену/день, делятся pool/N)
Штрих-коды и ставки — в `payroll/bonus-config.cjs` (из готового Python-скрипта): пакеты (4 ш/к, 0.50),
кофе (39 ш/к, 2.00, исключая name LIKE '%чай%'), кулинария (19 ш/к, 10%). Позже можно вынести в таблицу.
- Пакеты: Σ qty(пакеты) × 0.50.
- Кофе: Σ qty(кофе, кроме «чай») × 2.00. У кофе приходов нет (расходники) — только по списку ш/к.
- Кулинария: по каждому ш/к: `sold_cost = Σ price_purchase×qty`; `bonus = 10% × max(0, sold_cost − writeoff_cost)`.
  Исключаем «Випічка». Формула — по решению владельца (10%×(себест.−списания)), НЕ как в старом скрипте.

### 4.1 Списания кулинарии — узкое место
Сейчас только ручной Excel. Нужен постоянный источник:
- Вариант 1 (рекоменд.): админ-загрузка Excel в приложении → парсер (переиспользуем логику из Python:
  колонки, дата документа, исключение «Випічка») → таблица `writeoffs (date, store_id, barcode, qty, cost)` в Supabase.
- Вариант 2: ты грузишь списания в BigQuery, Node читает оттуда.
До готовности источника кулинарный бонус = 0 (остальное не ломается).

## 5. Пересчёт: модуль + эндпоинт
- Модуль `payroll/extras.cjs`: BQ-клиент, `getStoreMapping`, `getDlSalesByStoreDay`,
  `getBonusAggByStoreDay`, `getWriteoffsByStoreDay`, `computeExtrasForRange(from, to)`.
- Эндпоинт `POST /calculate-payroll-extras` (роли admin/accountant, `withLock('extras_YYYY-MM')`,
  запись в `financial_logs`): вход — дата или месяц; тянет смены (кто на смене per store/day),
  BQ-агрегаты и списания, считает доли, upsert в `payroll_calculations`, пересобирает `total_pay`.
  Идемпотентно; только для дат ≥ 16.07 (`isNewRulesDate`).
- UI: кнопка в `payroll.html` «Пересчитать бонусы за месяц» + опционально ночной scheduled job.

## 6. Влияние на аванс/финал/ФОТ
- `total_pay` включает extras → финал и ФОТ считаются как есть; налог 22% начисляется (подтверждено).
- Аванс (1–15): для августа+ extras за 1–15 к 15-му могут быть неполными (лаг BQ/списания) — аванс берёт
  посчитанное (ставка + доступные extras), финал добивает. Для июля аванс целиком по-старому.

## 7. Тесты и приёмка (обязательно до деплоя)
- Юнит: процент 3%/N; деление бонусов pool/N; кулинария 10%×(cost−writeoff) с clamp 0; исключение
  «чай»/«Випічка»; маппинг адресов/алиасов; clamp adjusted_cash.
- **Паритет**: прогнать Node-расчёт за ИЮНЬ и сверить с выгрузкой твоего Python-скрипта (пакеты, кофе,
  и ДЛ-вычитание) — суммы обязаны совпасть. Кулинария сверяется отдельно (формула новая).
- E2E: `/calculate-payroll` (ставка) + `/calculate-payroll-extras` за тестовый день ≥16.07 →
  `total_pay = ставка + процент + бонусы`; за день ≤15.07 — без изменений.

## 8. Нужно от тебя, чтобы стартовать
1. Креды BQ на Fly — поставить секретом (подскажу команду; ключ не коммитим).
2. Списания кулинарии: админ-загрузка Excel в приложении (сделаю) ИЛИ ты заводишь в BigQuery?
3. Штрих-коды бонусов держим в конфиг-модуле репо (быстро, версионируется) — ок? Или таблицей в БД.

## 9. Порядок работ (до 16.07)
- Ш1: миграция колонок + BQ-клиент + секреты + маппинг магазинов.
- Ш2: Блок 2 (процент) + юнит + паритет по ДЛ.
- Ш3: пакеты + кофе + юнит + паритет.
- Ш4: пайплайн списаний + кулинария + сверка.
- Ш5: эндпоинт пересчёта + пересборка `total_pay` + санити аванс/финал/ФОТ + логи.
- Ш6: E2E на 16.07+, ревью, деплой.
