import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getDb } from './client'

const { db } = getDb()
migrate(db, { migrationsFolder: './lib/db/migrations' })
console.log('migrations applied')
process.exit(0)
