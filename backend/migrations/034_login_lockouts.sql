-- Per-account sign-in lockout for password, PIN and admin login (see
-- backend/src/lib/loginLockout.ts). Replaces users.pin_failed_attempts /
-- users.pin_locked_until, which the code no longer uses. Those two columns are
-- left in place so the previous backend keeps working until the new container
-- is up; they can be dropped in a later migration.
CREATE TABLE IF NOT EXISTS login_lockouts (
  key                VARCHAR(80) PRIMARY KEY,
  failed_count       INTEGER NOT NULL DEFAULT 0,
  window_started_at  TIMESTAMPTZ NOT NULL,
  locked_until       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS login_lockouts_window_started_at_idx ON login_lockouts(window_started_at);
