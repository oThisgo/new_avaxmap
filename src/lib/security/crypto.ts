import { createHmac, createCipheriv, createDecipheriv, randomBytes } from 'crypto'

function getEncryptionKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY ?? ''
  if (hex.length !== 64) {
    throw new Error('FIELD_ENCRYPTION_KEY deve ser uma string hex de 32 bytes (64 caracteres). Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
  }
  return Buffer.from(hex, 'hex')
}

function getCpfSecret(): string {
  const secret = process.env.CPF_HMAC_SECRET ?? ''
  if (!secret) {
    throw new Error('CPF_HMAC_SECRET não configurado.')
  }
  return secret
}

/**
 * Gera HMAC-SHA256 determinístico do CPF.
 * Permite lookup por WHERE cpf = ? sem armazenar o CPF em texto claro.
 */
export function hashCpf(cpf: string): string {
  return createHmac('sha256', getCpfSecret()).update(cpf).digest('hex')
}

/**
 * Criptografa um campo com AES-256-GCM.
 * Retorna string no formato "iv_hex:tag_hex:ciphertext_hex".
 */
export function encryptField(value: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12) // 96-bit IV recomendado para GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Descriptografa um campo cifrado com AES-256-GCM.
 * Lança erro se o valor for adulterado (autenticação GCM).
 */
export function decryptField(encoded: string): string {
  const parts = encoded.split(':')
  if (parts.length !== 3) throw new Error('Formato de campo cifrado inválido')
  const [ivHex, tagHex, dataHex] = parts
  const key = getEncryptionKey()
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export function encryptFieldOrNull(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  return encryptField(value)
}

export function decryptFieldOrNull(encoded: string | null | undefined): string | null {
  if (encoded == null || encoded === '') return null
  try {
    return decryptField(encoded)
  } catch {
    return null
  }
}
