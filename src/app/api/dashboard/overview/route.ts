import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getMappingScopeContext } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import { parseCollaboratorFilters, applyCollaboratorFilters } from '@/lib/mapping/collaborator-fields'

export async function GET(request: NextRequest) {
  const session = request.cookies.get('manager_session')?.value
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mappingScope = await getMappingScopeContext(request, { requireMappingScope: true })
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  const supabase = createServerClient()

  const { data: mapping } = await supabase
    .from('mappings')
    .select('config')
    .eq('id', mappingScope.mappingId)
    .single()

  const mappingConfig = normalizeMappingConfig(mapping?.config)
  const filters = parseCollaboratorFilters(request.nextUrl.searchParams, mappingConfig.dashboard_filters)

  // Todos os colaboradores com filtros (para total esperado e distribuições)
  let collabQuery = supabase
    .from('collaborators')
    .select('id, area, role, employment_type')
    .eq('mapping_id', mappingScope.mappingId)
  collabQuery = applyCollaboratorFilters(collabQuery, filters)
  const { data: collabs, error: collabErr } = await collabQuery
  if (collabErr) return NextResponse.json({ error: collabErr.message }, { status: 500 })

  const allCollabs = collabs ?? []
  const total_expected = allCollabs.length
  const collaboratorIds = allCollabs.map((c) => c.id)

  // Distribuições por campo organizacional — apenas quem respondeu (has_answered = true)
  let answeredQuery = supabase
    .from('collaborators')
    .select('id, area, role, employment_type')
    .eq('mapping_id', mappingScope.mappingId)
    .eq('has_answered', true)
  answeredQuery = applyCollaboratorFilters(answeredQuery, filters)
  const { data: answeredCollabs } = await answeredQuery
  const answered = answeredCollabs ?? []

  const countBy = (arr: (string | null | undefined)[]) => {
    const map: Record<string, number> = {}
    for (const v of arr) {
      const key = v || 'Não informado'
      map[key] = (map[key] ?? 0) + 1
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }

  const by_area = countBy(answered.map((c) => c.area))
  const by_role = countBy(answered.map((c) => c.role))
  const by_employment_type = countBy(answered.map((c) => c.employment_type))

  if (collaboratorIds.length === 0) {
    return NextResponse.json({
      total_responses: 0,
      total_expected: 0,
      completion_pct: 0,
      responses_by_day: [],
      by_area,
      by_role,
      by_employment_type,
    })
  }

  const { data: responses, error: respErr } = await supabase
    .from('responses')
    .select('submitted_at')
    .in('collaborator_id', collaboratorIds)
    .order('submitted_at', { ascending: true })

  if (respErr) return NextResponse.json({ error: respErr.message }, { status: 500 })

  const total = responses?.length ?? 0
  const byDayMap: Record<string, number> = {}

  for (const r of responses ?? []) {
    if (r.submitted_at) {
      const day = r.submitted_at.slice(0, 10)
      byDayMap[day] = (byDayMap[day] ?? 0) + 1
    }
  }

  const responses_by_day = Object.entries(byDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  return NextResponse.json({
    total_responses: total,
    total_expected,
    completion_pct: total_expected > 0 ? Math.round((total / total_expected) * 10000) / 100 : 0,
    responses_by_day,
    by_area,
    by_role,
    by_employment_type,
  })
}
