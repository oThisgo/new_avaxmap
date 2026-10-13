import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { getManagerFromSession } from '@/lib/auth/manager'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import {
  computeMappingHighlights,
  type HighlightResponseRow,
  type MappingHighlights,
} from '@/lib/analytics/mapping-highlights'

/**
 * Visão consolidada do cliente (dashboard do owner): indicadores somados de
 * todos os mapeamentos do tenant, comparativo entre mapeamentos e uma linha do
 * tempo de marcos. Mesmo vínculo de tenant que GET /api/client/mappings (o
 * primeiro tenant_managers do gestor).
 */

type TimelineEvent = {
  at: string
  kind: 'created' | 'first_response' | 'milestone' | 'last_response'
  mapping_id: string
  mapping_name: string
  label: string
}

const MILESTONES = [25, 50, 75, 90]

function milestoneEvents(mapping: { id: string; name: string }, h: MappingHighlights): TimelineEvent[] {
  const events: TimelineEvent[] = []
  let next = 0
  for (const day of h.responses_by_day) {
    while (next < MILESTONES.length && day.cumulative_pct >= MILESTONES[next]) {
      events.push({
        at: `${day.date}T12:00:00.000Z`,
        kind: 'milestone',
        mapping_id: mapping.id,
        mapping_name: mapping.name,
        label: `Atingiu ${MILESTONES[next]}% de adesão`,
      })
      next++
    }
  }
  return events
}

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)
  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const link = await db
    .selectFrom('tenant_managers')
    .select(['tenant_id'])
    .where('manager_id', '=', manager.id)
    .orderBy('created_at', 'asc')
    .executeTakeFirst()

  if (!link?.tenant_id) {
    return NextResponse.json({ overall: null, mappings: [], timeline: [] })
  }

  let mappings
  try {
    mappings = await db
      .selectFrom('mappings')
      .select(['id', 'name', 'slug', 'status', 'module_type', 'is_demo', 'config', 'created_at', 'updated_at'])
      .where('tenant_id', '=', link.tenant_id)
      .execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao carregar mapeamentos do cliente.' }, { status: 500 })
  }

  if (mappings.length === 0) {
    return NextResponse.json({ overall: null, mappings: [], timeline: [] })
  }

  const mappingIds = mappings.map((m) => m.id)

  let collaborators
  let responses
  try {
    collaborators = await db
      .selectFrom('collaborators')
      .select(['id', 'mapping_id', 'has_answered', 'gender'])
      .where('mapping_id', 'in', mappingIds)
      .execute()

    responses = await db
      .selectFrom('responses')
      .innerJoin('collaborators', 'collaborators.id', 'responses.collaborator_id')
      .select([
        'collaborators.mapping_id',
        'responses.collaborator_id',
        'responses.submitted_at',
        'responses.hse_score',
        'responses.hse_class',
        'responses.hse_domains',
        'responses.answers',
        'responses.remote_score',
        'responses.remote_class',
        'responses.mental_health_answers',
        'responses.mental_health_derived',
      ])
      .where('collaborators.mapping_id', 'in', mappingIds)
      .execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao carregar respostas do cliente.' }, { status: 500 })
  }

  const allModules = new Set<string>()
  const timeline: TimelineEvent[] = []

  const perMapping = mappings.map((mapping) => {
    const config = normalizeMappingConfig(mapping.config)
    config.modules.forEach((m) => allModules.add(m))

    const h = computeMappingHighlights({
      collaborators: collaborators
        .filter((c) => c.mapping_id === mapping.id)
        .map((c) => ({ id: c.id, has_answered: c.has_answered, gender: c.gender })),
      responses: responses.filter((r) => r.mapping_id === mapping.id) as unknown as HighlightResponseRow[],
      modules: config.modules,
    })

    timeline.push({ at: mapping.created_at, kind: 'created', mapping_id: mapping.id, mapping_name: mapping.name, label: 'Mapeamento criado' })
    if (h.first_response_at) {
      timeline.push({ at: h.first_response_at, kind: 'first_response', mapping_id: mapping.id, mapping_name: mapping.name, label: 'Primeira resposta recebida' })
    }
    timeline.push(...milestoneEvents(mapping, h))
    if (h.last_response_at && h.last_response_at !== h.first_response_at) {
      timeline.push({ at: h.last_response_at, kind: 'last_response', mapping_id: mapping.id, mapping_name: mapping.name, label: 'Resposta mais recente' })
    }

    return {
      id: mapping.id,
      name: mapping.name,
      slug: mapping.slug,
      status: mapping.status,
      module_type: mapping.module_type,
      is_demo: mapping.is_demo,
      modules: config.modules,
      created_at: mapping.created_at,
      updated_at: mapping.updated_at,
      total_expected: h.total_expected,
      total_responses: h.total_responses,
      completion_pct: h.completion_pct,
      last_response_at: h.last_response_at,
      hse_avg: h.hse?.avg_score ?? null,
      hse_class: h.hse?.classification ?? null,
      hse_high_risk: h.hse?.high_risk ?? null,
      mh_avg: h.mental_health?.avg_index ?? null,
      mh_class: h.mental_health?.classification ?? null,
      suicide_at_risk: h.mental_health?.suicide_at_risk ?? null,
    }
  })

  const overall = computeMappingHighlights({
    collaborators: collaborators.map((c) => ({ id: c.id, has_answered: c.has_answered, gender: c.gender })),
    responses: responses as unknown as HighlightResponseRow[],
    modules: [...allModules],
  })

  const statusCounts = mappings.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    overall: {
      ...overall,
      // Segmentos e questões são por mapeamento (bases diferentes); no
      // consolidado só faz sentido o que é comparável entre eles.
      segments: [],
      mappings_total: mappings.length,
      mappings_by_status: statusCounts,
      responses_last_7_days: responses.filter((r) => r.submitted_at && Date.now() - new Date(r.submitted_at).getTime() <= 7 * 86_400_000).length,
    },
    mappings: perMapping.sort((a, b) => b.total_responses - a.total_responses),
    timeline: timeline.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 14),
  })
}
