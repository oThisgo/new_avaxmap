import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireMappingAccess } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import { parseCollaboratorFilters, applyCollaboratorFilters } from '@/lib/mapping/collaborator-fields'
import {
  DEPRESSION_SYMPTOM_OPTIONS,
  LIFE_EVENT_OPTIONS,
  LIFE_EVENT_OTHER_FIELD,
  STRESS_SOURCE_OPTIONS,
  STRESS_SYMPTOM_OPTIONS,
  SUBSTANCE_USED_OPTIONS,
  SUICIDE_SYMPTOM_OPTIONS,
  SUPPORT_OTHER_FIELD,
  SUPPORT_SOURCE_OPTIONS,
  type CheckboxOption,
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
]

/** Blocos categóricos que viram distribuição no dashboard, na ordem das faixas. */
const DISTRIBUTION_ORDER: Record<string, readonly string[]> = {
  estresse: ['Ausência de Sintomas', 'Sintomas Leves', 'Sintomas Moderados', 'Sintomas Graves'],
  sintomas_depressivos: ['Ausência de Sintomas', 'Sintomas Leves', 'Sintomas Moderados', 'Sintomas Graves'],
  internet: ['Ausente', 'Leve', 'Moderada', 'Alta', 'Não Informado'],
  rede_de_apoio: ['Sim', 'Não', 'Não Informado'],
  tabaco: ['Não fumante', 'Ex-fumante', 'Fumante passivo', 'Fumante', 'Não Informado'],
  alcool: ['Não Bebe', 'Consumo Moderado', 'Padrão Binge', 'Não Informado'],
}

const DISTRIBUTION_TITLES: Record<string, string> = {
  estresse: 'Nível de estresse',
  sintomas_depressivos: 'Nível de sintomas depressivos',
  internet: 'Dependência de internet',
  rede_de_apoio: 'Possui rede de apoio',
  tabaco: 'Uso de tabaco',
  alcool: 'Uso de álcool',
}

const CLASSIFICATION_ORDER = ['Excelente', 'Bom', 'Regular', 'Insatisfatório', 'Sem dados'] as const

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
  const filters = parseCollaboratorFilters(request.nextUrl.searchParams, mappingConfig.dashboard_filters)

  let collabQuery = supabase
    .from('collaborators')
    .select('id, gender')
    .eq('mapping_id', mappingScope.mappingId)
  collabQuery = applyCollaboratorFilters(collabQuery, filters)
  const { data: collabs, error: collabErr } = await collabQuery
  if (collabErr) return NextResponse.json({ error: collabErr.message }, { status: 500 })

  const genderById = new Map((collabs ?? []).map((c) => [c.id as string, (c as { gender?: string | null }).gender ?? null]))
  const collaboratorIds = [...genderById.keys()]

  const empty = {
    respondents: 0,
    avg_index: null,
    class_distribution: [],
    components: [],
    distributions: [],
    suicide: { at_risk: 0, total: 0 },
    descriptive: [],
  }
  if (collaboratorIds.length === 0) return NextResponse.json(empty)

  const { data: responses, error } = await supabase
    .from('responses')
    .select('collaborator_id, mental_health_answers, mental_health_derived')
    .in('collaborator_id', collaboratorIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: MentalHealthResult[] = []
  for (const row of (responses ?? []) as ResponseRow[]) {
    if (row.mental_health_derived) {
      results.push(row.mental_health_derived)
      continue
    }
    if (!row.mental_health_answers) continue
    results.push(
      calculateMentalHealth(normalizeMentalHealthAnswers(row.mental_health_answers), {
        gender: genderById.get(row.collaborator_id) ?? null,
      }),
    )
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

  for (const result of results) {
    if (typeof result.index === 'number') {
      indexSum += result.index
      indexCount++
    }
    classCounts.set(result.classification, (classCounts.get(result.classification) ?? 0) + 1)
    if (result.suicide?.atRisk) suicideAtRisk++

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

  return NextResponse.json({
    respondents: results.length,
    avg_index: indexCount > 0 ? Math.round((indexSum / indexCount) * 100) / 100 : null,
    class_distribution: toOrderedDistribution(classCounts, CLASSIFICATION_ORDER),
    components,
    distributions,
    suicide: { at_risk: suicideAtRisk, total: results.length },
    descriptive,
  })
}
