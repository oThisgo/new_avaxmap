import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { requireMappingAccess } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import { getCollaboratorFieldValue, isPushableFilterKey, type CollaboratorFieldSource } from '@/lib/mapping/collaborator-fields'

const MIN_GROUP_SIZE = 5

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
  const availableFilters = mappingConfig.dashboard_filters

  let rows
  try {
    rows = await db
      .selectFrom('collaborators')
      .select([
        'area', 'role', 'gender', 'race_color', 'employment_type', 'birth_date',
        'education_level', 'marital_status', 'disability', 'which_disability', 'extra_fields',
      ])
      .where('mapping_id', '=', mappingScope.mappingId)
      .execute()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao buscar colaboradores.' }, { status: 500 })
  }

  // Retorna apenas valores com >= 5 colaboradores para proteger o anonimato
  const optionsFor = (key: string): string[] => {
    const counts: Record<string, number> = {}
    for (const row of rows) {
      const value = getCollaboratorFieldValue(row as unknown as CollaboratorFieldSource, key)
      if (!value) continue
      counts[value] = (counts[value] ?? 0) + 1
    }
    return Object.entries(counts)
      .filter(([, count]) => count >= MIN_GROUP_SIZE)
      .map(([value]) => value)
      .sort((a, b) => a.localeCompare(b))
  }

  return NextResponse.json({
    available_filters: availableFilters,
    options: Object.fromEntries(availableFilters.map((key) => [key, optionsFor(key)])),
    labels: Object.fromEntries(availableFilters.map((key) => [key, mappingConfig.field_labels[key] ?? key])),
    // Chaves derivadas (ex.: age_range, calculado de um campo criptografado) não são
    // filtráveis via query na API — o front trata isso como somente leitura se precisar.
    pushable: Object.fromEntries(availableFilters.map((key) => [key, isPushableFilterKey(key)])),
  })
}
