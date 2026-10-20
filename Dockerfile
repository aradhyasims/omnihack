# syntax=docker/dockerfile:1.7
# Multi-stage build producing one image used for both the web app and the background worker.
#   web:    docker run ... omnihack                      (default CMD; MIGRATE_ON_START=true to migrate first)
#   worker: docker run ... omnihack node dist/worker.js
#   migrations (one-off task before deploy): docker run ... omnihack npx prisma migrate deploy

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts=false

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build && npm run build:worker

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 omnihack && useradd --system --uid 1001 --gid omnihack omnihack
COPY --from=build --chown=omnihack:omnihack /app/.next/standalone ./
COPY --from=build --chown=omnihack:omnihack /app/.next/static ./.next/static
COPY --from=build --chown=omnihack:omnihack /app/public ./public
COPY --from=build --chown=omnihack:omnihack /app/dist ./dist
COPY --from=build --chown=omnihack:omnihack /app/prisma ./prisma
COPY --from=build --chown=omnihack:omnihack /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=omnihack:omnihack /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=omnihack:omnihack /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=omnihack:omnihack /app/scripts/start.sh ./start.sh
USER omnihack
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# start.sh runs migrations first when MIGRATE_ON_START=true (e.g. Render), then `node server.js`.
CMD ["sh", "./start.sh"]
