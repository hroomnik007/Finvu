-- Repairs fixed expenses that lost their recurring flag. Since the zod 4 upgrade
-- (2026-10-28) every update of a transaction that did not send isFixed stored
-- is_fixed = false, and the app edits a fixed expense without sending it — so
-- editing one (name, due day, category or a price correction) turned it into a
-- one-off row. Only fixed expenses keep a JSON description ({"l": label, "n": note,
-- "d": due day}); a one-off expense's description is the user's plain note and the
-- app has no way to turn a fixed expense into a one-off one, so these rows can
-- only be the damaged ones.
UPDATE transactions
SET is_fixed = true, updated_at = now()
WHERE is_fixed = false
  AND type = 'expense'
  AND description ~ '^\{"l":".*"d":[0-9]+\}$';
