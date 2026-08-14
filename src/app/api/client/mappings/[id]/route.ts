import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import type { Updateable } from 'kysely'
import { db } from '@/lib/db/pool'
import type { DB } from '@/types/kysely-db'
import { getManagerFromSession } from '@/lib/auth/manager'
import { generateTemporaryPassword, wrapTemporaryHash, TEMP_PASSWORD_PREFIX } from '@/lib/auth/password'
import { buildMappingConfig, type MappingConfigPayload } from '@/lib/mapping/config-payload'
import { LOGO_REJECTED_MESSAGE, normalizeLogoUrl } from '@/lib/mapping/logo'
import { isRichTextEmpty, sanitizeRichTextHtml } from '@/lib/tcle/rich-text'
import { MANAGER_ROLE_OPTIONS, type ManagerRole } from '@/lib/mapping/manager-roles'

const VALID_MANAGER_ROLES = new Set(MANAGER_ROLE_OPTIONS.map((opt) => opt.value))

interface RouteParams {
  params: Promise<{ id: string }>
}

type ManagerPayload = {
  name?: string
  email?: string
  role?: ManagerRole
}

async function requireMappingOwner(managerId: string, mappingId: string) {
  const mapping = await db
    .selectFrom('mappings')
    .select([
      'id', 'tenant_id', 'name', 'slug', 'description', 'status', 'module_type',
      'is_demo', 'created_at', 'updated_at', 'config', 'tcle_text', 'logo_url', 'csv_columns',
    ])
    .where('id', '=', mappingId)
    .executeTakeFirst()

  if (!mapping) {
    return { error: 'Mapeamento não encontrado.', status: 404 } as const
  }

  const link = await db
    .selectFrom('tenant_managers')
    .select('role')
    .where('manager_id', '=', managerId)
    .where('tenant_id', '=', mapping.tenant_id)
    .executeTakeFirst()

  if (!link || !['owner', 'admin'].includes(link.role ?? '')) {
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

  const result = await requireMappingOwner(manager.id, id)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  let mappingManagers
  try {
    mappingManagers = await db
      .selectFrom('mapping_managers')
      .select(['manager_id', 'role'])
      .where('mapping_id', '=', id)
      .execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao carregar gestores do mapeamento.' }, { status: 500 })
  }

  const managerIds = mappingManagers.map((link) => link.manager_id)
  let managerRows: Array<{
    id: string
    name: string
    email: string
    is_active: boolean
    password_hash: string
    temp_password_plain: string | null
  }> = []

  if (managerIds.length > 0) {
    try {
      managerRows = await db
        .selectFrom('managers')
        .select(['id', 'name', 'email', 'is_active', 'password_hash', 'temp_password_plain'])
        .where('id', 'in', managerIds)
        .execute()
    } catch {
      return NextResponse.json({ error: 'Falha ao carregar dados dos gestores.' }, { status: 500 })
    }
  }

  const roleByManagerId = new Map(mappingManagers.map((link) => [link.manager_id, link.role]))

  const managers = managerRows
    .map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      mapping_role: roleByManagerId.get(m.id) ?? 'viewer',
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

  const result = await requireMappingOwner(manager.id, id)
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
  const managerRole = payload.role && VALID_MANAGER_ROLES.has(payload.role) ? payload.role : 'viewer'

  if (!managerEmail || !managerName) {
    return NextResponse.json({ error: 'Nome e e-mail do gestor são obrigatórios.' }, { status: 400 })
  }

  const existingManager = await db
    .selectFrom('managers')
    .select('id')
    .where('email', '=', managerEmail)
    .executeTakeFirst()

  let targetManagerId: string | null = existingManager?.id ?? null
  let temporaryPassword: string | null = null

  if (!targetManagerId) {
    temporaryPassword = generateTemporaryPassword(10)
    const bcryptHash = await hash(temporaryPassword, 12)

    let insertedManager
    try {
      insertedManager = await db
        .insertInto('managers')
        .values({
          name: managerName,
          email: managerEmail,
          role: 'manager',
          is_active: true,
          password_hash: wrapTemporaryHash(bcryptHash),
          temp_password_plain: temporaryPassword,
        })
        .returning('id')
        .executeTakeFirst()
    } catch {
      insertedManager = undefined
    }

    if (!insertedManager) {
      return NextResponse.json({ error: 'Falha ao criar gestor.' }, { status: 500 })
    }

    targetManagerId = insertedManager.id
  }

  try {
    await db
      .insertInto('tenant_managers')
      .values({ tenant_id: result.mapping.tenant_id, manager_id: targetManagerId, role: managerRole })
      .onConflict((oc) => oc.columns(['tenant_id', 'manager_id']).doUpdateSet({ role: managerRole }))
      .execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao vincular gestor ao tenant.' }, { status: 500 })
  }

  try {
    await db
      .insertInto('mapping_managers')
      .values({ mapping_id: id, manager_id: targetManagerId, role: managerRole })
      .onConflict((oc) => oc.columns(['mapping_id', 'manager_id']).doUpdateSet({ role: managerRole }))
      .execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao vincular gestor ao mapeamento.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    created_manager_credential: temporaryPassword
      ? { email: managerEmail, temporary_password: temporaryPassword }
      : null,
  })
}

type MappingPatchPayload = MappingConfigPayload & {
  status?: 'draft' | 'active' | 'archived'
  name?: string
  tcle_text?: string
  /** String vazia ou `null` remove a logo do cliente; ausente preserva a atual. */
  logo_url?: string | null
  /**
   * Presente quando o gestor está editando a configuração do questionário/dashboard.
   * Sem esta flag o PATCH altera apenas status/nome/TCLE, preservando a config —
   * assim um PATCH parcial (ex.: só mudar o status) nunca zera a configuração.
   */
  update_config?: boolean
}

export async function PATCH(request: NextRequest, { params }: Readonly<RouteParams>) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id } = await params

  const result = await requireMappingOwner(manager.id, id)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  let payload: MappingPatchPayload
  try {
    payload = (await request.json()) as MappingPatchPayload
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const updates: Updateable<DB['mappings']> = {}

  if (payload.status !== undefined) {
    if (!['draft', 'active', 'archived'].includes(payload.status)) {
      return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
    }
    updates.status = payload.status
  }

  if (payload.name !== undefined) {
    const name = payload.name.trim()
    if (!name) {
      return NextResponse.json({ error: 'Nome do mapeamento não pode ficar vazio.' }, { status: 400 })
    }
    updates.name = name
  }

  if (payload.tcle_text !== undefined) {
    const sanitized = sanitizeRichTextHtml(payload.tcle_text)
    updates.tcle_text = isRichTextEmpty(sanitized) ? null : sanitized
  }

  if (payload.logo_url !== undefined) {
    const normalizedLogo = normalizeLogoUrl(payload.logo_url)
    // Enviar uma imagem inválida é erro; enviar vazio/null é remoção deliberada.
    if (!normalizedLogo && typeof payload.logo_url === 'string' && payload.logo_url.trim()) {
      return NextResponse.json({ error: LOGO_REJECTED_MESSAGE }, { status: 400 })
    }
    updates.logo_url = normalizedLogo
  }

  if (payload.update_config) {
    // As colunas já conhecidas do mapeamento continuam valendo como lista permitida
    // quando o gestor edita a configuração sem reenviar o CSV.
    const existingCsvColumns = Array.isArray(result.mapping.csv_columns)
      ? (result.mapping.csv_columns as string[])
      : []

    const { config, csvColumns, moduleType } = buildMappingConfig(payload, {
      fallbackCsvColumns: existingCsvColumns,
    })

    const modules = config.modules as string[]
    if (modules.length === 0) {
      return NextResponse.json(
        { error: 'Selecione ao menos um módulo para o mapeamento.' },
        { status: 400 },
      )
    }

    // config/csvColumns vêm tipados frouxamente (Record<string, unknown> / string[]) de
    // buildMappingConfig — o Kysely exige o formato Json exato da coluna jsonb.
    // csvColumns é array no topo: o driver `pg` serializaria isso como literal
    // de array do Postgres em vez de JSON, e a coluna é jsonb — precisa do
    // JSON.stringify explícito (ver mesmo ajuste em ../route.ts).
    updates.config = config as unknown as DB['mappings']['config']
    updates.csv_columns = JSON.stringify(csvColumns) as unknown as DB['mappings']['csv_columns']
    updates.module_type = moduleType
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
  }

  try {
    await db.updateTable('mappings').set(updates).where('id', '=', id).execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao atualizar o mapeamento.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updated: Object.keys(updates) })
}

type MappingDeletePayload = {
  /** Nome do mapeamento digitado pelo gestor para confirmar — checado contra o nome real. */
  confirm_name?: string
}

export async function DELETE(request: NextRequest, { params }: Readonly<RouteParams>) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { id } = await params

  const result = await requireMappingOwner(manager.id, id)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  let payload: MappingDeletePayload = {}
  try {
    payload = (await request.json()) as MappingDeletePayload
  } catch {
    // Corpo vazio cai no valor padrão acima e falha na checagem de nome abaixo.
  }

  // Defesa em profundidade além da confirmação na UI: sem o nome exato do
  // mapeamento, a exclusão (irreversível, cascateia colaboradores e
  // respostas) não acontece — nem via chamada direta à API.
  const confirmName = typeof payload.confirm_name === 'string' ? payload.confirm_name.trim() : ''
  if (confirmName !== result.mapping.name) {
    return NextResponse.json(
      { error: 'Digite o nome do mapeamento exatamente como exibido para confirmar a exclusão.' },
      { status: 400 },
    )
  }

  try {
    // Colaboradores (collaborators.mapping_id), respostas
    // (responses.collaborator_id) e vínculos de gestor com este mapeamento
    // (mapping_managers.mapping_id) caem junto via ON DELETE CASCADE — as
    // contas de gestor em si (`managers`) não são apagadas, só o vínculo.
    await db.deleteFrom('mappings').where('id', '=', id).execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao excluir o mapeamento.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
