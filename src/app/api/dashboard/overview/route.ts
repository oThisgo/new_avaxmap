import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

function buildFilters(params: URLSearchParams) {
  const filters: Record<string, string> = {}
  for (const key of ['area', 'role', 'gender', 'race_color']) {
    const v = params.get(key)
    if (v) filters[key] = v
  }
  return filters
}

export async function GET(request: NextRequest) {
  const session = request.cookies.get('manager_session')?.value
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const filters = buildFilters(request.nextUrl.searchParams)

  // Todos os colaboradores com filtros (para total esperado e distribuições)
  let collabQuery = supabase
    .from('collaborators')
    .select('id, area, role, employment_type, organization')
  for (const [k, v] of Object.entries(filters)) {
    collabQuery = collabQuery.eq(k, v)
  }
  const { data: collabs, error: collabErr } = await collabQuery
  if (collabErr) return NextResponse.json({ error: collabErr.message }, { status: 500 })

  const allCollabs = collabs ?? []
  const total_expected = allCollabs.length
  const collaboratorIds = allCollabs.map((c) => c.id)

  // Distribuições por campo organizacional — apenas quem respondeu (has_answered = true)
  let answeredQuery = supabase
    .from('collaborators')
    .select('id, area, role, employment_type, organization')
    .eq('has_answered', true)
  for (const [k, v] of Object.entries(filters)) {
    answeredQuery = answeredQuery.eq(k, v)
  }
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
  const by_organization = countBy(answered.map((c) => c.organization))

  if (collaboratorIds.length === 0) {
    return NextResponse.json({
      total_responses: 0,
      total_expected: 0,
      completion_pct: 0,
      responses_by_day: [],
      by_area,
      by_role,
      by_employment_type,
      by_organization,
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
    by_organization,
  })
}
