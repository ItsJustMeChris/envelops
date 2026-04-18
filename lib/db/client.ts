import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import * as schema from './schema'

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>

const FILE_URL_RE = /^file:/

function resolveDbPath(raw: string | undefined): string {
  const value = raw && raw.length > 0 ? raw : 'file:./data/osops.db'
  const path = value.replace(FILE_URL_RE, '')
  return resolve(process.cwd(), path)
}

let cached: { db: DrizzleDB; sqlite: Database.Database } | null = null

export function getDb() {
  if (cached) return cached

  const path = resolveDbPath(process.env.DATABASE_URL)
  mkdirSync(dirname(path), { recursive: true })

  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const db = drizzle(sqlite, { schema })
  cached = { db, sqlite }
  return cached
}

export { schema }
