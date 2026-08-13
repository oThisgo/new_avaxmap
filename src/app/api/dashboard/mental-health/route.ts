import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { requireMappingAccess } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import { parseCollaboratorFilters, applyCollaboratorFilters } from '@/lib/mapping/collaborator-fields'
import {
  DEPRESSION_SYMPTOM_OPTIONS,
  DISASTER_CONTACT_OPTIONS,
  DISASTER_TYPE_OPTIONS,
  INTENSITY_OPTIONS,
  INTERNET_FIELDS,
  LIFE_EVENT_OPTIONS,
  LIFE_EVENT_OTHER_FIELD,
  STRESS_SOURCE_OPTIONS,
  STRESS_SYMPTOM_OPTIONS,
  SUBSTANCE_USED_OPTIONS,
  SUICIDE_SYMPTOM_OPTIONS,
  SUPPORT_OTHER_FIELD,
  SUPPORT_SOURCE_OPTIONS,
  type CheckboxOption,
  type EnumOption,
} from '@/lib/analytics/mental-health-definition'
import {
  MENTAL_HEALTH_COMPONENT_WEIGHTS,
  calculateMentalHealth,
  normalizeMentalHealthAnswers,
  type MentalHealthAnswers,
  type MentalHealthComponentKey,
  type MentalHealthResult,
} from '@/lib/analytics/mental-health'

/**
 * Agregações do módulo Saúde Mental. Lê o cache derivado gravado na submissão e,
 * quando ele não existe (resposta gravada antes desta versão), recalcula na hora
 * a partir das respostas brutas — é a mesma função pura usada no envio, então
 * não há chance de divergência entre "o que foi gravado" e "o que o dashboard
 * mostra".
 */

interface ResponseRow {
  collaborator_id: string
  mental_health_answers: MentalHealthAnswers | null
  mental_health_derived: MentalHealthResult | null
}

type DescriptiveGroup = {
  key: string
  title: string
  options: readonly CheckboxOption[]
  /** Campo de texto livre "Outro", contabilizado quando preenchido. */
  otherField?: string
  otherLabel?: string
}

/** Rótulos curtos para os 3 booleanos de uso de internet (SM15–SM17), que não têm um CheckboxGroupQuestion próprio para herdar labels. */
const INTERNET_BEHAVIOR_LABELS: Record<string, string> = {
  technology_online_time: 'Sente que deveria diminuir o tempo on-line',
  technology_anxiety: 'Sente ansiedade sem verificar o celular',
  technology_social_media: 'Sente-se triste ou frustrado ao se comparar nas redes sociais',
}

const DESCRIPTIVE_GROUPS: readonly DescriptiveGroup[] = [
  { key: 'stress_symptoms', title: 'Sintomas de estresse (último mês)', options: STRESS_SYMPTOM_OPTIONS },
  { key: 'stress_sources', title: 'Fontes de estresse na rotina', options: STRESS_SOURCE_OPTIONS },
  { key: 'depression_symptoms', title: 'Sintomas depressivos (duas últimas semanas)', options: DEPRESSION_SYMPTOM_OPTIONS },
  { key: 'suicide_symptoms', title: 'Indicadores de risco (últimos 30 dias)', options: SUICIDE_SYMPTOM_OPTIONS },
  { key: 'substances', title: 'Substâncias e medicações (últimos 30 dias)', options: SUBSTANCE_USED_OPTIONS },
  {
    key: 'support_sources',
    title: 'Rede de apoio',
    options: SUPPORT_SOURCE_OPTIONS,
    otherField: SUPPORT_OTHER_FIELD,
    otherLabel: 'Outro',
  },
  {
    key: 'life_events',
    title: 'Vivências do último ano',
    options: LIFE_EVENT_OPTIONS,
    otherField: LIFE_EVENT_OTHER_FIELD,
    otherLabel: 'Outro',
  },
  {
    key: 'internet_behaviors',
    title: 'Comportamentos de uso de internet',
    options: INTERNET_FIELDS.map((field) => ({ field, label: INTERNET_BEHAVIOR_LABELS[field] })),
  },
]

const CLASSIFICATION_ORDER = ['Excelente', 'Bom', 'Regular', 'Insatisfatório', 'Sem dados'] as const

/** Blocos categóricos que viram distribuição (pizza) no dashboard, na ordem das faixas. */
const DISTRIBUTION_ORDER: Record<string, readonly string[]> = {
  estresse: ['Ausência de Sintomas', 'Sintomas Leves', 'Sintomas Moderados', 'Sintomas Graves'],
  sintomas_depressivos: ['Ausência de Sintomas', 'Sintomas Leves', 'Sintomas Moderados', 'Sintomas Graves'],
  internet: ['Ausente', 'Leve', 'Moderada', 'Alta', 'Não Informado'],
  rede_de_apoio: ['Sim', 'Não', 'Não Informado'],
  tabaco: ['Não fumante', 'Ex-fumante', 'Fumante passivo', 'Fumante', 'Não Informado'],
  alcool: ['Não Bebe', 'Consumo Moderado', 'Padrão Binge', 'Não Informado'],
  // ansiedade_climatica não é um componente do índice, é a exposição a
  // desastre natural/ambiental (SM03) exibida à parte. percepcao_saude e
  // qualidade_de_vida não entram aqui — são nota 0–10 pura, exibidas como
  // histograma (ver NumericAccumulator/tobacco_cigarettes/health_score/
  // life_quality_score mais abaixo), não como pizza.
  ansiedade_climatica: ['Sim', 'Não', 'Não Informado'],
}

const DISTRIBUTION_TITLES: Record<string, string> = {
  estresse: 'Nível de estresse',
  sintomas_depressivos: 'Nível de sintomas depressivos',
  internet: 'Dependência de internet',
  rede_de_apoio: 'Possui rede de apoio',
  tabaco: 'Uso de tabaco',
  alcool: 'Uso de álcool',
  ansiedade_climatica: 'Exposição a desastre natural/ambiental',
}

type EnumDescriptiveGroup = {
  key: string
  title: string
  /** Campo em MentalHealthAnswers de onde vem o valor (numérico, um dos `options`). */
  field: string
  options: readonly EnumOption[]
}

/**
 * Perguntas de acompanhamento da exposição a desastre (SM04–SM07), só
 * respondidas por quem marcou exposição em SM03 — por isso a % de cada item
 * aqui é sobre o total de expostos, não sobre todos os respondentes do módulo.
 */
const CLIMATE_ENUM_GROUPS: readonly EnumDescriptiveGroup[] = [
  { key: 'disaster_type', title: 'Tipo de desastre mais intenso (entre expostos)', field: 'disaster_type', options: DISASTER_TYPE_OPTIONS },
  { key: 'disaster_contact', title: 'Contato com o desastre (entre expostos)', field: 'disaster_contact', options: DISASTER_CONTACT_OPTIONS },
  { key: 'disaster_vulnerability', title: 'Vulnerabilidade a desastres futuros (entre expostos)', field: 'disaster_vulnerability_feeling', options: INTENSITY_OPTIONS },
  { key: 'disaster_safety_concern', title: 'Preocupação com segurança do lar/trabalho (entre expostos)', field: 'disaster_safety_concern', options: INTENSITY_OPTIONS },
]

function toOrderedDistribution(counts: Map<string, number>, order: readonly string[]) {
  const rows = order
    .filter((name) => (counts.get(name) ?? 0) > 0)
    .map((name) => ({ name, value: counts.get(name) as number }))

  // Categorias fora da ordem conhecida (dado legado) entram ao final em vez de sumir.
  for (const [name, value] of counts) {
    if (!order.includes(name) && value > 0) rows.push({ name, value })
  }
  return rows
}

/** Acumulador de um valor numérico bruto (nota 0–10, cigarros/dia) — vira histograma + média/min/máx. */
class NumericAccumulator {
  private counts = new Map<number, number>()
  private sum = 0
  private count = 0
  private min = Infinity
  private max = -Infinity

  add(value: number) {
    this.counts.set(value, (this.counts.get(value) ?? 0) + 1)
    this.sum += value
    this.count++
    if (value < this.min) this.min = value
    if (value > this.max) this.max = value
  }

  toJSON() {
    const histogram = [...this.counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([value, count]) => ({
        value,
        count,
        pct: this.count > 0 ? Math.round((count / this.count) * 1000) / 10 : 0,
      }))

    return {
      respondents: this.count,
      avg: this.count > 0 ? Math.round((this.sum / this.count) * 100) / 100 : null,
      min: this.count > 0 ? this.min : null,
      max: this.count > 0 ? this.max : null,
      histogram,
    }
  }
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
    .select(['id', 'gender'])
    .where('mapping_id', '=', mappingScope.mappingId)
  collabQuery = applyCollaboratorFilters(collabQuery, filters)

  let collabs
  try {
    collabs = await collabQuery.execute()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao buscar colaboradores.' }, { status: 500 })
  }

  const genderById = new Map(collabs.map((c) => [c.id, c.gender ?? null]))
  const collaboratorIds = [...genderById.keys()]

  const emptyHistogram = { respondents: 0, avg: null, min: null, max: null, histogram: [] }
  const empty = {
    respondents: 0,
    avg_index: null,
    class_distribution: [],
    components: [],
    distributions: [],
    suicide: { at_risk: 0, total: 0 },
    descriptive: [],
    tobacco_cigarettes: emptyHistogram,
    health_score: emptyHistogram,
    life_quality_score: emptyHistogram,
  }
  if (collaboratorIds.length === 0) return NextResponse.json(empty)

  let responses
  try {
    responses = await db
      .selectFrom('responses')
      .select(['collaborator_id', 'mental_health_answers', 'mental_health_derived'])
      .where('collaborator_id', 'in', collaboratorIds)
      .execute()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao buscar respostas.' }, { status: 500 })
  }

  const results: MentalHealthResult[] = []
  // Exposição a desastre (SM03) e suas perguntas de acompanhamento (SM04–SM07)
  // não fazem parte de MentalHealthResult (não são componente do índice), então
  // saem das respostas brutas — sempre disponíveis junto do cache derivado, já
  // que responses/route.ts grava as duas colunas juntas na submissão.
  const climateExposureCounts = new Map<string, number>()
  const climateEnumCounts = new Map<string, Map<number, number>>()
  let exposedTotal = 0

  for (const row of responses as ResponseRow[]) {
    const result = row.mental_health_derived
      ?? (row.mental_health_answers
        ? calculateMentalHealth(normalizeMentalHealthAnswers(row.mental_health_answers), {
            gender: genderById.get(row.collaborator_id) ?? null,
          })
        : null)
    if (!result) continue
    results.push(result)

    if (!row.mental_health_answers) continue
    const rawAnswers = normalizeMentalHealthAnswers(row.mental_health_answers)
    const exposed = rawAnswers.exposed_natural_disaster
    const exposedLabel = exposed === true ? 'Sim' : exposed === false ? 'Não' : 'Não Informado'
    climateExposureCounts.set(exposedLabel, (climateExposureCounts.get(exposedLabel) ?? 0) + 1)

    if (exposed === true) {
      exposedTotal++
      for (const group of CLIMATE_ENUM_GROUPS) {
        const value = rawAnswers[group.field]
        if (typeof value !== 'number') continue
        const bucket = climateEnumCounts.get(group.key) ?? new Map<number, number>()
        bucket.set(value, (bucket.get(value) ?? 0) + 1)
        climateEnumCounts.set(group.key, bucket)
      }
    }
  }

  if (results.length === 0) return NextResponse.json(empty)

  // Índice médio — só entram as linhas com índice publicável (acima do piso de
  // confiabilidade). Linhas "Sem dados" contam na distribuição, não na média.
  let indexSum = 0
  let indexCount = 0
  const classCounts = new Map<string, number>()
  const componentSums = new Map<MentalHealthComponentKey, { sum: number; count: number }>()
  const distributionCounts = new Map<string, Map<string, number>>()
  const flagCounts = new Map<string, number>()
  let suicideAtRisk = 0
  // Histogramas de valor bruto — ver ValueHistogramCard no dashboard: mostram
  // a distribuição exata (não faixas), com média/mín/máx, no lugar de uma pizza.
  const cigarettesPerDay = new NumericAccumulator()
  const healthScore = new NumericAccumulator()
  const lifeQualityScore = new NumericAccumulator()

  for (const result of results) {
    if (typeof result.index === 'number') {
      indexSum += result.index
      indexCount++
    }
    classCounts.set(result.classification, (classCounts.get(result.classification) ?? 0) + 1)
    if (result.suicide?.atRisk) suicideAtRisk++

    if (typeof result.tobacco?.cigarettesPerDay === 'number') cigarettesPerDay.add(result.tobacco.cigarettesPerDay)
    if (typeof result.perception?.healthScore === 'number') healthScore.add(result.perception.healthScore)
    if (typeof result.perception?.lifeQualityScore === 'number') lifeQualityScore.add(result.perception.lifeQualityScore)

    for (const component of result.components ?? []) {
      // A média por componente só considera quem respondeu; a distribuição
      // considera todo mundo, inclusive a faixa "Não Informado" — senão o
      // gráfico esconde justamente quem deixou o bloco em branco.
      if (typeof component.score === 'number') {
        const agg = componentSums.get(component.key) ?? { sum: 0, count: 0 }
        agg.sum += component.score
        agg.count++
        componentSums.set(component.key, agg)
      }

      if (!component.detail || !DISTRIBUTION_ORDER[component.key]) continue
      const bucket = distributionCounts.get(component.key) ?? new Map<string, number>()
      bucket.set(component.detail, (bucket.get(component.detail) ?? 0) + 1)
      distributionCounts.set(component.key, bucket)
    }

    for (const [field, value] of Object.entries(result.flags ?? {})) {
      if (value) flagCounts.set(field, (flagCounts.get(field) ?? 0) + 1)
    }
  }

  distributionCounts.set('ansiedade_climatica', climateExposureCounts)

  const components = (Object.keys(MENTAL_HEALTH_COMPONENT_WEIGHTS) as MentalHealthComponentKey[])
    .map((key) => {
      const agg = componentSums.get(key)
      const label = results[0]?.components?.find((c) => c.key === key)?.label ?? key
      return {
        key,
        label,
        weight: MENTAL_HEALTH_COMPONENT_WEIGHTS[key],
        avg_score: agg && agg.count > 0 ? Math.round((agg.sum / agg.count) * 100) / 100 : null,
        answered: agg?.count ?? 0,
      }
    })

  const distributions = Object.keys(DISTRIBUTION_ORDER)
    .map((key) => ({
      key,
      title: DISTRIBUTION_TITLES[key] ?? key,
      items: toOrderedDistribution(distributionCounts.get(key) ?? new Map(), DISTRIBUTION_ORDER[key]),
    }))
    .filter((group) => group.items.length > 0)

  const descriptive = DESCRIPTIVE_GROUPS.map((group) => {
    const items = [
      ...group.options.map((option) => ({ field: option.field, label: option.label })),
      ...(group.otherField ? [{ field: group.otherField, label: group.otherLabel ?? 'Outro' }] : []),
    ]
      .map((item) => {
        const count = flagCounts.get(item.field) ?? 0
        return {
          ...item,
          count,
          pct: Math.round((count / results.length) * 1000) / 10,
        }
      })
      .sort((a, b) => b.count - a.count)

    return { key: group.key, title: group.title, items }
  })

  // Segue o mesmo padrão de DESCRIPTIVE_GROUPS acima (todas as opções aparecem,
  // mesmo com contagem 0 — ver "Risco de Suicídio" no dashboard), mas a % é
  // sobre quem está exposto (exposedTotal), não sobre todos os respondentes:
  // só quem respondeu "Sim" em SM03 vê essas perguntas no formulário.
  const climateDescriptive = exposedTotal > 0
    ? CLIMATE_ENUM_GROUPS.map((group) => {
        const counts = climateEnumCounts.get(group.key) ?? new Map<number, number>()
        const items = group.options
          .map((option) => {
            const count = counts.get(option.value) ?? 0
            return {
              field: String(option.value),
              label: option.label,
              count,
              pct: Math.round((count / exposedTotal) * 1000) / 10,
            }
          })
          .sort((a, b) => b.count - a.count)
        return { key: group.key, title: group.title, items }
      })
    : []

  return NextResponse.json({
    respondents: results.length,
    avg_index: indexCount > 0 ? Math.round((indexSum / indexCount) * 100) / 100 : null,
    class_distribution: toOrderedDistribution(classCounts, CLASSIFICATION_ORDER),
    components,
    distributions,
    suicide: { at_risk: suicideAtRisk, total: results.length },
    descriptive: [...descriptive, ...climateDescriptive],
    tobacco_cigarettes: cigarettesPerDay.toJSON(),
    health_score: healthScore.toJSON(),
    life_quality_score: lifeQualityScore.toJSON(),
  })
}
