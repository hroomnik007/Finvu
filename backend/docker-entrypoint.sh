#!/bin/sh
set -e
# Runs as root only long enough to make the uploads volume writable for the app user.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${UPLOAD_DIR:-/app/uploads}"
  chown -R node:node "${UPLOAD_DIR:-/app/uploads}"
  exec su-exec node "$@"
fi
exec "$@"
