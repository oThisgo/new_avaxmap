import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { createServerClient } from '@/lib/supabase/server'
import { getManagerFromSession } from '@/lib/auth/manager'
import { generateTemporaryPassword, wrapTemporaryHash, TEMP_PASSWORD_PREFIX } from '@/lib/auth/password'

interface RouteParams {
  params: Promise<{ id: string }>
}

type ManagerPayload = {
  name?: string
  email?: string
  role?: 'owner' | 'superuser' | 'admin' | 'manager' | 'analyst' | 'viewer'
}

async function requireMappingOwner(
  supabase: ReturnType<typeof createServerClient>,
  managerId: string,
  mappingId: string,
) {
  const { data: mapping, error: mappingError } = await supabase
    .from('mappings')
    .select('id, tenant_id, name, slug, description, status, module_type, is_demo, created_at, updated_at')
    .eq('id', mappingId)
    .single()

  if (mappingError || !mapping) {
    return { error: 'Mapeamento não encontrado.', status: 404 } as const
  }

  const { data: link, error: linkError } = await supabase
    .from('tenant_managers')
    .select('role')
    .eq('manager_id', managerId)
    .eq('tenant_id', mapping.tenant_id)
    .single()

  if (linkError || !link || !['owner', 'admin'].includes(link.role ?? '')) {
    return { error: 'Sem permissão para acessar este mapeamento.', status: 403 } as const
  }

  return { mapping } as const
}

export async function GET(request: NextRequest, { params }: Readonly<RouteParams>) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id } = await params
  const supabase = createServerClient()

  const result = await requireMappingOwner(supabase, manager.id, id)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const { data: mappingManagers, error: mmError } = await supabase
    .from('mapping_managers')
    .select('manager_id, role')
    .eq('mapping_id', id)

  if (mmError) {
    return NextResponse.json({ error: 'Falha ao carregar gestores do mapeamento.' }, { status: 500 })
  }

  const managerIds = (mappingManagers ?? []).map((link) => link.manager_id)
  let managerRows: Array<{
    id: string
    name: string
    email: string
    is_active: boolean
    password_hash: string
    temp_password_plain: string | null
  }> = []

  if (managerIds.length > 0) {
    const { data, error: managersError } = await supabase
      .from('managers')
      .select('id, name, email, is_active, password_hash, temp_password_plain')
      .in('id', managerIds)

    if (managersError) {
      return NextResponse.json({ error: 'Falha ao carregar dados dos gestores.' }, { status: 500 })
    }

    managerRows = data ?? []
  }

  const roleByManagerId = new Map((mappingManagers ?? []).map((link) => [link.manager_id, link.role]))

  const managers = managerRows
    .map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      mapping_role: roleByManagerId.get(m.id) ?? 'manager',
      is_active: m.is_active,
      temp_password_plain: m.temp_password_plain ?? null,
      must_change_password: (m.password_hash ?? '').startsWith(TEMP_PASSWORD_PREFIX),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({ mapping: result.mapping, managers })
}

export async function POST(request: NextRequest, { params }: Readonly<RouteParams>) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id } = await params
  const supabase = createServerClient()

  const result = await requireMappingOwner(supabase, manager.id, id)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  let payload: ManagerPayload
  try {
    payload = (await request.json()) as ManagerPayload
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const managerEmail = (payload.email ?? '').trim().toLowerCase()
  const managerName = (payload.name ?? '').trim()
  const managerRole = payload.role ?? 'manager'

  if (!managerEmail || !managerName) {
    return NextResponse.json({ error: 'Nome e e-mail do gestor são obrigatórios.' }, { status: 400 })
  }

  const { data: existingManager } = await supabase
    .from('managers')
    .select('id')
    .eq('email', managerEmail)
    .single()

  let targetManagerId: string | null = existingManager?.id ?? null
  let temporaryPassword: string | null = null

  if (!targetManagerId) {
    temporaryPassword = generateTemporaryPassword(10)
    const bcryptHash = await hash(temporaryPassword, 12)

    const { data: insertedManager, error: insertManagerError } = await supabase
      .from('managers')
      .insert({
        name: managerName,
        email: managerEmail,
        role: 'manager',
        is_active: true,
        password_hash: wrapTemporaryHash(bcryptHash),
        temp_password_plain: temporaryPassword,
      })
      .select('id')
      .single()

    if (insertManagerError || !insertedManager) {
      return NextResponse.json({ error: 'Falha ao criar gestor.' }, { status: 500 })
    }

    targetManagerId = insertedManager.id
  }

  const { error: tenantError } = await supabase
    .from('tenant_managers')
    .upsert(
      { tenant_id: result.mapping.tenant_id, manager_id: targetManagerId, role: managerRole },
      { onConflict: 'tenant_id,manager_id', ignoreDuplicates: false },
    )

  if (tenantError) {
    return NextResponse.json({ error: 'Falha ao vincular gestor ao tenant.' }, { status: 500 })
  }

  const { error: mappingError } = await supabase
    .from('mapping_managers')
    .upsert(
      { mapping_id: id, manager_id: targetManagerId, role: managerRole },
      { onConflict: 'mapping_id,manager_id', ignoreDuplicates: false },
    )

  if (mappingError) {
    return NextResponse.json({ error: 'Falha ao vincular gestor ao mapeamento.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    created_manager_credential: temporaryPassword
      ? { email: managerEmail, temporary_password: temporaryPassword }
      : null,
  })
}

type MappingPatchPayload = {
  status?: 'draft' | 'active' | 'archived'
}

export async function PATCH(request: NextRequest, { params }: Readonly<RouteParams>) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id } = await params
  const supabase = createServerClient()

  const result = await requireMappingOwner(supabase, manager.id, id)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  let payload: MappingPatchPayload
  try {
    payload = (await request.json()) as MappingPatchPayload
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  if (!payload.status || !['draft', 'active', 'archived'].includes(payload.status)) {
    return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
  }

  const { error: updateError } = await supabase
    .from('mappings')
    .update({ status: payload.status })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: 'Falha ao atualizar o status do mapeamento.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: payload.status })
}
