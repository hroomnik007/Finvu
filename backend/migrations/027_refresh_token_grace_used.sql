-- A rotated refresh token may be presented once more shortly after rotation
-- (two tabs racing); this marks that single allowed reuse.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS grace_used_at TIMESTAMPTZ DEFAULT NULL;
