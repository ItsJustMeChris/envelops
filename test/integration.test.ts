import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../lib/db/client'
import { findOrCreateAccountByEmail } from '../lib/services/accounts'
import { approveDeviceCode, findPendingDeviceCodeByUserCode } from '../lib/services/oauth'

const OPS_BIN = 'dotenvx-ops'
const PORT = process.env.OSOPS_TEST_PORT ?? '3100'
const BASE = `http://127.0.0.1:${PORT}`

async function waitForServer(url: string, attempts = 60): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url)
      if (resp.ok || resp.status < 500) return
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`server never ready at ${url}`)
}

async function readUserCode(stream: NodeJS.ReadableStream): Promise<string> {
  for await (const chunk of stream) {
    const s = chunk.toString()
    const m = s.match(/\[([A-F0-9]{4}-[A-F0-9]{4}|[A-F0-9]{8})\]/)
    if (m) return m[1].replace('-', '')
  }
  throw new Error('user code not seen in cli output')
}

describe('phase 1: drop-in backend against commercial dotenvx-ops', () => {
  beforeAll(async () => {
    await waitForServer(`${BASE}/`)
  }, 60_000)

  afterAll(async () => {
    const { sqlite } = getDb()
    sqlite.close()
  })

  it('runs the full device-code login flow and then fetches a keypair', async () => {
    const account = await findOrCreateAccountByEmail(`integration+${Date.now()}@example.com`)

    // 1) Spawn the commercial CLI login, which hits POST /oauth/device/code.
    const login = spawn(OPS_BIN, ['login', '--hostname', BASE], {
      env: { ...process.env, DOTENVX_NO_OPS: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const stderrChunks: string[] = []
    login.stderr.on('data', (b) => stderrChunks.push(b.toString()))

    try {
      const userCode = await Promise.race([
        readUserCode(login.stdout),
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error('timeout reading user_code')), 10_000))
      ])

      // 2) Approve the device code server-side, as if a signed-in operator clicked "approve".
      const pending = await findPendingDeviceCodeByUserCode(userCode)
      expect(pending, `pending record should exist for user_code ${userCode}`).toBeTruthy()
      await approveDeviceCode(pending!.id, account.id)

      // 3) Wait for the CLI to stop polling (exit 0 on success).
      const [code] = await Promise.race([
        once(login, 'exit'),
        new Promise<[number | null]>((_, rej) =>
          setTimeout(() => rej(new Error(`login did not exit; stderr=${stderrChunks.join('')}`)), 20_000)
        )
      ])
      expect(code).toBe(0)
    } finally {
      if (!login.killed) login.kill('SIGKILL')
    }

    // 4) With the CLI now logged in, keypair should round-trip.
    const kp = await runCli(['keypair'])
    const parsed = JSON.parse(kp)
    expect(parsed.public_key).toMatch(/^0[23][0-9a-fA-F]{64}$/)
    expect(parsed.private_key).toMatch(/^[0-9a-fA-F]{64}$/)

    // 5) Fetching by an existing pubkey returns the same record.
    const again = JSON.parse(await runCli(['keypair', parsed.public_key]))
    expect(again.public_key).toBe(parsed.public_key)
    expect(again.private_key).toBe(parsed.private_key)
  }, 60_000)

  it('round-trips a secret via /api/set and /api/get', async () => {
    const uri = `dotenvx://rot_${Date.now().toString(16)}`
    const value = `sk_test_${Date.now()}`
    await runCli(['set', uri, value])
    const got = (await runCli(['get', uri])).trim()
    expect(got).toBe(value)
  }, 60_000)
})

async function runCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(OPS_BIN, args, {
      env: { ...process.env, DOTENVX_OPS_HOSTNAME: BASE }
    })
    const out: string[] = []
    const err: string[] = []
    proc.stdout.on('data', (b) => out.push(b.toString()))
    proc.stderr.on('data', (b) => err.push(b.toString()))
    proc.on('error', reject)
    proc.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`cli ${args.join(' ')} exit=${code} stderr=${err.join('')}`))
      resolve(out.join(''))
    })
  })
}
