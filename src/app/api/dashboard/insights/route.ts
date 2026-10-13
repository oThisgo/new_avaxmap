import { NextRequest, NextResponse } from 'next/server'
import { generateText, jsonSchema, Output } from 'ai'
import { google } from '@ai-sdk/google'
import { db } from '@/lib/db/pool'
import { getManagerFromSession, isMappingSuperuser } from '@/lib/auth/manager'
import { getMappingScopeContext, getMappingManagerRole } from '@/lib/auth/mapping-scope'
import { normalizeMappingConfig } from '@/lib/mapping/config'
import {
  parseCollaboratorFilters,
  applyCollaboratorFilters,
  getCollaboratorFieldValue,
  type CollaboratorFieldSource,
} from '@/lib/mapping/collaborator-fields'
import type { HighlightResponseRow } from '@/lib/analytics/mapping-highlights'
import { buildInsightsEvidence, type InsightsEvidence } from '@/lib/analytics/insights-evidence'
import { INSIGHTS_JSON_SCHEMA, type InsightsAnalysis, type InsightsPayload } from '@/lib/analytics/insights-schema'

/**
 * Flash (não lite): a análise estruturada com correlações pede mais raciocínio.
 * A família 2.5 não está mais disponível para chaves novas — sobrescreva via
 * INSIGHTS_MODEL se precisar fixar outra versão.
 */
const INSIGHTS_MODEL = process.env.INSIGHTS_MODEL || 'gemini-3.8-flash'

const MODULE_DESCRIPTIONS: Record<string, string> = {
  hse: 'HSE (riscos psicossociais no trabalho) — escala 0–4, MAIOR = PIOR. ≥2,5 Alto risco · ≥1,5 Risco moderado · <1,5 Baixo risco. Domínios: Demandas, Controle, Apoio da Liderança, Apoio dos Colegas, Relacionamentos, Cargo, Comunicação e Mudanças.',
  ietr: 'IETR (trabalho remoto/digital) — escala 1–5, MAIOR = MELHOR. ≥4 Condição adequada · ≥3 Zona de atenção · <3 Situação de risco. Respondido apenas por quem trabalha remotamente.',
  saude_mental: 'Saúde Mental — Índice 0–10, MAIOR = MELHOR (≥9 Excelente · ≥7 Bom · ≥5 Regular · <5 Insatisfatório). Componentes: estresse, sintomas depressivos, tabaco, álcool, dependência de internet, rede de apoio, percepção de saúde, qualidade de vida. Qualquer indicador de risco de suicídio divide o índice por 2.',
  sociodemografico: 'Sociodemográfico — perfil dos respondentes (sem nota).',
}

function fmt(v: number | null | undefined, d = 2) {
  return v === null || v === undefined ? 'sem dados' : v.toFixed(d).replace('.', ',')
}

function buildPrompt(e: InsightsEvidence, filterDesc: string): string {
  const h = e.highlights
  const lines: string[] = []

  lines.push(`## Escopo\n${filterDesc}\nColaboradores: ${e.scope.total_collaborators} · Respondentes: ${e.scope.total_answered} · Adesão: ${fmt(e.scope.response_rate, 1)}%`)
  lines.push(`Módulos ativos:\n${e.scope.modules.map((m) => `- ${MODULE_DESCRIPTIONS[m] ?? m}`).join('\n')}`)

  if (h.responses_by_day.length > 0) {
    const peak = h.responses_by_day.reduce((a, b) => (b.count > a.count ? b : a))
    lines.push(`## Coleta\nPeríodo: ${h.first_response_at?.slice(0, 10)} a ${h.last_response_at?.slice(0, 10)} · ${h.responses_by_day.length} dias com respostas · pico em ${peak.date} (${peak.count} respostas).`)
  }

  if (h.hse) {
    lines.push([
      `## HSE`,
      `Média geral: ${fmt(h.hse.avg_score)} (${h.hse.classification}) · alto risco: ${h.hse.high_risk} de ${h.hse.respondents}`,
      `Distribuição: ${h.hse.class_distribution.map((c) => `${c.name} ${c.value}`).join(', ')}`,
      `Domínios (do pior ao melhor): ${h.hse.domains.map((d) => `${d.name} ${fmt(d.avg_score)} (${d.classification})`).join('; ')}`,
      `Questões mais críticas: ${h.hse.critical_questions.map((q) => `[${q.code} · ${q.domain}] "${q.text}" média ${fmt(q.avg_score)}, ${fmt(q.high_risk_pct, 0)}% em alto risco`).join('; ')}`,
    ].join('\n'))
  }

  if (h.remote && h.remote.respondents > 0) {
    lines.push([
      `## IETR (trabalho remoto)`,
      `Respondentes: ${h.remote.respondents} (${fmt((h.remote.respondents / Math.max(1, e.scope.total_answered)) * 100, 0)}% dos respondentes) · média ${fmt(h.remote.avg_score)} (${h.remote.classification})`,
      `Distribuição: ${h.remote.class_distribution.map((c) => `${c.name} ${c.value}`).join(', ')}`,
      `Domínios (do pior ao melhor): ${e.remote_domains.map((d) => `${d.name} ${fmt(d.avg_score)}`).join('; ')}`,
    ].join('\n'))
  }

  if (h.mental_health && e.mental_health_detail) {
    const mh = h.mental_health
    const d = e.mental_health_detail
    const p = (n: number) => `${fmt((n / Math.max(1, mh.respondents)) * 100, 1)}%`
    lines.push([
      `## Saúde Mental`,
      `Índice médio: ${fmt(mh.avg_index)} (${mh.classification}) · distribuição: ${mh.class_distribution.map((c) => `${c.name} ${c.value}`).join(', ')}`,
      `Indicadores de risco de suicídio: ${mh.suicide_at_risk} pessoas (${fmt(mh.suicide_pct, 1)}%) — tema sensível: recomende acolhimento e protocolo, nunca exposição.`,
      `Estresse grave: ${p(mh.severe_stress)} · sintomas depressivos moderados/graves: ${p(mh.depressive_moderate_severe)} · sem rede de apoio: ${p(mh.no_support)} · álcool em padrão binge: ${p(mh.binge)}`,
      `Percepção de saúde média: ${fmt(mh.avg_health_score, 1)}/10 · qualidade de vida média: ${fmt(mh.avg_life_quality, 1)}/10`,
      `Componentes (nota média 0–10, do pior ao melhor): ${d.components.map((c) => `${c.label} ${fmt(c.avg_score, 1)}`).join('; ')}`,
      `Sintomas de estresse mais citados: ${d.stress_symptoms.map((i) => `${i.label} ${fmt(i.pct, 0)}%`).join('; ')}`,
      `Fontes de estresse mais citadas: ${d.stress_sources.map((i) => `${i.label} ${fmt(i.pct, 0)}%`).join('; ')}`,
      `Sintomas depressivos mais citados: ${d.depression_symptoms.map((i) => `${i.label} ${fmt(i.pct, 0)}%`).join('; ')}`,
      `Rede de apoio: ${d.support_sources.map((i) => `${i.label} ${fmt(i.pct, 0)}%`).join('; ')}`,
      d.substances.length > 0 ? `Substâncias/medicações (30 dias): ${d.substances.map((i) => `${i.label} ${fmt(i.pct, 0)}%`).join('; ')}` : '',
      d.disaster_exposed_pct !== null ? `Exposição a desastre natural/ambiental: ${fmt(d.disaster_exposed_pct, 0)}%` : '',
    ].filter(Boolean).join('\n'))
  }

  if (h.segments.length > 0) {
    lines.push(`## Segmentos (grupos com ≥5 pessoas; índices só com ≥5 respostas)\n${h.segments.map((s) =>
      `${s.label}:\n${s.groups.map((g) => `  - ${g.name}: adesão ${fmt(g.pct, 0)}% (${g.answered}/${g.total})${g.hse_avg !== null ? ` · HSE ${fmt(g.hse_avg)} (${g.hse_class})` : ''}${g.mh_avg !== null ? ` · Saúde Mental ${fmt(g.mh_avg, 1)}` : ''}`).join('\n')}`,
    ).join('\n')}`)
  }

  if (e.correlations.length > 0) {
    lines.push(`## Correlações de Pearson calculadas (por respondente)\n${e.correlations.map((c) =>
      `- id="${c.id}": ${c.x} × ${c.y} → r=${fmt(c.r)} (${c.strength}, n=${c.n}). ${c.reading}`).join('\n')}`)
  }

  if (e.comparisons.length > 0) {
    lines.push(`## Comparações entre grupos\n${e.comparisons.map((c) =>
      `- id="${c.id}": ${c.metric} (${c.scale}) — ${c.a.label}: ${fmt(c.a.mean)} (n=${c.a.n}) vs ${c.b.label}: ${fmt(c.b.mean)} (n=${c.b.n}); diferença ${fmt(c.diff)}`).join('\n')}`)
  }

  return `Você é a Lumen AI, analista sênior de saúde mental e riscos psicossociais no trabalho (NR-1, ISO 45003). Analise o mapeamento abaixo e produza um relatório estruturado em português do Brasil, para gestores de RH e liderança.

Regras:
1. Use SOMENTE os números fornecidos. Não invente estatísticas, grupos nem correlações. Cite números no formato brasileiro (vírgula decimal).
2. Atenção ao sentido das escalas: no HSE maior = pior; no IETR e na Saúde Mental maior = melhor.
3. Correlação não é causalidade: use "está associado a", "tende a". Ignore correlações desprezíveis (|r| < 0,1) e não dê peso a fracas sem ressalva.
4. Em correlation_insights, use exatamente os ids fornecidos (de correlações ou comparações). Priorize as 4 a 6 mais relevantes.
5. Faça análises cruzadas entre módulos (ex.: como riscos psicossociais se relacionam com saúde mental, trabalho remoto, rede de apoio, fontes de estresse).
6. Nunca sugira identificar indivíduos. Sobre risco de suicídio, recomende acolhimento, canal de apoio psicológico e protocolo — com linguagem cuidadosa.
7. module_analyses: inclua apenas módulos ativos (${e.scope.modules.filter((m) => m !== 'sociodemografico').join(', ') || 'nenhum'}) e "adesao".
8. Seja específico e acionável; evite generalidades. Tom profissional, direto, sem jargão excessivo.

${lines.join('\n\n')}`
}

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)
  if (!manager) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return NextResponse.json({ error: 'GOOGLE_GENERATIVE_AI_API_KEY não configurada.' }, { status: 500 })
  }

  const mappingScope = await getMappingScopeContext(request, { requireMappingScope: true })
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  const mappingRole = await getMappingManagerRole(manager.id, mappingScope.mappingId as string)
  if (!isMappingSuperuser(manager.role, mappingRole)) {
    return NextResponse.json({ error: 'Apenas superuser pode gerar insights.' }, { status: 403 })
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
    .select([
      'id', 'area', 'role', 'employment_type', 'gender', 'race_color', 'birth_date', 'has_answered',
      'education_level', 'marital_status', 'disability', 'which_disability', 'extra_fields',
    ])
    .where('mapping_id', '=', mappingScope.mappingId)
  collabQuery = applyCollaboratorFilters(collabQuery, filters)

  let collabs
  try {
    collabs = await collabQuery.execute()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao buscar colaboradores.' }, { status: 500 })
  }

  if (collabs.length === 0) {
    return NextResponse.json({ error: 'Nenhum colaborador encontrado para os filtros selecionados.' }, { status: 404 })
  }

  let responses
  try {
    responses = await db
      .selectFrom('responses')
      .select([
        'collaborator_id', 'submitted_at', 'hse_score', 'hse_class', 'hse_domains', 'answers',
        'remote_score', 'remote_class', 'remote_domains', 'mental_health_answers', 'mental_health_derived',
      ])
      .where('collaborator_id', 'in', collabs.map((c) => c.id))
      .execute()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao buscar respostas.' }, { status: 500 })
  }

  if (responses.length === 0) {
    return NextResponse.json({ error: 'Ainda não há respostas suficientes para gerar insights neste recorte.' }, { status: 422 })
  }

  const collabById = new Map(collabs.map((c) => [c.id, c as unknown as CollaboratorFieldSource]))
  const evidence = buildInsightsEvidence({
    collaborators: collabs.map((c) => ({ id: c.id, has_answered: c.has_answered, gender: c.gender })),
    responses: responses as unknown as HighlightResponseRow[],
    modules: mappingConfig.modules,
    filters,
    hseQuestionTextOverrides: mappingConfig.hse_question_text_overrides,
    segments: mappingConfig.dashboard_filters.map((key) => ({
      key,
      label: mappingConfig.field_labels[key] ?? key,
      valueOf: (id: string) => {
        const row = collabById.get(id)
        return row ? getCollaboratorFieldValue(row, key) : null
      },
    })),
  })

  const filterPairs = Object.entries(filters).map(([k, v]) => `${mappingConfig.field_labels[k] ?? k} = ${v}`)
  const filterDesc = filterPairs.length > 0 ? `Recorte filtrado: ${filterPairs.join(', ')}` : 'Sem filtros (toda a organização mapeada)'

  let analysis: InsightsAnalysis
  try {
    const { output } = await generateText({
      model: google(INSIGHTS_MODEL),
      output: Output.object({ schema: jsonSchema<InsightsAnalysis>(INSIGHTS_JSON_SCHEMA as never) }),
      prompt: buildPrompt(evidence, filterDesc),
    })
    analysis = output
  } catch (err) {
    console.error('[insights] falha ao gerar análise', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'A IA não conseguiu concluir a análise agora. Tente novamente em instantes.' }, { status: 502 })
  }

  const payload: InsightsPayload = {
    version: 2,
    generated_at: new Date().toISOString(),
    model: INSIGHTS_MODEL,
    evidence: {
      ...evidence,
      scope: { ...evidence.scope, filters: Object.fromEntries(Object.entries(filters).map(([k, v]) => [mappingConfig.field_labels[k] ?? k, v])) },
    },
    analysis,
  }

  return NextResponse.json(payload)
}
