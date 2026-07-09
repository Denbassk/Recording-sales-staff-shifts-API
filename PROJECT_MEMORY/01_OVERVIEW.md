# 01. Общий обзор проекта

## Название и назначение

**Family Market — Shifts API**

Система управления сменами, расчёта зарплат и оформления возвратов товаров для сети продуктовых магазинов «Family Market» (Украина).

## Основные модули

1. **Учёт смен** — продавцы отмечают начало/конец смены, система записывает в Supabase
2. **Расчёт зарплат** — на основе смен, бонусов, авансов; экспорт в Excel
3. **Система возвратов** — продавцы сканируют штрих-коды товаров, формируют возврат; администраторы видят статистику

## Технологический стек

| Компонент | Технология |
|-----------|------------|
| Backend | Node.js + Express (CommonJS, `server.cjs`) |
| База данных | **Supabase** (PostgreSQL) |
| Аналитика / склад | **Google BigQuery** (`family-market-analytics`) |
| Фронтенд | Vanilla HTML/CSS/JS (SPA-подход) |
| Аутентификация | JWT в cookie (`token`) |
| Деплой | **Fly.io** (`shifts-api.fly.dev`) |
| CI/CD | GitHub Actions |
| Бэкап возвратов | Google Drive (OAuth2) |

## Структура папок

```
Shifts-api/
├── server.cjs              # Точка входа, Express-сервер
├── routes/
│   └── lookup.js           # Роутер: lookup + возвраты + /me-with-store
├── public/                 # Статические файлы (HTML/CSS/JS)
│   ├── index.html          # Главная страница (смены)
│   ├── returns.html        # Интерфейс продавца — возвраты
│   ├── returns.js
│   ├── returns.css
│   ├── admin-returns.html  # Интерфейс администратора — возвраты
│   ├── admin-returns.js
│   ├── admin-returns.css
│   ├── payroll.html        # Расчёт зарплат
│   ├── payroll.js
│   └── ...
├── scripts/
│   └── backup-returns.js   # Еженедельный бэкап возвратов → Google Drive
├── .github/workflows/
│   ├── fly-deploy.yml      # Автодеплой на Fly.io
│   └── backup-returns.yml  # Еженедельный бэкап (воскресенье 20:30 UTC)
├── sql/                    # SQL-скрипты
├── sql-migrations/         # Миграции
├── PROJECT_MEMORY/         # ← Эта папка
└── Returns.bat             # Ярлык для запуска страницы возвратов на кассе
```

## Роли пользователей

| Роль | Доступ |
|------|--------|
| `seller` (продавец) | Смены, интерфейс возвратов (только свой магазин) |
| `admin` | Всё + админ-панель возвратов, настройки |
| `accountant` | Зарплаты + админ-панель возвратов |
| `curator` | Куратор магазина, доступ к возвратам |

## Деплой

- **Prod:** `https://shifts-api.fly.dev`
- Конфиг деплоя: `fly.toml`
- Авто-деплой при push в `main`
