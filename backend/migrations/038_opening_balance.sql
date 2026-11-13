-- Opening balance: what the user had in the account on the day tracking began.
-- It is added to the cumulative balance, so "total balance" can match real money
-- instead of starting from zero. May be negative (overdraft). Additive: the
-- previous backend version ignores the column.
ALTER TABLE users ADD COLUMN IF NOT EXISTS opening_balance numeric(12,2) NOT NULL DEFAULT 0;
