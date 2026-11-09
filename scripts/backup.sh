#!/usr/bin/env bash
# Nightly backup of the Finvu database and uploaded avatars, run by cron on the server.
#
#   BACKUP_DIR=/var/backups/finvu ./scripts/backup.sh
#
# What it does:
#   1. pg_dump (custom format, compressed) from the Postgres container, then checks
#      that the dump is readable (pg_restore --list)
#   2. tar.gz of /app/uploads from the backend container
#   3. keeps 7 daily, 4 weekly (Sunday) and 6 monthly (1st of the month) copies
#   4. optional: copies everything off the server with rclone (BACKUP_RCLONE_REMOTE)
#   5. optional: pings a dead-man's-switch URL on success / failure (BACKUP_PING_URL)
#
# Settings (environment, or /etc/finvu-backup.env which is read if it exists):
#   BACKUP_DIR            where backups go                  (default /var/backups/finvu)
#   PG_CONTAINER          Postgres container name            (default finance-tracker-postgres-1)
#   PG_USER / PG_DB       database role and name             (default user / finance_tracker)
#   COMPOSE_FILE          compose file of the backend        (default <repo>/docker-compose.yml)
#   KEEP_DAILY / KEEP_WEEKLY / KEEP_MONTHLY                  (default 7 / 4 / 6)
#   BACKUP_RCLONE_REMOTE  e.g. "storagebox:finvu" (an rclone remote + path); unset = local only
#   BACKUP_PING_URL       e.g. a healthchecks.io check URL; "/fail" is appended on failure
#
# Restore: see scripts/restore-test.sh and DEPLOYMENT.md ("Backups").

set -Eeuo pipefail
umask 077 # financial data: backups readable by their owner only

# shellcheck source=/dev/null
[ -f /etc/finvu-backup.env ] && . /etc/finvu-backup.env

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/finvu}"
PG_CONTAINER="${PG_CONTAINER:-finance-tracker-postgres-1}"
PG_USER="${PG_USER:-user}"
PG_DB="${PG_DB:-finance_tracker}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/docker-compose.yml}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${KEEP_MONTHLY:-6}"
NOW="${BACKUP_NOW:-$(date +%F_%H%M)}"   # BACKUP_NOW only for tests
DOW="${BACKUP_DOW:-$(date +%u)}"         # 7 = Sunday
DOM="${BACKUP_DOM:-$(date +%d)}"

log() { echo "[backup $(date +%T)] $*"; }

ping_url() {
  [ -n "${BACKUP_PING_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 "${BACKUP_PING_URL}$1" >/dev/null || log "warning: ping $1 failed"
}

on_error() {
  log "FAILED (line $1)"
  rm -f -- "${DB_FILE:-}.part" "${UP_FILE:-}.part"
  ping_url /fail
}
trap 'on_error $LINENO' ERR

mkdir -p "$BACKUP_DIR"/{daily,weekly,monthly}

# One run at a time (a slow off-site copy must not overlap the next night)
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || { log "another backup is running, skipping"; exit 0; }
ping_url /start

# ── 1. Database ──────────────────────────────────────────────────────────────
DB_FILE="$BACKUP_DIR/daily/db-$NOW.dump"
log "dumping $PG_DB from $PG_CONTAINER"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner > "$DB_FILE.part"
# A truncated or empty dump must never replace a good one
docker exec -i "$PG_CONTAINER" pg_restore --list < "$DB_FILE.part" > /dev/null
mv "$DB_FILE.part" "$DB_FILE"
log "database: $(du -h "$DB_FILE" | cut -f1)"

# ── 2. Uploads (avatars) ─────────────────────────────────────────────────────
UP_FILE="$BACKUP_DIR/daily/uploads-$NOW.tar.gz"
log "archiving uploads"
docker compose -f "$COMPOSE_FILE" exec -T backend tar -czf - -C /app uploads > "$UP_FILE.part"
gzip -t "$UP_FILE.part"
mv "$UP_FILE.part" "$UP_FILE"
log "uploads: $(du -h "$UP_FILE" | cut -f1)"

# ── 3. Rotation ──────────────────────────────────────────────────────────────
# Weekly/monthly copies are hard links: no extra space until the daily one is pruned
if [ "$DOW" = "7" ]; then ln -f "$DB_FILE" "$BACKUP_DIR/weekly/"; ln -f "$UP_FILE" "$BACKUP_DIR/weekly/"; fi
if [ "$DOM" = "01" ]; then ln -f "$DB_FILE" "$BACKUP_DIR/monthly/"; ln -f "$UP_FILE" "$BACKUP_DIR/monthly/"; fi

prune() { # prune <dir> <keep>: keep the newest <keep> runs (db + uploads pairs)
  local dir="$1" keep="$2" kind
  for kind in db uploads; do
    # names carry a sortable timestamp, so a reverse name sort is newest first
    find "$dir" -maxdepth 1 -type f -name "$kind-*" ! -name '*.part' -printf '%f\n' \
      | sort -r | tail -n +"$((keep + 1))" | while read -r f; do rm -f -- "$dir/$f"; done
  done
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"
prune "$BACKUP_DIR/monthly" "$KEEP_MONTHLY"

# ── 4. Off-site copy ─────────────────────────────────────────────────────────
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  log "copying to $BACKUP_RCLONE_REMOTE"
  # sync mirrors the local rotation, so the remote doesn't grow forever
  rclone sync "$BACKUP_DIR" "$BACKUP_RCLONE_REMOTE" --exclude '*.part' --exclude '.lock'
else
  log "warning: BACKUP_RCLONE_REMOTE not set, backups stay on this server only"
fi

ping_url ""
log "done"
