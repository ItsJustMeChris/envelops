// Full end-to-end armor test: spawns the real commercial `dotenvx` + `dotenvx-ops` binaries
// in a sandboxed HOME, drives the device-code login programmatically, runs `dotenvx encrypt`
// against our server as the keystore, asserts no .env.keys exists on disk, then decrypts via
// `dotenvx run` and checks the plaintext comes back.
//
// This is the ONLY test that covers the seam between the two commercial CLIs and our server.
// Everything else stops at the ops binary boundary.
//
// Precondition: a dev server is running at $ENVELOPS_TEST_PORT (default 3100) with the same
// data/ DB this test process opens. Run with:
//   ENVELOPS_BASE_URL=http://localhost:3100 PORT=3100 npm run dev &
//   npx vitest run -c vitest.e2e.config.ts test/armor.test.ts

import { execFile, spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../lib/db/client'
import { findOrCreateAccountByEmail } from '../lib/services/accounts'
import { approveDeviceCode, findPendingDeviceCodeByUserCode } from '../lib/services/oauth'

const execFileP = promisify(execFile)

const OPS_BIN = 'dotenvx-ops'
const DOTENVX_BIN = 'dotenvx'
const PORT = process.env.ENVELOPS_TEST_PORT ?? '3100'
const BASE = `http://127.0.0.1:${PORT}`

async function waitForServer(url: string, attempts = 60): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url)
      if (resp.status < 500) return
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`server never ready at ${url}`)
}

async function binaryExists(bin: string): Promise<boolean> {
  try {
    await execFileP('which', [bin])
    return true
  } catch {
    return false
  }
}

/**
 * Drive the commercial `dotenvx-ops login` device-code flow in a sandboxed HOME so the
 * user's real production session is untouched. Approves the code via our own service
 * layer (simulating a signed-in operator clicking the approve button in the panel).
 *
 * Returns the sandbox HOME path — every subsequent `dotenvx`/`dotenvx-ops` call in the
 * test must run with this HOME so they share the session file.
 */
async function loginInSandbox(accountId: number): Promise<{ home: string }> {
  const home = mkdtempSync(path.join(tmpdir(), 'osops-armor-home-'))
  const login = spawn(OPS_BIN, ['login', '--hostname', BASE], {
    env: { ...process.env, HOME: home, DOTENVX_NO_OPS: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const stderrBuf: string[] = []
  login.stderr.on('data', (b) => stderrBuf.push(b.toString()))

  let userCode = ''
  for await (const chunk of login.stdout) {
    const s = chunk.toString()
    const m = s.match(/\[([A-F0-9]{4}-[A-F0-9]{4}|[A-F0-9]{8})\]/)
    if (m) {
      userCode = m[1].replace('-', '')
      break
    }
  }
  if (!userCode) {
    login.kill('SIGKILL')
    throw new Error(`user_code not seen in cli output; stderr=${stderrBuf.join('')}`)
  }

  const pending = await findPendingDeviceCodeByUserCode(userCode)
  if (!pending) {
    login.kill('SIGKILL')
    throw new Error(`no pending device code for user_code ${userCode}`)
  }
  await approveDeviceCode(pending.id, accountId)

  const [code] = await Promise.race([
    once(login, 'exit'),
    new Promise<[number | null]>((_, rej) =>
      setTimeout(() => {
        login.kill('SIGKILL')
        rej(new Error(`login did not exit within 20s; stderr=${stderrBuf.join('')}`))
      }, 20_000)
    )
  ])
  if (code !== 0) throw new Error(`login exit=${code}; stderr=${stderrBuf.join('')}`)

  return { home }
}

function runBinary(
  bin: string,
  args: string[],
  options: { home: string; cwd?: string; input?: string } = { home: '' }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, {
      env: { ...process.env, HOME: options.home },
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const out: string[] = []
    const err: string[] = []
    proc.stdout.on('data', (b) => out.push(b.toString()))
    proc.stderr.on('data', (b) => err.push(b.toString()))
    if (options.input) {
      proc.stdin.write(options.input)
      proc.stdin.end()
    } else {
      proc.stdin.end()
    }
    proc.on('error', reject)
    proc.on('exit', (code) => {
      const stdout = out.join('')
      const stderr = err.join('')
      if (code !== 0) return reject(new Error(`${bin} ${args.join(' ')} exit=${code}\nstdout: ${stdout}\nstderr: ${stderr}`))
      resolve({ stdout, stderr })
    })
  })
}

describe('full armor flow: dotenvx + dotenvx-ops against our server', () => {
  const sandboxes: string[] = []

  beforeAll(async () => {
    const hasOps = await binaryExists(OPS_BIN)
    const hasDotenvx = await binaryExists(DOTENVX_BIN)
    if (!hasOps || !hasDotenvx) {
      throw new Error(`this test needs both \`${OPS_BIN}\` and \`${DOTENVX_BIN}\` on PATH`)
    }
    await waitForServer(`${BASE}/`)
  }, 60_000)

  afterAll(() => {
    for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true })
    getDb().sqlite.close()
  })

  it('dotenvx encrypt uses our server as the keystore; .env.keys is never written; decrypt round-trips', async () => {
    const account = await findOrCreateAccountByEmail(`armor+${Date.now()}@example.com`)
    const { home } = await loginInSandbox(account.id)
    sandboxes.push(home)

    // Sanity: the ops binary should now report "on" against our server.
    const status = await runBinary(OPS_BIN, ['status'], { home })
    expect(status.stdout.trim()).toBe('on')

    // Prepare a fresh project directory with a plaintext .env.
    const project = mkdtempSync(path.join(tmpdir(), 'osops-armor-proj-'))
    sandboxes.push(project)
    const plainValue = `hunter2-${Date.now()}`
    writeFileSync(path.join(project, '.env'), `HELLO=${plainValue}\n`)

    // Run the commercial dotenvx encrypt. Under the hood it spawns `dotenvx-ops status`
    // (gets "on"), then `dotenvx-ops keypair` which hits our /api/keypair to mint an
    // "armored" key pair stored server-side.
    const encrypt = await runBinary(DOTENVX_BIN, ['encrypt'], { home, cwd: project })

    // The UX hint dotenvx prints on success. If armor is active the phrase will include
    // "armored key"; if it fell back to a local key it prints "local key (.env.keys)".
    expect(encrypt.stderr + encrypt.stdout).toMatch(/armored key/i)
    expect(encrypt.stderr + encrypt.stdout).not.toMatch(/local key/i)

    // The whole pitch: no private key material on disk.
    expect(existsSync(path.join(project, '.env.keys'))).toBe(false)

    // The ciphertext .env should NOT contain the plaintext.
    const envAfter = readFileSync(path.join(project, '.env'), 'utf8')
    expect(envAfter).not.toContain(plainValue)
    expect(envAfter).toMatch(/HELLO=encrypted:/)

    // Decrypt round-trip: `dotenvx run` must resolve HELLO by pulling the armored private
    // key back through `dotenvx-ops keypair <pubkey>` and decrypting in-process.
    const run = await runBinary(DOTENVX_BIN, ['run', '--', 'sh', '-c', 'echo "HELLO=$HELLO"'], {
      home,
      cwd: project
    })
    expect(run.stdout).toContain(`HELLO=${plainValue}`)
  }, 60_000)
})
