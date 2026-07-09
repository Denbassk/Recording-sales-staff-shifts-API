# Проект: Family Market — Shifts API

## Стек
- **Backend:** Node.js + Express (CommonJS), точка входа — `server.cjs`
- **БД:** Supabase (PostgreSQL) — смены, зарплаты, возвраты
- **Аналитика/склад:** Google BigQuery (`family-market-analytics.returns_system`)
- **Фронтенд:** Vanilla HTML/CSS/JS, без фреймворков
- **Деплой:** Fly.io (`shifts-api.fly.dev`), CI/CD через GitHub Actions
- **Аутентификация:** JWT в cookie (`token`)

## Ключевые модули
- `server.cjs` — основной сервер (смены, зарплаты)
- `routes/lookup.js` — все эндпоинты возвратов + поиск товара
- `public/returns.html` + `returns.js` — интерфейс продавца (сканирование возвратов)
- `public/admin-returns.html` + `admin-returns.js` — интерфейс администратора
- `scripts/backup-returns.js` — еженедельный бэкап в Google Drive

## Роли
`seller` → только смены и возвраты своего магазина  
`admin` / `accountant` / `curator` → полный доступ + админ-панель

## Документация проекта
Подробное описание всех модулей: папка `PROJECT_MEMORY/`

## userEmail
The user's email address is denbassk@gmail.com.

## currentDate
Today's date is 2026-05-28.
