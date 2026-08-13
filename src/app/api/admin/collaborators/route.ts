import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { isMappingAdmin, isMappingSuperuser } from '@/lib/auth/manager'
import { requireMappingAccess } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import {
  buildFallbackSchema,
  buildRosterSchema,
  resolveRosterValues,
  type RosterCollaboratorSource,
} from '@/lib/mapping/collaborator-roster'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 200

type CollaboratorRow = RosterCollaboratorSource & {
  id: string
  has_answered: boolean
  created_at: string
}

function parsePositiveInt(raw: string | null, fallback: number, max: number): number {
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

export async function GET(request: NextRequest) {
  const access = await requireMappingAccess(request)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  if (!isMappingAdmin(access.manager.role, access.mappingRole)) {
    return NextResponse.json(
      { error: 'Apenas administradores podem ver a base de colaboradores.' },
      { status: 403 },
    )
  }

  const mapping = await db
    .selectFrom('mappings')
    .select(['config', 'csv_columns'])
    .where('id', '=', access.mappingId)
    .executeTakeFirst()

  if (!mapping) {
    return NextResponse.json({ error: 'Mapeamento não encontrado.' }, { status: 404 })
  }

  const config = normalizeMappingConfig(mapping.config)
  const csvColumns = Array.isArray(mapping.csv_columns) ? (mapping.csv_columns as string[]) : []

  let collaboratorRows
  try {
    collaboratorRows = await db
      .selectFrom('collaborators')
      .select([
        'id', 'has_answered', 'created_at', 'name', 'email', 'birth_date', 'area', 'role', 'gender',
        'race_color', 'employment_type', 'education_level', 'marital_status', 'disability',
        'which_disability', 'extra_fields',
      ])
      .where('mapping_id', '=', access.mappingId)
      .execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao carregar colaboradores.' }, { status: 500 })
  }

  const collaborators = collaboratorRows as CollaboratorRow[]

  // Data de conclusão vem de `responses`; `has_answered` sozinho não guarda quando.
  const answeredAtByCollaborator = new Map<string, string>()
  if (collaborators.length > 0) {
    let responses
    try {
      responses = await db
        .selectFrom('responses')
        .select(['collaborator_id', 'submitted_at'])
        .where('collaborator_id', 'in', collaborators.map((c) => c.id))
        .execute()
    } catch {
      return NextResponse.json({ error: 'Falha ao carregar respostas.' }, { status: 500 })
    }

    for (const response of responses) {
      const current = answeredAtByCollaborator.get(response.collaborator_id)
      // Mantém a submissão mais recente quando houver mais de uma.
      if (!current || (response.submitted_at && response.submitted_at > current)) {
        answeredAtByCollaborator.set(response.collaborator_id, response.submitted_at)
      }
    }
  }

  const baseSchema = buildRosterSchema(csvColumns, config)
  const schema = baseSchema.columns.length > 0 ? baseSchema : buildFallbackSchema(collaborators)

  let rows = collaborators.map((collaborator) => {
    const answeredAt = answeredAtByCollaborator.get(collaborator.id) ?? null
    return {
      id: collaborator.id,
      values: resolveRosterValues(schema, collaborator),
      // has_answered pode estar true sem linha em `responses` (resposta excluída
      // por um superuser reabre o questionário zerando a flag, mas dados legados
      // podem divergir) — por isso os dois campos são reportados separadamente.
      has_answered: collaborator.has_answered,
      answered_at: answeredAt,
      has_response_record: answeredAt !== null,
      created_at: collaborator.created_at,
    }
  })

  // Busca e filtro de status rodam em memória: nome/e-mail ficam criptografados
  // por linha no banco (AES-GCM), então não há como filtrá-los via SQL.
  const search = (request.nextUrl.searchParams.get('search') ?? '').trim().toLowerCase()
  if (search) {
    rows = rows.filter((row) =>
      Object.values(row.values).some((value) => value?.toLowerCase().includes(search)),
    )
  }

  const status = request.nextUrl.searchParams.get('status')
  if (status === 'answered') rows = rows.filter((row) => row.has_answered)
  if (status === 'pending') rows = rows.filter((row) => !row.has_answered)

  const sortKey = schema.columns[0]?.key
  rows.sort((a, b) => {
    const left = sortKey ? a.values[sortKey] : null
    const right = sortKey ? b.values[sortKey] : null
    if (left && right) return left.localeCompare(right)
    if (left) return -1
    if (right) return 1
    return a.created_at.localeCompare(b.created_at)
  })

  const total = rows.length
  const pageSize = parsePositiveInt(request.nextUrl.searchParams.get('page_size'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(parsePositiveInt(request.nextUrl.searchParams.get('page'), 1, pageCount), pageCount)
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize)

  return NextResponse.json({
    columns: schema.columns,
    omitted_columns: schema.omitted,
    rows: pageRows,
    total,
    total_answered: rows.filter((row) => row.has_answered).length,
    page,
    page_size: pageSize,
    page_count: pageCount,
    can_delete: isMappingSuperuser(access.manager.role, access.mappingRole),
  })
}
