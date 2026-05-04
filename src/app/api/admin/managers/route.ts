import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { createServerClient } from '@/lib/supabase/server'
import { generateTemporaryPassword, wrapTemporaryHash } from '@/lib/auth/password'
import { getManagerFromSession, isSuperuser } from '@/lib/auth/manager'

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  if (!isSuperuser(manager.role)) {
    return NextResponse.json({ error: 'Apenas superuser pode acessar esta área.' }, { status: 403 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('managers')
    .select('id, name, email, role, is_active, created_at, password_hash, temp_password_plain')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Falha ao listar gestores.' }, { status: 500 })
  }

  const rows = (data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role ?? 'manager',
    is_active: m.is_active,
    created_at: m.created_at,
    must_change_password: (m.password_hash ?? '').startsWith('temp$'),
    temp_password_plain: (m as Record<string, unknown>).temp_password_plain as string | null ?? null,
  }))

  return NextResponse.json({ managers: rows })
}

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  if (!isSuperuser(manager.role)) {
    return NextResponse.json({ error: 'Apenas superuser pode criar gestores.' }, { status: 403 })
  }

  let body: { name?: string; email?: string; role?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const name = body.name?.trim() ?? ''
  const email = body.email?.trim().toLowerCase() ?? ''
  const role = body.role?.trim() ?? 'manager'

  if (!name || !email) {
    return NextResponse.json({ error: 'Nome e email são obrigatórios.' }, { status: 400 })
  }

  if (!['superuser', 'admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Perfil inválido.' }, { status: 400 })
  }

  const temporaryPassword = generateTemporaryPassword(10)
  const bcryptHash = await hash(temporaryPassword, 12)

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('managers')
    .insert({
      name,
      email,
      role,
      is_active: true,
      password_hash: wrapTemporaryHash(bcryptHash),
      temp_password_plain: temporaryPassword,
    })
    .select('id, name, email, role, is_active, created_at')
    .single()

  if (error) {
    if (error.message.toLowerCase().includes('duplicate') || error.message.toLowerCase().includes('unique')) {
      return NextResponse.json({ error: 'Já existe gestor com esse e-mail.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erro ao criar gestor.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    manager: {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role ?? 'manager',
      is_active: data.is_active,
      created_at: data.created_at,
      must_change_password: true,
    },
    temporary_password: temporaryPassword,
  })
}

export async function DELETE(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  if (!isSuperuser(manager.role)) {
    return NextResponse.json({ error: 'Apenas superuser pode excluir gestores.' }, { status: 403 })
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

  if (managerId === manager.id) {
    return NextResponse.json({ error: 'Você não pode excluir a si mesmo.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase.from('managers').delete().eq('id', managerId)

  if (error) {
    return NextResponse.json({ error: 'Erro ao excluir gestor.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
