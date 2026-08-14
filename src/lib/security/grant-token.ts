import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Concessão temporária de acesso a um recurso sensível, emitida após o gestor
 * reconfirmar a senha.
 *
 * O token da sessão (`manager_session`) é apenas base64 de `managerId:issuedAt`,
 * sem assinatura — quem o forjar entra como qualquer gestor. Para os dados de
 * risco de suicídio isso não serve: aqui o token é **assinado com HMAC** e
 * amarrado ao gestor, ao mapeamento e a um prazo curto, de modo que a
 * concessão não possa ser fabricada, reaproveitada em outro mapeamento nem
 * usada indefinidamente depois da confirmação.
 */

const GRANT_TTL_MS = 15 * 60 * 1000

/**
 * Chave derivada por rótulo a partir do segredo já existente no ambiente. A
 * separação por propósito evita que a mesma chave assine coisas diferentes (e
 * dispensa criar mais uma variável de ambiente no deploy).
 */
function getSigningKey(): Buffer {
  const secret = process.env.CPF_HMAC_SECRET ?? ''
  if (!secret) {
    throw new Error('CPF_HMAC_SECRET não configurado — necessário para assinar concessões de acesso.')
  }
  return createHmac('sha256', secret).update('risk-data-grant-v1').digest()
}

function sign(payload: string): string {
  return createHmac('sha256', getSigningKey()).update(payload).digest('base64url')
}

export function issueGrantToken(managerId: string, mappingId: string): { token: string; maxAgeSeconds: number } {
  const expiresAt = Date.now() + GRANT_TTL_MS
  const payload = `${managerId}.${mappingId}.${expiresAt}`
  return {
    token: `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`,
    maxAgeSeconds: Math.floor(GRANT_TTL_MS / 1000),
  }
}

/**
 * Só devolve `true` para um token íntegro, dentro do prazo e emitido para
 * exatamente este gestor e este mapeamento.
 */
export function verifyGrantToken(
  token: string | undefined,
  managerId: string,
  mappingId: string,
): boolean {
  if (!token) return false

  const separator = token.lastIndexOf('.')
  if (separator <= 0) return false

  const encodedPayload = token.slice(0, separator)
  const providedSignature = token.slice(separator + 1)

  let payload: string
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf-8')
  } catch {
    return false
  }

  const expected = Buffer.from(sign(payload))
  const provided = Buffer.from(providedSignature)
  if (expected.length !== provided.length) return false
  if (!timingSafeEqual(expected, provided)) return false

  const [tokenManagerId, tokenMappingId, expiresAtRaw] = payload.split('.')
  const expiresAt = Number(expiresAtRaw)

  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false
  return tokenManagerId === managerId && tokenMappingId === mappingId
}

export const RISK_DATA_GRANT_COOKIE = 'risk_data_grant'

/** Escopo de caminho do cookie: a concessão só viaja para as rotas que a exigem. */
export const RISK_DATA_GRANT_PATH = '/api/dashboard/risk-data'
