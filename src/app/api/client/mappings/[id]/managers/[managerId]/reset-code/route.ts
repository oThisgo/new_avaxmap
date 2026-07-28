import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { createServerClient } from '@/lib/supabase/server'
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
  const supabase = createServerClient()

  const { data: mapping, error: mappingError } = await supabase
    .from('mappings')
    .select('id, tenant_id')
    .eq('id', mappingId)
    .single()

  if (mappingError || !mapping) {
    return NextResponse.json({ error: 'Mapeamento não encontrado.' }, { status: 404 })
  }

  const { data: link, error: linkError } = await supabase
    .from('tenant_managers')
    .select('role')
    .eq('manager_id', manager.id)
    .eq('tenant_id', mapping.tenant_id)
    .single()

  if (linkError || !link || !['owner', 'admin'].includes(link.role ?? '')) {
    return NextResponse.json({ error: 'Sem permissão para redefinir código de acesso.' }, { status: 403 })
  }

  const { data: targetLink, error: targetLinkError } = await supabase
    .from('mapping_managers')
    .select('manager_id')
    .eq('mapping_id', mappingId)
    .eq('manager_id', managerId)
    .single()

  if (targetLinkError || !targetLink) {
    return NextResponse.json({ error: 'Gestor não vinculado a este mapeamento.' }, { status: 404 })
  }

  const temporaryPassword = generateTemporaryPassword(10)
  const bcryptHash = await hash(temporaryPassword, 12)

  const { error } = await supabase
    .from('managers')
    .update({ password_hash: wrapTemporaryHash(bcryptHash), temp_password_plain: temporaryPassword })
    .eq('id', managerId)

  if (error) {
    return NextResponse.json({ error: 'Erro ao redefinir código de acesso.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, temporary_password: temporaryPassword })
}
