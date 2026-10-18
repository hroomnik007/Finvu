-- A recurring (is_fixed) series can end: ended_on is the first day of the first
-- month it no longer applies (NULL = still running). It is set on every row of
-- the series, so whichever row is the latest for a month carries it.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ended_on DATE;
