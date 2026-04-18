'use strict'

const settings = require('./settings')
const { request } = require('./http')

const PKG_VERSION = require('../package.json').version

function die(msg, code = 1) {
  process.stderr.write(`☠ ${msg}\n`)
  process.exit(code)
}

async function cmdStatus() {
  process.stdout.write(settings.loggedIn() ? 'on' : 'off')
}

async function cmdKeypair(argv) {
  const publicKey = argv[0]
  const hostname = settings.hostname()
  const token = settings.token()
  if (!hostname || !token) die('not logged in. run: dotenvx-ops login --hostname <url>')

  const body = {
    device_public_key: settings.devicePublicKey(),
    cli_version: PKG_VERSION
  }
  if (publicKey) body.public_key = publicKey

  const { status, body: resp } = await request(`${hostname}/api/keypair`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body
  })
  if (status >= 400) die(`[${status}] ${resp?.error ?? 'error'}: ${resp?.error_description ?? ''}`)
  process.stdout.write(JSON.stringify({ public_key: resp.public_key, private_key: resp.private_key }))
}

async function cmdRotate(argv) {
  const uri = argv.find((a) => a.startsWith('dotenvx://'))
  if (!uri) die('usage: dotenvx-ops rotate <uri>')
  const hostname = settings.hostname()
  const token = settings.token()
  if (!hostname || !token) die('not logged in')

  const { status, body } = await request(`${hostname}/api/rotate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: { uri }
  })
  if (status >= 400) die(`[${status}] ${body?.error ?? 'error'}: ${body?.error_description ?? ''}`)
  process.stderr.write(`✔ rotated [${body.uri}]\n`)
  process.stderr.write(`⮕ next run [dotenvx-ops get dotenvx://${body.rot_uid}]\n`)
}

async function cmdSet(argv) {
  const uri = argv[0]
  const value = argv[1]
  if (!uri || value == null) die('usage: dotenvx-ops set <uri> <value>')
  const hostname = settings.hostname()
  const token = settings.token()
  if (!hostname || !token) die('not logged in')

  const { status, body } = await request(`${hostname}/api/set`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: { device_public_key: settings.devicePublicKey(), uri, value }
  })
  if (status >= 400) die(`[${status}] ${body?.error ?? 'error'}: ${body?.error_description ?? ''}`)
  process.stderr.write(`✔ set [${uri}]\n`)
}

async function cmdGet(argv) {
  const uri = argv[0]
  if (!uri) die('usage: dotenvx-ops get <uri>')
  const hostname = settings.hostname()
  const token = settings.token()
  if (!hostname || !token) die('not logged in')

  const { status, body, raw } = await request(`${hostname}/api/get`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: { uri }
  })
  if (status >= 400) die(`[${status}] ${body?.error ?? 'error'}: ${body?.error_description ?? ''}`)
  process.stdout.write(typeof body === 'string' ? body : raw)
}

async function cmdObserve(argv) {
  const encoded = argv[0]
  if (!encoded) die('usage: dotenvx-ops observe <base64>')
  const hostname = settings.hostname()
  const token = settings.token()
  if (!hostname || !token) return // silent: the OSS dotenvx integration expects best-effort

  await request(`${hostname}/api/observe`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: {
      encoded,
      observed_at: new Date().toISOString(),
      pwd: process.env.PWD ?? null,
      cli_version: PKG_VERSION
    }
  }).catch(() => {})
}

async function cmdLogin(argv) {
  const hostname = extractFlag(argv, '--hostname') || settings.hostname() || promptRequired('--hostname <url>')
  const devicePublicKey = settings.devicePublicKey()

  const { status, body } = await request(`${hostname}/oauth/device/code`, {
    method: 'POST',
    body: { client_id: 'oac_dotenvxcli', device_public_key: devicePublicKey }
  })
  if (status >= 400) die(`[${status}] device/code failed: ${body?.error_description ?? ''}`)

  process.stdout.write(`open [${body.verification_uri_complete}] and enter code [${formatUserCode(body.user_code)}]\n`)

  const start = Date.now()
  const ttl = body.expires_in * 1000
  let interval = body.interval * 1000
  while (Date.now() - start < ttl) {
    await sleep(interval)
    const { status: tStatus, body: tBody } = await request(`${hostname}/oauth/token`, {
      method: 'POST',
      body: {
        client_id: 'oac_dotenvxcli',
        device_code: body.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      }
    })
    if (tStatus < 400) {
      settings.setSession({
        hostname,
        token: tBody.access_token,
        username: tBody.username,
        id: tBody.id
      })
      process.stderr.write(`✔ logged in [${tBody.username}]\n`)
      return
    }
    if (tBody?.error === 'authorization_pending') {
      interval += 1000
      continue
    }
    die(`[${tStatus}] ${tBody?.error ?? 'error'}: ${tBody?.error_description ?? ''}`)
  }
  die('login expired without approval')
}

async function cmdLogout() {
  const hostname = settings.hostname()
  const token = settings.token()
  if (hostname && token) {
    await request(`${hostname}/api/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` }
    }).catch(() => {})
  }
  settings.clearSession()
  process.stdout.write('✔ logged out\n')
}

function extractFlag(argv, flag) {
  const i = argv.indexOf(flag)
  if (i === -1) return null
  return argv[i + 1] ?? null
}

function promptRequired(msg) {
  die(`missing ${msg}`)
}

function formatUserCode(code) {
  if (!code || code.length !== 8) return code
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

module.exports = {
  cmdStatus,
  cmdKeypair,
  cmdObserve,
  cmdLogin,
  cmdLogout,
  cmdRotate,
  cmdSet,
  cmdGet
}
