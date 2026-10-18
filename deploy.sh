#!/bin/bash
# Deploy script for finvu.pedani.eu + api.pedani.eu
# Usage:
#   ./deploy.sh            — deploy both frontend and backend
#   ./deploy.sh frontend   — only frontend
#   ./deploy.sh backend    — only backend

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_SRC="${REPO_ROOT}/finance-tracker"
BACKEND_SRC="${REPO_ROOT}/backend"

FRONTEND_DEST="/var/www/finance-tracker/finance-tracker/dist"


# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo ""; echo "▶  $*"; }
ok()   { echo "✓  $*"; }
fail() { echo "✗  $*" >&2; exit 1; }

# ── Argument parsing ──────────────────────────────────────────────────────────
TARGET="${1:-both}"
case "$TARGET" in
  frontend|backend|both) ;;
  *) fail "Unknown target '${TARGET}'. Use: frontend | backend | both" ;;
esac

# ── Pull latest code ──────────────────────────────────────────────────────────
log "Pulling latest code..."
cd "$REPO_ROOT"
git pull --ff-only
ok "Code up to date ($(git rev-parse --short HEAD))"

# ────────────────────────────────────────────────────────────────────────────
#  FRONTEND
# ────────────────────────────────────────────────────────────────────────────
deploy_frontend() {
    log "Building frontend..."
    cd "${FRONTEND_SRC}"
    rm -rf node_modules && npm cache clean --force
    npm ci --legacy-peer-deps
    npm run build
    ok "Frontend built → ${FRONTEND_SRC}/dist"

    log "Deploying frontend to ${FRONTEND_DEST}..."
    rm -rf "${FRONTEND_DEST:?}"/*
    cp -r "${FRONTEND_SRC}/dist/." "${FRONTEND_DEST}/"
    ok "Frontend files deployed"

    log "Reloading Nginx..."
    sudo nginx -t
    sudo systemctl reload nginx
    ok "Nginx reloaded"

    echo ""
    echo "  Frontend live at https://finvu.pedani.eu"
}

# ────────────────────────────────────────────────────────────────────────────
#  BACKEND
# ────────────────────────────────────────────────────────────────────────────
deploy_backend() {
    # Mirrors the "Deploy backend" step of .github/workflows/deploy.yml (the normal
    # way to deploy is a push to main — use this script only as a manual fallback).
    [ -n "${DATABASE_URL:-}" ] || fail "Set DATABASE_URL (the migration role, as in the GitHub secret) before deploying the backend"

    log "Running database migrations..."
    cd "${BACKEND_SRC}"
    npm ci --prefer-offline
    npm run db:migrate
    ok "Migrations applied"

    log "Rebuilding and replacing the backend container..."
    cd "${REPO_ROOT}"
    docker compose build backend
    docker compose up -d --no-deps --remove-orphans --wait --wait-timeout 90 backend \
        || { docker compose logs backend --tail=50; fail "Backend did not become healthy"; }
    ok "Backend container running and healthy"

    echo ""
    echo "  Backend live at https://api.pedani.eu"
}

# ────────────────────────────────────────────────────────────────────────────
#  Run
# ────────────────────────────────────────────────────────────────────────────
START=$(date +%s)

case "$TARGET" in
  frontend) deploy_frontend ;;
  backend)  deploy_backend  ;;
  both)     deploy_frontend; deploy_backend ;;
esac

END=$(date +%s)
echo ""
echo "════════════════════════════════════════"
echo "  Deploy complete in $((END - START))s"
echo "════════════════════════════════════════"
