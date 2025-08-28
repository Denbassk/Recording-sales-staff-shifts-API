-- Проверяем, есть ли уже поля для авансов
ALTER TABLE payroll_calculations 
ADD COLUMN IF NOT EXISTS advance_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS card_remainder DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS cash_payout DECIMAL(10,2) DEFAULT 0;

-- Добавляем индекс для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_payroll_calc_date ON payroll_calculations(work_date);
