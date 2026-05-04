import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

function buildFilters(params: URLSearchParams) {
  const filters: Record<string, string> = {}
  for (const key of ['area', 'role', 'gender', 'race_color', 'employment_type']) {
    const v = params.get(key)
    if (v) filters[key] = v
  }
  return filters
}

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

const REMOTE_QUESTIONS: QuestionMeta[] = [
  { domain: 'Demandas',     code: 'TR01', text: 'O volume de trabalho no formato remoto é compatível com o tempo disponível' },
  { domain: 'Demandas',     code: 'TR02', text: 'O ritmo de trabalho no formato remoto é adequado' },
  { domain: 'Controle',     code: 'TR03', text: 'Tenho autonomia para organizar minha rotina de trabalho remoto' },
  { domain: 'Controle',     code: 'TR04', text: 'Posso decidir como executar minhas atividades no trabalho remoto' },
  { domain: 'Suporte',      code: 'TR05', text: 'Os recursos tecnológicos disponíveis são adequados para o trabalho remoto' },
  { domain: 'Suporte',      code: 'TR06', text: 'Recebo o suporte necessário para realizar o trabalho remoto' },
  { domain: 'Comunicação',  code: 'TR07', text: 'A comunicação com a equipe ocorre de forma adequada no trabalho remoto' },
  { domain: 'Comunicação',  code: 'TR08', text: 'Há alinhamento suficiente para a execução das atividades' },
  { domain: 'Papel',        code: 'TR09', text: 'Tenho clareza sobre minhas responsabilidades no trabalho remoto' },
  { domain: 'Papel',        code: 'TR10', text: 'As expectativas em relação ao meu trabalho estão definidas' },
  { domain: 'Limites',      code: 'TR11', text: 'A jornada de trabalho remoto ocorre dentro do horário previsto' },
  { domain: 'Limites',      code: 'TR12', text: 'Há separação entre o tempo de trabalho e o tempo pessoal' },
  { domain: 'Ambiente',     code: 'TR13', text: 'O ambiente em que realizo o trabalho remoto é adequado' },
  { domain: 'Ambiente',     code: 'TR14', text: 'O ambiente doméstico apresenta interferências durante o trabalho' },
  { domain: 'Produtividade',code: 'TR15', text: 'O trabalho remoto permite a realização das atividades conforme esperado' },
  { domain: 'Produtividade',code: 'TR16', text: 'O trabalho remoto permite manter a concentração nas tarefas' },
]

const REMOTE_Q_BY_CODE = new Map(REMOTE_QUESTIONS.map((q) => [q.code, q]))

function classifyRemote(avg: number): 'Condição adequada' | 'Zona de atenção' | 'Situação de risco' {
  if (avg >= 4) return 'Condição adequada'
  if (avg >= 3) return 'Zona de atenção'
  return 'Situação de risco'
}

export async function GET(request: NextRequest) {
  const session = request.cookies.get('manager_session')?.value
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const filters = buildFilters(request.nextUrl.searchParams)

  let collabQuery = supabase.from('collaborators').select('id, remote_status')
  for (const [k, v] of Object.entries(filters)) {
    collabQuery = collabQuery.eq(k, v)
  }
  const { data: collabs, error: collabErr } = await collabQuery
  if (collabErr) return NextResponse.json({ error: collabErr.message }, { status: 500 })

  // Exclui colaboradores que explicitamente responderam que não trabalham remotamente.
  // Quem não tem remote_status (dados antigos) é mantido para compatibilidade.
  const NEGATIVE_REMOTE = /^n[aã]o/i
  const collaboratorIds = (collabs ?? [])
    .filter((c) => {
      const rs = (c as Record<string, unknown>).remote_status as string | null | undefined
      if (!rs) return true
      return !NEGATIVE_REMOTE.test(rs.trim())
    })
    .map((c) => c.id)
  if (collaboratorIds.length === 0) return NextResponse.json({ domains: [], class_distribution: [] })

  const { data: responses, error } = await supabase
    .from('responses')
    .select('remote_domains, remote_class, remote_score, answers')
    .in('collaborator_id', collaboratorIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const domainAgg: Record<string, { sum: number; count: number; weight: number }> = {}
  const questionAgg: Record<string, { sum: number; count: number }> = {}
  const classMap: Record<string, number> = {}
  let scoreSum = 0, scoreCount = 0

  for (const r of responses ?? []) {
    if (r.remote_class) classMap[r.remote_class] = (classMap[r.remote_class] ?? 0) + 1
    if ((r as { remote_score?: number | null }).remote_score != null) { scoreSum += (r as { remote_score: number }).remote_score; scoreCount++ }
    if (Array.isArray(r.remote_domains)) {
      for (const d of r.remote_domains as RemoteDomainEntry[]) {
        if (!domainAgg[d.domain]) domainAgg[d.domain] = { sum: 0, count: 0, weight: d.weight }
        domainAgg[d.domain].sum += d.score
        domainAgg[d.domain].count++
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
        question_text: q.text,
        avg_score: avg,
        classification: classifyRemote(avg),
        responses: agg.count,
      }
    })
    .filter((q): q is NonNullable<typeof q> => q !== null)

  return NextResponse.json({ domains, class_distribution, avg_score, question_risk })
}
