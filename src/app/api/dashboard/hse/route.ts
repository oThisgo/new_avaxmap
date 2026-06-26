import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getMappingScopeContext } from '@/lib/auth/mapping-scope'

function buildFilters(params: URLSearchParams) {
  const filters: Record<string, string> = {}
  for (const key of ['area', 'role', 'gender', 'race_color', 'employment_type']) {
    const v = params.get(key)
    if (v) filters[key] = v
  }
  return filters
}

interface HseDomainEntry {
  domain: string
  weight: number
  score: number
  weightedScore: number
}

interface ResponseAnswerEntry {
  questionCode?: string
  riskValue?: number | null
}

type DistItem = { name: string; value: number }

type QuestionMeta = {
  domain: string
  code: string
  text: string
}

const HSE_QUESTIONS: QuestionMeta[] = [
  { domain: 'Demandas', code: 'Q03', text: 'As exigências de trabalho feitas por colegas e liderança direta são difíceis de combinar' },
  { domain: 'Demandas', code: 'Q06', text: 'Os prazos definidos para minhas atividades são difíceis de serem cumpridos' },
  { domain: 'Demandas', code: 'Q09', text: 'Meu trabalho exige que eu trabalhe em um ritmo muito intenso' },
  { domain: 'Demandas', code: 'Q12', text: 'Eu não faço algumas tarefas porque tenho muita coisa para fazer' },
  { domain: 'Demandas', code: 'Q16', text: 'Não tenho possibilidade de fazer pausas suficientes' },
  { domain: 'Demandas', code: 'Q18', text: 'Sinto-me pressionado a trabalhar fora do meu horário de trabalho' },
  { domain: 'Demandas', code: 'Q20', text: 'Tenho que fazer meu trabalho com muita rapidez' },
  { domain: 'Demandas', code: 'Q22', text: 'Na prática, é difícil ou impossível fazer pequenas pausas durante o trabalho' },

  { domain: 'Controle', code: 'Q02', text: 'Posso decidir quando fazer uma pausa' },
  { domain: 'Controle', code: 'Q10', text: 'Consideram a minha opinião sobre o ritmo em que realizo meu trabalho.' },
  { domain: 'Controle', code: 'Q15', text: 'Tenho liberdade de escolha de como fazer meu trabalho' },
  { domain: 'Controle', code: 'Q19', text: 'Tenho liberdade para decidir o que fazer no meu trabalho' },
  { domain: 'Controle', code: 'Q25', text: 'Minhas sugestões são consideradas sobre como fazer meu trabalho' },
  { domain: 'Controle', code: 'Q30', text: 'O meu horário de trabalho pode ser flexível' },

  { domain: 'Apoio da Liderança', code: 'Q08', text: 'Recebo informações e suporte que me ajudam no trabalho que eu faço' },
  { domain: 'Apoio da Liderança', code: 'Q23', text: 'Posso confiar em minha liderança quando eu tiver problemas no trabalho' },
  { domain: 'Apoio da Liderança', code: 'Q29', text: 'Quando algo no trabalho me perturba ou irrita posso falar com minha liderança' },
  { domain: 'Apoio da Liderança', code: 'Q33', text: 'Tenho suportado trabalhos emocionalmente exigentes' },
  { domain: 'Apoio da Liderança', code: 'Q35', text: 'Minha liderança me incentiva no trabalho' },

  { domain: 'Apoio dos Colegas', code: 'Q07', text: 'Quando o trabalho se torna difícil, posso contar com a ajuda dos meus colegas' },
  { domain: 'Apoio dos Colegas', code: 'Q24', text: 'Meus colegas me ajudam e me dão apoio quando eu preciso' },
  { domain: 'Apoio dos Colegas', code: 'Q27', text: 'No trabalho os meus colegas demonstram o respeito que mereço' },
  { domain: 'Apoio dos Colegas', code: 'Q31', text: 'Os meus colegas estão disponíveis para escutar os meus problemas de trabalho' },

  { domain: 'Relacionamentos', code: 'Q05', text: 'Falam ou se comportam comigo de forma ríspida ou desrespeitosa' },
  { domain: 'Relacionamentos', code: 'Q14', text: 'Existem conflitos entre os colegas' },
  { domain: 'Relacionamentos', code: 'Q21', text: 'Sinto que sou perseguido no trabalho' },
  { domain: 'Relacionamentos', code: 'Q34', text: 'As relações no trabalho são tensas' },

  { domain: 'Cargo', code: 'Q01', text: 'Tenho clareza sobre o que se espera de mim no trabalho' },
  { domain: 'Cargo', code: 'Q04', text: 'Eu sei como fazer o meu trabalho' },
  { domain: 'Cargo', code: 'Q11', text: 'Estão claras as minhas tarefas e responsabilidades.' },
  { domain: 'Cargo', code: 'Q13', text: 'Os objetivos e metas da minha área são claros para mim' },
  { domain: 'Cargo', code: 'Q17', text: 'Eu vejo como o meu trabalho contribui com os objetivos da empresa' },

  { domain: 'Comunicação e Mudanças', code: 'Q26', text: 'Tenho oportunidades para pedir explicações a minha liderança sobre as mudanças relacionadas ao meu trabalho' },
  { domain: 'Comunicação e Mudanças', code: 'Q28', text: 'As pessoas são sempre consultadas sobre as mudanças no trabalho' },
  { domain: 'Comunicação e Mudanças', code: 'Q32', text: 'Quando há mudanças, faço o meu trabalho com a mesma dedicação' },
]

const QUESTION_META_BY_CODE = new Map(HSE_QUESTIONS.map((q) => [q.code, q]))

function classifyRisk(avg: number): 'Baixo risco' | 'Risco moderado' | 'Alto risco' {
  if (avg >= 2.5) return 'Alto risco'
  if (avg >= 1.5) return 'Risco moderado'
  return 'Baixo risco'
}

function splitDisabilityValues(raw: string): string[] {
  return raw
    .split(/[,;|/]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

async function getDisabilityTypes(
  supabase: ReturnType<typeof createServerClient>,
  collaboratorIds: string[],
): Promise<DistItem[]> {
  const map: Record<string, number> = {}

  const which = await supabase
    .from('collaborators')
    .select('which_disability')
    .in('id', collaboratorIds)

  if (which.error) return []

  for (const row of which.data ?? []) {
    const value = (row as Record<string, unknown>).which_disability
    if (typeof value !== 'string' || !value.trim()) continue
    for (const item of splitDisabilityValues(value)) {
      map[item] = (map[item] ?? 0) + 1
    }
    }

  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

export async function GET(request: NextRequest) {
  const session = request.cookies.get('manager_session')?.value
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mappingScope = await getMappingScopeContext(request, { requireMappingScope: true })
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  const supabase = createServerClient()
  const filters = buildFilters(request.nextUrl.searchParams)

  let collabQuery = supabase
    .from('collaborators')
    .select('id')
    .eq('mapping_id', mappingScope.mappingId)
  for (const [k, v] of Object.entries(filters)) {
    collabQuery = collabQuery.eq(k, v)
  }
  const { data: collabs, error: collabErr } = await collabQuery
  if (collabErr) return NextResponse.json({ error: collabErr.message }, { status: 500 })

  const collaboratorIds = (collabs ?? []).map((c) => c.id)
  if (collaboratorIds.length === 0) {
    return NextResponse.json({ domains: [], class_distribution: [], avg_score: null, disability_types: [], question_risk: [] })
  }

  const { data: responses, error } = await supabase
    .from('responses')
    .select('hse_domains, hse_class, hse_score, answers')
    .in('collaborator_id', collaboratorIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aggregate domain scores
  const domainAgg: Record<string, { sum: number; count: number; weight: number }> = {}
  const questionAgg: Record<string, { sum: number; count: number }> = {}
  const classMap: Record<string, number> = {}
  let scoreSum = 0, scoreCount = 0

  for (const r of responses ?? []) {
    if (r.hse_class) classMap[r.hse_class] = (classMap[r.hse_class] ?? 0) + 1
    if ((r as { hse_score?: number | null }).hse_score != null) { scoreSum += (r as { hse_score: number }).hse_score; scoreCount++ }
    if (!Array.isArray(r.hse_domains)) continue
    for (const d of r.hse_domains as HseDomainEntry[]) {
      if (!domainAgg[d.domain]) domainAgg[d.domain] = { sum: 0, count: 0, weight: d.weight }
      domainAgg[d.domain].sum += d.score
      domainAgg[d.domain].count++
    }

    if (!Array.isArray((r as { answers?: ResponseAnswerEntry[] | null }).answers)) continue
    for (const answer of (r as { answers: ResponseAnswerEntry[] }).answers) {
      const code = answer.questionCode
      if (!code || !QUESTION_META_BY_CODE.has(code) || answer.riskValue == null) continue
      if (!questionAgg[code]) questionAgg[code] = { sum: 0, count: 0 }
      questionAgg[code].sum += answer.riskValue
      questionAgg[code].count++
    }
  }

  const domains = Object.entries(domainAgg).map(([name, { sum, count, weight }]) => {
    const avg = count > 0 ? Math.round((sum / count) * 100) / 100 : 0
    const classification = classifyRisk(avg)
    return { name, avg_score: avg, weight, classification }
  })

  const class_distribution = Object.entries(classMap).map(([name, value]) => ({ name, value }))
  const avg_score = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) / 100 : null
  const disability_types = await getDisabilityTypes(supabase, collaboratorIds)
  const question_risk = HSE_QUESTIONS
    .map((q) => {
      const agg = questionAgg[q.code]
      if (!agg || agg.count === 0) return null
      const avg = Math.round((agg.sum / agg.count) * 100) / 100
      return {
        domain: q.domain,
        question_code: q.code,
        question_text: q.text,
        avg_score: avg,
        classification: classifyRisk(avg),
        responses: agg.count,
      }
    })
    .filter((q): q is NonNullable<typeof q> => q !== null)

  return NextResponse.json({ domains, class_distribution, avg_score, disability_types, question_risk })
}
