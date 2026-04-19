#!/bin/sh
set -e

mkdir -p /data

if [ -z "$ENVELOPS_MASTER_KEY" ]; then
  echo "[osops] ENVELOPS_MASTER_KEY is not set. Refusing to boot in production mode."
  echo "[osops] Generate one with: openssl rand -hex 32"
  exit 1
fi

# Apply pending migrations on every boot. Safe — Drizzle's migrator is idempotent.
node -e "
  const Database = require('better-sqlite3');
  const { drizzle } = require('drizzle-orm/better-sqlite3');
  const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
  const url = (process.env.DATABASE_URL || 'file:/data/osops.db').replace(/^file:/, '');
  const db = drizzle(new Database(url));
  migrate(db, { migrationsFolder: './lib/db/migrations' });
  console.log('[osops] migrations applied');
"

exec "$@"
