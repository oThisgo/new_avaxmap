import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import type { DB } from '@/types/kysely-db'
import { getManagerFromSession } from '@/lib/auth/manager'
import { isRichTextEmpty, sanitizeRichTextHtml } from '@/lib/tcle/rich-text'
import { generateTemporaryPassword, wrapTemporaryHash } from '@/lib/auth/password'
import { hash } from 'bcryptjs'
import { randomBytes } from 'crypto'
import { buildMappingConfig, type MappingConfigPayload } from '@/lib/mapping/config-payload'
import { normalizeLogoUrl } from '@/lib/mapping/logo'
import { MANAGER_ROLE_OPTIONS, type ManagerRole } from '@/lib/mapping/manager-roles'

const VALID_MANAGER_ROLES = new Set(MANAGER_ROLE_OPTIONS.map((opt) => opt.value))

type MappingPayload = MappingConfigPayload & {
  name?: string
  status?: 'draft' | 'active' | 'archived'
  tcle_text?: string
  logo_url?: string | null
  managers?: Array<{
    name?: string
    email?: string
    role?: ManagerRole
  }>
}

function normalizeSlug(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function randomSuffix(length = 6): string {
  return randomBytes(length)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, length)
    .toLowerCase()
}

async function generateUniqueMappingSlug(name: string): Promise<string> {
  const base = normalizeSlug(name) || 'mapeamento'

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `${base}-${randomSuffix(6)}`
    const data = await db.selectFrom('mappings').select('id').where('slug', '=', candidate).limit(1).execute()

    if (data.length === 0) {
      return candidate
    }
  }

  return `${base}-${Date.now().toString(36)}`
}

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  let links
  try {
    links = await db
      .selectFrom('tenant_managers')
      .select(['tenant_id', 'role'])
      .where('manager_id', '=', manager.id)
      .orderBy('created_at', 'asc')
      .execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao carregar vínculo do cliente.' }, { status: 500 })
  }

  const firstLink = links[0]
  if (!firstLink?.tenant_id) {
    return NextResponse.json({ tenant: null, mappings: [] })
  }

  const tenant = await db
    .selectFrom('tenants')
    .select(['id', 'name', 'slug', 'is_active'])
    .where('id', '=', firstLink.tenant_id)
    .executeTakeFirst()

  if (!tenant) {
    return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  }

  let mappings
  try {
    mappings = await db
      .selectFrom('mappings')
      .select(['id', 'name', 'slug', 'description', 'status', 'module_type', 'is_demo', 'updated_at'])
      .where('tenant_id', '=', tenant.id)
      .orderBy('is_demo', 'desc')
      .orderBy('updated_at', 'desc')
      .execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao carregar mapeamentos do cliente.' }, { status: 500 })
  }

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      role: firstLink.role,
      is_active: tenant.is_active,
    },
    mappings,
  })
}

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  let payload: MappingPayload
  try {
    payload = (await request.json()) as MappingPayload
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const name = (payload.name ?? '').trim()
  const status = payload.status ?? 'draft'
  const { config, csvColumns, moduleType } = buildMappingConfig(payload)
  const sanitizedTcleText = sanitizeRichTextHtml(payload.tcle_text ?? '')
  const tcleText = isRichTextEmpty(sanitizedTcleText) ? null : sanitizedTcleText
  const managers = Array.isArray(payload.managers) ? payload.managers : []

  if (!name) {
    return NextResponse.json({ error: 'Nome do mapeamento é obrigatório.' }, { status: 400 })
  }

  const slug = await generateUniqueMappingSlug(name)

  let links
  try {
    links = await db
      .selectFrom('tenant_managers')
      .select(['tenant_id', 'role'])
      .where('manager_id', '=', manager.id)
      .orderBy('created_at', 'asc')
      .execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao validar acesso do owner.' }, { status: 500 })
  }

  const firstLink = links[0]
  if (!firstLink?.tenant_id) {
    return NextResponse.json({ error: 'Nenhum tenant vinculado ao usuário.' }, { status: 403 })
  }

  if (!['owner', 'admin'].includes(firstLink.role ?? '')) {
    return NextResponse.json({ error: 'Sem permissão para criar mapeamentos.' }, { status: 403 })
  }

  let mapping
  try {
    mapping = await db
      .insertInto('mappings')
      .values({
        tenant_id: firstLink.tenant_id,
        name,
        slug,
        description: null,
        status,
        module_type: moduleType,
        is_demo: false,
        tcle_text: tcleText,
        logo_url: normalizeLogoUrl(payload.logo_url),
        // csvColumns é um array no topo — o driver `pg` serializa array
        // top-level como literal de array do Postgres (`{"a","b"}`), não como
        // JSON (`["a","b"]"`), e a coluna é jsonb: dá "invalid input syntax
        // for type json" na escrita. JSON.stringify explícito evita a
        // serialização automática errada; `config` é objeto no topo, então
        // não sofre disso, mas ainda exige o cast — Kysely exige o formato
        // Json exato da coluna jsonb, e buildMappingConfig devolve tipos frouxos.
        csv_columns: JSON.stringify(csvColumns),
        config: config as unknown as DB['mappings']['config'],
      })
      .returning(['id', 'name', 'slug'])
      .executeTakeFirst()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Falha ao inserir mapping:', err)
    mapping = undefined
  }

  if (!mapping) {
    return NextResponse.json({ error: 'Falha ao criar mapeamento.' }, { status: 500 })
  }

  try {
    await db
      .insertInto('mapping_managers')
      .values({ mapping_id: mapping.id, manager_id: manager.id, role: 'owner' })
      .onConflict((oc) => oc.columns(['mapping_id', 'manager_id']).doUpdateSet({ role: 'owner' }))
      .execute()
  } catch {
    // Mesma tolerância do código original: falha aqui não invalida a criação do mapeamento.
  }

  const createdCredentials: Array<{ email: string; temporary_password: string }> = []
  const failedManagers: Array<{ email: string; error: string }> = []

  for (const managerInput of managers) {
    const managerEmail = (managerInput.email ?? '').trim().toLowerCase()
    const managerName = (managerInput.name ?? '').trim()
    const managerRole = managerInput.role && VALID_MANAGER_ROLES.has(managerInput.role) ? managerInput.role : 'viewer'

    if (!managerEmail || !managerName) continue

    const existingManager = await db
      .selectFrom('managers')
      .select('id')
      .where('email', '=', managerEmail)
      .executeTakeFirst()

    let targetManagerId = existingManager?.id ?? null
    let newTempPassword: string | null = null

    if (!targetManagerId) {
      const tempPassword = generateTemporaryPassword(10)
      const bcryptHash = await hash(tempPassword, 12)
      const wrappedHash = wrapTemporaryHash(bcryptHash)

      let insertedManager
      try {
        insertedManager = await db
          .insertInto('managers')
          .values({
            name: managerName,
            email: managerEmail,
            role: 'manager',
            is_active: true,
            password_hash: wrappedHash,
            temp_password_plain: tempPassword,
          })
          .returning('id')
          .executeTakeFirst()
      } catch {
        insertedManager = undefined
      }

      if (!insertedManager) {
        failedManagers.push({ email: managerEmail, error: 'Falha ao criar gestor.' })
        continue
      }

      targetManagerId = insertedManager.id
      newTempPassword = tempPassword
    }

    try {
      await db
        .insertInto('tenant_managers')
        .values({ tenant_id: firstLink.tenant_id, manager_id: targetManagerId, role: managerRole })
        .onConflict((oc) => oc.columns(['tenant_id', 'manager_id']).doUpdateSet({ role: managerRole }))
        .execute()
    } catch {
      failedManagers.push({ email: managerEmail, error: 'Falha ao vincular gestor ao tenant.' })
      continue
    }

    try {
      await db
        .insertInto('mapping_managers')
        .values({ mapping_id: mapping.id, manager_id: targetManagerId, role: managerRole })
        .onConflict((oc) => oc.columns(['mapping_id', 'manager_id']).doUpdateSet({ role: managerRole }))
        .execute()
    } catch {
      failedManagers.push({ email: managerEmail, error: 'Falha ao vincular gestor ao mapeamento.' })
      continue
    }

    if (newTempPassword) {
      createdCredentials.push({ email: managerEmail, temporary_password: newTempPassword })
    }
  }

  return NextResponse.json({
    ok: true,
    mapping,
    created_manager_credentials: createdCredentials,
    failed_managers: failedManagers,
  })
}
