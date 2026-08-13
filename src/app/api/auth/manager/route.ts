import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { createHash, timingSafeEqual } from 'crypto'
import { compare, hash } from 'bcryptjs'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { unwrapHash } from '@/lib/auth/password'

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

  let body: { email?: string; password?: string; mapping_slug?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { email, password, mapping_slug } = body
  if (!email || !password) {
    return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()
  const normalizedMappingSlug = mapping_slug?.trim().toLowerCase() || null
  let mappingRole: string | null = null

  const manager = await db
    .selectFrom('managers')
    .select(['id', 'name', 'role', 'password_hash', 'is_active'])
    .where('email', '=', normalizedEmail)
    .executeTakeFirst()

  const storedHash = manager?.password_hash ?? ''
  const unwrapped = unwrapHash(storedHash)

  // Mantém custo de verificação mesmo quando usuário não existe.
  if (!storedHash) {
    await compare(password, DUMMY_BCRYPT_HASH)
  }

  let match = false
  let usedLegacyHash = false

  if (isBcryptHash(unwrapped.hash)) {
    match = await compare(password, unwrapped.hash)
  } else {
    usedLegacyHash = true
    match = timingSafeLegacyMatch(password, unwrapped.hash)
  }

  if (!manager || !match || !manager.is_active) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
  }

  if (normalizedMappingSlug) {
    const mapping = await db
      .selectFrom('mappings')
      .select(['id', 'slug', 'status'])
      .where('slug', '=', normalizedMappingSlug)
      .executeTakeFirst()

    if (!mapping || mapping.status !== 'active') {
      return NextResponse.json({ error: 'Mapeamento inválido ou inativo.' }, { status: 404 })
    }

    const access = await db
      .selectFrom('mapping_managers')
      .select(['id', 'role'])
      .where('mapping_id', '=', mapping.id)
      .where('manager_id', '=', manager.id)
      .executeTakeFirst()

    if (!access) {
      return NextResponse.json({ error: 'Sem acesso a este mapeamento.' }, { status: 403 })
    }

    mappingRole = access.role ?? null
  }

  // Migração progressiva: hash legado -> bcrypt após login bem-sucedido.
  if (usedLegacyHash) {
    const newHash = await hash(password, 12)
    try {
      await db.updateTable('managers').set({ password_hash: newHash }).where('id', '=', manager.id).execute()
    } catch (updateError) {
      console.error('[auth:manager] falha ao migrar hash de senha para bcrypt', {
        managerId: manager.id,
        error: updateError instanceof Error ? updateError.message : updateError,
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

  const response = NextResponse.json({ ok: true, must_change_password: unwrapped.temporary })
  response.cookies.set('manager_session', sessionToken, { ...cookieOpts, httpOnly: true })
  response.cookies.set('manager_scope', normalizedMappingSlug ? 'mapping' : 'client', {
    ...cookieOpts,
    httpOnly: true,
  })
  response.cookies.set('active_mapping_slug', normalizedMappingSlug ?? '', {
    ...cookieOpts,
    httpOnly: true,
    maxAge: normalizedMappingSlug ? 60 * 60 * 8 : 0,
  })
  // Cookie não-httpOnly apenas para exibição do nome/role no UI (sem dados sensíveis)
  response.cookies.set(
    'manager_display',
    JSON.stringify({
      name: manager.name ?? '',
      email: normalizedEmail,
      role: manager.role ?? 'manager',
      mapping_role: mappingRole,
      must_change_password: unwrapped.temporary,
      mapping_slug: normalizedMappingSlug,
    }),
    { ...cookieOpts, httpOnly: false },
  )

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('manager_session')
  response.cookies.delete('manager_display')
  response.cookies.delete('manager_scope')
  response.cookies.delete('active_mapping_slug')
  return response
}
