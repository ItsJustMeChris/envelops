import * as secp from '@noble/secp256k1'
import { bytesToHex } from '@noble/hashes/utils.js'

export interface Keypair {
  publicKey: string
  privateKey: string
}

/** Generate a fresh secp256k1 keypair. Returns hex — compressed pubkey (33 bytes → 66 chars). */
export function generateKeypair(): Keypair {
  const { secretKey, publicKey } = secp.keygen()
  return {
    privateKey: bytesToHex(secretKey),
    publicKey: bytesToHex(publicKey)
  }
}

export function isCompressedPublicKey(hex: string): boolean {
  return /^0[23][0-9a-fA-F]{64}$/.test(hex)
}

export function isValidPrivateKey(hex: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(hex)
}
