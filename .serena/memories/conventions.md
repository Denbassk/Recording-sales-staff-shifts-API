# mem:conventions — стиль и соглашения кода

## Язык/модули
- **CommonJS**: `const x = require('...')`, `module.exports = router`. НЕ ESM.
- Расширение основного сервера — `.cjs`. Роуты — `.js` в `routes/`.
- Node + Express 4. Асинхронность — `async/await` везде (не колбэки/промисы вручную).

## Именование
- Функции-хелперы: camelCase глаголом — `calculateDailyPay`, `getEmployeeCardLimit`,
  `validateDate`, `buildFotReport`, `logFinancialOperation`, `withLock`.
- Middleware-группы доступа: `canManagePayroll`, `canManageFot`, `canViewDetails` (camelCase,
  «can…»).
- Константы-лимиты: UPPER_SNAKE_CASE — `MAX_PENALTY`, `COMPANY_TAX_RATE`, `MIN_YEAR`.
- Переменные БД-полей и поля JSON ответа — snake_case (`total_pay`, `card_remainder`,
  `advance_payment_method`) — совпадает с колонками Supabase.
- Эндпоинты: kebab-case (`/calculate-final-payroll`); новые/«технические» под префиксом
  `/api/...` (`/api/card-limit-types`). Единообразия префикса нет (часть без `/api`).

## Формат ответа API
- Успех: `res.json({ success: true, ...payload })` — payload плоско или в полях
  (`results`, `reportData`, `summary`, `returns`, `stores` и т.п.). Единого `data`-конверта НЕТ.
- Ошибка: `res.status(4xx|500).json({ success: false, error: '...' })`. Иногда `message`
  вместо `error` (особенно auth: `{success:false, message:'Нет токена.'}`). Непоследовательно.
- Валидация → 400; нет токена/невалиден → 401; нет прав → 403; не найдено → 404; сбой → 500.

## Обработка ошибок
- Каждый хэндлер обёрнут в `try/catch`, в catch — `console.error('...', error)` +
  `res.status(500).json({success:false, error: error.message})`.
- Supabase-ошибки: проверяется `if (error) throw error`, иногда спец-обработка
  `error.code === '42P01'` (таблицы нет) как мягкая.
- Логирование действий — `console.log` обильно (в т.ч. детали расчётов на русском с эмодзи).

## Прочее
- Комментарии на русском/украинском, нередко «болтливые» с эмодзи и ASCII-разделителями
  (`// ========== ... ==========`).
- Даты в БД — строки `YYYY-MM-DD`; в JS активно `new Date(...).toISOString()`.
- Числа форматируются для UI через `formatNumber` (рус. формат: пробел-разделитель тысяч,
  запятая-десятичная).
- Фронт — vanilla, общается `fetch(..., {credentials:'include'})`.
