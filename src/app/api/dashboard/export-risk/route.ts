import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getManagerFromSession, isSuperuser } from '@/lib/auth/manager'
import { getMappingScopeContext } from '@/lib/auth/mapping-scope'
import { decryptFieldOrNull } from '@/lib/security/crypto'
import { IETR_CODES, IETR_DOMAIN_WEIGHTS } from '@/lib/analytics/ietr-definition'

// ─── Constantes ───────────────────────────────────────────────────────────────
const HSE_CODES = [
  'Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08', 'Q09', 'Q10',
  'Q11', 'Q12', 'Q13', 'Q14', 'Q15', 'Q16', 'Q17', 'Q18', 'Q19', 'Q20',
  'Q21', 'Q22', 'Q23', 'Q24', 'Q25', 'Q26', 'Q27', 'Q28', 'Q29', 'Q30',
  'Q31', 'Q32', 'Q33', 'Q34', 'Q35',
]
const REMOTE_CODES = IETR_CODES
const HSE_DOMAINS = [
  'Demandas', 'Controle', 'Apoio da Liderança', 'Apoio dos Colegas',
  'Relacionamentos', 'Cargo', 'Comunicação e Mudanças',
]
const IETR_DOMAINS = Object.keys(IETR_DOMAIN_WEIGHTS)

// ─── Helpers de CSV ───────────────────────────────────────────────────────────
function csvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  return s.includes(';') || s.includes('"') || s.includes('\n')
    ? `"${s.replaceAll('"', '""')}"`
    : s
}

function slugDomain(d: string): string {
  return d
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+$/, '')
}

function getAgeRange(raw: string | null): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (/^\d{1,3}$/.test(trimmed)) {
    const age = Number(trimmed)
    if (!Number.isFinite(age) || age < 0 || age > 120) return ''
    if (age < 25) return 'Até 24'
    if (age < 35) return '25–34'
    if (age < 45) return '35–44'
    if (age < 55) return '45–54'
    return '55+'
  }
  let normalized = trimmed
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/')
    normalized = `${y}-${m}-${d}`
  }
  const birth = new Date(normalized)
  if (Number.isNaN(birth.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const md = today.getMonth() - birth.getMonth()
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age--
  if (age < 25) return 'Até 24'
  if (age < 35) return '25–34'
  if (age < 45) return '35–44'
  if (age < 55) return '45–54'
  return '55+'
}

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface AnswerEntry { questionCode?: string; numericValue?: number | null }
interface DomainEntry { domain?: string; score?: number }

interface ResponseData {
  answers: AnswerEntry[]
  hse_domains: DomainEntry[]
  hse_score: number | null
  hse_class: string | null
  remote_domains: DomainEntry[]
  remote_score: number | null
  remote_class: string | null
}

interface CollabData {
  id: string
  area: string | null
  role: string | null
  gender: string | null
  race_color: string | null
  employment_type: string | null
  birth_date: string | null
}

// ─── Builders de linha CSV ────────────────────────────────────────────────────
function buildAnswerMap(answers: AnswerEntry[]): Map<string, number | null> {
  const map = new Map<string, number | null>()
  for (const a of answers) {
    if (a.questionCode) map.set(a.questionCode, a.numericValue ?? null)
  }
  return map
}

function buildDomainMap(domains: DomainEntry[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const d of domains) {
    if (!d.domain || typeof d.score !== 'number') continue
    map.set(d.domain === 'Demanda' ? 'Demandas' : d.domain, d.score)
  }
  return map
}

function buildCsvRow(idx: number, collab: CollabData, resp: ResponseData | undefined): string {
  const answeredHse = resp?.hse_score !== null && resp?.hse_score !== undefined
  const answeredIetr = resp !== undefined && resp.remote_score !== null

  const ageRange = getAgeRange(decryptFieldOrNull(collab.birth_date))
  const answerMap = buildAnswerMap(resp?.answers ?? [])
  const hseDomMap = buildDomainMap(resp?.hse_domains ?? [])
  const ietrDomMap = buildDomainMap(resp?.remote_domains ?? [])

  const hseAnswers = HSE_CODES.map((c) => answeredHse ? csvCell(answerMap.get(c) ?? '') : '')
  const hseDoms = HSE_DOMAINS.map((d) => answeredHse ? csvCell(hseDomMap.get(d)?.toFixed(2) ?? '') : '')
  const ietrAnswers = REMOTE_CODES.map((c) => answeredIetr ? csvCell(answerMap.get(c) ?? '') : '')
  const ietrDoms = IETR_DOMAINS.map((d) => answeredIetr ? csvCell(ietrDomMap.get(d)?.toFixed(2) ?? '') : '')

  const hseScore = answeredHse ? csvCell(resp?.hse_score?.toFixed(2) ?? '') : ''
  const hseClass = answeredHse ? csvCell(resp?.hse_class ?? '') : ''
  const ietrStatus = answeredIetr ? 'Sim' : 'Não'
  const ietrScore = answeredIetr ? csvCell(resp?.remote_score?.toFixed(2) ?? '') : ''
  const ietrClass = answeredIetr ? csvCell(resp?.remote_class ?? '') : ''

  const cells: (string | number)[] = [
    idx + 1,
    csvCell(collab.area),
    csvCell(collab.role),
    csvCell(collab.gender),
    csvCell(collab.race_color),
    csvCell(collab.employment_type),
    csvCell(ageRange),
    answeredHse ? 'Sim' : 'Não',
    ...hseAnswers,
    ...hseDoms,
    hseScore,
    hseClass,
    ietrStatus,
    ...ietrAnswers,
    ...ietrDoms,
    ietrScore,
    ietrClass,
  ]

  return cells.join(';')
}

function buildFilters(params: URLSearchParams) {
  const filters: Record<string, string> = {}
  for (const key of ['area', 'role', 'gender', 'race_color', 'employment_type']) {
    const v = params.get(key)
    if (v) filters[key] = v
  }
  return filters
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)
  if (!manager) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!isSuperuser(manager.role)) {
    return NextResponse.json({ error: 'Apenas superuser pode exportar dados de risco.' }, { status: 403 })
  }

  const supabase = createServerClient()
  const mappingScope = await getMappingScopeContext(request, { requireMappingScope: true })
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  const filters = buildFilters(request.nextUrl.searchParams)

  let collabQuery = supabase
    .from('collaborators')
    .select('id, area, role, gender, race_color, employment_type, birth_date')
    .eq('mapping_id', mappingScope.mappingId)
  for (const [k, v] of Object.entries(filters)) {
    collabQuery = collabQuery.eq(k, v)
  }

  const { data: collabs, error: collabErr } = await collabQuery
  if (collabErr) return NextResponse.json({ error: collabErr.message }, { status: 500 })

  const allCollabs = (collabs ?? []) as CollabData[]
  const allIds = allCollabs.map((c) => c.id)
  const responseMap = new Map<string, ResponseData>()

  if (allIds.length > 0) {
    const { data: responses, error: respErr } = await supabase
      .from('responses')
      .select('collaborator_id, answers, hse_domains, hse_score, hse_class, remote_domains, remote_score, remote_class')
      .in('collaborator_id', allIds)
    if (respErr) return NextResponse.json({ error: respErr.message }, { status: 500 })

    for (const r of responses ?? []) {
      responseMap.set(r.collaborator_id, {
        answers: (r.answers as AnswerEntry[] | null) ?? [],
        hse_domains: (r.hse_domains as DomainEntry[] | null) ?? [],
        hse_score: typeof r.hse_score === 'number' ? r.hse_score : null,
        hse_class: r.hse_class ?? null,
        remote_domains: (r.remote_domains as DomainEntry[] | null) ?? [],
        remote_score: typeof r.remote_score === 'number' ? r.remote_score : null,
        remote_class: r.remote_class ?? null,
      })
    }
  }

  const hseDomCols = HSE_DOMAINS.map((d) => `hse_dom_${slugDomain(d)}`)
  const ietrDomCols = IETR_DOMAINS.map((d) => `ietr_dom_${slugDomain(d)}`)

  const headers = [
    'id_anonimo',
    'area', 'cargo', 'genero', 'raca_cor', 'vinculo', 'faixa_etaria',
    'respondeu_hse',
    ...HSE_CODES,
    ...hseDomCols,
    'hse_score', 'hse_classificacao',
    'respondeu_ietr',
    ...REMOTE_CODES,
    ...ietrDomCols,
    'ietr_score', 'ietr_classificacao',
  ]

  const rows = [
    headers.join(';'),
    ...allCollabs.map((c, i) => buildCsvRow(i, c, responseMap.get(c.id))),
  ]

  const csv = '\uFEFF' + rows.join('\r\n')
  const filename = `export-risco-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
