-- Shared categories: a flagged category has the same name in every sharing
-- household member's list and one common limit (kept in sync by the API).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT false;
