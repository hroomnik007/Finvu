-- Refresh tokens belong to a session, so removing a session (Settings -> active
-- sessions) really signs that device out: the cascade deletes its tokens.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS refresh_tokens_session_id_idx ON refresh_tokens(session_id);

-- E-mail verification links expire (NULL = legacy token issued before this column).
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMP;

-- Tokens used to be stored raw; from now on only their SHA-256 hex is stored and
-- looked up. Hash the rows that already exist (same digest the app computes), so
-- links already sent by e-mail keep working and no raw value remains in the DB.
UPDATE users
SET verification_token = encode(sha256(convert_to(verification_token, 'UTF8')), 'hex')
WHERE verification_token IS NOT NULL;

UPDATE password_reset_tokens
SET token = encode(sha256(convert_to(token, 'UTF8')), 'hex');
