# 📁 PROJECT MEMORY — Family Market Shifts API

Папка создана: 2026-05-28  
Назначение: хранить описание всей системы, архитектурные решения, статус компонентов и заметки для быстрого погружения в проект.

## Содержимое

| Файл | Описание |
|------|----------|
| `01_OVERVIEW.md` | Общий обзор: цель проекта, стек, деплой |
| `02_SHIFTS_PAYROLL.md` | Система смен и расчёта зарплат (основной модуль) |
| `03_RETURNS_SYSTEM.md` | Система возвратов товара продавцами — полное описание |
| `04_API_ENDPOINTS.md` | Все API-эндпоинты с описанием |
| `05_DATABASE.md` | Структура таблиц Supabase + BigQuery |
| `06_FRONTEND_INTERFACES.md` | Описание всех фронтенд-интерфейсов |
| `07_DEPLOYMENT.md` | Деплой, переменные окружения, GitHub Actions |

## Быстрые ссылки

- **Продавец → возврат:** `public/returns.html` + `returns.js` + `returns.css`
- **Админ → возвраты:** `public/admin-returns.html` + `admin-returns.js` + `admin-returns.css`
- **API возвратов:** `routes/lookup.js` (все эндпоинты + lookup/search в одном файле)
- **Основной сервер:** `server.cjs`
- **Бэкап возвратов:** `scripts/backup-returns.js` + `.github/workflows/backup-returns.yml`
- **Запуск возвратов на кассе:** `Returns.bat`
