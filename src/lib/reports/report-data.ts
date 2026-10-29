import { db } from '@/lib/db/pool'
import { normalizeMappingConfig, type NormalizedMappingConfig } from '@/lib/mapping/config'
import { getCollaboratorFieldValue, type CollaboratorFieldSource } from '@/lib/mapping/collaborator-fields'
import { normalizeLogoUrl } from '@/lib/mapping/logo'
import { HSE_QUESTIONS } from '@/lib/analytics/hse-definition'
import { IETR_QUESTIONS } from '@/lib/analytics/ietr-definition'
import {
  DEPRESSION_SYMPTOM_OPTIONS,
  STRESS_SOURCE_OPTIONS,
  STRESS_SYMPTOM_OPTIONS,
  type CheckboxOption,
} from '@/lib/analytics/mental-health-definition'
import {
  calculateMentalHealth,
  normalizeMentalHealthAnswers,
  type MentalHealthAnswers,
  type MentalHealthResult,
} from '@/lib/analytics/mental-health'
import {
  CLIMATE_DISASTER_COLUMNS,
  HSE_RISK_PROTOCOL,
  REPORT_SECTION_ORDER,
  type AssociativeCorrelationRow,
  type AssociativeOm4Insight,
  type AssociativeOm4MentalNotesRow,
  type AssociativePriorityAction,
  type ClimateDisasterStratifiedSlice,
  type ClimateDisasterTypeKey,
  type GenderByStratumStratifiedSlice,
  type HseStratifiedSlice,
  type IetrStratifiedSlice,
  type IetrStratumRow,
  type ParticipationStratifiedSlice,
  type ReportPayload,
  type ReportSectionKey,
  type StratumRow,
  type WellbeingPerceptionStratumRow,
  type WellbeingRecurringItem,
  type WellbeingStratifiedSlice,
  type WellbeingStratumRow,
} from './risk-pptx'

/**
 * Construtor do payload do relatório PPTX a partir de um mapeamento do AvaxMap.
 *
 * Porta a lógica de agregação dos relatórios da plataforma-alana (Instituto Alana para HSE e
 * IETR; YARA/CMPC para Saúde Mental e o Modelo Associativo Dinâmico) para o banco do AvaxMap,
 * com estratos, filtros e categorias definidos por quem gera o relatório — em vez de colunas
 * fixas por cliente. Classificações espelham o dashboard para que os números batam.
 */

export class ReportBuildError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ReportBuildError'
  }
}

/* ─── Opções do relatório ─────────────────────────────────────────────────── */

export interface ReportOptions {
  clientName: string
  clientDescription?: string
  /** Data URI. `undefined` usa a logo do mapeamento; `null` remove a logo da capa. */
  clientLogoBase64?: string | null
  coverImageBase64?: string | null
  /** Recorte da base: só entram colaboradores cujo valor está entre os selecionados, por campo. */
  filters?: Record<string, string[]>
  /** Estratos da análise estratificada, na ordem desejada. O primeiro é o estrato principal. */
  strata?: string[]
  /** Categorias omitidas por estrato (ex.: { 'custom:funcao': ['Diretoria'] }). */
  excludedCategories?: Record<string, string[]>
  /** Quando true, quem pertence a uma categoria omitida também sai da base (totais e índices). */
  excludeOmittedFromBase?: boolean
  sections?: ReportSectionKey[]
  /** Tamanho mínimo de grupo para exibir índices de um estrato (anonimato). */
  minGroupSize?: number
  /** Nota de Controle (C, 0–100) por domínio HSE para a Matriz de Risco Ocupacional. */
  riskControlByDomain?: Record<string, number>
}

export const MIN_GROUP_SIZE_FLOOR = 5
const MIN_GROUP_SIZE_CEIL = 30
const ASSOCIATIVE_MIN_SAMPLE = 12
const ASSOCIATIVE_MIN_GROUP_SAMPLE = 8
const NOT_INFORMED = 'Não informado'

/* ─── Metadados ───────────────────────────────────────────────────────────── */

const HSE_DOMAIN_ORDER = [
  'Demandas', 'Controle', 'Apoio da Liderança', 'Apoio dos Colegas',
  'Relacionamentos', 'Cargo', 'Comunicação e Mudanças',
]

const IETR_DOMAIN_ORDER = IETR_QUESTIONS
  .map((q) => q.domain)
  .filter((d, i, arr) => arr.indexOf(d) === i)

/**
 * Rótulos curtos dos itens do HSE — viram o segundo nível ("item") da análise associativa,
 * no lugar dos subdomínios do protocolo IRP. Curtos para caber nos gráficos e tabelas.
 */
const HSE_ITEM_SHORT_LABELS: Record<string, string> = {
  Q01: 'Clareza de expectativas', Q02: 'Decidir as pausas', Q03: 'Exigências conflitantes',
  Q04: 'Saber fazer o trabalho', Q05: 'Tratamento ríspido', Q06: 'Prazos difíceis',
  Q07: 'Ajuda dos colegas', Q08: 'Informação e suporte', Q09: 'Ritmo intenso',
  Q10: 'Opinião sobre o ritmo', Q11: 'Clareza de tarefas', Q12: 'Tarefas não feitas por excesso',
  Q13: 'Clareza de metas', Q14: 'Conflitos entre colegas', Q15: 'Liberdade de método',
  Q16: 'Pausas insuficientes', Q17: 'Contribuição para a empresa', Q18: 'Pressão fora do horário',
  Q19: 'Liberdade de decisão', Q20: 'Trabalho com muita rapidez', Q21: 'Sensação de perseguição',
  Q22: 'Impossibilidade de pausas', Q23: 'Confiança na liderança', Q24: 'Apoio de colegas',
  Q25: 'Sugestões consideradas', Q26: 'Explicações sobre mudanças', Q27: 'Respeito dos colegas',
  Q28: 'Consulta sobre mudanças', Q29: 'Diálogo com a liderança', Q30: 'Horário flexível',
  Q31: 'Escuta dos colegas', Q32: 'Dedicação nas mudanças', Q33: 'Trabalho emocionalmente exigente',
  Q34: 'Relações tensas', Q35: 'Incentivo da liderança',
}

const HSE_DOMAIN_ACTIONS: Record<string, string> = {
  'Demandas': 'Revisar carga de trabalho, prazos e dimensionamento das equipes mais pressionadas.',
  'Controle': 'Ampliar a margem de decisão sobre ritmo, pausas e forma de execução das tarefas.',
  'Apoio da Liderança': 'Desenvolver lideranças em escuta ativa, feedback e suporte psicossocial.',
  'Apoio dos Colegas': 'Criar rotinas de apoio entre pares e pactos de colaboração nas equipes.',
  'Relacionamentos': 'Fortalecer prevenção de assédio, canal de denúncia e mediação de conflitos.',
  'Cargo': 'Clarificar papéis, metas e responsabilidades, com critérios explícitos de prioridade.',
  'Comunicação e Mudanças': 'Formalizar a comunicação de mudanças com consulta prévia e retorno às equipes.',
}

const HSE_DOMAIN_MEANING: Record<string, string> = {
  'Demandas': 'sinaliza sobrecarga, pressão de prazos e ritmo difícil de sustentar.',
  'Controle': 'aponta baixa autonomia sobre ritmo, pausas e forma de trabalhar.',
  'Apoio da Liderança': 'indica fragilidade de suporte, escuta e confiança na chefia.',
  'Apoio dos Colegas': 'mostra pouca ajuda prática e emocional entre pares.',
  'Relacionamentos': 'reflete tensão relacional, conflitos e situações de desrespeito.',
  'Cargo': 'evidencia pouca clareza de papéis, metas e contribuição.',
  'Comunicação e Mudanças': 'indica ruído na comunicação e baixa participação nas mudanças.',
}

/** Rótulos curtos (slides) das opções de estresse/depressão — o rótulo completo não cabe. */
const SHORT_STRESS_SOURCE: Record<string, string> = {
  stress_source_work: 'Trabalho', stress_source_study: 'Estudos', stress_source_money: 'Dinheiro',
  stress_source_relationships: 'Relacionamentos', stress_source_health: 'Saúde',
  stress_source_technology: 'Tecnologia', stress_source_violence: 'Violência urbana',
  stress_source_discrimination: 'Discriminação', stress_source_politics: 'Clima político',
  stress_source_covid: 'Pandemias / clima',
}
const SHORT_STRESS_SYMPTOM: Record<string, string> = {
  stress_lack_control: 'Falta de controle', stress_tiredness: 'Cansaço excessivo',
  stress_difficulty_relax: 'Dificuldade para relaxar', stress_accumulation_problems: 'Sensação de acúmulo de problemas',
  stress_procrastination: 'Procrastinação', stress_irritation: 'Irritação',
  stress_feeling_low_capacity: 'Pouca capacidade para lidar com problemas', stress_insomnia: 'Insônia',
  stress_impairment_decision_making: 'Dificuldade para tomar decisões',
}
const SHORT_DEPRESSION_SYMPTOM: Record<string, string> = {
  depression_symptoms_sadness: 'Tristeza', depression_symptoms_discouragement: 'Desânimo ou desmotivação',
  depression_symptoms_loss_of_interest: 'Perda de interesse ou prazer', depression_symptoms_irritability: 'Irritabilidade',
  depression_symptoms_worthless: 'Sem valor ou desvalorizado(a)', depression_symptoms_useless: 'Sentiu-se inútil',
  depression_symptoms_alone: 'Sentiu-se abandonado(a) ou sozinho(a)', depression_symptoms_guilty: 'Sentiu-se culpado(a)',
  depression_symptoms_other: 'Outros',
}

const DISASTER_TYPE_LABELS: Record<number, string> = {
  1: 'Enchentes', 2: 'Deslizamentos', 3: 'Furacões', 4: 'Seca', 5: 'Blecautes',
  6: 'Incêndios Florestais', 7: 'Terremotos', 8: 'Tsunami', 9: 'Rompimento de Barragem', 10: 'Derramamento Químico',
}
const DISASTER_TYPE_KEYS: Record<number, ClimateDisasterTypeKey> = {
  1: 'flood', 2: 'landslide', 3: 'hurricane', 4: 'drought', 5: 'blackout',
  6: 'wildfire', 7: 'earthquake', 8: 'tsunami', 9: 'damBreak', 10: 'chemicalSpill',
}
const DISASTER_CONTACT_LABELS: Record<number, string> = {
  1: 'Risco de vida ou casa diretamente impactada',
  2: 'Pessoas próximas impactadas, mas em segurança',
  3: 'Deslocamento para o trabalho impactado, mas em segurança',
  4: 'Cidade impactada, sem problemas na rotina',
}
const DISASTER_INTENSITY_LABELS = ['Nada', 'Pouco', 'Moderadamente', 'Muito', 'Extremamente']

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const round2 = (v: number) => Math.round(v * 100) / 100
const pct1 = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0)
/** Sem arredondar — F da Matriz de Risco precisa de precisão total (ver risk-pptx.ts). */
const pctRaw = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0)
const trunc2 = (v: number) => Math.trunc(v * 100) / 100

function avgOf(values: number[]): number | null {
  if (values.length === 0) return null
  return round2(values.reduce((s, v) => s + v, 0) / values.length)
}

function countBy<T>(items: T[], key: (item: T) => string): { name: string; value: number }[] {
  const map = new Map<string, number>()
  for (const item of items) {
    const k = key(item) || NOT_INFORMED
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

function orderedDist(items: string[], order: string[]): { name: string; value: number }[] {
  return order.map((name) => ({ name, value: items.filter((i) => i === name).length }))
}

function rankWithTies(values: number[]): number[] {
  const indexed = values.map((value, idx) => ({ value, idx })).sort((a, b) => a.value - b.value)
  const ranks = new Array<number>(values.length).fill(0)
  let i = 0
  while (i < indexed.length) {
    let j = i + 1
    while (j < indexed.length && indexed[j].value === indexed[i].value) j++
    const rank = (i + 1 + j) / 2
    for (let k = i; k < j; k++) ranks[indexed[k].idx] = rank
    i = j
  }
  return ranks
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null
  const n = xs.length
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my)
    vx += (xs[i] - mx) ** 2
    vy += (ys[i] - my) ** 2
  }
  if (vx <= 0 || vy <= 0) return null
  return cov / Math.sqrt(vx * vy)
}

/** Spearman — mesma métrica do Modelo Associativo Dinâmico de origem (robusta a escalas ordinais). */
function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null
  return pearson(rankWithTies(xs), rankWithTies(ys))
}

/* ─── Linhas do banco ─────────────────────────────────────────────────────── */

interface Collab {
  id: string
  hasAnswered: boolean
  gender: string | null
  /** Valor resolvido (decifrado quando for o caso) de cada campo estratificável/filtrável. */
  fields: Record<string, string>
}

interface Resp {
  collaboratorId: string
  hseScore: number | null
  hseClass: string | null
  hseDomains: Record<string, number>
  hseItems: Record<string, number>
  remoteScore: number | null
  remoteClass: string | null
  remoteDomains: Record<string, number>
  mh: MentalHealthResult | null
  mhAnswers: MentalHealthAnswers | null
}

function readDomains(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!Array.isArray(raw)) return out
  for (const d of raw as Array<{ domain?: string; score?: number }>) {
    if (d?.domain && typeof d.score === 'number') out[d.domain] = d.score
  }
  return out
}

function readHseItems(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!Array.isArray(raw)) return out
  for (const a of raw as Array<{ questionCode?: string; riskValue?: number | null }>) {
    if (a?.questionCode && /^Q\d+$/.test(a.questionCode) && typeof a.riskValue === 'number') out[a.questionCode] = a.riskValue
  }
  return out
}

/* ─── Campos disponíveis ──────────────────────────────────────────────────── */

export interface ReportField {
  key: string
  label: string
  /** Campo é filtro do dashboard (definido a partir da planilha da empresa) — estrato padrão. */
  isDashboardFilter: boolean
}

/**
 * Campos que podem estratificar ou filtrar o relatório: os filtros do dashboard e as colunas
 * demográficas do mapeamento (inclui colunas customizadas da planilha da empresa).
 */
export function reportFieldsOf(config: NormalizedMappingConfig): ReportField[] {
  const keys = [...config.dashboard_filters, ...config.demographic_columns]
    .filter((key, i, arr) => arr.indexOf(key) === i)
    .filter((key) => key !== 'disability_types')
  return keys.map((key) => ({ key, label: config.field_labels[key] ?? key, isDashboardFilter: config.dashboard_filters.includes(key) }))
}

/**
 * Deficiência chega em grafias diferentes conforme a origem — "não" gravado pela importação do
 * CSV, "Não"/"Sim" pelo formulário. Sem unificar, viram categorias separadas no relatório.
 */
function normalizeCategory(key: string, value: string | null): string {
  if (!value) return NOT_INFORMED
  if (key === 'disability') {
    if (/^n[aã]o$/i.test(value)) return 'Não'
    if (/^sim$/i.test(value)) return 'Sim'
  }
  return value
}

const COLLAB_COLUMNS = [
  'id', 'has_answered', 'area', 'role', 'gender', 'race_color', 'employment_type', 'birth_date',
  'education_level', 'marital_status', 'disability', 'which_disability', 'extra_fields',
] as const

async function loadCollaborators(mappingId: string, fieldKeys: string[]): Promise<Collab[]> {
  const rows = await db
    .selectFrom('collaborators')
    .select([...COLLAB_COLUMNS])
    .where('mapping_id', '=', mappingId)
    .execute()

  // Campos demográficos fixos usados pelo slide de perfil, além dos estratificáveis.
  const allKeys = [...new Set([...fieldKeys, 'gender', 'race_color', 'age_range', 'employment_type',
    'education_level', 'marital_status', 'disability', 'disability_types'])]

  return rows.map((row) => {
    const source = row as unknown as CollaboratorFieldSource
    const fields: Record<string, string> = {}
    for (const key of allKeys) fields[key] = normalizeCategory(key, getCollaboratorFieldValue(source, key))
    return { id: row.id, hasAnswered: row.has_answered, gender: row.gender, fields }
  })
}

async function loadResponses(collabs: Collab[]): Promise<Map<string, Resp>> {
  const out = new Map<string, Resp>()
  const genderById = new Map(collabs.map((c) => [c.id, c.gender]))
  const ids = collabs.map((c) => c.id)
  const CHUNK = 1000

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    if (chunk.length === 0) continue
    const rows = await db
      .selectFrom('responses')
      .select([
        'collaborator_id', 'hse_score', 'hse_class', 'hse_domains', 'answers', 'remote_score',
        'remote_class', 'remote_domains', 'mental_health_answers', 'mental_health_derived',
      ])
      .where('collaborator_id', 'in', chunk)
      .execute()

    for (const r of rows) {
      const mhAnswers = r.mental_health_answers
        ? normalizeMentalHealthAnswers(r.mental_health_answers as MentalHealthAnswers)
        : null
      const mh = (r.mental_health_derived && typeof r.mental_health_derived === 'object')
        ? r.mental_health_derived as unknown as MentalHealthResult
        : mhAnswers ? calculateMentalHealth(mhAnswers, { gender: genderById.get(r.collaborator_id) ?? null }) : null
      out.set(r.collaborator_id, {
        collaboratorId: r.collaborator_id,
        hseScore: typeof r.hse_score === 'number' ? r.hse_score : null,
        hseClass: r.hse_class,
        hseDomains: readDomains(r.hse_domains),
        hseItems: readHseItems(r.answers),
        remoteScore: typeof r.remote_score === 'number' ? r.remote_score : null,
        remoteClass: r.remote_class,
        remoteDomains: readDomains(r.remote_domains),
        mh,
        mhAnswers,
      })
    }
  }
  return out
}

/* ─── Classificações (espelham o dashboard) ───────────────────────────────── */

function classifyHse(avg: number): string {
  if (avg >= HSE_RISK_PROTOCOL.highCut) return 'Alto risco'
  if (avg >= HSE_RISK_PROTOCOL.moderateCut) return 'Risco moderado'
  return 'Baixo risco'
}

function classifyRemote(avg: number): string {
  if (avg >= 4) return 'Condição adequada'
  if (avg >= 3) return 'Zona de atenção'
  return 'Situação de risco'
}

/* ─── Estratificação ──────────────────────────────────────────────────────── */

interface StratumContext {
  collabs: Collab[]
  resp: Map<string, Resp>
  minGroup: number
  excluded: Set<string>
}

function groupBy(ctx: StratumContext, key: string, onlyAnswered = false): Map<string, Collab[]> {
  const groups = new Map<string, Collab[]>()
  for (const c of ctx.collabs) {
    if (onlyAnswered && !ctx.resp.has(c.id)) continue
    const value = c.fields[key] ?? NOT_INFORMED
    if (ctx.excluded.has(value)) continue
    const list = groups.get(value) ?? []
    list.push(c)
    groups.set(value, list)
  }
  return groups
}

function buildHseStratumRows(ctx: StratumContext, key: string): StratumRow[] {
  const rows: StratumRow[] = []
  for (const [name, members] of groupBy(ctx, key)) {
    const answered = members.map((m) => ctx.resp.get(m.id)).filter((r): r is Resp => !!r)
    if (answered.length < ctx.minGroup) continue

    const scores = answered.map((r) => r.hseScore).filter((v): v is number => v !== null)
    const classes = answered.map((r) => r.hseClass)
    const high = classes.filter((c) => c === 'Alto risco').length
    const mod = classes.filter((c) => c === 'Risco moderado').length
    const low = classes.filter((c) => c === 'Baixo risco').length
    const classified = high + mod + low

    const domainAvgs: Record<string, number | null> = {}
    const domainHighPcts: Record<string, number | null> = {}
    const domainAtLeastModeratePcts: Record<string, number | null> = {}
    for (const domain of HSE_DOMAIN_ORDER) {
      const values = answered.map((r) => r.hseDomains[domain]).filter((v): v is number => typeof v === 'number')
      domainAvgs[domain] = avgOf(values)
      domainHighPcts[domain] = values.length > 0 ? pct1(values.filter((v) => v >= HSE_RISK_PROTOCOL.highCut).length, values.length) : null
      domainAtLeastModeratePcts[domain] = values.length > 0
        ? pctRaw(values.filter((v) => v >= HSE_RISK_PROTOCOL.moderateCut).length, values.length)
        : null
    }

    const hseAvg = avgOf(scores)
    rows.push({
      name,
      total: members.length,
      answered: answered.length,
      hseAvg,
      hseClass: hseAvg !== null ? classifyHse(hseAvg) : null,
      highPct: pct1(high, classified),
      modPct: pct1(mod, classified),
      lowPct: pct1(low, classified),
      domainAvgs,
      domainHighPcts,
      domainAtLeastModeratePcts,
    })
  }
  return rows.sort((a, b) => (b.hseAvg ?? -1) - (a.hseAvg ?? -1))
}

function buildIetrStratumRows(ctx: StratumContext, key: string): IetrStratumRow[] {
  const rows: IetrStratumRow[] = []
  for (const [name, members] of groupBy(ctx, key, true)) {
    const answered = members.map((m) => ctx.resp.get(m.id)).filter((r): r is Resp => !!r && r.remoteScore !== null)
    if (answered.length < ctx.minGroup) continue

    const high = answered.filter((r) => r.remoteClass === 'Situação de risco').length
    const mod = answered.filter((r) => r.remoteClass === 'Zona de atenção').length
    const low = answered.filter((r) => r.remoteClass === 'Condição adequada').length
    const classified = high + mod + low

    const domainAvgs: Record<string, number | null> = {}
    for (const domain of IETR_DOMAIN_ORDER) {
      domainAvgs[domain] = avgOf(answered.map((r) => r.remoteDomains[domain]).filter((v): v is number => typeof v === 'number'))
    }
    const ietrAvg = avgOf(answered.map((r) => r.remoteScore as number))
    rows.push({
      name,
      answered: answered.length,
      ietrAvg,
      ietrClass: ietrAvg !== null ? classifyRemote(ietrAvg) : null,
      highPct: pct1(high, classified),
      modPct: pct1(mod, classified),
      lowPct: pct1(low, classified),
      domainAvgs,
    })
  }
  return rows.sort((a, b) => b.highPct - a.highPct || (a.ietrAvg ?? 99) - (b.ietrAvg ?? 99))
}

const isDepressionAlert = (level: string | undefined) => level === 'Sintomas Moderados' || level === 'Sintomas Graves'

function buildWellbeingStratumRows(ctx: StratumContext, key: string): WellbeingStratumRow[] {
  const rows: WellbeingStratumRow[] = []
  for (const [name, members] of groupBy(ctx, key, true)) {
    const results = members.map((m) => ctx.resp.get(m.id)?.mh).filter((r): r is MentalHealthResult => !!r)
    if (results.length < ctx.minGroup) continue
    const indexes = results.map((r) => r.index).filter((v): v is number => typeof v === 'number')
    const valid = indexes.length
    rows.push({
      name,
      answered: results.length,
      mentalHealthAvg: avgOf(indexes),
      mentalValid: valid,
      mentalUnsatPct: pct1(indexes.filter((v) => v < 5).length, valid),
      mentalRegularPct: pct1(indexes.filter((v) => v >= 5 && v < 7).length, valid),
      mentalGoodPct: pct1(indexes.filter((v) => v >= 7 && v < 9).length, valid),
      mentalExcellentPct: pct1(indexes.filter((v) => v >= 9).length, valid),
      severeStressPct: pct1(results.filter((r) => r.stress?.level === 'Sintomas Graves').length, results.length),
      depressiveAlertPct: pct1(results.filter((r) => isDepressionAlert(r.depression?.level)).length, results.length),
      suicideRiskPct: pct1(results.filter((r) => r.suicide?.atRisk).length, results.length),
      supportPresencePct: pct1(results.filter((r) => r.support?.presence === 'Sim').length, results.length),
    })
  }
  return rows.sort((a, b) => (b.mentalUnsatPct - a.mentalUnsatPct) || (b.suicideRiskPct - a.suicideRiskPct)
    || ((a.mentalHealthAvg ?? 99) - (b.mentalHealthAvg ?? 99)))
}

function buildPerceptionStratumRows(ctx: StratumContext, key: string): WellbeingPerceptionStratumRow[] {
  const rows: WellbeingPerceptionStratumRow[] = []
  for (const [name, members] of groupBy(ctx, key, true)) {
    const results = members.map((m) => ctx.resp.get(m.id)?.mh).filter((r): r is MentalHealthResult => !!r)
    if (results.length < ctx.minGroup) continue
    rows.push({
      name,
      answered: results.length,
      mentalSelfHealthAvg: avgOf(results.map((r) => r.perception?.healthScore).filter((v): v is number => typeof v === 'number')),
      lifeQualityAvg: avgOf(results.map((r) => r.perception?.lifeQualityScore).filter((v): v is number => typeof v === 'number')),
    })
  }
  return rows.sort((a, b) => ((a.mentalSelfHealthAvg ?? 0) + (a.lifeQualityAvg ?? 0)) - ((b.mentalSelfHealthAvg ?? 0) + (b.lifeQualityAvg ?? 0)))
}

/* ─── Modelo Associativo Dinâmico ─────────────────────────────────────────── */

interface Predictor { name: string; getValue: (r: Resp) => number | null }

const OUTCOMES: Predictor[] = [
  // Todos orientados a "carga" (maior = pior), como os preditores HSE — r positivo = associação de risco.
  { name: 'Saúde Mental (Geral)', getValue: (r) => (typeof r.mh?.index === 'number' ? 10 - r.mh.index : null) },
  { name: 'Estresse', getValue: (r) => r.mh ? r.mh.stress.symptomCount : null },
  { name: 'Depressão', getValue: (r) => r.mh ? r.mh.depression.symptomCount : null },
  { name: 'Risco de suicídio', getValue: (r) => r.mh ? r.mh.suicide.indicatorCount : null },
]

const DOMAIN_PREDICTORS: Predictor[] = HSE_DOMAIN_ORDER.map((domain) => ({
  name: domain,
  getValue: (r) => r.hseDomains[domain] ?? null,
}))

const ITEM_PREDICTORS: Predictor[] = HSE_QUESTIONS.map((q) => ({
  name: HSE_ITEM_SHORT_LABELS[q.code] ?? q.code,
  getValue: (r) => r.hseItems[q.code] ?? null,
}))
const ITEM_DOMAIN = new Map(HSE_QUESTIONS.map((q) => [HSE_ITEM_SHORT_LABELS[q.code] ?? q.code, q.domain]))

function associativeRows(responses: Resp[], predictors: Predictor[], minSample: number): AssociativeCorrelationRow[] {
  return predictors
    .map((predictor) => {
      const metrics = OUTCOMES.map((outcome) => {
        const pairs = responses
          .map((r) => {
            const x = predictor.getValue(r)
            const y = outcome.getValue(r)
            return x !== null && y !== null ? { x, y } : null
          })
          .filter((p): p is { x: number; y: number } => p !== null)
        if (pairs.length < minSample) return { outcome: outcome.name, coefficient: null, absCoefficient: 0, sampleSize: pairs.length }
        const coefficient = spearman(pairs.map((p) => p.x), pairs.map((p) => p.y))
        return {
          outcome: outcome.name,
          coefficient,
          absCoefficient: coefficient === null ? 0 : trunc2(Math.abs(coefficient)),
          sampleSize: pairs.length,
        }
      })
      const valid = metrics.filter((m) => m.coefficient !== null)
      return {
        predictor: predictor.name,
        metrics,
        meanAbsCoefficient: valid.length > 0 ? trunc2(valid.reduce((s, m) => s + m.absCoefficient, 0) / valid.length) : 0,
      }
    })
    .filter((row) => row.metrics.some((m) => m.coefficient !== null))
    .sort((a, b) => b.meanAbsCoefficient - a.meanAbsCoefficient || a.predictor.localeCompare(b.predictor, 'pt-BR'))
}

function bestPositive(row: AssociativeCorrelationRow) {
  return row.metrics
    .filter((m): m is typeof m & { coefficient: number } => m.coefficient !== null && m.coefficient > 0)
    .sort((a, b) => b.coefficient - a.coefficient)[0] ?? null
}

function bestInverse(row: AssociativeCorrelationRow) {
  return row.metrics
    .filter((m): m is typeof m & { coefficient: number } => m.coefficient !== null && m.coefficient < 0)
    .sort((a, b) => a.coefficient - b.coefficient)[0] ?? null
}

const priorityOf = (score: number): 'Alta' | 'Média' | 'Monitorar' => (score >= 0.45 ? 'Alta' : score >= 0.3 ? 'Média' : 'Monitorar')

function actionFor(factor: string): string {
  return HSE_DOMAIN_ACTIONS[factor]
    ?? HSE_DOMAIN_ACTIONS[ITEM_DOMAIN.get(factor) ?? '']
    ?? 'Detalhar diagnóstico local e definir plano de mitigação com governança e prazo.'
}

function buildAssociative(responses: Resp[], ctx: StratumContext, primaryKey: string | null) {
  const usable = responses.filter((r) => r.mh && Object.keys(r.hseDomains).length > 0)
  const domainRows = associativeRows(usable, DOMAIN_PREDICTORS, ASSOCIATIVE_MIN_SAMPLE)
  const itemRows = associativeRows(usable, ITEM_PREDICTORS, ASSOCIATIVE_MIN_SAMPLE)

  const scatter = [...DOMAIN_PREDICTORS, ...ITEM_PREDICTORS]
    .map((predictor) => {
      const points = usable
        .map((r) => {
          const x = predictor.getValue(r)
          const y = OUTCOMES[0].getValue(r)
          return x !== null && y !== null ? { x, y } : null
        })
        .filter((p): p is { x: number; y: number } => p !== null)
      if (points.length < ASSOCIATIVE_MIN_SAMPLE) return null
      const coefficient = spearman(points.map((p) => p.x), points.map((p) => p.y))
      if (coefficient === null) return null
      return { predictor: predictor.name, outcome: OUTCOMES[0].name, coefficient, sampleSize: points.length, points }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))
    .slice(0, 6)

  const toPriority = (scope: 'Domínio' | 'Subdomínio', rows: AssociativeCorrelationRow[]): AssociativePriorityAction[] => rows
    .map((row) => {
      const best = bestPositive(row)
      if (!best) return null
      return {
        scope,
        factor: row.predictor,
        priority: priorityOf(best.coefficient),
        strength: best.coefficient,
        strongestOutcome: best.outcome,
        rationale: `Associação positiva observada com ${best.outcome} (r=${best.coefficient.toFixed(2)}) na base atual.`,
        recommendation: actionFor(row.predictor),
      }
    })
    .filter((a): a is AssociativePriorityAction => a !== null)

  const priorityActions = [...toPriority('Domínio', domainRows), ...toPriority('Subdomínio', itemRows)]
    .sort((a, b) => b.strength - a.strength || a.factor.localeCompare(b.factor, 'pt-BR'))
    .slice(0, 10)

  // Leitura por grupo do estrato principal (equivalente à "OM4" do relatório de origem).
  const insights: AssociativeOm4Insight[] = []
  const notes: AssociativeOm4MentalNotesRow[] = []
  if (primaryKey) {
    const raw = [...groupBy(ctx, primaryKey, true).entries()]
      .map(([stratumValue, members]) => {
        const group = members.map((m) => ctx.resp.get(m.id)).filter((r): r is Resp => !!r && !!r.mh)
        if (group.length < Math.max(ASSOCIATIVE_MIN_GROUP_SAMPLE, ctx.minGroup)) return null
        const dRows = associativeRows(group, DOMAIN_PREDICTORS, ASSOCIATIVE_MIN_GROUP_SAMPLE)
        const iRows = associativeRows(group, ITEM_PREDICTORS, ASSOCIATIVE_MIN_GROUP_SAMPLE)
        if (dRows.length === 0) return null

        const pos = (rows: AssociativeCorrelationRow[]) => rows.slice().sort((a, b) => (bestPositive(b)?.coefficient ?? 0) - (bestPositive(a)?.coefficient ?? 0))[0] ?? null
        const inv = (rows: AssociativeCorrelationRow[]) => rows.slice().sort((a, b) => Math.abs(bestInverse(b)?.coefficient ?? 0) - Math.abs(bestInverse(a)?.coefficient ?? 0))[0] ?? null
        const topPosDomain = pos(dRows)
        const topPosItem = pos(iRows)
        const topInvDomain = inv(dRows)
        const topInvItem = inv(iRows)
        const positiveStrength = Math.max(bestPositive(topPosDomain!)?.coefficient ?? 0, topPosItem ? bestPositive(topPosItem)?.coefficient ?? 0 : 0)
        const inverseStrength = Math.max(Math.abs(bestInverse(topInvDomain!)?.coefficient ?? 0), topInvItem ? Math.abs(bestInverse(topInvItem)?.coefficient ?? 0) : 0)

        const burdenValues = group.map((r) => OUTCOMES[0].getValue(r)).filter((v): v is number => v !== null)
        const burden = burdenValues.length > 0 ? burdenValues.reduce((s, v) => s + v, 0) / burdenValues.length : null
        const bounded = burden === null ? 5 : Math.max(0, Math.min(10, burden))

        const useDomain = positiveStrength > 0 ? topPosDomain : topInvDomain
        const useItem = positiveStrength > 0 ? topPosItem : topInvItem
        const topDomain = useDomain?.predictor ?? dRows[0].predictor
        const topItem = useItem?.predictor ?? iRows[0]?.predictor ?? topDomain
        const componentAvg = (key: string) => avgOf(group
          .map((r) => r.mh?.components?.find((c) => c.key === key)?.score)
          .filter((v): v is number => typeof v === 'number'))

        return {
          base: {
            stratumValue,
            sampleSize: group.length,
            strongestOutcome: (useDomain && (positiveStrength > 0 ? bestPositive(useDomain) : bestInverse(useDomain))?.outcome) || 'Saúde Mental (Geral)',
            topDomain,
            topDomainStrength: positiveStrength > 0 ? (bestPositive(topPosDomain!)?.coefficient ?? 0) : -(Math.abs(bestInverse(topInvDomain!)?.coefficient ?? 0)),
            topSubdomain: topItem,
            topSubdomainStrength: positiveStrength > 0 ? positiveStrength : -inverseStrength,
            priority: priorityOf(positiveStrength),
            keyFactors: [...new Set([topDomain, topItem])].slice(0, 2),
            recommendation: actionFor(topDomain),
            mentalBurdenScore: burden,
          } satisfies AssociativeOm4Insight,
          positiveStrength,
          riskScore: positiveStrength * 0.7 + (bounded / 10) * 0.3,
          benchmarkScore: inverseStrength * 0.45 + ((10 - bounded) / 10) * 0.55,
          bounded,
          note: {
            stratumValue,
            sampleSize: group.length,
            riscoPsicossocialAvg: avgOf(group.map((r) => r.hseScore).filter((v): v is number => v !== null)),
            saudeMentalAvg: avgOf(group.map((r) => r.mh?.index).filter((v): v is number => typeof v === 'number')),
            notaEstresseAvg: componentAvg('estresse'),
            notaSintomasDepressivosAvg: componentAvg('sintomas_depressivos'),
            notaInternetAvg: componentAvg('internet'),
            notaRedeApoioAvg: componentAvg('rede_de_apoio'),
            // 0 = ninguém do grupo com indicador; 10 = todos (escala "maior = pior" do slide).
            notaSuicidioAvg: avgOf(group.map((r) => (r.mh?.suicide.atRisk ? 10 : 0))),
            topDomain,
            topSubdomain: topItem,
            diagnosisStrategic: `${topDomain} + ${topItem}: ${HSE_DOMAIN_MEANING[topDomain] ?? 'indica necessidade de diagnóstico local detalhado e plano de ação prioritário.'}`,
          } satisfies AssociativeOm4MentalNotesRow,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    // HSE: maior = pior — os grupos mais críticos primeiro.
    notes.push(...raw.map((r) => r.note).sort((a, b) => (b.riscoPsicossocialAvg ?? -1) - (a.riscoPsicossocialAvg ?? -1)))

    const riskCases = raw.filter((r) => r.positiveStrength > 0).sort((a, b) => b.riskScore - a.riskScore).slice(0, 4)
      .map((r) => ({
        ...r.base,
        caseType: 'Atenção' as const,
        whyIncluded: `Entrou como caso de atenção por combinar associação positiva entre risco psicossocial e piora dos desfechos com maior pressão de saúde mental (carga relativa ${r.bounded.toFixed(1)}/10).`,
      }))
    const used = new Set(riskCases.map((r) => r.stratumValue))
    const benchmarks = raw.filter((r) => !used.has(r.base.stratumValue)).sort((a, b) => b.benchmarkScore - a.benchmarkScore).slice(0, 2)
      .map((r) => ({
        ...r.base,
        caseType: 'Benchmark' as const,
        priority: 'Monitorar' as const,
        recommendation: `Mapear práticas locais de ${r.base.keyFactors.join(' e ').toLowerCase()} para replicação gradual em outros grupos.`,
        whyIncluded: `Entrou como benchmark por mostrar menor pressão de saúde mental (carga relativa ${r.bounded.toFixed(1)}/10) e sinais de associação inversa/protetiva.`,
      }))
    insights.push(...riskCases, ...benchmarks)
  }

  return { domainRows, itemRows, scatter, priorityActions, insights, notes }
}

/* ─── Construtor principal ────────────────────────────────────────────────── */

export async function buildMappingReportPayload(mappingId: string, options: ReportOptions): Promise<ReportPayload> {
  const clientName = options.clientName?.trim()
  if (!clientName) throw new ReportBuildError(400, 'Nome do cliente é obrigatório.')

  const mapping = await db
    .selectFrom('mappings')
    .select(['config', 'logo_url'])
    .where('id', '=', mappingId)
    .executeTakeFirst()
  if (!mapping) throw new ReportBuildError(404, 'Mapeamento não encontrado.')

  const config = normalizeMappingConfig(mapping.config)
  const fields = reportFieldsOf(config)
  const fieldKeys = new Set(fields.map((f) => f.key))
  const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? key

  const minGroup = Math.max(MIN_GROUP_SIZE_FLOOR, Math.min(MIN_GROUP_SIZE_CEIL, Math.round(options.minGroupSize ?? MIN_GROUP_SIZE_FLOOR)))

  // Recorte da base (filtros com múltiplos valores) e categorias omitidas
  const filters = Object.fromEntries(
    Object.entries(options.filters ?? {})
      .filter(([key, values]) => fieldKeys.has(key) && Array.isArray(values) && values.length > 0),
  )
  const excludedByKey = new Map(
    Object.entries(options.excludedCategories ?? {})
      .filter(([key, values]) => fieldKeys.has(key) && Array.isArray(values) && values.length > 0)
      .map(([key, values]) => [key, new Set(values)]),
  )

  const allCollabs = await loadCollaborators(mappingId, [...fieldKeys])
  const collabs = allCollabs.filter((c) => {
    for (const [key, values] of Object.entries(filters)) {
      if (!values.includes(c.fields[key] ?? NOT_INFORMED)) return false
    }
    if (options.excludeOmittedFromBase) {
      for (const [key, omitted] of excludedByKey) {
        if (omitted.has(c.fields[key] ?? NOT_INFORMED)) return false
      }
    }
    return true
  })
  if (collabs.length === 0) throw new ReportBuildError(404, 'Nenhum colaborador encontrado para o recorte escolhido.')

  const resp = await loadResponses(collabs)
  const answeredCollabs = collabs.filter((c) => resp.has(c.id))
  if (answeredCollabs.length === 0) throw new ReportBuildError(422, 'Ainda não há respostas neste recorte.')
  const responses = answeredCollabs.map((c) => resp.get(c.id) as Resp)

  // Estratos: escolhidos (ou todos), sem os campos fixados em um único valor pelo filtro
  const requestedStrata = (options.strata && options.strata.length > 0 ? options.strata : fields.map((f) => f.key))
    .filter((key, i, arr) => fieldKeys.has(key) && arr.indexOf(key) === i)
    .filter((key) => !(filters[key] && filters[key].length === 1))

  const ctxFor = (key: string): StratumContext => ({ collabs, resp, minGroup, excluded: excludedByKey.get(key) ?? new Set() })

  /* Demografia — só quem respondeu, como no dashboard */
  const dist = (key: string) => countBy(answeredCollabs, (c) => c.fields[key])
  const disabilityTypeMap = new Map<string, number>()
  for (const c of answeredCollabs) {
    const raw = c.fields.disability_types
    if (!raw || raw === NOT_INFORMED) continue
    for (const item of raw.split(/[,;|/]/).map((v) => v.trim()).filter(Boolean)) {
      disabilityTypeMap.set(item, (disabilityTypeMap.get(item) ?? 0) + 1)
    }
  }
  const onlyInformed = (d: { name: string; value: number }[]) => (d.every((i) => i.name === NOT_INFORMED) ? [] : d)

  /* HSE */
  const hseScores = responses.map((r) => r.hseScore).filter((v): v is number => v !== null)
  const hseAvg = avgOf(hseScores)
  const hseClassDist = ['Alto risco', 'Risco moderado', 'Baixo risco']
    .map((name) => ({ name, value: responses.filter((r) => r.hseClass === name).length }))
  const presentDomains = HSE_DOMAIN_ORDER.filter((d) => responses.some((r) => typeof r.hseDomains[d] === 'number'))
  const domainValues = (d: string) => responses.map((r) => r.hseDomains[d]).filter((v): v is number => typeof v === 'number')
  const domainAvgs = presentDomains.map((domain) => ({ domain, avg: avgOf(domainValues(domain)) ?? 0 }))
  const overallDomainHighPcts = Object.fromEntries(presentDomains.map((d) => {
    const v = domainValues(d)
    return [d, v.length > 0 ? pct1(v.filter((x) => x >= HSE_RISK_PROTOCOL.highCut).length, v.length) : null]
  }))
  const overallDomainAtLeastModeratePcts = Object.fromEntries(presentDomains.map((d) => {
    const v = domainValues(d)
    return [d, v.length > 0 ? pctRaw(v.filter((x) => x >= HSE_RISK_PROTOCOL.moderateCut).length, v.length) : null]
  }))

  /* IETR */
  const ietrResponses = responses.filter((r) => r.remoteScore !== null)
  const ietrAvg = avgOf(ietrResponses.map((r) => r.remoteScore as number))
  const ietrClassDist = ['Situação de risco', 'Zona de atenção', 'Condição adequada']
    .map((name) => ({ name, value: ietrResponses.filter((r) => r.remoteClass === name).length }))
  const presentIetrDomains = IETR_DOMAIN_ORDER.filter((d) => ietrResponses.some((r) => typeof r.remoteDomains[d] === 'number'))
  const ietrDomainAvgs = presentIetrDomains.map((domain) => ({
    domain,
    avg: avgOf(ietrResponses.map((r) => r.remoteDomains[domain]).filter((v): v is number => typeof v === 'number')) ?? 0,
  }))
  const hasIetr = config.modules.includes('ietr') && ietrResponses.length > 0

  /* Estratificação */
  const stratifiedHse: HseStratifiedSlice[] = requestedStrata
    .map((key) => ({ stratum: key, stratumLabel: labelOf(key), stratumRows: buildHseStratumRows(ctxFor(key), key) }))
    .filter((s) => s.stratumRows.length > 0)
  const stratifiedIetr: IetrStratifiedSlice[] = hasIetr
    ? requestedStrata
        .map((key) => ({ stratum: key, stratumLabel: labelOf(key), ietrStratumRows: buildIetrStratumRows(ctxFor(key), key) }))
        .filter((s) => s.ietrStratumRows.length > 0)
    : []
  const stratifiedParticipation: ParticipationStratifiedSlice[] = requestedStrata.map((key) => ({
    stratum: key,
    stratumLabel: labelOf(key),
    participationRows: [...groupBy(ctxFor(key), key).entries()]
      .map(([name, members]) => ({ name, total: members.length, answered: members.filter((m) => resp.has(m.id)).length }))
      .sort((a, b) => pct1(a.answered, a.total) - pct1(b.answered, b.total)),
  })).filter((s) => s.participationRows.length > 0)

  const genderKnown = answeredCollabs.some((c) => c.fields.gender !== NOT_INFORMED)
  const stratifiedGenderByStratum: GenderByStratumStratifiedSlice[] = genderKnown
    ? requestedStrata
        .filter((key) => key !== 'gender')
        .map((key) => ({
          stratum: key,
          stratumLabel: labelOf(key),
          rows: [...groupBy(ctxFor(key), key, true).entries()]
            .filter(([, members]) => members.length >= minGroup)
            .map(([stratumValue, members]) => {
              const g = members.map((m) => (m.fields.gender ?? '').toLowerCase())
              const masculino = g.filter((v) => /^(masculino|homem|m)$/.test(v)).length
              const feminino = g.filter((v) => /^(feminino|mulher|f)$/.test(v)).length
              const notInformed = g.filter((v) => v === '' || v === NOT_INFORMED.toLowerCase() || v.startsWith('prefiro')).length
              return { stratumValue, total: members.length, masculino, feminino, outro: members.length - masculino - feminino - notInformed, notInformed }
            })
            .sort((a, b) => b.total - a.total),
        }))
        .filter((s) => s.rows.length > 1)
    : []

  /* Saúde Mental */
  const mhResponses = responses.filter((r) => r.mh && r.mhAnswers)
  const hasWellbeing = config.modules.includes('saude_mental') && mhResponses.length > 0
  const mh = mhResponses.map((r) => r.mh as MentalHealthResult)
  const mha = mhResponses.map((r) => r.mhAnswers as MentalHealthAnswers)
  const exposed = mha.filter((a) => a.exposed_natural_disaster === true)

  const recurring = (options: readonly CheckboxOption[], short: Record<string, string>): WellbeingRecurringItem[] => options
    .map((o) => {
      const value = mha.filter((a) => a[o.field] === true).length
      return { name: short[o.field] ?? o.label, value, pct: pct1(value, mha.length) }
    })
    .filter((i) => i.value > 0)
    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name, 'pt-BR'))

  const scoreDist = (pick: (r: MentalHealthResult) => number | null) => {
    const buckets = new Array(11).fill(0)
    for (const r of mh) {
      const v = pick(r)
      if (typeof v === 'number' && v >= 0 && v <= 10) buckets[Math.trunc(v)]++
    }
    return buckets.map((value, score) => ({ name: String(score), value }))
  }

  const stratifiedWellbeing: WellbeingStratifiedSlice[] = hasWellbeing
    ? requestedStrata
        .map((key) => ({ stratum: key, stratumLabel: labelOf(key), wellbeingStratumRows: buildWellbeingStratumRows(ctxFor(key), key) }))
        .filter((s) => s.wellbeingStratumRows.length > 0)
    : []

  const stratifiedClimateDisasterRows: ClimateDisasterStratifiedSlice[] = hasWellbeing
    ? requestedStrata.map((key) => ({
        stratum: key,
        stratumLabel: labelOf(key),
        rows: [...groupBy(ctxFor(key), key, true).entries()]
          .map(([category, members]) => {
            const answers = members.map((m) => resp.get(m.id)?.mhAnswers).filter((a): a is MentalHealthAnswers => !!a)
            const typeCounts = Object.fromEntries(CLIMATE_DISASTER_COLUMNS.map((c) => [c.key, 0])) as Record<ClimateDisasterTypeKey, number>
            let exposedCount = 0
            for (const a of answers) {
              if (a.exposed_natural_disaster !== true) continue
              exposedCount++
              const typeKey = typeof a.disaster_type === 'number' ? DISASTER_TYPE_KEYS[a.disaster_type] : undefined
              if (typeKey) typeCounts[typeKey]++
            }
            return { category, total: answers.length, exposed: exposedCount, typeCounts }
          })
          .filter((row) => row.total >= minGroup)
          .sort((a, b) => pct1(b.exposed, b.total) - pct1(a.exposed, a.total)),
      })).filter((s) => s.rows.length > 0)
    : []

  /* Análises associativas (precisam de HSE + Saúde Mental) */
  const primaryKey = stratifiedHse[0]?.stratum ?? requestedStrata[0] ?? null
  const associative = hasWellbeing && hseAvg !== null
    ? buildAssociative(responses, ctxFor(primaryKey ?? ''), primaryKey)
    : null

  /* Filtros exibidos na capa/rodapé, com rótulos legíveis */
  const filterLabels: Record<string, string> = {}
  for (const [key, values] of Object.entries(filters)) filterLabels[labelOf(key)] = values.join(', ')
  const omittedSummary = [...excludedByKey.entries()].map(([key, values]) => `${labelOf(key)}: ${[...values].join(', ')}`)
  const variantParts = [
    ...Object.entries(filterLabels).map(([k, v]) => `${k}: ${v}`),
    ...(omittedSummary.length > 0 ? [`Omitidos${options.excludeOmittedFromBase ? ' da base' : ''} — ${omittedSummary.join(' • ')}`] : []),
  ]

  const logo = options.clientLogoBase64 === null
    ? undefined
    : normalizeLogoUrl(options.clientLogoBase64 ?? mapping.logo_url)?.startsWith('data:')
      ? normalizeLogoUrl(options.clientLogoBase64 ?? mapping.logo_url) ?? undefined
      : undefined

  const primaryHse = stratifiedHse[0]
  const primaryIetr = stratifiedIetr[0]

  return {
    reportSections: (options.sections && options.sections.length > 0 ? options.sections : REPORT_SECTION_ORDER)
      .filter((s) => REPORT_SECTION_ORDER.includes(s)),
    riskControlByDomain: options.riskControlByDomain,
    clientName,
    clientDescription: options.clientDescription?.trim() ?? '',
    clientLogoBase64: logo,
    clientCoverImageBase64: options.coverImageBase64 && options.coverImageBase64.startsWith('data:image/') ? options.coverImageBase64 : undefined,
    generatedAt: new Date().toISOString(),
    filters: filterLabels,
    reportVariantLabel: variantParts.length > 0 ? variantParts.join(' | ') : undefined,

    stratum: primaryHse?.stratum ?? primaryKey ?? 'area',
    stratumLabel: primaryHse?.stratumLabel ?? (primaryKey ? labelOf(primaryKey) : 'Área'),

    totalCollabs: collabs.length,
    totalAnswered: answeredCollabs.length,

    genderDist: onlyInformed(dist('gender')),
    raceDist: onlyInformed(dist('race_color')),
    ageRangeDist: onlyInformed(dist('age_range')),
    employDist: onlyInformed(dist('employment_type')),
    educationDist: onlyInformed(dist('education_level')),
    maritalDist: onlyInformed(dist('marital_status')),
    disabilityDist: onlyInformed(dist('disability')),
    disabilityTypeDist: [...disabilityTypeMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    workCategoryByOm4: [],
    stratifiedGenderByStratum,

    riskProtocol: HSE_RISK_PROTOCOL,
    hseAvg,
    hseClassDist,
    domainAvgs,
    overallDomainHighPcts,
    overallDomainAtLeastModeratePcts,
    stratumRows: primaryHse?.stratumRows ?? [],
    hseDomains: presentDomains,
    stratifiedHse,
    stratifiedParticipation,

    hasIetr,
    ietrAvg,
    ietrClassDist,
    ietrDomains: presentIetrDomains,
    ietrDomainAvgs,
    ietrStratumRows: primaryIetr?.ietrStratumRows ?? [],
    stratifiedIetr,

    hasWellbeing,
    ...(hasWellbeing ? {
      mentalHealthAvg: avgOf(mh.map((r) => r.index).filter((v): v is number => typeof v === 'number')),
      mentalHealthClassDist: countBy(mh, (r) => r.classification),
      stressDist: countBy(mh, (r) => r.stress?.level),
      depressionDist: countBy(mh, (r) => r.depression?.level),
      suicideRiskDist: [
        { name: 'Com risco', value: mh.filter((r) => r.suicide?.atRisk).length },
        { name: 'Sem risco', value: mh.filter((r) => !r.suicide?.atRisk).length },
      ],
      mentalHealthCriticalUnionCount: mh.filter((r) => r.stress?.level === 'Sintomas Graves' || isDepressionAlert(r.depression?.level) || r.suicide?.atRisk).length,
      tobaccoDist: countBy(mh, (r) => r.tobacco?.category),
      alcoholDist: countBy(mh, (r) => r.alcohol?.category),
      internetDist: countBy(mh, (r) => r.internet?.level),
      supportDist: [
        { name: 'Com apoio', value: mh.filter((r) => r.support?.presence === 'Sim').length },
        { name: 'Sem apoio', value: mh.filter((r) => r.support?.presence !== 'Sim').length },
      ],
      climateExposureDist: [
        { name: 'Expostos', value: exposed.length },
        { name: 'Não expostos', value: mha.length - exposed.length },
      ],
      disasterTypeDist: countBy(exposed.filter((a) => typeof a.disaster_type === 'number' && DISASTER_TYPE_LABELS[a.disaster_type as number]),
        (a) => DISASTER_TYPE_LABELS[a.disaster_type as number]),
      disasterContactDist: orderedDist(
        exposed.map((a) => DISASTER_CONTACT_LABELS[a.disaster_contact as number] ?? ''),
        Object.values(DISASTER_CONTACT_LABELS),
      ),
      disasterVulnerabilityDist: orderedDist(
        exposed.map((a) => DISASTER_INTENSITY_LABELS[(a.disaster_vulnerability_feeling as number) - 1] ?? ''),
        DISASTER_INTENSITY_LABELS,
      ),
      disasterSafetyConcernDist: orderedDist(
        exposed.map((a) => DISASTER_INTENSITY_LABELS[(a.disaster_safety_concern as number) - 1] ?? ''),
        DISASTER_INTENSITY_LABELS,
      ),
      stratifiedClimateDisasterRows,
      perceivedPhysicalHealthDist: scoreDist((r) => r.perception?.healthScore ?? null),
      perceivedLifeQualityDist: scoreDist((r) => r.perception?.lifeQualityScore ?? null),
      stressSourcesTop: recurring(STRESS_SOURCE_OPTIONS, SHORT_STRESS_SOURCE),
      stressSymptomsTop: recurring(STRESS_SYMPTOM_OPTIONS, SHORT_STRESS_SYMPTOM),
      depressionSymptomsTop: recurring(DEPRESSION_SYMPTOM_OPTIONS, SHORT_DEPRESSION_SYMPTOM),
      wellbeingStratumRows: stratifiedWellbeing[0]?.wellbeingStratumRows ?? [],
      wellbeingPerceptionStratumRows: primaryKey ? buildPerceptionStratumRows(ctxFor(primaryKey), primaryKey) : [],
      stratifiedWellbeing,
    } : {}),

    ...(associative ? {
      associativeOutcomes: OUTCOMES.map((o) => o.name),
      associativeDomainCorrelations: associative.domainRows,
      associativeSubdomainCorrelations: associative.itemRows,
      associativeScatterSamples: associative.scatter,
      associativePriorityActions: associative.priorityActions,
      associativeOm4Insights: associative.insights,
      associativeOm4MentalNotes: associative.notes,
    } : {}),
  }
}

/* ─── Metadados para a tela de geração ────────────────────────────────────── */

export interface ReportFieldMeta extends ReportField {
  categories: Array<{ name: string; total: number; answered: number }>
}

export interface ReportOptionsMeta {
  mappingName: string
  defaultClientName: string
  hasLogo: boolean
  logo: string | null
  modules: string[]
  fields: ReportFieldMeta[]
  hseDomains: string[]
  totals: { collaborators: number; answered: number }
  availableSections: ReportSectionKey[]
}

export async function getReportOptionsMeta(mappingId: string): Promise<ReportOptionsMeta> {
  const mapping = await db
    .selectFrom('mappings')
    .innerJoin('tenants', 'tenants.id', 'mappings.tenant_id')
    .select(['mappings.name', 'mappings.config', 'mappings.logo_url', 'tenants.name as tenant_name'])
    .where('mappings.id', '=', mappingId)
    .executeTakeFirst()
  if (!mapping) throw new ReportBuildError(404, 'Mapeamento não encontrado.')

  const config = normalizeMappingConfig(mapping.config)
  const fields = reportFieldsOf(config)
  const collabs = await loadCollaborators(mappingId, fields.map((f) => f.key))

  const fieldMeta: ReportFieldMeta[] = fields.map((field) => {
    const counts = new Map<string, { total: number; answered: number }>()
    for (const c of collabs) {
      const v = c.fields[field.key] ?? NOT_INFORMED
      const entry = counts.get(v) ?? { total: 0, answered: 0 }
      entry.total++
      if (c.hasAnswered) entry.answered++
      counts.set(v, entry)
    }
    return {
      ...field,
      categories: [...counts.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR')),
    }
  }).filter((f) => f.categories.some((c) => c.name !== NOT_INFORMED))

  const modules = config.modules
  const hasHse = modules.includes('hse')
  const hasMh = modules.includes('saude_mental')
  const availableSections = REPORT_SECTION_ORDER.filter((s) => {
    if (s === 'riscos' || s === 'estratificada' || s === 'classificacao') return hasHse
    if (s === 'ietr') return modules.includes('ietr')
    if (s === 'saude_mental') return hasMh
    if (s === 'associativa') return hasHse && hasMh
    return true
  })
  const logo = normalizeLogoUrl(mapping.logo_url)

  return {
    mappingName: mapping.name,
    defaultClientName: mapping.tenant_name,
    hasLogo: !!logo,
    logo: logo?.startsWith('data:') ? logo : null,
    modules,
    fields: fieldMeta,
    hseDomains: hasHse ? HSE_DOMAIN_ORDER : [],
    totals: { collaborators: collabs.length, answered: collabs.filter((c) => c.hasAnswered).length },
    availableSections,
  }
}
