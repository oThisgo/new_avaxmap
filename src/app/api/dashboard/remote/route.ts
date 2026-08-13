import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { IETR_QUESTIONS } from '@/lib/analytics/ietr-definition'
import { requireMappingAccess } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import { parseCollaboratorFilters, applyCollaboratorFilters } from '@/lib/mapping/collaborator-fields'

interface RemoteDomainEntry {
  domain: string
  weight: number
  score: number
  weightedScore: number
}

interface ResponseAnswerEntry {
  questionCode?: string
  riskValue?: number | null
}

type QuestionMeta = { domain: string; code: string; text: string }

const REMOTE_QUESTIONS: QuestionMeta[] = IETR_QUESTIONS.map((q) => ({
  domain: q.domain,
  code: q.code,
  text: q.text,
}))

const REMOTE_Q_BY_CODE = new Map(REMOTE_QUESTIONS.map((q) => [q.code, q]))

function normalizeRemoteDomainName(domain: string): string {
  if (domain === 'Demanda') return 'Demandas'
  return domain
}

function classifyRemote(avg: number): 'Condição adequada' | 'Zona de atenção' | 'Situação de risco' {
  if (avg >= 4) return 'Condição adequada'
  if (avg >= 3) return 'Zona de atenção'
  return 'Situação de risco'
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
  const filters = parseCollaboratorFilters(request.nextUrl.searchParams, mappingConfig.dashboard_filters)

  let collabQuery = db
    .selectFrom('collaborators')
    .select(['id', 'remote_status'])
    .where('mapping_id', '=', mappingScope.mappingId)
  collabQuery = applyCollaboratorFilters(collabQuery, filters)

  let collabs
  try {
    collabs = await collabQuery.execute()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao buscar colaboradores.' }, { status: 500 })
  }

  // Exclui colaboradores que explicitamente responderam que não trabalham remotamente.
  // Quem não tem remote_status (dados antigos) é mantido para compatibilidade.
  const NEGATIVE_REMOTE = /^n[aã]o/i
  const collaboratorIds = collabs
    .filter((c) => {
      const rs = c.remote_status
      if (!rs) return true
      return !NEGATIVE_REMOTE.test(rs.trim())
    })
    .map((c) => c.id)
  if (collaboratorIds.length === 0) return NextResponse.json({ domains: [], class_distribution: [] })

  let responses
  try {
    responses = await db
      .selectFrom('responses')
      .select(['remote_domains', 'remote_class', 'remote_score', 'answers'])
      .where('collaborator_id', 'in', collaboratorIds)
      .execute()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao buscar respostas.' }, { status: 500 })
  }

  const domainAgg: Record<string, { sum: number; count: number; weight: number }> = {}
  const questionAgg: Record<string, { sum: number; count: number }> = {}
  const classMap: Record<string, number> = {}
  let scoreSum = 0, scoreCount = 0

  for (const r of responses ?? []) {
    if (r.remote_class) classMap[r.remote_class] = (classMap[r.remote_class] ?? 0) + 1
    if ((r as { remote_score?: number | null }).remote_score != null) { scoreSum += (r as { remote_score: number }).remote_score; scoreCount++ }
    if (Array.isArray(r.remote_domains)) {
      for (const d of r.remote_domains as unknown as RemoteDomainEntry[]) {
        const normalizedDomain = normalizeRemoteDomainName(d.domain)
        if (!domainAgg[normalizedDomain]) {
          domainAgg[normalizedDomain] = { sum: 0, count: 0, weight: d.weight }
        }
        domainAgg[normalizedDomain].sum += d.score
        domainAgg[normalizedDomain].count++
      }
    }
    if (Array.isArray((r as { answers?: ResponseAnswerEntry[] | null }).answers)) {
      for (const a of (r as { answers: ResponseAnswerEntry[] }).answers) {
        if (!a.questionCode || !REMOTE_Q_BY_CODE.has(a.questionCode) || a.riskValue == null) continue
        if (!questionAgg[a.questionCode]) questionAgg[a.questionCode] = { sum: 0, count: 0 }
        questionAgg[a.questionCode].sum += a.riskValue
        questionAgg[a.questionCode].count++
      }
    }
  }

  const domains = Object.entries(domainAgg).map(([name, { sum, count, weight }]) => {
    const avg = count > 0 ? Math.round((sum / count) * 100) / 100 : 0
    let classification = 'Situação de risco'
    if (avg >= 4) classification = 'Condição adequada'
    else if (avg >= 3) classification = 'Zona de atenção'
    return { name, avg_score: avg, weight, classification }
  })

  const class_distribution = Object.entries(classMap).map(([name, value]) => ({ name, value }))
  const avg_score = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) / 100 : null

  const question_risk = REMOTE_QUESTIONS
    .map((q) => {
      const agg = questionAgg[q.code]
      if (!agg || agg.count === 0) return null
      const avg = Math.round((agg.sum / agg.count) * 100) / 100
      return {
        domain: q.domain,
        question_code: q.code,
        question_text: mappingConfig.ietr_question_text_overrides[q.code] ?? q.text,
        avg_score: avg,
        classification: classifyRemote(avg),
        responses: agg.count,
      }
    })
    .filter((q): q is NonNullable<typeof q> => q !== null)

  return NextResponse.json({ domains, class_distribution, avg_score, question_risk })
}
