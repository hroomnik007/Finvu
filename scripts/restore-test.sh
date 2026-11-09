#!/usr/bin/env bash
# Proves a backup can actually be restored: loads a dump into a throw-away
# database next to the live one, compares row counts, then drops it again.
# The live database is only read (for the comparison), never written.
#
#   ./scripts/restore-test.sh                      # newest dump in $BACKUP_DIR/daily
#   ./scripts/restore-test.sh /path/to/db-….dump   # a specific dump
#
# Uses the same settings as backup.sh (environment or /etc/finvu-backup.env).
set -Eeuo pipefail

# shellcheck source=/dev/null
[ -f /etc/finvu-backup.env ] && . /etc/finvu-backup.env

BACKUP_DIR="${BACKUP_DIR:-/var/backups/finvu}"
PG_CONTAINER="${PG_CONTAINER:-finance-tracker-postgres-1}"
PG_USER="${PG_USER:-user}"
PG_DB="${PG_DB:-finance_tracker}"
TEST_DB="finvu_restore_test"

DUMP="${1:-$(find "$BACKUP_DIR/daily" -maxdepth 1 -name 'db-*.dump' -printf '%f\n' | sort -r | head -n1)}"
[ -n "$DUMP" ] || { echo "no dump found in $BACKUP_DIR/daily" >&2; exit 1; }
[ -f "$DUMP" ] || DUMP="$BACKUP_DIR/daily/$DUMP"
echo "restoring $DUMP into $TEST_DB"

psql_c() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -v ON_ERROR_STOP=1 -qAt "$@"; }
cleanup() { psql_c -d postgres -c "SET client_min_messages = warning" -c "DROP DATABASE IF EXISTS $TEST_DB" >/dev/null || true; }
trap cleanup EXIT

cleanup
psql_c -d postgres -c "CREATE DATABASE $TEST_DB"
docker exec -i "$PG_CONTAINER" pg_restore -U "$PG_USER" -d "$TEST_DB" --no-owner --exit-on-error < "$DUMP"

COUNTS="select 'users', count(*) from users union all select 'transactions', count(*) from transactions
  union all select 'categories', count(*) from categories union all select 'households', count(*) from households
  union all select 'migrations', count(*) from _migrations"
echo
printf '%-14s %10s %10s\n' table backup live
paste -d'|' <(psql_c -d "$TEST_DB" -c "$COUNTS") <(psql_c -d "$PG_DB" -c "$COUNTS") \
  | awk -F'|' '{ printf "%-14s %10s %10s\n", $1, $2, $4 }'
echo
echo "restore OK (live counts may be a little higher: they include everything since the dump)"
