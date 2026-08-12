import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireMappingAccess } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import { getCollaboratorFieldValue, isPushableFilterKey } from '@/lib/mapping/collaborator-fields'

const MIN_GROUP_SIZE = 5

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
  const availableFilters = mappingConfig.dashboard_filters

  const { data, error } = await supabase
    .from('collaborators')
    .select('area, role, gender, race_color, employment_type, birth_date, education_level, marital_status, disability, which_disability, extra_fields')
    .eq('mapping_id', mappingScope.mappingId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  // Retorna apenas valores com >= 5 colaboradores para proteger o anonimato
  const optionsFor = (key: string): string[] => {
    const counts: Record<string, number> = {}
    for (const row of rows) {
      const value = getCollaboratorFieldValue(row, key)
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
