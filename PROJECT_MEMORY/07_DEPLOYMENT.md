# 07. Деплой и запуск

## Продакшн (Fly.io)

Приложение задеплоено на `https://shifts-api.fly.dev`

**Конфиг:** `fly.toml`  
**Авто-деплой:** `.github/workflows/fly-deploy.yml` — пуш в ветку `main`

## Переменные окружения (`.env`)

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=...
GCP_SA_KEY=...         # JSON-ключ сервисного аккаунта Google Cloud для BigQuery
```

## Локальный запуск

1. Установить зависимости: `npm install`
2. Создать `.env` с переменными выше
3. Запустить: `node server.cjs`
4. Открыть `http://localhost:3000`

## GitHub Secrets (для CI/CD)

Для бэкапа возвратов в `.github/workflows/backup-returns.yml`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `DRIVE_BACKUP_FOLDER_ID`

## Ветки Git

| Ветка | Назначение |
|-------|------------|
| `main` | Продакшн |
| `feature/payment-corrections` | Корректировки выплат |
| `feature/unified-payroll-adjustments` | Единая система корректировок зарплат |

## Запуск на конкретной кассе (Windows)

1. В папке с `Returns.bat` должен лежать `device.json` вида:
   ```json
   { "device_key": "abc123..." }
   ```
2. Дважды кликнуть `Returns.bat`
3. Открывается Chrome/Edge с авторизацией через device_key

## Docker

`Dockerfile` присутствует — можно запустить в контейнере:
```bash
docker build -t shifts-api .
docker run -p 3000:3000 --env-file .env shifts-api
```
