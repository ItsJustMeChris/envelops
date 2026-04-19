import { randomBytes } from 'node:crypto'
import { gcm } from '@noble/ciphers/aes'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils'

const ENV = 'ENVELOPS_MASTER_KEY'
const KEY_LEN = 32

function parse(raw: string): Uint8Array {
  try {
    return /^[0-9a-fA-F]{64}$/.test(raw)
      ? hexToBytes(raw)
      : new Uint8Array(Buffer.from(raw, 'base64'))
  } catch {
    throw new Error(`${ENV} is not valid hex-64 or base64`)
  }
}

function loadKey(): { id: string; key: Uint8Array } {
  const raw = process.env[ENV]
  if (!raw) {
    // Require explicit opt-in for the deterministic dev key. Falling back on
    // absence of NODE_ENV=production meant any deploy that forgot to set
    // NODE_ENV would silently encrypt every secret under a public constant.
    if (process.env.ENVELOPS_DEV_MODE !== '1') {
      throw new Error(`${ENV} must be set (or set ENVELOPS_DEV_MODE=1 to use the insecure dev fallback)`)
    }
    const key = utf8ToBytes('dev-master-key-not-for-production!!'.padEnd(KEY_LEN, '!')).slice(0, KEY_LEN)
    return { id: 'dev', key }
  }
  const key = parse(raw)
  if (key.length !== KEY_LEN) throw new Error(`${ENV} must decode to ${KEY_LEN} bytes (got ${key.length})`)
  // Short, stable identifier for the key so ciphertexts can reference which key encrypted them.
  const id = bytesToHex(key.slice(0, 4))
  return { id, key }
}

let cached: { id: string; key: Uint8Array } | null = null
export function masterKey() {
  if (!cached) cached = loadKey()
  return cached
}

/** Encrypt arbitrary bytes with the active master key. Returned format: `<keyId>:<nonceHex>:<ctHex>`. */
export function encryptWithMaster(plaintext: Uint8Array | string): { ciphertext: string; masterKeyId: string } {
  const mk = masterKey()
  const nonce = randomBytes(12)
  const pt = typeof plaintext === 'string' ? utf8ToBytes(plaintext) : plaintext
  const ct = gcm(mk.key, nonce).encrypt(pt)
  return {
    ciphertext: `${mk.id}:${bytesToHex(nonce)}:${bytesToHex(ct)}`,
    masterKeyId: mk.id
  }
}

export function decryptWithMaster(ciphertext: string): Uint8Array {
  const mk = masterKey()
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('bad ciphertext format')
  const [kid, nonceHex, ctHex] = parts
  if (kid !== mk.id) throw new Error(`ciphertext bound to master key ${kid}, active is ${mk.id}`)
  return gcm(mk.key, hexToBytes(nonceHex)).decrypt(hexToBytes(ctHex))
}
