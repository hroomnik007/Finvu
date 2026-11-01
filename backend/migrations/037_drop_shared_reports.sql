-- Shared reports were removed from the app (the endpoints, the public page and the
-- first_report achievement can no longer be earned). The table was empty in
-- production when this migration was written; a pg_dump taken right before is in
-- /var/backups/finvu/pre-drop-shared-reports-*.dump.
DROP TABLE IF EXISTS shared_reports;
