-- ================================================
-- МИГРАЦИЯ: Добавление роли "curator" (Куратор)
-- ================================================
-- Дата: 2024-11-04
-- Описание: Добавляем новую роль для кураторов магазинов
--           Кураторы могут только просматривать детализацию расчетов

-- Шаг 1: Проверяем существующие роли
-- SELECT DISTINCT role FROM employees;

-- Шаг 2: Добавляем проверку роли (constraint) если её нет
DO $$ 
BEGIN
    -- Удаляем старое ограничение если есть
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'employees_role_check'
    ) THEN
        ALTER TABLE employees DROP CONSTRAINT employees_role_check;
    END IF;
    
    -- Добавляем новое ограничение с ролью curator
    ALTER TABLE employees ADD CONSTRAINT employees_role_check 
        CHECK (role IN ('seller', 'admin', 'accountant', 'curator'));
END $$;

-- Шаг 3: Создаем тестового куратора (замените данные на реальные)
-- РАСКОММЕНТИРУЙТЕ И ЗАМЕНИТЕ ДАННЫЕ:
/*
INSERT INTO employees (id, fullname, role, password, active)
VALUES 
    ('CUR001', 'Петров Петр', 'curator', 'password123', true)
ON CONFLICT (id) DO UPDATE 
SET role = 'curator', active = true;
*/

-- Шаг 4: Обновляем существующего сотрудника до куратора (если нужно)
-- РАСКОММЕНТИРУЙТЕ И ЗАМЕНИТЕ ID:
/*
UPDATE employees 
SET role = 'curator' 
WHERE id = 'СУЩЕСТВУЮЩИЙ_ID';
*/

-- Шаг 5: Проверяем результат
SELECT id, fullname, role, active 
FROM employees 
WHERE role IN ('admin', 'accountant', 'curator')
ORDER BY role, fullname;

COMMENT ON TABLE employees IS 'Таблица сотрудников. Роли: seller, admin, accountant, curator';
