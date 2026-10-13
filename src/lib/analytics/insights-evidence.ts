import {
  DEPRESSION_SYMPTOM_OPTIONS,
  STRESS_SOURCE_OPTIONS,
  STRESS_SYMPTOM_OPTIONS,
  SUBSTANCE_USED_OPTIONS,
  SUPPORT_SOURCE_OPTIONS,
  type CheckboxOption,
} from './mental-health-definition'
import {
  calculateMentalHealth,
  normalizeMentalHealthAnswers,
  type MentalHealthAnswers,
  type MentalHealthResult,
} from './mental-health'
import {
  computeMappingHighlights,
  type HighlightResponseRow,
  type MappingHighlights,
  type SegmentSource,
} from './mapping-highlights'

/**
 * Pacote de evidências que alimenta os Insights com IA.
 *
 * Todos os números (médias, prevalências, correlações, comparações entre
 * grupos) são calculados aqui, de forma determinística — a IA só interpreta.
 * Isso garante que o que aparece nos gráficos da tela é exatamente o que foi
 * medido, e que o modelo não precise (nem possa) "inventar" estatística.
 *
 * Privacidade: só agregados saem daqui. Correlações exigem
 * MIN_CORRELATION_N pares; comparações entre grupos exigem MIN_GROUP pessoas
 * em cada lado; segmentos seguem o recorte de computeMappingHighlights.
 */

const MIN_CORRELATION_N = 10
const MIN_GROUP = 5

export interface CorrelationStat {
  id: string
  x: string
  y: string
  r: number
  n: number
  strength: 'desprezível' | 'fraca' | 'moderada' | 'forte'
  /** Leitura em linguagem simples do sinal, já considerando o sentido das escalas. */
  reading: string
}

export interface ComparisonStat {
  id: string
  metric: string
  scale: string
  a: { label: string; mean: number; n: number }
  b: { label: string; mean: number; n: number }
  diff: number
}

export interface PrevalenceItem { label: string; pct: number; count: number }

export interface InsightsEvidence {
  scope: {
    total_collaborators: number
    total_answered: number
    response_rate: number
    modules: string[]
    filters: Record<string, string>
  }
  highlights: MappingHighlights
  remote_domains: Array<{ name: string; avg_score: number }>
  mental_health_detail: null | {
    components: Array<{ label: string; avg_score: number | null }>
    stress_symptoms: PrevalenceItem[]
    stress_sources: PrevalenceItem[]
    depression_symptoms: PrevalenceItem[]
    support_sources: PrevalenceItem[]
    substances: PrevalenceItem[]
    disaster_exposed_pct: number | null
  }
  correlations: CorrelationStat[]
  comparisons: ComparisonStat[]
}

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length

function pearson(pairs: Array<[number, number]>): number | null {
  if (pairs.length < MIN_CORRELATION_N) return null
  const mx = mean(pairs.map((p) => p[0]))
  const my = mean(pairs.map((p) => p[1]))
  let num = 0
  let dx = 0
  let dy = 0
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my)
    dx += (x - mx) ** 2
    dy += (y - my) ** 2
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

function strengthOf(r: number): CorrelationStat['strength'] {
  const a = Math.abs(r)
  if (a < 0.1) return 'desprezível'
  if (a < 0.3) return 'fraca'
  if (a < 0.5) return 'moderada'
  return 'forte'
}

type Respondent = {
  id: string
  hse: number | null
  hseClass: string | null
  hseDomains: Record<string, number>
  remote: number | null
  mh: MentalHealthResult | null
  mhAnswers: MentalHealthAnswers | null
}

/**
 * Definição das variáveis por respondente usadas nas correlações. `higherIsWorse`
 * informa a leitura do sinal: HSE é risco (maior = pior); Saúde Mental, IETR e
 * notas de percepção são bem-estar (maior = melhor); contagens de sintomas são
 * risco.
 */
type Variable = { key: string; label: string; higherIsWorse: boolean; get: (r: Respondent) => number | null }

const HSE_DOMAIN_KEYS = [
  'Demandas', 'Controle', 'Apoio da Liderança', 'Apoio dos Colegas', 'Relacionamentos', 'Cargo', 'Comunicação e Mudanças',
]

function buildVariables(): Record<string, Variable> {
  const vars: Variable[] = [
    { key: 'hse', label: 'Índice HSE (risco psicossocial)', higherIsWorse: true, get: (r) => r.hse },
    { key: 'mh', label: 'Índice de Saúde Mental', higherIsWorse: false, get: (r) => (typeof r.mh?.index === 'number' ? r.mh.index : null) },
    { key: 'remote', label: 'Índice IETR (trabalho remoto)', higherIsWorse: false, get: (r) => r.remote },
    { key: 'health', label: 'Percepção de saúde (0–10)', higherIsWorse: false, get: (r) => r.mh?.perception?.healthScore ?? null },
    { key: 'life', label: 'Qualidade de vida (0–10)', higherIsWorse: false, get: (r) => r.mh?.perception?.lifeQualityScore ?? null },
    { key: 'stress', label: 'Nº de sintomas de estresse', higherIsWorse: true, get: (r) => r.mh?.stress?.symptomCount ?? null },
    { key: 'depression', label: 'Nº de sintomas depressivos', higherIsWorse: true, get: (r) => r.mh?.depression?.symptomCount ?? null },
    ...HSE_DOMAIN_KEYS.map((d) => ({
      key: `hse:${d}`,
      label: `Domínio HSE "${d}"`,
      higherIsWorse: true,
      get: (r: Respondent) => r.hseDomains[d] ?? null,
    })),
  ]
  return Object.fromEntries(vars.map((v) => [v.key, v]))
}

/** Pares de variáveis com hipótese de relação relevante para gestão. */
const CORRELATION_PAIRS: Array<[string, string]> = [
  ['hse', 'mh'],
  ['hse', 'health'],
  ['hse', 'life'],
  ['hse', 'stress'],
  ['hse:Demandas', 'stress'],
  ['hse:Demandas', 'mh'],
  ['hse:Apoio da Liderança', 'depression'],
  ['hse:Apoio da Liderança', 'mh'],
  ['hse:Relacionamentos', 'depression'],
  ['hse:Controle', 'stress'],
  ['hse:Comunicação e Mudanças', 'mh'],
  ['hse:Apoio dos Colegas', 'mh'],
  ['remote', 'mh'],
  ['remote', 'stress'],
]

function readCorrelation(x: Variable, y: Variable, r: number): string {
  if (Math.abs(r) < 0.1) return `Não há relação relevante entre ${x.label} e ${y.label}.`
  // "Pior com pior" quando o sinal concorda com o sentido de risco das duas escalas.
  const sameRiskDirection = x.higherIsWorse === y.higherIsWorse
  const worseTogether = (r > 0 && sameRiskDirection) || (r < 0 && !sameRiskDirection)
  return worseTogether
    ? `Quanto pior ${x.label}, pior tende a ser ${y.label}.`
    : `Quanto pior ${x.label}, melhor tende a ser ${y.label} (relação inversa ao esperado).`
}

function prevalence(results: Array<{ answers: MentalHealthAnswers }>, options: readonly CheckboxOption[], top = 5): PrevalenceItem[] {
  const total = results.length
  return options
    .map((opt) => {
      const count = results.filter((r) => r.answers[opt.field] === true).length
      return { label: opt.label.replace(/\s*\(.*\)\s*$/, ''), count, pct: total > 0 ? round((count / total) * 100, 1) : 0 }
    })
    .filter((i) => i.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, top)
}

function compare(
  id: string,
  metric: string,
  scale: string,
  respondents: Respondent[],
  value: (r: Respondent) => number | null,
  split: (r: Respondent) => boolean | null,
  labels: [string, string],
): ComparisonStat | null {
  const a: number[] = []
  const b: number[] = []
  for (const r of respondents) {
    const v = value(r)
    const s = split(r)
    if (v === null || s === null) continue
    ;(s ? a : b).push(v)
  }
  if (a.length < MIN_GROUP || b.length < MIN_GROUP) return null
  const ma = round(mean(a))
  const mb = round(mean(b))
  return {
    id,
    metric,
    scale,
    a: { label: labels[0], mean: ma, n: a.length },
    b: { label: labels[1], mean: mb, n: b.length },
    diff: round(ma - mb),
  }
}

export function buildInsightsEvidence(input: {
  collaborators: Array<{ id: string; has_answered: boolean; gender: string | null }>
  responses: HighlightResponseRow[]
  modules: readonly string[]
  segments: readonly SegmentSource[]
  filters: Record<string, string>
  hseQuestionTextOverrides?: Record<string, string>
}): InsightsEvidence {
  const highlights = computeMappingHighlights({
    collaborators: input.collaborators,
    responses: input.responses,
    modules: input.modules,
    segments: input.segments,
    hseQuestionTextOverrides: input.hseQuestionTextOverrides,
  })

  const genderById = new Map(input.collaborators.map((c) => [c.id, c.gender]))
  const ids = new Set(input.collaborators.map((c) => c.id))

  const respondents: Respondent[] = input.responses
    .filter((row) => ids.has(row.collaborator_id))
    .map((row) => {
      const hseDomains: Record<string, number> = {}
      if (Array.isArray(row.hse_domains)) {
        for (const d of row.hse_domains as Array<{ domain?: string; score?: number }>) {
          if (d?.domain && typeof d.score === 'number') hseDomains[d.domain] = d.score
        }
      }
      const mhAnswers = row.mental_health_answers
        ? normalizeMentalHealthAnswers(row.mental_health_answers as MentalHealthAnswers)
        : null
      const mh = (row.mental_health_derived && typeof row.mental_health_derived === 'object')
        ? row.mental_health_derived as MentalHealthResult
        : mhAnswers ? calculateMentalHealth(mhAnswers, { gender: genderById.get(row.collaborator_id) ?? null }) : null
      return {
        id: row.collaborator_id,
        hse: typeof row.hse_score === 'number' ? row.hse_score : null,
        hseClass: row.hse_class,
        hseDomains,
        remote: typeof row.remote_score === 'number' ? row.remote_score : null,
        mh,
        mhAnswers,
      }
    })

  // ─── Domínios IETR ─────────────────────────────────────────────────────────
  const remoteAgg = new Map<string, { sum: number; count: number }>()
  for (const row of input.responses) {
    if (!ids.has(row.collaborator_id) || !Array.isArray(row.remote_domains)) continue
    for (const d of row.remote_domains as Array<{ domain?: string; score?: number }>) {
      if (!d?.domain || typeof d.score !== 'number') continue
      const agg = remoteAgg.get(d.domain) ?? { sum: 0, count: 0 }
      agg.sum += d.score
      agg.count++
      remoteAgg.set(d.domain, agg)
    }
  }
  const remote_domains = [...remoteAgg.entries()]
    .map(([name, { sum, count }]) => ({ name, avg_score: round(sum / count) }))
    .sort((a, b) => a.avg_score - b.avg_score)

  // ─── Saúde mental detalhada ────────────────────────────────────────────────
  const withMh = respondents.filter((r): r is Respondent & { mh: MentalHealthResult; mhAnswers: MentalHealthAnswers } => !!r.mh && !!r.mhAnswers)
  let mental_health_detail: InsightsEvidence['mental_health_detail'] = null
  if (input.modules.includes('saude_mental') && withMh.length > 0) {
    const compAgg = new Map<string, { sum: number; count: number }>()
    for (const r of withMh) {
      for (const c of r.mh.components ?? []) {
        if (typeof c.score !== 'number') continue
        const agg = compAgg.get(c.label) ?? { sum: 0, count: 0 }
        agg.sum += c.score
        agg.count++
        compAgg.set(c.label, agg)
      }
    }
    const answersList = withMh.map((r) => ({ answers: r.mhAnswers }))
    const exposedKnown = withMh.filter((r) => typeof r.mhAnswers.exposed_natural_disaster === 'boolean')
    mental_health_detail = {
      components: [...compAgg.entries()]
        .map(([label, { sum, count }]) => ({ label, avg_score: count > 0 ? round(sum / count) : null }))
        .sort((a, b) => (a.avg_score ?? 99) - (b.avg_score ?? 99)),
      stress_symptoms: prevalence(answersList, STRESS_SYMPTOM_OPTIONS),
      stress_sources: prevalence(answersList, STRESS_SOURCE_OPTIONS),
      depression_symptoms: prevalence(answersList, DEPRESSION_SYMPTOM_OPTIONS),
      support_sources: prevalence(answersList, SUPPORT_SOURCE_OPTIONS, 4),
      substances: prevalence(answersList, SUBSTANCE_USED_OPTIONS, 4),
      disaster_exposed_pct: exposedKnown.length > 0
        ? round((exposedKnown.filter((r) => r.mhAnswers.exposed_natural_disaster === true).length / exposedKnown.length) * 100, 1)
        : null,
    }
  }

  // ─── Correlações ───────────────────────────────────────────────────────────
  const vars = buildVariables()
  const correlations: CorrelationStat[] = []
  for (const [xk, yk] of CORRELATION_PAIRS) {
    const x = vars[xk]
    const y = vars[yk]
    if (!x || !y) continue
    const pairs: Array<[number, number]> = []
    for (const r of respondents) {
      const vx = x.get(r)
      const vy = y.get(r)
      if (vx !== null && vy !== null) pairs.push([vx, vy])
    }
    const r = pearson(pairs)
    if (r === null) continue
    correlations.push({
      id: `${xk}__${yk}`,
      x: x.label,
      y: y.label,
      r: round(r),
      n: pairs.length,
      strength: strengthOf(r),
      reading: readCorrelation(x, y, r),
    })
  }
  correlations.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))

  // ─── Comparações entre grupos ──────────────────────────────────────────────
  const mhIndex = (r: Respondent) => (typeof r.mh?.index === 'number' ? r.mh.index : null)
  const comparisons = [
    compare('mh_by_hse_risk', 'Índice de Saúde Mental', '0–10, maior = melhor', respondents, mhIndex,
      (r) => (r.hseClass === 'Alto risco' || r.hseClass === 'Risco moderado' ? true : r.hseClass === 'Baixo risco' ? false : null),
      ['Risco HSE moderado/alto', 'Risco HSE baixo']),
    compare('mh_by_support', 'Índice de Saúde Mental', '0–10, maior = melhor', respondents, mhIndex,
      (r) => (r.mh?.support?.presence === 'Sim' ? true : r.mh?.support?.presence === 'Não' ? false : null),
      ['Com rede de apoio', 'Sem rede de apoio']),
    compare('mh_by_remote', 'Índice de Saúde Mental', '0–10, maior = melhor', respondents, mhIndex,
      (r) => (input.modules.includes('ietr') ? r.remote !== null : null),
      ['Em trabalho remoto', 'Presencial']),
    compare('mh_by_work_stress', 'Índice de Saúde Mental', '0–10, maior = melhor', respondents, mhIndex,
      (r) => (r.mhAnswers ? r.mhAnswers.stress_source_work === true : null),
      ['Apontam o trabalho como fonte de estresse', 'Não apontam']),
    compare('mh_by_disaster', 'Índice de Saúde Mental', '0–10, maior = melhor', respondents, mhIndex,
      (r) => (typeof r.mhAnswers?.exposed_natural_disaster === 'boolean' ? r.mhAnswers.exposed_natural_disaster : null),
      ['Expostos a desastre natural', 'Não expostos']),
    compare('hse_by_work_stress', 'Índice HSE', '0–4, maior = pior', respondents, (r) => r.hse,
      (r) => (r.mhAnswers ? r.mhAnswers.stress_source_work === true : null),
      ['Apontam o trabalho como fonte de estresse', 'Não apontam']),
    compare('life_by_hse_risk', 'Qualidade de vida', '0–10, maior = melhor', respondents, (r) => r.mh?.perception?.lifeQualityScore ?? null,
      (r) => (r.hseClass === 'Alto risco' || r.hseClass === 'Risco moderado' ? true : r.hseClass === 'Baixo risco' ? false : null),
      ['Risco HSE moderado/alto', 'Risco HSE baixo']),
  ].filter((c): c is ComparisonStat => c !== null)

  return {
    scope: {
      total_collaborators: highlights.total_expected,
      total_answered: highlights.total_responses,
      response_rate: highlights.completion_pct,
      modules: [...input.modules],
      filters: input.filters,
    },
    highlights,
    remote_domains,
    mental_health_detail,
    correlations,
    comparisons,
  }
}
