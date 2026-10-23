#!/bin/sh
# Container start: optionally apply pending migrations (single-instance hosts such as Render,
# where there is no separate pre-deploy step), then start the Next.js server.
set -e
# AWS (infra/cloudformation): the RDS password arrives separately from Secrets Manager, so build the URL here.
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME}?schema=public&sslmode=require"
fi
if [ "$MIGRATE_ON_START" = "true" ]; then
  echo "[start] applying database migrations"
  node migrator/node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma
fi
exec node server.js
