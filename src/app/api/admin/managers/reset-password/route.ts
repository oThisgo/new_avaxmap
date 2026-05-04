import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { createServerClient } from '@/lib/supabase/server'
import { generateTemporaryPassword, wrapTemporaryHash } from '@/lib/auth/password'
import { getManagerFromSession, isSuperuser } from '@/lib/auth/manager'

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  if (!isSuperuser(manager.role)) {
    return NextResponse.json({ error: 'Apenas superuser pode redefinir senha.' }, { status: 403 })
  }

  let body: { manager_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const managerId = body.manager_id?.trim() ?? ''
  if (!managerId) {
    return NextResponse.json({ error: 'manager_id é obrigatório.' }, { status: 400 })
  }

  const temporaryPassword = generateTemporaryPassword(10)
  const bcryptHash = await hash(temporaryPassword, 12)

  const supabase = createServerClient()
  const { error } = await supabase
    .from('managers')
    .update({ password_hash: wrapTemporaryHash(bcryptHash), temp_password_plain: temporaryPassword })
    .eq('id', managerId)

  if (error) {
    return NextResponse.json({ error: 'Erro ao redefinir senha.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, temporary_password: temporaryPassword })
}
