-- Таблица для фиксации всех выплат (авансы и окончательные расчеты)
CREATE TABLE IF NOT EXISTS payroll_payments (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL,
    payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('advance', 'final', 'correction')),
    payment_date DATE NOT NULL,
    payment_period_month INTEGER NOT NULL CHECK (payment_period_month BETWEEN 1 AND 12),
    payment_period_year INTEGER NOT NULL CHECK (payment_period_year >= 2024),
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('card', 'cash', 'mixed')),
    card_amount DECIMAL(10,2) DEFAULT 0,
    cash_amount DECIMAL(10,2) DEFAULT 0,
    calculation_date DATE NOT NULL, -- Дата, по которую был сделан расчет (для аванса - обычно 15 число)
    notes TEXT,
    created_by VARCHAR(50), -- ID пользователя, который зафиксировал выплату
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_cancelled BOOLEAN DEFAULT FALSE,
    cancelled_at TIMESTAMP,
    cancelled_by VARCHAR(50),
    cancellation_reason TEXT,
    
    -- Уникальный индекс: один сотрудник не может получить два аванса за один месяц
    UNIQUE(employee_id, payment_type, payment_period_month, payment_period_year, is_cancelled)
);

-- Индексы для быстрого поиска
CREATE INDEX idx_payroll_payments_employee ON payroll_payments(employee_id);
CREATE INDEX idx_payroll_payments_period ON payroll_payments(payment_period_year, payment_period_month);
CREATE INDEX idx_payroll_payments_type ON payroll_payments(payment_type);
CREATE INDEX idx_payroll_payments_date ON payroll_payments(payment_date);

-- Представление для активных (не отмененных) выплат
CREATE VIEW active_payroll_payments AS
SELECT * FROM payroll_payments WHERE is_cancelled = FALSE;

-- Комментарии к таблице
COMMENT ON TABLE payroll_payments IS 'Фиксация всех выплат зарплаты (авансы, окончательные расчеты)';
COMMENT ON COLUMN payroll_payments.payment_type IS 'Тип выплаты: advance - аванс, final - окончательный расчет, correction - корректировка';
COMMENT ON COLUMN payroll_payments.calculation_date IS 'Дата, по которую был произведен расчет (например, для аванса - 15 число)';
COMMENT ON COLUMN payroll_payments.is_cancelled IS 'Флаг отмены выплаты (для корректировки ошибочных записей)';
