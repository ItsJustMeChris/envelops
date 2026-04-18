import { spawn } from 'node:child_process'
import { rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../lib/db/client'
import { findOrCreateAccountByEmail } from '../lib/services/accounts'
import { approveDeviceCode, findPendingDeviceCodeByUserCode } from '../lib/services/oauth'

const SHIM_BIN = path.resolve(__dirname, '../packages/cli-shim/bin/dotenvx-ops.js')
const PORT = process.env.OSOPS_TEST_PORT ?? '3100'
const BASE = `http://127.0.0.1:${PORT}`

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url)
      if (r.status < 500) return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`server not ready at ${url}`)
}

describe('phase 3: OSS cli shim round-trip', () => {
  let cliDir: string

  beforeAll(async () => {
    cliDir = mkdtempSync(path.join(tmpdir(), 'osops-shim-'))
    await waitForServer(`${BASE}/`)
  }, 60_000)

  afterAll(() => {
    rmSync(cliDir, { recursive: true, force: true })
    getDb().sqlite.close()
  })

  it('logs in and fetches a keypair via our shim against our server', async () => {
    const account = await findOrCreateAccountByEmail(`shim+${Date.now()}@example.com`)

    const login = spawn(SHIM_BIN, ['login', '--hostname', BASE], {
      env: { ...process.env, OSOPS_CLI_DIR: cliDir },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const stderr: string[] = []
    login.stderr.on('data', (b) => stderr.push(b.toString()))

    let userCode = ''
    for await (const chunk of login.stdout) {
      const s = chunk.toString()
      const m = s.match(/\[([A-F0-9]{4}-[A-F0-9]{4}|[A-F0-9]{8})\]/)
      if (m) { userCode = m[1].replace('-', ''); break }
    }
    expect(userCode).toMatch(/^[A-F0-9]{8}$/)

    const pending = await findPendingDeviceCodeByUserCode(userCode)
    expect(pending).toBeTruthy()
    await approveDeviceCode(pending!.id, account.id)

    const [code] = await Promise.race([
      once(login, 'exit'),
      new Promise<[number | null]>((_, rej) =>
        setTimeout(() => rej(new Error(`shim login did not exit; stderr=${stderr.join('')}`)), 20_000)
      )
    ])
    expect(code).toBe(0)

    const kp = await runShim(['keypair'], { OSOPS_CLI_DIR: cliDir })
    const parsed = JSON.parse(kp)
    expect(parsed.public_key).toMatch(/^0[23][0-9a-fA-F]{64}$/)
    expect(parsed.private_key).toMatch(/^[0-9a-fA-F]{64}$/)
  }, 60_000)
})

async function runShim(args: string[], env: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(SHIM_BIN, args, { env: { ...process.env, ...env } })
    const out: string[] = []
    const err: string[] = []
    proc.stdout.on('data', (b) => out.push(b.toString()))
    proc.stderr.on('data', (b) => err.push(b.toString()))
    proc.on('error', reject)
    proc.on('exit', (c) => {
      if (c !== 0) return reject(new Error(`shim ${args.join(' ')} exit=${c} stderr=${err.join('')}`))
      resolve(out.join(''))
    })
  })
}
