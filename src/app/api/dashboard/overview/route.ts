import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { requireMappingAccess } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import { parseCollaboratorFilters, applyCollaboratorFilters } from '@/lib/mapping/collaborator-fields'

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
  const filters = parseCollaboratorFilters(request.nextUrl.searchParams, mappingConfig.dashboard_filters)

  // Todos os colaboradores com filtros (para total esperado e distribuições)
  let collabQuery = db
    .selectFrom('collaborators')
    .select(['id', 'area', 'role', 'employment_type'])
    .where('mapping_id', '=', mappingScope.mappingId)
  collabQuery = applyCollaboratorFilters(collabQuery, filters)
  const allCollabs = await collabQuery.execute()

  const total_expected = allCollabs.length
  const collaboratorIds = allCollabs.map((c) => c.id)

  // Distribuições por campo organizacional — apenas quem respondeu (has_answered = true)
  let answeredQuery = db
    .selectFrom('collaborators')
    .select(['id', 'area', 'role', 'employment_type'])
    .where('mapping_id', '=', mappingScope.mappingId)
    .where('has_answered', '=', true)
  answeredQuery = applyCollaboratorFilters(answeredQuery, filters)
  const answered = await answeredQuery.execute()

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

  // area/role/employment_type só existem quando a base do cliente trouxe essa
  // coluna (são campos puramente organizacionais — nunca vêm do questionário,
  // ver comentário em src/types/database.ts). Sem isso, `null` em vez de `[]`
  // distingue "esta base não tem essa coluna" (esconde o card) de "tem a
  // coluna, mas ninguém respondeu ainda" (mostra "Sem dados").
  const hasArea = allCollabs.some((c) => c.area)
  const hasRole = allCollabs.some((c) => c.role)
  const hasEmploymentType = allCollabs.some((c) => c.employment_type)

  const by_area = hasArea ? countBy(answered.map((c) => c.area)) : null
  const by_role = hasRole ? countBy(answered.map((c) => c.role)) : null
  const by_employment_type = hasEmploymentType ? countBy(answered.map((c) => c.employment_type)) : null

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

  let responses
  try {
    responses = await db
      .selectFrom('responses')
      .select('submitted_at')
      .where('collaborator_id', 'in', collaboratorIds)
      .orderBy('submitted_at', 'asc')
      .execute()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao buscar respostas.' }, { status: 500 })
  }

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
