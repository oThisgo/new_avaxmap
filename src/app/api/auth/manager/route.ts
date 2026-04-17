import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createHash, timingSafeEqual } from 'crypto'

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

// POST /api/auth/manager
// Body: { email: string, password: string }
export async function POST(request: NextRequest) {
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

  const supabase = createServerClient()
  const { data: manager, error } = await supabase
    .from('managers')
    .select('id, name, role, password_hash, is_active')
    .eq('email', email.toLowerCase().trim())
    .single()

  // Timing-safe: sempre compara mesmo se o gestor não for encontrado
  const inputHash = hashPassword(password)
  const storedHash = manager?.password_hash ?? '0'.repeat(64)
  const hashBuf = Buffer.from(inputHash, 'hex')
  const storedBuf = Buffer.from(storedHash.padEnd(64, '0').slice(0, 64), 'hex')
  const match = timingSafeEqual(hashBuf, storedBuf)

  if (error || !manager || !match || !manager.is_active) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
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
    JSON.stringify({ name: manager.name ?? '', email: email.toLowerCase().trim(), role: manager.role ?? 'manager' }),
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
