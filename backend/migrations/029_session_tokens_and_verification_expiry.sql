-- Refresh tokens belong to a session, so removing a session (Settings -> active
-- sessions) really signs that device out: the cascade deletes its tokens.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS refresh_tokens_session_id_idx ON refresh_tokens(session_id);

-- E-mail verification links expire (NULL = legacy token issued before this column).
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMP;

-- Tokens used to be stored raw; from now on only their SHA-256 hex is stored and
-- looked up.
--
-- Verification tokens were UUIDs, so a 64-char hex value is already a digest
-- (guard keeps a manual re-run from hashing twice). Hash the rest with the same
-- digest the app computes, so links already sent by e-mail keep working.
UPDATE users
SET verification_token = encode(sha256(convert_to(verification_token, 'UTF8')), 'hex')
WHERE verification_token IS NOT NULL
  AND verification_token !~ '^[0-9a-f]{64}$';

-- Raw reset tokens were 64 hex chars, indistinguishable from a digest, so they
-- cannot be converted safely. They live for one hour only: drop the outstanding
-- ones — anyone mid-reset simply requests a new link.
DELETE FROM password_reset_tokens;
