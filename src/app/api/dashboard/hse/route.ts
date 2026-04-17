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

interface HseDomainEntry {
  domain: string
  weight: number
  score: number
  weightedScore: number
}

export async function GET(request: NextRequest) {
  const session = request.cookies.get('manager_session')?.value
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const filters = buildFilters(request.nextUrl.searchParams)

  let collabQuery = supabase.from('collaborators').select('id')
  for (const [k, v] of Object.entries(filters)) {
    collabQuery = collabQuery.eq(k, v)
  }
  const { data: collabs, error: collabErr } = await collabQuery
  if (collabErr) return NextResponse.json({ error: collabErr.message }, { status: 500 })

  const collaboratorIds = (collabs ?? []).map((c) => c.id)
  if (collaboratorIds.length === 0) return NextResponse.json({ domains: [], class_distribution: [] })

  const { data: responses, error } = await supabase
    .from('responses')
    .select('hse_domains, hse_class, hse_score')
    .in('collaborator_id', collaboratorIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aggregate domain scores
  const domainAgg: Record<string, { sum: number; count: number; weight: number }> = {}
  const classMap: Record<string, number> = {}
  let scoreSum = 0, scoreCount = 0

  for (const r of responses ?? []) {
    if (r.hse_class) classMap[r.hse_class] = (classMap[r.hse_class] ?? 0) + 1
    if ((r as { hse_score?: number | null }).hse_score != null) { scoreSum += (r as { hse_score: number }).hse_score; scoreCount++ }
    if (!Array.isArray(r.hse_domains)) continue
    for (const d of r.hse_domains as HseDomainEntry[]) {
      if (!domainAgg[d.domain]) domainAgg[d.domain] = { sum: 0, count: 0, weight: d.weight }
      domainAgg[d.domain].sum += d.score
      domainAgg[d.domain].count++
    }
  }

  const domains = Object.entries(domainAgg).map(([name, { sum, count, weight }]) => {
    const avg = count > 0 ? Math.round((sum / count) * 100) / 100 : 0
    let classification = 'Baixo risco'
    if (avg >= 2.5) classification = 'Alto risco'
    else if (avg >= 1.5) classification = 'Risco moderado'
    return { name, avg_score: avg, weight, classification }
  })

  const class_distribution = Object.entries(classMap).map(([name, value]) => ({ name, value }))
  const avg_score = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) / 100 : null

  return NextResponse.json({ domains, class_distribution, avg_score })
}
