-- =============================================
-- СКРИПТ МИГРАЦИИ ДЛЯ ДОБАВЛЕНИЯ СИСТЕМЫ АВТОРИЗАЦИИ
-- Выполните этот скрипт в Supabase SQL Editor
-- =============================================

-- 1. Добавляем поле role в таблицу employees (если его еще нет)
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'seller';

-- 2. Создаем таблицу для хранения сессий
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  token VARCHAR(255) UNIQUE NOT NULL,
  employee_id VARCHAR(50) NOT NULL,
  employee_role VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- 3. Создаем индекс для быстрого поиска по токену
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

-- 4. Создаем индекс для автоматической очистки истекших сессий
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- 5. Устанавливаем роли для существующих сотрудников
-- ВАЖНО: Замените имена на реальные имена из вашей базы данных!

-- Назначаем роль admin (замените 'Ваше Имя' на реальное)
-- UPDATE employees SET role = 'admin' WHERE fullname = 'Ваше Имя';

-- Назначаем роль accountant (замените 'Имя Бухгалтера' на реальное)
-- UPDATE employees SET role = 'accountant' WHERE fullname = 'Имя Бухгалтера';

-- Все остальные автоматически получат роль 'seller' по умолчанию

-- 6. Создаем функцию для автоматической очистки истекших сессий
CREATE OR REPLACE FUNCTION delete_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- 7. Создаем расписание для очистки сессий каждый час (опционально)
-- Примечание: В Supabase можно настроить это через Cron Jobs в Dashboard
-- SELECT cron.schedule('delete-expired-sessions', '0 * * * *', 'SELECT delete_expired_sessions();');

-- =============================================
-- ПРОВЕРКА МИГРАЦИИ
-- =============================================

-- Проверяем, что поле role добавлено
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'employees' AND column_name = 'role';

-- Проверяем, что таблица sessions создана
SELECT * FROM information_schema.tables WHERE table_name = 'sessions';

-- Показываем текущие роли сотрудников
SELECT id, fullname, role FROM employees ORDER BY role, fullname;

-- =============================================
-- ИНСТРУКЦИИ ПОСЛЕ ВЫПОЛНЕНИЯ СКРИПТА:
-- =============================================
-- 1. Обязательно назначьте роль 'admin' хотя бы одному пользователю
-- 2. Назначьте роль 'accountant' бухгалтеру
-- 3. Проверьте, что все сотрудники имеют корректные роли
-- 4. Протестируйте авторизацию перед деплоем
