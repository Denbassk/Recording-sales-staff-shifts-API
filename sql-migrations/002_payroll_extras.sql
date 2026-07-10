-- 002_payroll_extras.sql
-- Доп. колонки под Блок 2 (процент от продаж) и Блок 3 (доп.бонусы) новых правил (с 16.07.2026).
-- Идемпотентно (IF NOT EXISTS). Старые строки получают 0/NULL — прежний расчёт не меняется.
-- Применить в Supabase (SQL Editor) один раз.

ALTER TABLE payroll_calculations
  ADD COLUMN IF NOT EXISTS sales_percent     numeric DEFAULT 0,  -- доля продавца от 3% с кассы (минус ДЛ)
  ADD COLUMN IF NOT EXISTS bag_bonus         numeric DEFAULT 0,  -- доля продавца: пакеты
  ADD COLUMN IF NOT EXISTS coffee_bonus      numeric DEFAULT 0,  -- доля продавца: кофе
  ADD COLUMN IF NOT EXISTS culinary_bonus    numeric DEFAULT 0,  -- доля продавца: кулинария
  ADD COLUMN IF NOT EXISTS dl_sales_deducted numeric DEFAULT 0,  -- вычтено продаж ДЛ Солюшн (магазин/день, аудит)
  ADD COLUMN IF NOT EXISTS adjusted_cash     numeric DEFAULT 0,  -- касса минус ДЛ (аудит)
  ADD COLUMN IF NOT EXISTS extras_source     text,               -- метка расчёта extras
  ADD COLUMN IF NOT EXISTS extras_updated_at timestamptz;        -- когда пересчитаны extras

-- total_pay для новых правил пересобирается приложением как:
--   total_pay = base_rate + sales_percent + bag_bonus + coffee_bonus + culinary_bonus
