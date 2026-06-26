import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getManagerFromSession, isSuperuser } from '@/lib/auth/manager'
import { getMappingScopeContext } from '@/lib/auth/mapping-scope'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

function buildFilters(params: URLSearchParams) {
  const filters: Record<string, string> = {}
  for (const key of ['area', 'role', 'gender', 'race_color', 'employment_type']) {
    const v = params.get(key)
    if (v) filters[key] = v
  }
  return filters
}

function classifyHse(avg: number) {
  if (avg >= 2.5) return 'Alto risco'
  if (avg >= 1.5) return 'Risco moderado'
  return 'Baixo risco'
}

function classifyRemote(avg: number) {
  if (avg >= 4) return 'Condição adequada'
  if (avg >= 3) return 'Zona de atenção'
  return 'Situação de risco'
}

type CollabRow = { id: string; gender: string | null; race_color: string | null; area: string | null; role: string | null; employment_type: string | null }
type ResponseRow = {
  collaborator_id: string
  hse_domains: unknown
  hse_class: string | null
  hse_score: unknown
  remote_domains: unknown
  remote_class: string | null
  remote_score: unknown
}
type DomainStat = { domain: string; avg: number; classification: string }
type GroupStat = { group: string; avgHse: number | null; hseClass: string | null; count: number; avgRemote: number | null; remoteClass: string | null; remoteCount: number }
type CrossAnalysis = Record<string, GroupStat[]>

const MIN_CROSS_GROUP_SIZE = 5
const DIMENSION_LABELS: Record<string, string> = {
  area: 'Área',
  role: 'Cargo',
  gender: 'Gênero',
  race_color: 'Raça/Cor',
  employment_type: 'Vínculo',
}

function accumulateDomains(
  domainsField: unknown,
  accum: Record<string, { sum: number; count: number }>,
) {
  // domains are stored as Array<{ domain, weight, score, weightedScore }>
  if (!Array.isArray(domainsField)) return
  for (const d of domainsField as Array<{ domain: string; score: number }>) {
    if (!d?.domain || typeof d.score !== 'number') continue
    if (!accum[d.domain]) accum[d.domain] = { sum: 0, count: 0 }
    accum[d.domain].sum += d.score
    accum[d.domain].count++
  }
}

function calcHseMetrics(responses: ResponseRow[]) {
  const domainAccum: Record<string, { sum: number; count: number }> = {}
  const classCount: Record<string, number> = {}
  let totalScore = 0
  let count = 0

  for (const r of responses) {
    if (typeof r.hse_score === 'number') { totalScore += r.hse_score; count++ }
    if (r.hse_class) classCount[r.hse_class] = (classCount[r.hse_class] ?? 0) + 1
    accumulateDomains(r.hse_domains, domainAccum)
  }

  const avgScore = count > 0 ? totalScore / count : null
  const domainAvgs: DomainStat[] = Object.entries(domainAccum)
    .map(([domain, { sum, count }]) => ({ domain, avg: Math.round((sum / count) * 100) / 100, classification: classifyHse(sum / count) }))
    .sort((a, b) => b.avg - a.avg)

  return { avgScore, domainAvgs, classCount }
}

function calcRemoteMetrics(responses: ResponseRow[], remoteIds: Set<string>) {
  const domainAccum: Record<string, { sum: number; count: number }> = {}
  const classCount: Record<string, number> = {}
  let totalScore = 0
  let count = 0

  for (const r of responses) {
    if (!remoteIds.has(r.collaborator_id)) continue
    if (typeof r.remote_score === 'number') { totalScore += r.remote_score; count++ }
    if (r.remote_class) classCount[r.remote_class] = (classCount[r.remote_class] ?? 0) + 1
    accumulateDomains(r.remote_domains, domainAccum)
  }

  const avgScore = count > 0 ? totalScore / count : null
  const domainAvgs: DomainStat[] = Object.entries(domainAccum)
    .map(([domain, { sum, count }]) => ({ domain, avg: Math.round((sum / count) * 100) / 100, classification: classifyRemote(sum / count) }))
    .sort((a, b) => a.avg - b.avg)

  return { avgScore, domainAvgs, classCount }
}

function calcDemographics(collabs: CollabRow[]) {
  const genderCount: Record<string, number> = {}
  const raceCount: Record<string, number> = {}
  for (const c of collabs) {
    if (c.gender) genderCount[c.gender] = (genderCount[c.gender] ?? 0) + 1
    if (c.race_color) raceCount[c.race_color] = (raceCount[c.race_color] ?? 0) + 1
  }
  const topGenders = Object.entries(genderCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topRaces = Object.entries(raceCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
  return { topGenders, topRaces }
}

type AccumMap = Record<string, { hseSum: number; hseCount: number; remoteSum: number; remoteCount: number }>

function accumulateGroupScore(
  r: ResponseRow,
  collab: CollabRow,
  dim: 'area' | 'role' | 'gender' | 'race_color' | 'employment_type',
  groupData: AccumMap,
  remoteIds: Set<string>,
) {
  const groupKey = collab[dim] ?? 'Não informado'
  if (!groupData[groupKey]) groupData[groupKey] = { hseSum: 0, hseCount: 0, remoteSum: 0, remoteCount: 0 }
  if (typeof r.hse_score === 'number') {
    groupData[groupKey].hseSum += r.hse_score
    groupData[groupKey].hseCount++
  }
  if (remoteIds.has(r.collaborator_id) && typeof r.remote_score === 'number') {
    groupData[groupKey].remoteSum += r.remote_score
    groupData[groupKey].remoteCount++
  }
}

function buildGroupStats(groupData: AccumMap): GroupStat[] {
  return Object.entries(groupData)
    .filter(([, d]) => d.hseCount >= MIN_CROSS_GROUP_SIZE)
    .map(([group, d]) => {
      const avgHse = d.hseCount > 0 ? Math.round((d.hseSum / d.hseCount) * 100) / 100 : null
      const avgRemote = d.remoteCount > 0 ? Math.round((d.remoteSum / d.remoteCount) * 100) / 100 : null
      return {
        group,
        avgHse,
        hseClass: avgHse === null ? null : classifyHse(avgHse),
        count: d.hseCount,
        avgRemote,
        remoteClass: avgRemote === null ? null : classifyRemote(avgRemote),
        remoteCount: d.remoteCount,
      }
    })
    .sort((a, b) => (b.avgHse ?? 0) - (a.avgHse ?? 0))
}

function calcCrossAnalysis(
  collabs: CollabRow[],
  responses: ResponseRow[],
  remoteIds: Set<string>,
): CrossAnalysis {
  const collabMap = new Map(collabs.map((c) => [c.id, c]))
  const dims: Array<'area' | 'role' | 'gender' | 'race_color' | 'employment_type'> =
    ['area', 'role', 'gender', 'race_color', 'employment_type']
  const result: CrossAnalysis = {}

  for (const dim of dims) {
    const groupData: AccumMap = {}
    for (const r of responses) {
      const collab = collabMap.get(r.collaborator_id)
      if (collab) accumulateGroupScore(r, collab, dim, groupData, remoteIds)
    }
    const groups = buildGroupStats(groupData)
    if (groups.length > 0) result[dim] = groups
  }

  return result
}

function buildPrompt(params: {
  filterDesc: string
  totalCollabs: number
  totalAnswered: number
  responseRate: number
  hseAvgScore: number | null
  hseDomainAvgs: DomainStat[]
  hseClassCount: Record<string, number>
  remoteCount: number
  remoteAvgScore: number | null
  remoteDomainAvgs: DomainStat[]
  remoteClassCount: Record<string, number>
  topGenders: [string, number][]
  topRaces: [string, number][]
  crossAnalysis: CrossAnalysis
}) {
  const {
    filterDesc, totalCollabs, totalAnswered, responseRate,
    hseAvgScore, hseDomainAvgs, hseClassCount,
    remoteCount, remoteAvgScore, remoteDomainAvgs, remoteClassCount,
    topGenders, topRaces, crossAnalysis,
  } = params

  const remoteRate = totalAnswered > 0 ? Math.round((remoteCount / totalAnswered) * 100) : 0

  const hseDomainLines = hseDomainAvgs.length > 0
    ? hseDomainAvgs.map(d => `  - ${d.domain}: média ${d.avg} (${d.classification})`).join('\n')
    : '  - Sem dados'
  const remoteDomainLines = remoteDomainAvgs.length > 0
    ? remoteDomainAvgs.map(d => `  - ${d.domain}: média ${d.avg} (${d.classification})`).join('\n')
    : '  - Sem dados'
  const hseClassLines = Object.entries(hseClassCount).map(([cls, n]) => `  - ${cls}: ${n} respondentes`).join('\n')
  const remoteClassLines = Object.entries(remoteClassCount).length > 0
    ? Object.entries(remoteClassCount).map(([cls, n]) => `  - ${cls}: ${n} respondentes`).join('\n')
    : '  - Sem dados'
  const genderLines = topGenders.map(([g, n]) => `  - ${g}: ${n}`).join('\n')
  const raceLines = topRaces.map(([r, n]) => `  - ${r}: ${n}`).join('\n')
  const hseScoreStr = hseAvgScore === null ? 'Sem dados' : `${hseAvgScore.toFixed(2)} (${classifyHse(hseAvgScore)})`
  const remoteScoreStr = remoteAvgScore === null ? 'Sem dados' : `${remoteAvgScore.toFixed(2)} (${classifyRemote(remoteAvgScore)})`

  const crossLines = Object.entries(crossAnalysis)
    .filter(([, groups]) => groups.length > 0)
    .map(([dim, groups]) => {
      const label = DIMENSION_LABELS[dim] ?? dim
      const top = groups.slice(0, 6)
      const rows = top.map((g) => {
        const hseStr = g.avgHse === null ? 'sem dados' : `HSE ${g.avgHse} (${g.hseClass})`
        const remoteStr = g.avgRemote === null ? '' : ` | IETR ${g.avgRemote} (${g.remoteClass}, N=${g.remoteCount})`
        return `  - ${g.group}: ${hseStr}${remoteStr} — ${g.count} respondentes`
      })
      const extra = groups.length > 6 ? [`  (+ ${groups.length - 6} outros grupos)`] : []
      return [`Por ${label}:`, ...rows, ...extra].join('\n')
    })
    .join('\n\n')

  const areaGroups = crossAnalysis['area'] ?? []
  const areaLines = areaGroups.length > 0
    ? areaGroups.map((g) => {
        const hseStr = g.avgHse === null ? 'sem dados' : `HSE ${g.avgHse.toFixed(2)} (${g.hseClass})`
        const remoteStr = g.avgRemote === null ? '' : ` | IETR ${g.avgRemote.toFixed(2)} (${g.remoteClass}, N=${g.remoteCount})`
        return `  - ${g.group}: ${hseStr}${remoteStr} — ${g.count} respondentes`
      }).join('\n')
    : '  - Dados insuficientes (nenhuma área com ≥5 respondentes)'

  return `Você é um especialista em saúde e segurança psicossocial no trabalho. Analise os dados do mapeamento de saúde e bem-estar dos colaboradores e gere insights práticos em português brasileiro.

IMPORTANTE: Neste sistema há dois módulos de avaliação distintos:
- Módulo HSE (Health, Safety & Environment): avalia riscos psicossociais no trabalho. Escala 0–4, onde valores ALTOS = maior risco.
- Módulo IETR (Instrumento de Avaliação do Trabalho Remoto): avalia condições do home office. Escala 1–5, onde valores BAIXOS = maior risco.
Cada módulo possui domínios internos (ex: Demandas, Controle, Relacionamentos no HSE; Autonomia, Vínculos no IETR).

## Contexto
${filterDesc}
- Total de colaboradores: ${totalCollabs}
- Respondentes do módulo HSE: ${totalAnswered} (${responseRate}% do total)
- Respondentes do módulo IETR: ${remoteCount} de ${totalAnswered} (${remoteRate}% dos respondentes HSE)

## Módulo HSE — Saúde e Segurança no Trabalho
Escala 0–4: valores ALTOS = maior risco psicossocial
Classificação: ≥2.5 = Alto risco | ≥1.5 = Risco moderado | <1.5 = Baixo risco
Score médio geral HSE: ${hseScoreStr}

Distribuição por classificação:
${hseClassLines || '  - Sem dados'}

Scores médios por domínio do módulo HSE (ordem decrescente de risco):
${hseDomainLines}

## Módulo IETR — Trabalho Remoto
Escala 1–5: valores BAIXOS = maior risco / piores condições
Classificação: ≥4.0 = Condição adequada | ≥3.0 = Zona de atenção | <3.0 = Situação de risco
Score médio geral IETR: ${remoteScoreStr}
Contexto: ${remoteCount} de ${totalAnswered} respondentes HSE responderam o módulo IETR (${remoteRate}%). A análise é proporcional a esse grupo.

Distribuição por classificação:
${remoteClassLines}

Scores médios por domínio do módulo IETR (ordem crescente — menores = pior):
${remoteDomainLines}

## Perfil Demográfico
Gênero:
${genderLines || '  - Sem dados'}
Raça/Cor:
${raceLines || '  - Sem dados'}

## Cruzamento Demográfico — Score HSE médio por grupo (grupos com ≥5 respondentes, ordem decrescente de risco)
${crossLines || '  - Dados insuficientes para cruzamento demográfico'}

## Riscos por Área (ISO 45003 — todos os grupos com ≥5 respondentes, ordem decrescente de risco HSE)
${areaLines}

## Instruções para a resposta
1. Seja direto e objetivo. Use parágrafos curtos.
2. Estruture a resposta exatamente nas seguintes seções com títulos em negrito:
   **Visão Geral**
   **Pontos de Atenção Prioritários**
   **Trabalho Remoto** (inclua apenas se remoteCount > 0)
   **Disparidades por Grupo** (inclua apenas se houver variações relevantes entre grupos — destaque os grupos de maior e menor risco e possíveis disparidades por gênero, raça/cor, área ou cargo)
   **Recomendações Práticas** (mínimo 3 ações concretas numeradas; considere os grupos em situação mais crítica)
   **Plano de Ação ISO 45003** (com base nos dados de risco por área, elabore prioridades de intervenção para as áreas de maior risco — cite nível de prioridade, principais fatores de risco identificados para cada área e intervenções práticas alinhadas à ISO 45003: controles organizacionais, participação dos trabalhadores, suporte à liderança e acompanhamento contínuo; use subseções ou lista por área; inclua apenas áreas com ≥5 respondentes)
3. Refira-se a Demandas, Controle, Relacionamentos etc. como domínios dentro dos módulos HSE e IETR.
4. Destaque nomes de domínios críticos, grupos de risco elevado e áreas prioritárias em negrito.
5. Quando mencionar o módulo IETR, contextualize que representa ${remoteRate}% dos respondentes HSE.
6. Use linguagem clara para gestores de RH, sem jargões excessivos.
7. Limite a resposta a aproximadamente 900 palavras.`
}

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)
  if (!manager) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!isSuperuser(manager.role)) return NextResponse.json({ error: 'Apenas superuser pode gerar insights.' }, { status: 403 })

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return NextResponse.json({ error: 'GOOGLE_GENERATIVE_AI_API_KEY não configurada.' }, { status: 500 })
  }

  const supabase = createServerClient()
  const mappingScope = await getMappingScopeContext(request, { requireMappingScope: true })
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  const filters = buildFilters(request.nextUrl.searchParams)

  let collabQuery = supabase
    .from('collaborators')
    .select('id, area, role, gender, race_color, employment_type')
    .eq('mapping_id', mappingScope.mappingId)
  for (const [k, v] of Object.entries(filters)) {
    collabQuery = collabQuery.eq(k, v)
  }
  const { data: collabs, error: collabErr } = await collabQuery
  if (collabErr) return NextResponse.json({ error: collabErr.message }, { status: 500 })

  const allIds = (collabs ?? []).map((c) => c.id)
  if (allIds.length === 0) {
    return NextResponse.json({ error: 'Nenhum colaborador encontrado para os filtros selecionados.' }, { status: 404 })
  }

  // has_answered is on collaborators, not responses — filter collaborator IDs first
  const { data: answeredCollabs, error: answeredErr } = await supabase
    .from('collaborators')
    .select('id')
    .eq('mapping_id', mappingScope.mappingId)
    .in('id', allIds)
    .eq('has_answered', true)
  if (answeredErr) return NextResponse.json({ error: answeredErr.message }, { status: 500 })

  const answeredIds = (answeredCollabs ?? []).map((c) => c.id)

  const { data: responses, error: respErr } = await supabase
    .from('responses')
    .select('collaborator_id, hse_domains, hse_class, hse_score, remote_domains, remote_class, remote_score')
    .in('collaborator_id', answeredIds)
  if (respErr) return NextResponse.json({ error: respErr.message }, { status: 500 })

  const totalCollabs = allIds.length
  const totalAnswered = answeredIds.length
  const responseRate = Math.round((totalAnswered / totalCollabs) * 100)

  // Remote workers = respondents who have remote_score data (IETR is only shown to remote workers)
  const remoteIds = new Set(
    (responses ?? [])
      .filter((r) => r.remote_score !== null && r.remote_score !== undefined)
      .map((r) => r.collaborator_id)
  )

  const hse = calcHseMetrics(responses ?? [])
  const remote = calcRemoteMetrics(responses ?? [], remoteIds)
  const { topGenders, topRaces } = calcDemographics(collabs ?? [])
  const crossAnalysis = calcCrossAnalysis(collabs ?? [], responses ?? [], remoteIds)

  const filterPairs = Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(', ')
  const filterDesc = Object.keys(filters).length > 0 ? `Filtros ativos: ${filterPairs}` : 'Sem filtros ativos (toda a organização)'

  const prompt = buildPrompt({
    filterDesc, totalCollabs, totalAnswered, responseRate,
    hseAvgScore: hse.avgScore,
    hseDomainAvgs: hse.domainAvgs,
    hseClassCount: hse.classCount,
    remoteCount: remoteIds.size,
    remoteAvgScore: remote.avgScore,
    remoteDomainAvgs: remote.domainAvgs,
    remoteClassCount: remote.classCount,
    topGenders, topRaces, crossAnalysis,
  })

  const { text } = await generateText({ model: google('gemini-2.5-flash-lite'), prompt })

  return NextResponse.json({
    insights: text,
    generated_at: new Date().toISOString(),
    meta: { total_collaborators: totalCollabs, total_answered: totalAnswered, response_rate: responseRate, filters },
  })
}
