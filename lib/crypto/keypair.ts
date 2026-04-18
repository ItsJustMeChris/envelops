import * as secp from '@noble/secp256k1'
import { bytesToHex } from '@noble/hashes/utils'

export interface Keypair {
  publicKey: string
  privateKey: string
}

/** Generate a fresh secp256k1 keypair. Returns hex — compressed pubkey (33 bytes → 66 chars). */
export function generateKeypair(): Keypair {
  const sk = secp.utils.randomPrivateKey()
  const pk = secp.getPublicKey(sk, true)
  return {
    privateKey: bytesToHex(sk),
    publicKey: bytesToHex(pk)
  }
}

export function isCompressedPublicKey(hex: string): boolean {
  return /^0[23][0-9a-fA-F]{64}$/.test(hex)
}

export function isValidPrivateKey(hex: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(hex)
}
