-- Idempotent creates (see backend/src/middleware/idempotency.ts). A client
-- sends an Idempotency-Key header with a create; the first request claims the
-- (user_id, key) row via the unique constraint, and once it succeeds its
-- status and body are stored so a repeat with the same key gets the same
-- answer instead of a second row. Rows older than 24 hours are removed by the
-- nightly cleanup job.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key              VARCHAR(100) NOT NULL,
  request_method   VARCHAR(10) NOT NULL,
  request_path     VARCHAR(200) NOT NULL,
  request_hash     CHAR(64) NOT NULL,
  response_status  INTEGER,
  response_body    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_keys_user_key_unique UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx ON idempotency_keys(created_at);
