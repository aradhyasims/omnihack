#!/bin/sh
# Container start: optionally apply pending migrations (single-instance hosts such as Render,
# where there is no separate pre-deploy step), then start the Next.js server.
set -e
if [ "$MIGRATE_ON_START" = "true" ]; then
  echo "[start] applying database migrations"
  node migrator/node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma
fi
exec node server.js
