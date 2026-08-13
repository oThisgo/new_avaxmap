import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { requireMappingAccess } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import {
  getCollaboratorFieldValue,
  parseCollaboratorFilters,
  applyCollaboratorFilters,
  type CollaboratorFieldSource,
} from '@/lib/mapping/collaborator-fields'

function countBy(values: (string | null)[]): { name: string; value: number }[] {
  const map: Record<string, number> = {}
  for (const v of values) {
    if (!v) continue
    map[v] = (map[v] ?? 0) + 1
  }
  return Object.entries(map).map(([name, value]) => ({ name, value }))
}

export async function GET(request: NextRequest) {
  const mappingScope = await requireMappingAccess(request)
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  const mapping = await db
    .selectFrom('mappings')
    .select('config')
    .where('id', '=', mappingScope.mappingId)
    .executeTakeFirst()

  const mappingConfig = normalizeMappingConfig(mapping?.config)
  const chartKeys = mappingConfig.demographic_columns
  const filters = parseCollaboratorFilters(request.nextUrl.searchParams, mappingConfig.dashboard_filters)

  let query = db
    .selectFrom('collaborators')
    .select([
      'area', 'role', 'gender', 'race_color', 'employment_type', 'birth_date',
      'education_level', 'marital_status', 'disability', 'which_disability', 'extra_fields',
    ])
    .where('mapping_id', '=', mappingScope.mappingId)
    .where('has_answered', '=', true)
  query = applyCollaboratorFilters(query, filters)

  let rows
  try {
    rows = await query.execute()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao buscar colaboradores.' }, { status: 500 })
  }

  const result: Record<string, { name: string; value: number }[]> = {}
  for (const key of chartKeys) {
    result[key] = countBy(rows.map((row) => getCollaboratorFieldValue(row as unknown as CollaboratorFieldSource, key)))
  }

  return NextResponse.json(result)
}
