-- Auto-limit categories: limit = sum of fixed expenses + this reserve, so
-- variable spending in the same category fits under the limit. 0 keeps the
-- previous behaviour (limit equals the fixed total).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS limit_reserve NUMERIC(12,2) NOT NULL DEFAULT 0;
