'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

// Co-exist with the commercial binary by using a distinct dir. Users switching over
// intentionally log in again; we do not read the commercial settings file.
const DIR = process.env.ENVELOPS_CLI_DIR || path.join(os.homedir(), '.envelops')
const FILE = path.join(DIR, 'settings.json')

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    return {}
  }
}

function save(data) {
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), { mode: 0o600 })
}

function devicePublicKey() {
  const current = load()
  if (current.device_public_key) return current.device_public_key
  // Deterministic per-install fingerprint so device identity is stable across restarts.
  const material = `${os.hostname()}|${os.userInfo().username}|${DIR}`
  const hash = crypto.createHash('sha256').update(material).digest()
  const pub = '02' + hash.toString('hex')
  save({ ...current, device_public_key: pub })
  return pub
}

function hostname() {
  return process.env.DOTENVX_OPS_HOSTNAME || load().hostname || null
}

function token() {
  return process.env.DOTENVX_OPS_TOKEN || load().token || null
}

function loggedIn() {
  return Boolean(token() && hostname())
}

function setSession({ hostname: hn, token: tok, username, id }) {
  save({ ...load(), hostname: hn, token: tok, username, id, logged_in_at: new Date().toISOString() })
}

function clearSession() {
  const cur = load()
  delete cur.token
  delete cur.username
  delete cur.id
  delete cur.logged_in_at
  save(cur)
}

module.exports = {
  DIR,
  FILE,
  load,
  save,
  devicePublicKey,
  hostname,
  token,
  loggedIn,
  setSession,
  clearSession
}
