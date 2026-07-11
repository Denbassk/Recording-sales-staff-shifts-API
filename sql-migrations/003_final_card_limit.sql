-- 003_final_card_limit.sql
-- Сохраняем лимит карты, действовавший НА МОМЕНТ окончательного расчёта,
-- чтобы проверки/история опирались на исторический лимит, а не на текущий.
ALTER TABLE final_payroll_calculations
  ADD COLUMN IF NOT EXISTS card_limit numeric;
