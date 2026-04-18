import { createHash, randomBytes } from 'node:crypto'

const PREFIX = 'dxo_'

/** Mint a new opaque bearer token. Plaintext is returned once — caller stores only the hash. */
export function mintToken(): { plaintext: string; hash: string } {
  const plaintext = PREFIX + randomBytes(24).toString('base64url')
  return { plaintext, hash: hashToken(plaintext) }
}

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

/** 8 uppercase hex chars — matches the commercial ops device-code wire format. */
export function generateUserCode(): string {
  return randomBytes(4).toString('hex').toUpperCase()
}

/** 20 hex chars — matches the commercial ops device-code wire format. */
export function generateDeviceCode(): string {
  return randomBytes(10).toString('hex')
}
