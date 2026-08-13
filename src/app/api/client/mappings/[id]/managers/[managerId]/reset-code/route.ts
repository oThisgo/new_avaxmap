import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db/pool'
import { getManagerFromSession } from '@/lib/auth/manager'
import { generateTemporaryPassword, wrapTemporaryHash } from '@/lib/auth/password'

interface RouteParams {
  params: Promise<{ id: string; managerId: string }>
}

export async function POST(request: NextRequest, { params }: Readonly<RouteParams>) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id: mappingId, managerId } = await params

  const mapping = await db
    .selectFrom('mappings')
    .select(['id', 'tenant_id'])
    .where('id', '=', mappingId)
    .executeTakeFirst()

  if (!mapping) {
    return NextResponse.json({ error: 'Mapeamento não encontrado.' }, { status: 404 })
  }

  const link = await db
    .selectFrom('tenant_managers')
    .select('role')
    .where('manager_id', '=', manager.id)
    .where('tenant_id', '=', mapping.tenant_id)
    .executeTakeFirst()

  if (!link || !['owner', 'admin'].includes(link.role ?? '')) {
    return NextResponse.json({ error: 'Sem permissão para redefinir código de acesso.' }, { status: 403 })
  }

  const targetLink = await db
    .selectFrom('mapping_managers')
    .select('manager_id')
    .where('mapping_id', '=', mappingId)
    .where('manager_id', '=', managerId)
    .executeTakeFirst()

  if (!targetLink) {
    return NextResponse.json({ error: 'Gestor não vinculado a este mapeamento.' }, { status: 404 })
  }

  const temporaryPassword = generateTemporaryPassword(10)
  const bcryptHash = await hash(temporaryPassword, 12)

  try {
    await db
      .updateTable('managers')
      .set({ password_hash: wrapTemporaryHash(bcryptHash), temp_password_plain: temporaryPassword })
      .where('id', '=', managerId)
      .execute()
  } catch {
    return NextResponse.json({ error: 'Erro ao redefinir código de acesso.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, temporary_password: temporaryPassword })
}
