# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm rebuild better-sqlite3

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
    && npm rebuild better-sqlite3
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx drizzle-kit generate || true \
    && npm run build

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/data/envelops.db

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/lib/db/migrations ./lib/db/migrations
COPY --from=deps --chown=node:node /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder --chown=node:node /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --chown=node:node docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && mkdir -p /data \
    && chown -R node:node /data

EXPOSE 3000
VOLUME ["/data"]
USER node
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
CMD ["node", "server.js"]
