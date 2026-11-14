#!/bin/sh
# QA Commerce Lab API container entrypoint:
#   1. apply pending migrations (idempotent)
#   2. seed the reference dataset depending on SEED_ON_START (if-empty | always | reset | never)
#   3. start the API
set -e

echo "[entrypoint] Applying database migrations..."
npx --no-install prisma migrate deploy --schema prisma/schema.prisma

case "${SEED_ON_START:-if-empty}" in
  if-empty) node dist/prisma/seed.js --if-empty ;;
  always)   node dist/prisma/seed.js ;;
  reset)    node dist/prisma/seed.js --reset ;;
  never)    echo "[entrypoint] Skipping seed" ;;
  *)        echo "[entrypoint] Unknown SEED_ON_START=${SEED_ON_START}"; exit 1 ;;
esac

echo "[entrypoint] Starting API (APP_ENV=${APP_ENV:-local})"
exec node dist/src/main.js
