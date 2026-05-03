import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createHash, timingSafeEqual } from 'crypto'
import { compare, hash } from 'bcryptjs'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'

const AUTH_WINDOW_MS = 60_000
const AUTH_LIMIT = 6

const DUMMY_BCRYPT_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

function hashPasswordLegacy(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

function timingSafeLegacyMatch(password: string, storedHash: string): boolean {
  const inputHash = hashPasswordLegacy(password)
  const normalizedHash = /^[a-f0-9]{64}$/i.test(storedHash) ? storedHash : '0'.repeat(64)
  const hashBuf = Buffer.from(inputHash, 'hex')
  const storedBuf = Buffer.from(normalizedHash, 'hex')
  return timingSafeEqual(hashBuf, storedBuf)
}

function isBcryptHash(value: string): boolean {
  return value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$')
}

// POST /api/auth/manager
// Body: { email: string, password: string }
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rateLimit = checkRateLimit(`auth:manager:${ip}`, AUTH_LIMIT, AUTH_WINDOW_MS)
  if (!rateLimit.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente em instantes.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { email, password } = body
  if (!email || !password) {
    return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()

  const supabase = createServerClient()
  const { data: manager, error } = await supabase
    .from('managers')
    .select('id, name, role, password_hash, is_active')
    .eq('email', normalizedEmail)
    .single()

  const storedHash = manager?.password_hash ?? ''

  // Mantém custo de verificação mesmo quando usuário não existe.
  if (!storedHash) {
    await compare(password, DUMMY_BCRYPT_HASH)
  }

  let match = false
  let usedLegacyHash = false

  if (isBcryptHash(storedHash)) {
    match = await compare(password, storedHash)
  } else {
    usedLegacyHash = true
    match = timingSafeLegacyMatch(password, storedHash)
  }

  if (error || !manager || !match || !manager.is_active) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
  }

  // Migração progressiva: hash legado -> bcrypt após login bem-sucedido.
  if (usedLegacyHash) {
    const newHash = await hash(password, 12)
    const { error: updateError } = await supabase
      .from('managers')
      .update({ password_hash: newHash })
      .eq('id', manager.id)

    if (updateError) {
      console.error('[auth:manager] falha ao migrar hash de senha para bcrypt', {
        managerId: manager.id,
        error: updateError.message,
      })
    }
  }

  const sessionToken = Buffer.from(`${manager.id}:${Date.now()}`).toString('base64')
  const cookieOpts = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 8,
    path: '/',
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('manager_session', sessionToken, { ...cookieOpts, httpOnly: true })
  // Cookie não-httpOnly apenas para exibição do nome/role no UI (sem dados sensíveis)
  response.cookies.set(
    'manager_display',
    JSON.stringify({ name: manager.name ?? '', email: normalizedEmail, role: manager.role ?? 'manager' }),
    { ...cookieOpts, httpOnly: false },
  )

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('manager_session')
  response.cookies.delete('manager_display')
  return response
}
