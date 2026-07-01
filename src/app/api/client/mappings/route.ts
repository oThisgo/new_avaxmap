import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getManagerFromSession } from '@/lib/auth/manager'
import { isRichTextEmpty, sanitizeRichTextHtml } from '@/lib/tcle/rich-text'
import { generateTemporaryPassword, wrapTemporaryHash } from '@/lib/auth/password'
import { hash } from 'bcryptjs'
import { randomBytes } from 'crypto'

type MappingPayload = {
  name?: string
  status?: 'draft' | 'active' | 'archived'
  modules?: string[]
  csv_columns?: string[]
  credential_column?: string
  stratification_columns?: string[]
  demographic_columns?: string[]
  column_display_names?: Record<string, string>
  column_profiles?: Array<{
    source_name?: string
    display_name?: string
    is_dashboard_filter?: boolean
    is_demographic?: boolean
    locked?: boolean
    locked_reason?: string | null
  }>
  column_mapping?: Record<string, string>
  tcle_text?: string
  dashboard_filters?: string[]
  managers?: Array<{
    name?: string
    email?: string
    role?: 'owner' | 'manager' | 'analyst' | 'viewer'
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

async function generateUniqueMappingSlug(
  supabase: ReturnType<typeof createServerClient>,
  name: string,
): Promise<string> {
  const base = normalizeSlug(name) || 'mapeamento'

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `${base}-${randomSuffix(6)}`
    const { data } = await supabase
      .from('mappings')
      .select('id')
      .eq('slug', candidate)
      .limit(1)

    if (!data || data.length === 0) {
      return candidate
    }
  }

  return `${base}-${Date.now().toString(36)}`
}

function normalizeCsvColumns(cols: unknown): string[] {
  if (!Array.isArray(cols)) return []
  return cols
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
}

function normalizeFilters(filters: unknown): string[] {
  if (!Array.isArray(filters)) return []
  return filters
    .filter((f): f is string => typeof f === 'string')
    .map((f) => f.trim())
    .filter((f) => f.length > 0)
}

function normalizeStratificationColumns(columns: unknown): string[] {
  if (!Array.isArray(columns)) return []
  return columns
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
}

function normalizeColumnMapping(
  value: unknown,
  csvColumns: string[],
): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const allowedColumns = new Set(csvColumns)
  const output: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v !== 'string') continue
    const key = k.trim()
    const column = v.trim()
    if (!key || !column) continue
    if (!allowedColumns.has(column)) continue
    output[key] = column
  }
  return output
}

type NormalizedColumnProfile = {
  source_name: string
  display_name: string
  is_dashboard_filter: boolean
  is_demographic: boolean
  locked: boolean
  locked_reason: string | null
}

function normalizeColumnProfiles(
  value: unknown,
  csvColumns: string[],
): NormalizedColumnProfile[] {
  if (!Array.isArray(value)) return []
  const allowedColumns = new Set(csvColumns)
  const profiles: NormalizedColumnProfile[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const sourceName = typeof row.source_name === 'string' ? row.source_name.trim() : ''
    if (!sourceName || !allowedColumns.has(sourceName)) continue

    const displayName = typeof row.display_name === 'string' && row.display_name.trim().length > 0
      ? row.display_name.trim()
      : sourceName

    profiles.push({
      source_name: sourceName,
      display_name: displayName,
      is_dashboard_filter: row.is_dashboard_filter === true,
      is_demographic: row.is_demographic === true,
      locked: row.locked === true,
      locked_reason: typeof row.locked_reason === 'string' ? row.locked_reason : null,
    })
  }

  return profiles
}

function normalizeColumnDisplayNames(
  value: unknown,
  csvColumns: string[],
): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const allowedColumns = new Set(csvColumns)
  const output: Record<string, string> = {}

  for (const [key, rawLabel] of Object.entries(value as Record<string, unknown>)) {
    const column = key.trim()
    if (!column || !allowedColumns.has(column)) continue
    if (typeof rawLabel !== 'string') continue
    const label = rawLabel.trim()
    output[column] = label || column
  }

  return output
}

function normalizeModules(modules: unknown): string[] {
  if (!Array.isArray(modules)) return []
  const allowed = new Set(['sociodemografico', 'hse', 'ietr'])
  return modules
    .filter((m): m is string => typeof m === 'string')
    .map((m) => m.trim().toLowerCase())
    .filter((m) => allowed.has(m))
}

function inferModuleType(modules: string[]): 'HSE' | 'REMOTE' | null {
  const hasHse = modules.includes('hse')
  const hasIetr = modules.includes('ietr')
  if (hasHse && !hasIetr) return 'HSE'
  if (!hasHse && hasIetr) return 'REMOTE'
  return null
}

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const supabase = createServerClient()

  const { data: links, error: linkError } = await supabase
    .from('tenant_managers')
    .select('tenant_id, role')
    .eq('manager_id', manager.id)
    .order('created_at', { ascending: true })

  if (linkError) {
    return NextResponse.json({ error: 'Falha ao carregar vínculo do cliente.' }, { status: 500 })
  }

  const firstLink = (links ?? [])[0]
  if (!firstLink?.tenant_id) {
    return NextResponse.json({ tenant: null, mappings: [] })
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, name, slug, is_active')
    .eq('id', firstLink.tenant_id)
    .single()

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 })
  }

  const { data: mappings, error: mappingsError } = await supabase
    .from('mappings')
    .select('id, name, slug, description, status, module_type, is_demo, updated_at')
    .eq('tenant_id', tenant.id)
    .order('is_demo', { ascending: false })
    .order('updated_at', { ascending: false })

  if (mappingsError) {
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
    mappings: mappings ?? [],
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
  const modules = normalizeModules(payload.modules)
  const csvColumns = normalizeCsvColumns(payload.csv_columns)
  const credentialColumn = typeof payload.credential_column === 'string'
    ? payload.credential_column.trim()
    : ''
  const columnProfiles = normalizeColumnProfiles(payload.column_profiles, csvColumns)
  const dashboardFiltersFromProfiles = columnProfiles
    .filter((profile) => profile.is_dashboard_filter)
    .map((profile) => profile.source_name)
  const demographicColumnsFromProfiles = columnProfiles
    .filter((profile) => profile.is_demographic)
    .map((profile) => profile.source_name)
  const dashboardFilters = dashboardFiltersFromProfiles.length > 0
    ? dashboardFiltersFromProfiles
    : normalizeFilters(payload.dashboard_filters)
  const stratificationColumns = normalizeStratificationColumns(payload.stratification_columns)
  const effectiveStratificationColumns = stratificationColumns.length > 0
    ? stratificationColumns
    : dashboardFilters
  const demographicColumns = demographicColumnsFromProfiles.length > 0
    ? demographicColumnsFromProfiles
    : normalizeStratificationColumns(payload.demographic_columns)
  const columnDisplayNames = normalizeColumnDisplayNames(payload.column_display_names, csvColumns)
  const columnMapping = normalizeColumnMapping(payload.column_mapping, csvColumns)
  const sanitizedTcleText = sanitizeRichTextHtml(payload.tcle_text ?? '')
  const tcleText = isRichTextEmpty(sanitizedTcleText) ? null : sanitizedTcleText
  const managers = Array.isArray(payload.managers) ? payload.managers : []

  if (!name) {
    return NextResponse.json({ error: 'Nome do mapeamento é obrigatório.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const slug = await generateUniqueMappingSlug(supabase, name)

  const { data: links, error: linkError } = await supabase
    .from('tenant_managers')
    .select('tenant_id, role')
    .eq('manager_id', manager.id)
    .order('created_at', { ascending: true })

  if (linkError) {
    return NextResponse.json({ error: 'Falha ao validar acesso do owner.' }, { status: 500 })
  }

  const firstLink = (links ?? [])[0]
  if (!firstLink?.tenant_id) {
    return NextResponse.json({ error: 'Nenhum tenant vinculado ao usuário.' }, { status: 403 })
  }

  if (!['owner', 'admin'].includes(firstLink.role ?? '')) {
    return NextResponse.json({ error: 'Sem permissão para criar mapeamentos.' }, { status: 403 })
  }

  const config = {
    modules,
    dashboard_filters: dashboardFilters,
    stratification_columns: effectiveStratificationColumns,
    demographic_columns: demographicColumns,
    column_display_names: columnDisplayNames,
    column_profiles: columnProfiles,
    credential_column: credentialColumn || null,
    column_mapping: columnMapping,
    report: 'dynamic',
  }

  const { data: mapping, error: mappingError } = await supabase
    .from('mappings')
    .insert({
      tenant_id: firstLink.tenant_id,
      name,
      slug,
      description: null,
      status,
      module_type: inferModuleType(modules),
      is_demo: false,
      tcle_text: tcleText,
      csv_columns: csvColumns,
      config,
    })
    .select('id, name, slug')
    .single()

  if (mappingError || !mapping) {
    return NextResponse.json({ error: 'Falha ao criar mapeamento.' }, { status: 500 })
  }

  await supabase
    .from('mapping_managers')
    .upsert(
      {
        mapping_id: mapping.id,
        manager_id: manager.id,
        role: 'owner',
      },
      { onConflict: 'mapping_id,manager_id', ignoreDuplicates: false },
    )

  const createdCredentials: Array<{ email: string; temporary_password: string }> = []

  for (const managerInput of managers) {
    const managerEmail = (managerInput.email ?? '').trim().toLowerCase()
    const managerName = (managerInput.name ?? '').trim()
    const managerRole = managerInput.role ?? 'manager'

    if (!managerEmail || !managerName) continue

    const { data: existingManager } = await supabase
      .from('managers')
      .select('id')
      .eq('email', managerEmail)
      .single()

    let targetManagerId = existingManager?.id ?? null

    if (!targetManagerId) {
      const tempPassword = generateTemporaryPassword(10)
      const bcryptHash = await hash(tempPassword, 12)
      const wrappedHash = wrapTemporaryHash(bcryptHash)

      const { data: insertedManager, error: insertManagerError } = await supabase
        .from('managers')
        .insert({
          name: managerName,
          email: managerEmail,
          role: 'manager',
          is_active: true,
          password_hash: wrappedHash,
          temp_password_plain: tempPassword,
        })
        .select('id')
        .single()

      if (insertManagerError || !insertedManager) continue

      targetManagerId = insertedManager.id
      createdCredentials.push({ email: managerEmail, temporary_password: tempPassword })
    }

    await supabase
      .from('tenant_managers')
      .upsert(
        {
          tenant_id: firstLink.tenant_id,
          manager_id: targetManagerId,
          role: managerRole,
        },
        { onConflict: 'tenant_id,manager_id', ignoreDuplicates: false },
      )

    await supabase
      .from('mapping_managers')
      .upsert(
        {
          mapping_id: mapping.id,
          manager_id: targetManagerId,
          role: managerRole,
        },
        { onConflict: 'mapping_id,manager_id', ignoreDuplicates: false },
      )
  }

  return NextResponse.json({
    ok: true,
    mapping,
    created_manager_credentials: createdCredentials,
  })
}
