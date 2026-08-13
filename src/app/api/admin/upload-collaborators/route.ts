import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'kysely'
import { db } from '@/lib/db/pool'
import { getManagerFromSession, isMappingAdmin } from '@/lib/auth/manager'
import { getMappingScopeContext, getMappingManagerRole } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import { isCustomFieldKey, customFieldSlug, slugifyColumnKey } from '@/lib/mapping/column-key'
import { hashCpf, encryptFieldOrNull } from '@/lib/security/crypto'

type MappingConfig = {
  credential_column?: string | null
  column_mapping?: Record<string, string>
  stratification_columns?: string[]
}

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectDelimiter(headerLine: string): string {
  const delimiters = [';', ',', '\t', '|']
  let best = ';'
  let bestCount = -1
  for (const delimiter of delimiters) {
    const count = headerLine.split(delimiter).length
    if (count > bestCount) {
      bestCount = count
      best = delimiter
    }
  }
  return best
}

function parseCsvRow(row: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function normalizeCpf(raw: string): string {
  return raw.replace(/[.\-\s]/g, '').trim()
}

function isCpfLikeLabel(label: string): boolean {
  return /cpf|documento|tax id/.test(normalizeLabel(label))
}

function normalizeCredential(value: string, cpfLike: boolean): string {
  return cpfLike ? normalizeCpf(value) : value.trim().toLowerCase()
}

function pickMappedColumn(
  headers: string[],
  config: MappingConfig,
  key: string,
  patterns: RegExp[],
): string | null {
  const explicit = config.column_mapping?.[key]
  if (explicit && headers.includes(explicit)) return explicit

  for (const header of headers) {
    const n = normalizeLabel(header)
    if (patterns.some((pattern) => pattern.test(n))) return header
  }

  return null
}

function readValue(rowValues: string[], indexes: Map<string, number>, column: string | null): string {
  if (!column) return ''
  const idx = indexes.get(column)
  if (idx == null) return ''
  return (rowValues[idx] ?? '').trim()
}

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Falha ao ler o arquivo enviado.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
  }

  const mappingScope = await getMappingScopeContext(request)
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  let mappingId = mappingScope.mappingId
  const mappingSlugFromBody = formData.get('mapping_slug')
  const mappingSlug =
    typeof mappingSlugFromBody === 'string' && mappingSlugFromBody.trim().length > 0
      ? mappingSlugFromBody.trim().toLowerCase()
      : null

  if (!mappingId && mappingSlug) {
    const mapping = await db
      .selectFrom('mappings')
      .select(['id', 'status', 'config'])
      .where('slug', '=', mappingSlug)
      .executeTakeFirst()

    if (!mapping || mapping.status !== 'active') {
      return NextResponse.json({ error: 'Mapeamento inválido para importação.' }, { status: 404 })
    }

    mappingId = mapping.id
  }

  if (!mappingId) {
    return NextResponse.json(
      { error: 'Informe um mapeamento para importar colaboradores.' },
      { status: 400 },
    )
  }

  const mappingRole = await getMappingManagerRole(manager.id, mappingId)
  if (!isMappingAdmin(manager.role, mappingRole)) {
    return NextResponse.json({ error: 'Acesso negado. Apenas administradores podem importar colaboradores.' }, { status: 403 })
  }

  const mappingConfigResult = await db
    .selectFrom('mappings')
    .select('config')
    .where('id', '=', mappingId)
    .executeTakeFirst()

  const mappingConfig = (mappingConfigResult?.config ?? {}) as MappingConfig
  const normalizedConfig = normalizeMappingConfig(mappingConfigResult?.config)
  const customFieldSlugsToImport = new Set(
    [...normalizedConfig.dashboard_filters, ...normalizedConfig.demographic_columns]
      .filter(isCustomFieldKey)
      .map(customFieldSlug),
  )

  const text = await file.text()
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    return NextResponse.json({ error: 'CSV vazio ou sem linhas de dados.' }, { status: 400 })
  }

  const headerLine = lines[0]
  const delimiter = detectDelimiter(headerLine)
  const headers = parseCsvRow(headerLine, delimiter)
  const headerIndexes = new Map(headers.map((header, index) => [header, index]))

  const credentialColumn =
    typeof mappingConfig.credential_column === 'string' && headers.includes(mappingConfig.credential_column)
      ? mappingConfig.credential_column
      : pickMappedColumn(headers, mappingConfig, 'cpf', [/^cpf$/, /documento/])
        ?? pickMappedColumn(headers, mappingConfig, 'employee_code', [/matricula/, /codigo/, /registro/, /employee id/])
        ?? pickMappedColumn(headers, mappingConfig, 'email', [/^e-?mail$/, /email/, /mail/])

  if (!credentialColumn) {
    return NextResponse.json(
      { error: 'Não foi possível identificar a coluna de credencial no CSV.' },
      { status: 400 },
    )
  }

  const fullNameColumn = pickMappedColumn(headers, mappingConfig, 'full_name', [/^nome$/, /nome.*completo/, /colaborador/, /funcionario/, /employee.*name/])
  const emailColumn = pickMappedColumn(headers, mappingConfig, 'email', [/^e-?mail$/, /email/, /mail/])
  const birthDateColumn = pickMappedColumn(headers, mappingConfig, 'birth_date', [/nascimento/, /data.*nasc/, /birth/, /dob/])
  const ageRangeColumn = pickMappedColumn(headers, mappingConfig, 'age_range', [/^idade$/, /faixa.*etaria/, /age/])
  const genderColumn = pickMappedColumn(headers, mappingConfig, 'gender', [/genero/, /sexo/, /gender/])
  const raceColorColumn = pickMappedColumn(headers, mappingConfig, 'race_color', [/raca/, /etnia/, /cor/, /ethnic/])
  const educationColumn = pickMappedColumn(headers, mappingConfig, 'education_level', [/escolaridade/, /formacao/, /education/])
  const maritalStatusColumn = pickMappedColumn(headers, mappingConfig, 'marital_status', [/estado civil/, /marital/])
  const disabilityColumn = pickMappedColumn(headers, mappingConfig, 'disability', [/deficiencia$/, /pcd/, /disability$/])
  const disabilityTypeColumn = pickMappedColumn(headers, mappingConfig, 'disability_type', [/tipo.*deficiencia/, /qual.*deficiencia/, /disability.*type/])

  const stratifications = Array.isArray(mappingConfig.stratification_columns)
    ? mappingConfig.stratification_columns.filter((column) => headers.includes(column))
    : []

  const areaColumn = pickMappedColumn(headers, mappingConfig, 'area', [/^area$/, /setor/, /departamento/, /unidade/, /regional/])
    ?? stratifications.find((column) => /area|setor|departamento|unidade|regional/.test(normalizeLabel(column)))
    ?? null
  const roleColumn = pickMappedColumn(headers, mappingConfig, 'role', [/cargo/, /funcao/, /posição/, /posicao/, /role/])
    ?? stratifications.find((column) => /cargo|funcao|posicao|role/.test(normalizeLabel(column)))
    ?? null
  const employmentTypeColumn = pickMappedColumn(headers, mappingConfig, 'employment_type', [/vinculo/, /tipo.*contrato/, /regime/, /employment type/])
    ?? stratifications.find((column) => /vinculo|contrato|regime/.test(normalizeLabel(column)))
    ?? null

  // Colunas customizadas escolhidas como filtro/demográfico na criação do mapeamento
  // (qualquer coluna que não corresponda a um campo canônico reconhecido acima).
  // Nunca inclui credencial/nome/e-mail: essas já viram campos dedicados criptografados
  // e ficam bloqueadas na UI de criação, então nunca chegam aqui como "customizadas".
  const reservedColumns = new Set(
    [credentialColumn, fullNameColumn, emailColumn].filter((c): c is string => !!c),
  )
  const extraFieldColumnBySlug = new Map<string, string>()
  for (const header of headers) {
    if (reservedColumns.has(header)) continue
    const slug = slugifyColumnKey(header)
    if (customFieldSlugsToImport.has(slug)) extraFieldColumnBySlug.set(slug, header)
  }

  // Pula o header
  const dataLines = lines.slice(1)

  type CollaboratorRow = {
    mapping_id: string
    cpf: string
    name: string
    email: string | null
    birth_date: string | null
    area: string | null
    role: string | null
    gender: string | null
    race_color: string | null
    employment_type: string | null
    education_level: string | null
    marital_status: string | null
    disability: string | null
    which_disability: string | null
    extra_fields: Record<string, string | null>
  }

  const rows: CollaboratorRow[] = []
  const parseErrors: string[] = []
  const credentialIsCpf = isCpfLikeLabel(credentialColumn)

  for (let i = 0; i < dataLines.length; i++) {
    const cols = parseCsvRow(dataLines[i], delimiter)
    const rawCredential = readValue(cols, headerIndexes, credentialColumn)
    const normalizedCredential = normalizeCredential(rawCredential, credentialIsCpf)

    if (!normalizedCredential) {
      parseErrors.push(`Linha ${i + 2}: credencial vazia (coluna "${credentialColumn}")`)
      continue
    }

    if (credentialIsCpf && !/^\d{11}$/.test(normalizedCredential)) {
      parseErrors.push(`Linha ${i + 2}: CPF inválido ("${rawCredential}")`)
      continue
    }

    const birthDateValue = readValue(cols, headerIndexes, birthDateColumn)
    const ageValue = readValue(cols, headerIndexes, ageRangeColumn)
    const normalizedBirthOrAge = birthDateValue || ageValue

    const disabilityCol = readValue(cols, headerIndexes, disabilityTypeColumn ?? disabilityColumn)
    const hasDisability = disabilityCol.toLowerCase() !== 'sem deficiência' && disabilityCol !== ''

    const extraFields: Record<string, string | null> = {}
    for (const [slug, header] of extraFieldColumnBySlug) {
      extraFields[slug] = readValue(cols, headerIndexes, header) || null
    }

    rows.push({
      mapping_id: mappingId,
      cpf: hashCpf(normalizedCredential),
      name: encryptFieldOrNull(readValue(cols, headerIndexes, fullNameColumn)) ?? '',
      email: encryptFieldOrNull(readValue(cols, headerIndexes, emailColumn)),
      birth_date: encryptFieldOrNull(normalizedBirthOrAge),
      area: readValue(cols, headerIndexes, areaColumn) || null,
      role: readValue(cols, headerIndexes, roleColumn) || null,
      gender: readValue(cols, headerIndexes, genderColumn) || null,
      race_color: readValue(cols, headerIndexes, raceColorColumn) || null,
      employment_type: readValue(cols, headerIndexes, employmentTypeColumn) || null,
      education_level: encryptFieldOrNull(readValue(cols, headerIndexes, educationColumn)),
      marital_status: encryptFieldOrNull(readValue(cols, headerIndexes, maritalStatusColumn)),
      disability: encryptFieldOrNull(hasDisability ? 'sim' : 'não'),
      which_disability: hasDisability ? disabilityCol : null,
      extra_fields: extraFields,
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Nenhuma linha válida encontrada.', parse_errors: parseErrors }, { status: 400 })
  }

  // CPFs já estão hasheados em rows; busca para diferenciar insert de update
  const incomingHashedCpfs = rows.map((r) => r.cpf)
  const existing = await db
    .selectFrom('collaborators')
    .select('cpf')
    .where('mapping_id', '=', mappingId)
    .where('cpf', 'in', incomingHashedCpfs)
    .execute()

  const existingCpfSet = new Set(existing.map((e) => e.cpf))

  // Upsert: atualiza name, email, area, role, employment_type, extra_fields sempre a
  // partir do CSV (nunca vêm de outro lugar). NÃO toca em: has_answered.
  //
  // birth_date/gender/race_color/marital_status/education_level/disability/which_disability
  // podem vir do CSV OU do formulário sociodemográfico que o colaborador preenche
  // (ver collaboratorUpdate em src/app/api/responses/route.ts) — um reupload de CSV
  // sem essas colunas mapeadas não pode apagar o que o colaborador já respondeu.
  // COALESCE: usa o valor novo do CSV quando ele existe, senão preserva o que já
  // estava salvo (nunca sobrescreve um valor real com null).
  try {
    await db
      .insertInto('collaborators')
      .values(rows)
      .onConflict((oc) =>
        oc.columns(['mapping_id', 'cpf']).doUpdateSet((eb) => ({
          name: eb.ref('excluded.name'),
          email: eb.ref('excluded.email'),
          area: eb.ref('excluded.area'),
          role: eb.ref('excluded.role'),
          employment_type: eb.ref('excluded.employment_type'),
          extra_fields: eb.ref('excluded.extra_fields'),
          birth_date: sql`coalesce(excluded.birth_date, collaborators.birth_date)`,
          gender: sql`coalesce(excluded.gender, collaborators.gender)`,
          race_color: sql`coalesce(excluded.race_color, collaborators.race_color)`,
          marital_status: sql`coalesce(excluded.marital_status, collaborators.marital_status)`,
          education_level: sql`coalesce(excluded.education_level, collaborators.education_level)`,
          disability: sql`coalesce(excluded.disability, collaborators.disability)`,
          which_disability: sql`coalesce(excluded.which_disability, collaborators.which_disability)`,
        })),
      )
      .execute()
  } catch (err) {
    return NextResponse.json({ error: `Erro no banco: ${err instanceof Error ? err.message : err}` }, { status: 500 })
  }

  const inserted = rows.filter((r) => !existingCpfSet.has(r.cpf as string)).length
  const updated = rows.filter((r) => existingCpfSet.has(r.cpf as string)).length

  return NextResponse.json({
    ok: true,
    total: rows.length,
    inserted,
    updated,
    parse_errors: parseErrors,
  })
}
