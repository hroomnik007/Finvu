# Deployment — pedani.eu

Domains:
- **Frontend:** https://finvu.pedani.eu — static build served by nginx
- **Backend API:** https://api.pedani.eu — nginx → `127.0.0.1:3001` (Docker container `backend`)
- **Database:** PostgreSQL 17 in its own Docker container (`finance-tracker-postgres-1`)

## How a deploy works

Every push to `main` runs `.github/workflows/deploy.yml`:

1. **lint** — runs `.github/workflows/ci.yml` (the same workflow checks every pull request):
   ESLint, typecheck, tests and a production build of the frontend; typecheck and unit tests of the
   backend; a throw-away Postgres on which `npm run db:setup` builds the schema from scratch,
   `npm run db:check-schema` proves it matches `backend/src/db/schema.ts` and the integration tests
   run; `npm audit` of production dependencies.
2. **deploy-frontend** (when `finance-tracker/**` changed) — SSH to the server, `git reset --hard origin/main`,
   `npm ci`, `npm run build`, copy `dist/` to `/var/www/finance-tracker/finance-tracker/dist`, reload nginx.
3. **deploy-backend** (when `backend/**` changed) — SSH to the server, `git reset --hard origin/main`,
   `npm run db:migrate` (role from the `DATABASE_URL` secret), `docker compose build backend`, then
   `docker compose up -d --no-deps --wait backend` — the container is replaced and the step waits for its healthcheck.

GitHub secrets used: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`, `DATABASE_URL`, `VITE_VAPID_PUBLIC_KEY`.

**nginx configuration is not deployed by CI.** After changing `nginx/*.conf`, copy the file to
`/etc/nginx/sites-enabled/` (and `nginx/snippets/*.conf` to `/etc/nginx/snippets/`) on the server
and run `sudo nginx -t && sudo systemctl reload nginx`. The frontend's security headers and CSP live
in `nginx/snippets/finvu-security-headers.conf`, included by every location of `finvu.pedani.eu.conf`.

## Database migrations

- New changes go to `backend/migrations/` as the next numbered `NNN_name.sql`. `npm run db:migrate`
  applies the files that are not recorded in `_migrations` yet, each in one transaction.
- `backend/drizzle/` is the frozen legacy schema (see its README). Do not generate new files there.
- Empty database (development, CI): `npm run db:setup` applies the legacy schema and then all migrations.
- Check that a database matches the code: `npm run db:check-schema`.

## Manual fallback

`./deploy.sh [frontend|backend]` runs the same steps by hand on the server (the backend part needs
`DATABASE_URL` exported). Use it only when GitHub Actions is unavailable.

## Operations

```bash
docker compose ps                       # backend status and health
docker compose logs backend --tail=50   # backend logs
docker compose restart backend
sudo tail -f /var/log/nginx/access.log
```

## Backups

`scripts/backup.sh` dumps the database (`pg_dump -Fc`, checked with `pg_restore --list`) and archives
the uploaded avatars, keeps 7 daily / 4 weekly / 6 monthly copies in `/var/backups/finvu`, and with
`BACKUP_RCLONE_REMOTE` set also copies them off the server. A failed run leaves no partial file and,
with `BACKUP_PING_URL` set (e.g. healthchecks.io), reports the failure.

Settings go to `/etc/finvu-backup.env` (read by both scripts, mode 600), for example:

```bash
PG_USER=user
PG_DB=finance_tracker
BACKUP_RCLONE_REMOTE=storagebox:finvu
BACKUP_PING_URL=https://hc-ping.com/<uuid>
```

Nightly run (root crontab, `sudo crontab -e`), after the 03:30 cleanup job:

```
15 4 * * * /var/www/finance-tracker-repo/scripts/backup.sh >> /var/log/finvu-backup.log 2>&1
```

Check that a backup really restores (loads the newest dump into a throw-away database next to the
live one, compares row counts, drops it; the live database is only read):

```bash
sudo /var/www/finance-tracker-repo/scripts/restore-test.sh
```

Full restore after a disaster: stop the backend (`docker compose stop backend`), recreate the database,
`docker exec -i finance-tracker-postgres-1 pg_restore -U user -d finance_tracker --no-owner < db-….dump`,
extract `uploads-….tar.gz` into the `uploads_data` volume, start the backend.

The backend runs a nightly cleanup (03:30) of expired tokens and idle sessions, and
the monthly summary e-mail job (last day of the month, at each user's chosen hour).

## Backend environment (`backend/.env`, never committed)

See `backend/.env.example` for the full list. The required ones:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string used by the running backend |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ADMIN_SECRET` | token signing secrets (long random strings) |
| `ADMIN_PASSWORD` | password of the admin area |
| `SMTP_*`, `APP_URL` | outgoing e-mail and links inside e-mails |
