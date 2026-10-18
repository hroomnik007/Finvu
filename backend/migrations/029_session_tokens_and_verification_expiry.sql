-- Refresh tokens belong to a session, so removing a session (Settings -> active
-- sessions) really signs that device out: the cascade deletes its tokens.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS refresh_tokens_session_id_idx ON refresh_tokens(session_id);

-- E-mail verification links expire (NULL = legacy token issued before this column).
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMP;
