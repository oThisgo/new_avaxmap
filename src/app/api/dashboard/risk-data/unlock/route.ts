import { NextRequest, NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { db } from '@/lib/db/pool'
import { unwrapHash } from '@/lib/auth/password'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import {
  RISK_DATA_GRANT_COOKIE,
  RISK_DATA_GRANT_PATH,
  issueGrantToken,
} from '@/lib/security/grant-token'
import { requireRiskDataAdmin } from '../guard'

/**
 * POST /api/dashboard/risk-data/unlock
 *
 * Reconfirmação de senha para liberar a lista nominal de colaboradores com
 * indicador de risco de suicídio. Em caso de sucesso emite uma concessão
 * assinada de curta duração (cookie httpOnly restrito ao caminho das rotas de
 * risco), que expira sozinha — reabrir a aba depois disso exige confirmar de
 * novo.
 */

const UNLOCK_WINDOW_MS = 5 * 60 * 1000
const UNLOCK_LIMIT = 5

export async function POST(request: NextRequest) {
  const context = await requireRiskDataAdmin(request)
  if (context instanceof NextResponse) return context

  // Limite por gestor + IP: a confirmação de senha é um alvo de força bruta, e
  // aqui o prêmio é justamente o dado mais sensível da plataforma.
  const ip = getClientIp(request.headers)
  const limiter = checkRateLimit(`risk-unlock:${context.managerId}:${ip}`, UNLOCK_LIMIT, UNLOCK_WINDOW_MS)
  if (!limiter.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000))
    return NextResponse.json(
      { error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const password = body.password?.trim() ?? ''
  if (!password) {
    return NextResponse.json({ error: 'Informe sua senha para continuar.' }, { status: 400 })
  }

  const row = await db
    .selectFrom('managers')
    .select(['password_hash'])
    .where('id', '=', context.managerId)
    .executeTakeFirst()

  if (!row) {
    return NextResponse.json({ error: 'Gestor não encontrado.' }, { status: 404 })
  }

  const stored = unwrapHash(row.password_hash ?? '')
  const valid = await compare(password, stored.hash)
  if (!valid) {
    return NextResponse.json({ error: 'Senha inválida.' }, { status: 401 })
  }

  const { token, maxAgeSeconds } = issueGrantToken(context.managerId, context.mappingId)

  const response = NextResponse.json({ ok: true, expires_in: maxAgeSeconds })
  response.cookies.set(RISK_DATA_GRANT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: RISK_DATA_GRANT_PATH,
    maxAge: maxAgeSeconds,
  })

  return response
}
