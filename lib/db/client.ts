import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import * as schema from './schema'

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>

const FILE_URL_RE = /^file:/

function resolveDbPath(raw: string | undefined): string {
  const value = raw && raw.length > 0 ? raw : 'file:./data/envelops.db'
  const path = value.replace(FILE_URL_RE, '')
  if (isAbsolute(path)) return resolve(path)
  const cwd = process.cwd()
  const resolved = resolve(cwd, path)
  const rel = relative(cwd, resolved)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('DATABASE_URL relative path escapes working directory')
  }
  return resolved
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
