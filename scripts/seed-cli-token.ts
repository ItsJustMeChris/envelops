// Seed a CLI bearer token without going through the device-code flow.
// Usage: npx tsx scripts/seed-cli-token.ts <email> [deviceSuffix]
// Prints: <token> on stdout. Everything else goes to stderr.
import { getDb } from '../lib/db/client'
import { findOrCreateAccountByEmail } from '../lib/services/accounts'
import { devices, tokens } from '../lib/db/schema'
import { hashToken, mintToken } from '../lib/crypto/tokens'
import { and, eq } from 'drizzle-orm'

const email = process.argv[2]
if (!email) {
  console.error('usage: seed-cli-token.ts <email> [deviceSuffix]')
  process.exit(1)
}

const suffix = process.argv[3] ?? 'seed'
const devicePublicKey = `02${Buffer.from(`${email}:${suffix}`).toString('hex').padEnd(64, '0').slice(0, 64)}`

async function main() {
  const { db, sqlite } = getDb()
  const account = await findOrCreateAccountByEmail(email)

  const existing = await db.query.devices.findFirst({
    where: and(eq(devices.accountId, account.id), eq(devices.publicKey, devicePublicKey))
  })
  const deviceId = existing
    ? existing.id
    : (await db.insert(devices).values({ accountId: account.id, publicKey: devicePublicKey, lastSeenAt: new Date() }).returning({ id: devices.id }))[0].id

  const { plaintext, hash } = mintToken()
  await db.insert(tokens).values({ accountId: account.id, deviceId, tokenHash: hash, scope: 'cli' })

  console.error(`[seed] account=${account.id} email=${email} device_pubkey=${devicePublicKey}`)
  process.stdout.write(plaintext)
  sqlite.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
