import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireMappingAccess } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import { getCollaboratorFieldValue, parseCollaboratorFilters, applyCollaboratorFilters } from '@/lib/mapping/collaborator-fields'

function countBy(values: (string | null)[]): { name: string; value: number }[] {
  const map: Record<string, number> = {}
  for (const v of values) {
    if (!v) continue
    map[v] = (map[v] ?? 0) + 1
  }
  return Object.entries(map).map(([name, value]) => ({ name, value }))
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const mappingScope = await requireMappingAccess(request, supabase)
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  const { data: mapping } = await supabase
    .from('mappings')
    .select('config')
    .eq('id', mappingScope.mappingId)
    .single()

  const mappingConfig = normalizeMappingConfig(mapping?.config)
  const chartKeys = mappingConfig.demographic_columns
  const filters = parseCollaboratorFilters(request.nextUrl.searchParams, mappingConfig.dashboard_filters)

  let query = supabase
    .from('collaborators')
    .select('area, role, gender, race_color, employment_type, birth_date, education_level, marital_status, disability, which_disability, extra_fields')
    .eq('mapping_id', mappingScope.mappingId)
    .eq('has_answered', true)
  query = applyCollaboratorFilters(query, filters)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const result: Record<string, { name: string; value: number }[]> = {}
  for (const key of chartKeys) {
    result[key] = countBy(rows.map((row) => getCollaboratorFieldValue(row, key)))
  }

  return NextResponse.json(result)
}
