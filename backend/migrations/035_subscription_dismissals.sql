-- Subscription suggestions the user hid ("Skryť"), per normalized merchant name
-- (see backend/src/lib/subscriptions.ts). Deleted with the account.
CREATE TABLE IF NOT EXISTS subscription_dismissals (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pattern_key  VARCHAR(120) NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, pattern_key)
);
