# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
# The schema has to be here before npm install, because postinstall runs
# `prisma generate` and it fails the whole install without one.
COPY prisma.config.ts ./
COPY prisma ./prisma
# npm ci currently rejects npm's cross-platform optional dependency entries
# (the lock was generated on macOS but the image is Linux). npm install still
# honors package-lock.json while resolving those platform-specific packages.
RUN npm install --no-audit --no-fund

FROM dependencies AS database
# A volume created before this project had migrations was built by `db push`
# and has no _prisma_migrations table, so `migrate deploy` would fail on
# already-existing types. Baseline it once, then apply.
CMD ["sh", "-c", "npx prisma migrate deploy || { npx prisma migrate resolve --applied 0_init && npx prisma migrate deploy; } && npm run db:seed"]

FROM dependencies AS development
COPY . .
RUN npm run prisma:generate
ENV NODE_ENV=development
EXPOSE 4600
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "4600"]

FROM dependencies AS builder
COPY . .
# Build-time placeholders are never used as production credentials. Runtime
# values are supplied by Compose or the deployment platform.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV AUTH_SECRET=build-only-placeholder-with-at-least-32-characters
RUN npm run prisma:generate && npx next build --webpack

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4600 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 4600
CMD ["node", "server.js"]
