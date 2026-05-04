import { NextRequest, NextResponse } from 'next/server'
import { compare, hash } from 'bcryptjs'
import { getManagerFromSession } from '@/lib/auth/manager'
import { createServerClient } from '@/lib/supabase/server'
import { unwrapHash } from '@/lib/auth/password'

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  let body: { current_password?: string; new_password?: string; confirm_password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const currentPassword = body.current_password?.trim() ?? ''
  const newPassword = body.new_password?.trim() ?? ''
  const confirmPassword = body.confirm_password?.trim() ?? ''

  if (!currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json({ error: 'Preencha todos os campos.' }, { status: 400 })
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' }, { status: 400 })
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: 'A confirmação de senha não confere.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: row, error } = await supabase
    .from('managers')
    .select('id, password_hash, name, email, role')
    .eq('id', manager.id)
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'Gestor não encontrado.' }, { status: 404 })
  }

  const stored = unwrapHash(row.password_hash ?? '')
  const valid = await compare(currentPassword, stored.hash)

  if (!valid) {
    return NextResponse.json({ error: 'Senha atual inválida.' }, { status: 401 })
  }

  const newHash = await hash(newPassword, 12)
  const { error: updateError } = await supabase
    .from('managers')
    .update({ password_hash: newHash, temp_password_plain: null })
    .eq('id', manager.id)

  if (updateError) {
    return NextResponse.json({ error: 'Erro ao atualizar senha.' }, { status: 500 })
  }

  const cookieOpts = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 8,
    path: '/',
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(
    'manager_display',
    JSON.stringify({
      name: row.name ?? '',
      email: row.email ?? '',
      role: row.role ?? 'manager',
      must_change_password: false,
    }),
    { ...cookieOpts, httpOnly: false },
  )

  return response
}
