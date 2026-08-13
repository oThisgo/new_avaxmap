import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db/pool'
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

  let data
  try {
    data = await db
      .selectFrom('managers')
      .select(['id', 'name', 'email', 'role', 'is_active', 'created_at', 'password_hash', 'temp_password_plain'])
      .orderBy('created_at', 'desc')
      .execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao listar gestores.' }, { status: 500 })
  }

  const rows = data.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role ?? 'manager',
    is_active: m.is_active,
    created_at: m.created_at,
    must_change_password: (m.password_hash ?? '').startsWith('temp$'),
    temp_password_plain: m.temp_password_plain ?? null,
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

  let data
  try {
    data = await db
      .insertInto('managers')
      .values({
        name,
        email,
        role,
        is_active: true,
        password_hash: wrapTemporaryHash(bcryptHash),
        temp_password_plain: temporaryPassword,
      })
      .returning(['id', 'name', 'email', 'role', 'is_active', 'created_at'])
      .executeTakeFirstOrThrow()
  } catch (err) {
    // 23505 = unique_violation no Postgres
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
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

  try {
    await db.deleteFrom('managers').where('id', '=', managerId).execute()
  } catch {
    return NextResponse.json({ error: 'Erro ao excluir gestor.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
