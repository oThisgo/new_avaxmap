import { HSE_QUESTIONS } from './hse-definition'
import {
  calculateMentalHealth,
  classifyMentalHealth,
  normalizeMentalHealthAnswers,
  type MentalHealthAnswers,
  type MentalHealthResult,
} from './mental-health'

/**
 * Indicadores-resumo de um mapeamento ("termômetro" da Visão Geral e cards do
 * dashboard do cliente). Função pura sobre as linhas já buscadas — as rotas
 * cuidam de escopo/filtros; aqui só agrega.
 *
 * Recorte de anonimato: tudo que cruza risco com um segmento (unidade, função...)
 * só é publicado para grupos com pelo menos MIN_GROUP_RESPONDENTS respostas, a
 * mesma régua do MIN_GROUP_SIZE dos filtros do dashboard. Adesão (quem respondeu
 * ou não) é dado de participação, não de risco, e sai para grupos com pelo menos
 * MIN_GROUP_RESPONDENTS colaboradores cadastrados.
 */
export const MIN_GROUP_RESPONDENTS = 5

export type HseClass = 'Baixo risco' | 'Risco moderado' | 'Alto risco'
export type RemoteClass = 'Condição adequada' | 'Zona de atenção' | 'Situação de risco'

export function classifyHse(avg: number): HseClass {
  if (avg >= 2.5) return 'Alto risco'
  if (avg >= 1.5) return 'Risco moderado'
  return 'Baixo risco'
}

export function classifyRemote(avg: number): RemoteClass {
  if (avg >= 4) return 'Condição adequada'
  if (avg >= 3) return 'Zona de atenção'
  return 'Situação de risco'
}

export interface HighlightResponseRow {
  collaborator_id: string
  submitted_at: string | null
  hse_score: number | null
  hse_class: string | null
  hse_domains: unknown
  answers: unknown
  remote_score: number | null
  remote_class: string | null
  remote_domains?: unknown
  mental_health_answers: unknown
  mental_health_derived: unknown
}

export interface SegmentSource {
  key: string
  label: string
  /** Valor do segmento por colaborador (já decifrado quando for o caso). */
  valueOf: (collaboratorId: string) => string | null
}

type Dist = { name: string; value: number }

const round2 = (v: number) => Math.round(v * 100) / 100
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0)

function countsToDist(counts: Map<string, number>, order: readonly string[]): Dist[] {
  return order.filter((name) => (counts.get(name) ?? 0) > 0).map((name) => ({ name, value: counts.get(name) as number }))
}

const HSE_ORDER: readonly HseClass[] = ['Baixo risco', 'Risco moderado', 'Alto risco']
const REMOTE_ORDER: readonly RemoteClass[] = ['Condição adequada', 'Zona de atenção', 'Situação de risco']
const MH_ORDER = ['Excelente', 'Bom', 'Regular', 'Insatisfatório'] as const

const HSE_META = new Map(HSE_QUESTIONS.map((q) => [q.code, q]))

function resolveMentalHealth(row: HighlightResponseRow, gender: string | null): MentalHealthResult | null {
  if (row.mental_health_derived && typeof row.mental_health_derived === 'object') {
    return row.mental_health_derived as MentalHealthResult
  }
  if (!row.mental_health_answers) return null
  return calculateMentalHealth(
    normalizeMentalHealthAnswers(row.mental_health_answers as MentalHealthAnswers),
    { gender },
  )
}

export interface MappingHighlights {
  total_expected: number
  total_responses: number
  completion_pct: number
  first_response_at: string | null
  last_response_at: string | null
  responses_by_day: Array<{ date: string; count: number; cumulative: number; cumulative_pct: number }>
  hse: null | {
    respondents: number
    avg_score: number | null
    classification: HseClass | null
    high_risk: number
    class_distribution: Dist[]
    domains: Array<{ name: string; avg_score: number; classification: HseClass }>
    critical_questions: Array<{ code: string; domain: string; text: string; avg_score: number; classification: HseClass; high_risk_pct: number }>
  }
  mental_health: null | {
    respondents: number
    avg_index: number | null
    classification: string | null
    class_distribution: Dist[]
    suicide_at_risk: number
    suicide_pct: number
    severe_stress: number
    depressive_moderate_severe: number
    no_support: number
    binge: number
    avg_health_score: number | null
    avg_life_quality: number | null
  }
  remote: null | {
    respondents: number
    avg_score: number | null
    classification: RemoteClass | null
    class_distribution: Dist[]
  }
  segments: Array<{
    key: string
    label: string
    groups: Array<{
      name: string
      total: number
      answered: number
      pct: number
      /** Risco só quando o grupo tem >= MIN_GROUP_RESPONDENTS respostas. */
      hse_avg: number | null
      hse_class: HseClass | null
      mh_avg: number | null
    }>
  }>
}

export function computeMappingHighlights(input: {
  collaborators: Array<{ id: string; has_answered: boolean; gender: string | null }>
  responses: HighlightResponseRow[]
  modules: readonly string[]
  segments?: readonly SegmentSource[]
  hseQuestionTextOverrides?: Record<string, string>
}): MappingHighlights {
  const { collaborators, responses, modules } = input
  const genderById = new Map(collaborators.map((c) => [c.id, c.gender]))
  const validIds = new Set(collaborators.map((c) => c.id))
  const rows = responses.filter((r) => validIds.has(r.collaborator_id))

  // ─── Linha do tempo ────────────────────────────────────────────────────────
  const byDay = new Map<string, number>()
  let first: string | null = null
  let last: string | null = null
  for (const r of rows) {
    if (!r.submitted_at) continue
    const day = r.submitted_at.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + 1)
    if (!first || r.submitted_at < first) first = r.submitted_at
    if (!last || r.submitted_at > last) last = r.submitted_at
  }
  let running = 0
  const responses_by_day = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => {
      running += count
      return { date, count, cumulative: running, cumulative_pct: pct(running, collaborators.length) }
    })

  // ─── Agregados por resposta ────────────────────────────────────────────────
  const hseClassCounts = new Map<string, number>()
  const hseDomainAgg = new Map<string, { sum: number; count: number }>()
  const hseQuestionAgg = new Map<string, { sum: number; count: number; high: number }>()
  let hseSum = 0
  let hseCount = 0

  const mhClassCounts = new Map<string, number>()
  let mhSum = 0
  let mhCount = 0
  let mhRespondents = 0
  let suicide = 0
  let severeStress = 0
  let depressive = 0
  let noSupport = 0
  let binge = 0
  let healthSum = 0
  let healthCount = 0
  let lifeSum = 0
  let lifeCount = 0

  const remoteClassCounts = new Map<string, number>()
  let remoteSum = 0
  let remoteCount = 0

  const perCollaborator = new Map<string, { hse: number | null; mh: number | null }>()

  for (const r of rows) {
    const entry = { hse: null as number | null, mh: null as number | null }

    if (typeof r.hse_score === 'number') {
      hseSum += r.hse_score
      hseCount++
      entry.hse = r.hse_score
      if (r.hse_class) hseClassCounts.set(r.hse_class, (hseClassCounts.get(r.hse_class) ?? 0) + 1)
    }
    if (Array.isArray(r.hse_domains)) {
      for (const d of r.hse_domains as Array<{ domain?: string; score?: number }>) {
        if (!d?.domain || typeof d.score !== 'number') continue
        const agg = hseDomainAgg.get(d.domain) ?? { sum: 0, count: 0 }
        agg.sum += d.score
        agg.count++
        hseDomainAgg.set(d.domain, agg)
      }
    }
    if (Array.isArray(r.answers)) {
      for (const a of r.answers as Array<{ questionCode?: string; riskValue?: number | null }>) {
        if (!a?.questionCode || !HSE_META.has(a.questionCode) || typeof a.riskValue !== 'number') continue
        const agg = hseQuestionAgg.get(a.questionCode) ?? { sum: 0, count: 0, high: 0 }
        agg.sum += a.riskValue
        agg.count++
        if (a.riskValue >= 3) agg.high++
        hseQuestionAgg.set(a.questionCode, agg)
      }
    }

    if (typeof r.remote_score === 'number') {
      remoteSum += r.remote_score
      remoteCount++
      if (r.remote_class) remoteClassCounts.set(r.remote_class, (remoteClassCounts.get(r.remote_class) ?? 0) + 1)
    }

    const mh = resolveMentalHealth(r, genderById.get(r.collaborator_id) ?? null)
    if (mh) {
      mhRespondents++
      mhClassCounts.set(mh.classification, (mhClassCounts.get(mh.classification) ?? 0) + 1)
      if (typeof mh.index === 'number') {
        mhSum += mh.index
        mhCount++
        entry.mh = mh.index
      }
      if (mh.suicide?.atRisk) {
        suicide++
      }
      if (mh.stress?.level === 'Sintomas Graves') severeStress++
      if (mh.depression?.level === 'Sintomas Moderados' || mh.depression?.level === 'Sintomas Graves') depressive++
      if (mh.support?.presence === 'Não') noSupport++
      if (mh.alcohol?.category === 'Padrão Binge') binge++
      if (typeof mh.perception?.healthScore === 'number') { healthSum += mh.perception.healthScore; healthCount++ }
      if (typeof mh.perception?.lifeQualityScore === 'number') { lifeSum += mh.perception.lifeQualityScore; lifeCount++ }
    }

    perCollaborator.set(r.collaborator_id, entry)
  }

  const hseAvg = hseCount > 0 ? round2(hseSum / hseCount) : null
  const mhAvg = mhCount > 0 ? round2(mhSum / mhCount) : null
  const remoteAvg = remoteCount > 0 ? round2(remoteSum / remoteCount) : null
  const overrides = input.hseQuestionTextOverrides ?? {}

  const hse = modules.includes('hse')
    ? {
        respondents: hseCount,
        avg_score: hseAvg,
        classification: hseAvg !== null ? classifyHse(hseAvg) : null,
        high_risk: hseClassCounts.get('Alto risco') ?? 0,
        class_distribution: countsToDist(hseClassCounts, HSE_ORDER),
        domains: [...hseDomainAgg.entries()]
          .map(([name, { sum, count }]) => {
            const avg = round2(sum / count)
            return { name, avg_score: avg, classification: classifyHse(avg) }
          })
          .sort((a, b) => b.avg_score - a.avg_score),
        critical_questions: [...hseQuestionAgg.entries()]
          .map(([code, { sum, count, high }]) => {
            const meta = HSE_META.get(code)!
            const avg = round2(sum / count)
            return {
              code,
              domain: meta.domain,
              text: overrides[code] ?? meta.text,
              avg_score: avg,
              classification: classifyHse(avg),
              high_risk_pct: pct(high, count),
            }
          })
          .sort((a, b) => b.avg_score - a.avg_score)
          .slice(0, 5),
      }
    : null

  const mental_health = modules.includes('saude_mental')
    ? {
        respondents: mhRespondents,
        avg_index: mhAvg,
        classification: mhAvg !== null ? classifyMentalHealth(mhAvg) : null,
        class_distribution: countsToDist(mhClassCounts, MH_ORDER),
        suicide_at_risk: suicide,
        suicide_pct: pct(suicide, mhRespondents),
        severe_stress: severeStress,
        depressive_moderate_severe: depressive,
        no_support: noSupport,
        binge,
        avg_health_score: healthCount > 0 ? round2(healthSum / healthCount) : null,
        avg_life_quality: lifeCount > 0 ? round2(lifeSum / lifeCount) : null,
      }
    : null

  const remote = modules.includes('ietr')
    ? {
        respondents: remoteCount,
        avg_score: remoteAvg,
        classification: remoteAvg !== null ? classifyRemote(remoteAvg) : null,
        class_distribution: countsToDist(remoteClassCounts, REMOTE_ORDER),
      }
    : null

  // ─── Segmentos: adesão e risco por grupo ───────────────────────────────────
  const segments = (input.segments ?? []).map((segment) => {
    const groups = new Map<string, { total: number; answered: number; hse: number[]; mh: number[] }>()
    for (const c of collaborators) {
      const name = segment.valueOf(c.id)
      if (!name) continue
      const g = groups.get(name) ?? { total: 0, answered: 0, hse: [], mh: [] }
      g.total++
      const resp = perCollaborator.get(c.id)
      if (c.has_answered || resp) g.answered++
      if (resp?.hse != null) g.hse.push(resp.hse)
      if (resp?.mh != null) g.mh.push(resp.mh)
      groups.set(name, g)
    }

    return {
      key: segment.key,
      label: segment.label,
      groups: [...groups.entries()]
        .filter(([, g]) => g.total >= MIN_GROUP_RESPONDENTS)
        .map(([name, g]) => {
          const enough = g.answered >= MIN_GROUP_RESPONDENTS
          const hseAvgGroup = enough && g.hse.length > 0 ? round2(g.hse.reduce((s, v) => s + v, 0) / g.hse.length) : null
          return {
            name,
            total: g.total,
            answered: g.answered,
            pct: pct(g.answered, g.total),
            hse_avg: hseAvgGroup,
            hse_class: hseAvgGroup !== null ? classifyHse(hseAvgGroup) : null,
            mh_avg: enough && g.mh.length > 0 ? round2(g.mh.reduce((s, v) => s + v, 0) / g.mh.length) : null,
          }
        })
        .sort((a, b) => b.total - a.total),
    }
  }).filter((s) => s.groups.length > 1)

  return {
    total_expected: collaborators.length,
    total_responses: rows.length,
    completion_pct: pct(rows.length, collaborators.length),
    first_response_at: first,
    last_response_at: last,
    responses_by_day,
    hse,
    mental_health,
    remote,
    segments,
  }
}
