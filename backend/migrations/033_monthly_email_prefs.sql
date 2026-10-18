-- Monthly summary e-mail: personal vs family content, send hour (Europe/Bratislava),
-- and the month it was last sent for (guards against double sends).
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_email_scope VARCHAR(10) NOT NULL DEFAULT 'personal';
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_email_hour SMALLINT NOT NULL DEFAULT 9;
ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_email_last_sent VARCHAR(7);
