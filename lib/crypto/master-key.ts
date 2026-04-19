import { createHash, randomBytes } from 'node:crypto'
import { gcm } from '@noble/ciphers/aes'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils'

const ENV = 'ENVELOPS_MASTER_KEY'
const KEY_LEN = 32
const ID_CONTEXT = 'envelops/master-key-id/v1'

function parse(raw: string): Uint8Array {
  try {
    return /^[0-9a-fA-F]{64}$/.test(raw)
      ? hexToBytes(raw)
      : new Uint8Array(Buffer.from(raw, 'base64'))
  } catch {
    throw new Error(`${ENV} is not valid hex-64 or base64`)
  }
}

function deriveKeyId(key: Uint8Array): string {
  // SHA-256(context || key) prefix. Doesn't reveal any bytes of the key, unlike
  // a raw key-prefix id.
  return createHash('sha256').update(ID_CONTEXT).update(key).digest('hex').slice(0, 8)
}

function loadKey(): { id: string; legacyId: string; key: Uint8Array } {
  const raw = process.env[ENV]
  if (!raw) {
    // Require explicit opt-in for the deterministic dev key. Falling back on
    // absence of NODE_ENV=production meant any deploy that forgot to set
    // NODE_ENV would silently encrypt every secret under a public constant.
    if (process.env.ENVELOPS_DEV_MODE !== '1') {
      throw new Error(`${ENV} must be set (or set ENVELOPS_DEV_MODE=1 to use the insecure dev fallback)`)
    }
    const key = utf8ToBytes('dev-master-key-not-for-production!!'.padEnd(KEY_LEN, '!')).slice(0, KEY_LEN)
    return { id: 'dev', legacyId: 'dev', key }
  }
  const key = parse(raw)
  if (key.length !== KEY_LEN) throw new Error(`${ENV} must decode to ${KEY_LEN} bytes (got ${key.length})`)
  // `legacyId` is the pre-fix derivation (raw 4-byte prefix of the key, exposed
  // in every ciphertext). Kept as an accepted-on-decrypt fallback so rows
  // written under the old scheme still open; new writes use `id`.
  return { id: deriveKeyId(key), legacyId: bytesToHex(key.slice(0, 4)), key }
}

let cached: { id: string; legacyId: string; key: Uint8Array } | null = null
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
  if (kid !== mk.id && kid !== mk.legacyId) {
    throw new Error(`ciphertext bound to master key ${kid}, active is ${mk.id}`)
  }
  return gcm(mk.key, hexToBytes(nonceHex)).decrypt(hexToBytes(ctHex))
}
