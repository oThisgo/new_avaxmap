import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getManagerFromSession, isSuperuser } from '@/lib/auth/manager'
import { getMappingScopeContext } from '@/lib/auth/mapping-scope'
import { decryptFieldOrNull } from '@/lib/security/crypto'
import { buildRiskReport, ReportPayload, StratumRow, IetrStratumRow } from '@/lib/reports/risk-pptx'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

// ─── Domain constants ─────────────────────────────────────────────────────────
const HSE_DOMAINS = [
  'Demandas', 'Controle', 'Apoio da Liderança', 'Apoio dos Colegas',
  'Relacionamentos', 'Cargo', 'Comunicação e Mudanças',
]
const IETR_DOMAINS = [
  'Demandas',
  'Controle',
  'Suporte',
  'Comunicação',
  'Papel',
  'Limites',
  'Ambiente',
  'Produtividade',
]

// ─── Types ────────────────────────────────────────────────────────────────────
interface CollabRow {
  id:              string
  area:            string | null
  role:            string | null
  gender:          string | null
  race_color:      string | null
  employment_type: string | null
  birth_date:      string | null
  education_level: string | null
  marital_status:  string | null
  disability:      string | null
  which_disability: string | null
  has_answered:    boolean
}

interface CollabForStratum extends CollabRow {
  age_range: string
}

interface DomainEntry { domain?: string; score?: number }

interface RespRow {
  collaborator_id: string
  hse_score:       number | null
  hse_class:       string | null
  hse_domains:     DomainEntry[] | null
  remote_score:    number | null
  remote_class:    string | null
  remote_domains:  DomainEntry[] | null
}

// ─── Request body ─────────────────────────────────────────────────────────────
interface ReportBody {
  clientName:        string
  clientDescription?: string
  stratum?:          string  // legacy: kept for backward compatibility
  clientLogoBase64?: string
  filters?:          Record<string, string>
  excludePj?:        boolean
}

const STRATUM_LABELS: Record<string, string> = {
  area:            'Área',
  role:            'Cargo',
  gender:          'Gênero',
  race_color:      'Raça / Cor',
  employment_type: 'Tipo de Vínculo',
  age_range:       'Faixa Etária',
}

const MERGED_AREA_LABEL_GENERAL = 'GESTÃO INSTITUCIONAL, DIGITAL/SAÚDE/INCLUSÃO'
const MERGED_AREA_ALIASES_GENERAL = new Set([
  'gestao institucional',
  'digital/saude/inclusao',
])

const MERGED_AREA_LABEL_EXCLUDE_PJ = 'DIGITAL / SAÚDE / INCLUSÃO, MARIA FARINHA FILMES E PRODUCOES LTDA'
const MERGED_AREA_ALIASES_EXCLUDE_PJ = new Set([
  'digital/saude/inclusao',
  'maria farinha filmes e producoes ltda',
])

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*[-–]\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function mergeAreaIfNeeded(value: string, excludePj: boolean): string {
  const normalized = normalizeText(value)
  if (excludePj && MERGED_AREA_ALIASES_EXCLUDE_PJ.has(normalized)) {
    return MERGED_AREA_LABEL_EXCLUDE_PJ
  }
  if (MERGED_AREA_ALIASES_GENERAL.has(normalized)) return MERGED_AREA_LABEL_GENERAL
  return value
}

function getStratumKey(collab: CollabForStratum, stratum: string, excludePj: boolean): string {
  if (stratum === 'age_range') return collab.age_range || 'Não informado'
  const raw = collab[stratum as keyof CollabRow]
  if (typeof raw !== 'string' || !raw.trim()) return 'Não informado'
  if (stratum === 'area') return mergeAreaIfNeeded(raw, excludePj)
  return raw
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getAgeRange(raw: string | null): string {
  if (!raw) return 'Não informado'
  let normalized = raw
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split('/')
    normalized = `${y}-${m}-${d}`
  }
  const birth = new Date(normalized)
  if (Number.isNaN(birth.getTime())) return 'Não informado'
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

function countBy<T>(arr: T[], key: (item: T) => string): { name: string; value: number }[] {
  const map = new Map<string, number>()
  for (const item of arr) {
    const k = key(item) || 'Não informado'
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
}

function hseClass(score: number | null): string | null {
  if (score === null) return null
  if (score >= 2.5) return 'Alto risco'
  if (score >= 1.5) return 'Risco moderado'
  return 'Baixo risco'
}

function avg(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null)
  if (valid.length === 0) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

function trunc1(value: number): number {
  return Math.trunc(value * 10) / 10
}

function pct1(part: number, total: number): number {
  return total > 0 ? trunc1((part / total) * 100) : 0
}

function normalizeDisability(raw: string | null): string {
  if (!raw) return 'Não possui'
  const n = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  if (n.includes('sim') || n.includes('possui') || n.includes('pcd')) return 'Possui'
  if (n.includes('nao') || n.includes('não')) return 'Não possui'
  return 'Não possui'
}

function isPjEmploymentType(raw: string | null): boolean {
  if (!raw) return false
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  return normalized === 'pj'
    || normalized.includes('pessoa juridica')
    || normalized.startsWith('pj ')
    || normalized.endsWith(' pj')
    || normalized.includes('(pj)')
}

function normalizeIetrDomain(domain: string): string {
  if (domain === 'Demanda') return 'Demandas'
  return domain
}

// ─── Aggregation ──────────────────────────────────────────────────────────────
function buildStratumRows(
  collabs:   CollabForStratum[],
  respMap:   Map<string, RespRow>,
  stratum:   string,
  excludePj: boolean,
): StratumRow[] {
  const groups = new Map<string, { total: number; answered: number; scores: (number | null)[]; domainSums: Record<string, number[]> }>()

  for (const c of collabs) {
    const key = getStratumKey(c, stratum, excludePj)
    if (!groups.has(key)) groups.set(key, { total: 0, answered: 0, scores: [], domainSums: {} })
    const g = groups.get(key)!
    g.total++
    const resp = respMap.get(c.id)
    if (resp) {
      g.answered++
      g.scores.push(resp.hse_score)
      for (const d of (resp.hse_domains ?? [])) {
        if (!d.domain || d.score === undefined) continue
        if (!g.domainSums[d.domain]) g.domainSums[d.domain] = []
        g.domainSums[d.domain].push(d.score)
      }
    }
  }

  const rows: StratumRow[] = []
  for (const [name, g] of groups) {
    if (g.answered < 5) continue

    const hseAvg    = avg(g.scores)
    const validScores = g.scores.filter((s): s is number => s !== null)
    const highCount = validScores.filter(s => s >= 2.5).length
    const modCount  = validScores.filter(s => s >= 1.5 && s < 2.5).length
    const lowCount  = validScores.filter(s => s < 1.5).length
    const total100  = highCount + modCount + lowCount

    const domainAvgs: Record<string, number | null> = {}
    for (const d of HSE_DOMAINS) {
      const vals = g.domainSums[d] ?? []
      domainAvgs[d] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
    }

    rows.push({
      name,
      total:     g.total,
      answered:  g.answered,
      hseAvg,
      hseClass:  hseClass(hseAvg),
      highPct:   pct1(highCount, total100),
      modPct:    pct1(modCount, total100),
      lowPct:    pct1(lowCount, total100),
      domainAvgs,
    })
  }
  return rows.sort((a, b) => (b.hseAvg ?? 0) - (a.hseAvg ?? 0))
}

function buildIetrStratumRows(
  collabs: CollabForStratum[],
  respMap: Map<string, RespRow>,
  stratum: string,
  excludePj: boolean,
): IetrStratumRow[] {
  const groups = new Map<string, { answered: number; scores: number[]; domainSums: Record<string, number[]> }>()

  for (const c of collabs) {
    const resp = respMap.get(c.id)
    if (!resp || resp.remote_score === null) continue
    const key = getStratumKey(c, stratum, excludePj)
    if (!groups.has(key)) groups.set(key, { answered: 0, scores: [], domainSums: {} })
    const g = groups.get(key)!
    g.answered++
    g.scores.push(resp.remote_score)
    for (const d of (resp.remote_domains ?? [])) {
      if (!d.domain || d.score === undefined) continue
      if (!g.domainSums[d.domain]) g.domainSums[d.domain] = []
      g.domainSums[d.domain].push(d.score)
    }
  }

  return Array.from(groups.entries())
    .filter(([, g]) => g.answered >= 5)
    .map(([name, g]) => {
      const ietrAvg = avg(g.scores)
      const riskCount = g.scores.filter(s => s < 3.0).length
      const attCount  = g.scores.filter(s => s >= 3.0 && s < 4.0).length
      const okCount   = g.scores.filter(s => s >= 4.0).length
      const total100  = riskCount + attCount + okCount

      let ietrClass: string | null = null
      if (ietrAvg !== null) {
        if (ietrAvg >= 4.0) ietrClass = 'Condição adequada'
        else if (ietrAvg >= 3.0) ietrClass = 'Zona de atenção'
        else ietrClass = 'Situação de risco'
      }

      const domainAvgs: Record<string, number | null> = {}
      for (const d of IETR_DOMAINS) {
        const vals = g.domainSums[d] ?? []
        domainAvgs[d] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
      }

      return {
        name,
        answered: g.answered,
        ietrAvg,
        ietrClass,
        highPct: pct1(riskCount, total100),
        modPct: pct1(attCount, total100),
        lowPct: pct1(okCount, total100),
        domainAvgs,
      }
    })
    .sort((a, b) => (a.ietrAvg ?? 5) - (b.ietrAvg ?? 5))
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  // Auth
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)
  if (!manager) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!isSuperuser(manager.role)) {
    return NextResponse.json({ error: 'Apenas superuser pode gerar relatórios.' }, { status: 403 })
  }

  // Parse body
  let body: ReportBody
  try {
    body = (await request.json()) as ReportBody
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const { clientName, clientDescription = '', stratum = 'area', clientLogoBase64, filters = {}, excludePj = false } = body
  if (!clientName?.trim()) {
    return NextResponse.json({ error: 'Nome do cliente é obrigatório.' }, { status: 400 })
  }
  if (!STRATUM_LABELS[stratum]) {
    return NextResponse.json({ error: 'Dimensão de estratificação inválida.' }, { status: 400 })
  }

  const supabase = createServerClient()
  const mappingScope = await getMappingScopeContext(request, { requireMappingScope: true })
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  // 1. Fetch collaborators
  let collabQuery = supabase
    .from('collaborators')
    .select('id, area, role, gender, race_color, employment_type, birth_date, education_level, marital_status, disability, which_disability, has_answered')
    .eq('mapping_id', mappingScope.mappingId)
  for (const [k, v] of Object.entries(filters)) {
    collabQuery = collabQuery.eq(k, v)
  }
  const { data: collabData, error: collabErr } = await collabQuery
  if (collabErr) return NextResponse.json({ error: collabErr.message }, { status: 500 })

  const collabs = ((collabData ?? []) as CollabRow[])
    .filter((c) => (excludePj ? !isPjEmploymentType(c.employment_type) : true))
  const collabsWithAge: CollabForStratum[] = collabs.map((c) => ({
    ...c,
    age_range: getAgeRange(decryptFieldOrNull(c.birth_date)),
  }))

  // Decrypt birth_date for answered collaborators
  const answeredCollabs = collabsWithAge.filter(c => c.has_answered)
  const decryptedCollabs = answeredCollabs.map(c => ({
    ...c,
    birth_date_dec: decryptFieldOrNull(c.birth_date),
    education_level_dec: decryptFieldOrNull(c.education_level),
    marital_status_dec:  decryptFieldOrNull(c.marital_status),
    disability_dec:      decryptFieldOrNull(c.disability),
    which_disability_dec: c.which_disability?.trim() || '',
  }))

  // 2. Fetch responses
  const answeredIds = answeredCollabs.map(c => c.id)
  const respMap = new Map<string, RespRow>()

  if (answeredIds.length > 0) {
    const { data: respData, error: respErr } = await supabase
      .from('responses')
      .select('collaborator_id, hse_score, hse_class, hse_domains, remote_score, remote_class, remote_domains')
      .in('collaborator_id', answeredIds)
    if (respErr) return NextResponse.json({ error: respErr.message }, { status: 500 })

    for (const r of respData ?? []) {
      respMap.set(r.collaborator_id, {
        collaborator_id: r.collaborator_id,
        hse_score:       typeof r.hse_score   === 'number' ? r.hse_score   : null,
        hse_class:       r.hse_class   ?? null,
        hse_domains:     (r.hse_domains  as DomainEntry[] | null) ?? null,
        remote_score:    typeof r.remote_score === 'number' ? r.remote_score : null,
        remote_class:    r.remote_class ?? null,
        remote_domains:  (r.remote_domains as DomainEntry[] | null) ?? null,
      })
    }
  }

  // 3. Demographics (answered collaborators only)
  const genderDist   = countBy(decryptedCollabs, c => c.gender        || 'Não informado')
  const raceDist     = countBy(decryptedCollabs, c => c.race_color     || 'Não informado')
  const ageRangeDist = countBy(decryptedCollabs, c => getAgeRange(c.birth_date_dec))
  const employDist   = countBy(decryptedCollabs, c => c.employment_type || 'Não informado')
  const educationDist = countBy(decryptedCollabs, c => c.education_level_dec || 'Não informado')
  const maritalDist   = countBy(decryptedCollabs, c => c.marital_status_dec || 'Não informado')
  const disabilityDist = countBy(decryptedCollabs, c => normalizeDisability(c.disability_dec))
  const disabilityTypeDist = countBy(
    decryptedCollabs.filter(c => c.which_disability_dec.length > 0),
    c => c.which_disability_dec,
  )

  // 4. Overall HSE
  const allHseScores = Array.from(respMap.values()).map(r => r.hse_score)
  const hseAvg = avg(allHseScores)
  const validHse = allHseScores.filter((s): s is number => s !== null)
  const hseClassDist = [
    { name: 'Alto risco',     value: validHse.filter(s => s >= 2.5).length },
    { name: 'Risco moderado', value: validHse.filter(s => s >= 1.5 && s < 2.5).length },
    { name: 'Baixo risco',    value: validHse.filter(s => s < 1.5).length },
  ]

  // Domain averages
  const domainAccum: Record<string, number[]> = {}
  for (const r of respMap.values()) {
    for (const d of (r.hse_domains ?? [])) {
      if (!d.domain || d.score === undefined) continue
      if (!domainAccum[d.domain]) domainAccum[d.domain] = []
      domainAccum[d.domain].push(d.score)
    }
  }
  const domainAvgs = HSE_DOMAINS
    .map(d => ({ domain: d, avg: avg(domainAccum[d] ?? []) }))
    .filter(d => d.avg !== null)
    .map(d => ({ domain: d.domain, avg: d.avg as number }))

  // 5. Per-stratum stats (always generate all configured stratification dimensions)
  const stratumRows = buildStratumRows(collabsWithAge, respMap, stratum, excludePj)
  const stratumKeysInOrder = Object.keys(STRATUM_LABELS)
  const sliceKeys = stratumKeysInOrder
  const stratifiedHse = sliceKeys.map((k) => ({
    stratum: k,
    stratumLabel: STRATUM_LABELS[k],
    stratumRows: buildStratumRows(collabsWithAge, respMap, k, excludePj),
  }))

  // 6. IETR stats
  const allRemoteScores = Array.from(respMap.values())
    .map(r => r.remote_score)
    .filter((s): s is number => s !== null)
  const hasIetr = allRemoteScores.length > 0
  const ietrAvg = hasIetr ? avg(allRemoteScores) : null
  const ietrClassDist = hasIetr ? [
    { name: 'Situação de risco',  value: allRemoteScores.filter(s => s < 3.0).length },
    { name: 'Zona de atenção',    value: allRemoteScores.filter(s => s >= 3.0 && s < 4.0).length },
    { name: 'Condição adequada',  value: allRemoteScores.filter(s => s >= 4.0).length },
  ] : []

  const ietrDomainAccum: Record<string, number[]> = {}
  for (const r of respMap.values()) {
    for (const d of (r.remote_domains ?? [])) {
      if (!d.domain || d.score === undefined) continue
      const normalizedDomain = normalizeIetrDomain(d.domain)
      if (!ietrDomainAccum[normalizedDomain]) ietrDomainAccum[normalizedDomain] = []
      ietrDomainAccum[normalizedDomain].push(d.score)
    }
  }
  const ietrDomainAvgs = IETR_DOMAINS
    .map(d => ({ domain: d, avg: avg(ietrDomainAccum[d] ?? []) }))
    .filter(d => d.avg !== null)
    .map(d => ({ domain: d.domain, avg: d.avg as number }))

  const ietrStratumRows = buildIetrStratumRows(collabsWithAge, respMap, stratum, excludePj)
  const stratifiedIetr = sliceKeys.map((k) => ({
    stratum: k,
    stratumLabel: STRATUM_LABELS[k],
    ietrStratumRows: buildIetrStratumRows(collabsWithAge, respMap, k, excludePj),
  }))

  // 7. Build payload
  const payload: ReportPayload = {
    clientName:        clientName.trim(),
    clientDescription: clientDescription?.trim() ?? '',
    stratum,
    stratumLabel:      STRATUM_LABELS[stratum],
    generatedAt:       new Date().toISOString(),
    filters,
    totalCollabs:      collabs.length,
    totalAnswered:     answeredIds.length,
    genderDist,
    raceDist,
    ageRangeDist,
    employDist,
    educationDist,
    maritalDist,
    disabilityDist,
    disabilityTypeDist,
    hseAvg,
    hseClassDist,
    domainAvgs,
    stratumRows,
    hseDomains:        HSE_DOMAINS,
    hasIetr,
    ietrAvg,
    ietrClassDist,
    ietrDomains:      IETR_DOMAINS,
    ietrDomainAvgs,
    ietrStratumRows,
    stratifiedHse,
    stratifiedIetr,
    clientLogoBase64,
    reportVariantLabel: excludePj ? 'Base analítica sem colaboradores com vínculo PJ' : undefined,
  }

  // 8. Generate PPTX
  let pptxBuffer: Uint8Array
  try {
    pptxBuffer = await buildRiskReport(payload)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Erro ao gerar relatório: ${msg}` }, { status: 500 })
  }

  const dateStr = new Date().toISOString().slice(0, 10)
  // Slice to get a plain ArrayBuffer (required by NextResponse BodyInit)
  const ab = pptxBuffer.buffer.slice(
    pptxBuffer.byteOffset,
    pptxBuffer.byteOffset + pptxBuffer.byteLength,
  ) as ArrayBuffer
  return new NextResponse(ab, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="relatorio-risco-${dateStr}.pptx"`,
      'Cache-Control':       'no-store',
    },
  })
}
