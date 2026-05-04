import { randomBytes } from 'crypto'

export const TEMP_PASSWORD_PREFIX = 'temp$'

export function wrapTemporaryHash(bcryptHash: string): string {
  return `${TEMP_PASSWORD_PREFIX}${bcryptHash}`
}

export function unwrapHash(passwordHash: string): { hash: string; temporary: boolean } {
  if (passwordHash.startsWith(TEMP_PASSWORD_PREFIX)) {
    return { hash: passwordHash.slice(TEMP_PASSWORD_PREFIX.length), temporary: true }
  }
  return { hash: passwordHash, temporary: false }
}

export function generateTemporaryPassword(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}
