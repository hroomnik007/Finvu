-- Token lookups now go by SHA-256 hash equality instead of scanning every row
-- of a user (or of all users) and comparing in application code.
CREATE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx   ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS pin_device_tokens_token_hash_idx ON pin_device_tokens(token_hash);

-- Emails are matched case-insensitively (lower(email) = $1). Deliberately NOT
-- unique: legacy rows may already contain case-variant duplicates.
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
