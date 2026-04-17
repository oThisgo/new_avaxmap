// ─── Escala HSE ──────────────────────────────────────────────────────────────
// 0 = Nunca | 1 = Raramente | 2 = Às vezes | 3 = Frequentemente | 4 = Sempre

const HSE_SCALE: Record<string, number> = {
  'nunca': 0,
  'raramente': 1,
  'às vezes': 2,
  'as vezes': 2,
  'frequentemente': 3,
  'sempre': 4,
}

// ─── Itens protetivos: score = 4 - resposta ──────────────────────────────────
// Itens não protetivos: score = resposta
const PROTECTIVE = new Set([
  'Q01', 'Q02', 'Q04', 'Q07', 'Q08',
  'Q10', 'Q11', 'Q13', 'Q15', 'Q17', 'Q19',
  'Q23', 'Q24', 'Q25', 'Q26', 'Q27',
  'Q28', 'Q29', 'Q30', 'Q31', 'Q32', 'Q33', 'Q35',
])

// ─── Mapeamento de domínios ───────────────────────────────────────────────────
const DOMAINS: Record<string, string[]> = {
  'Demandas':               ['Q03', 'Q06', 'Q09', 'Q12', 'Q16', 'Q18', 'Q20', 'Q22'],
  'Controle':               ['Q02', 'Q10', 'Q15', 'Q19', 'Q25', 'Q30'],
  'Apoio da Chefia':        ['Q08', 'Q23', 'Q29', 'Q33', 'Q35'],
  'Apoio dos Colegas':      ['Q07', 'Q24', 'Q27', 'Q31'],
  'Relacionamentos':        ['Q05', 'Q14', 'Q21', 'Q34'],
  'Cargo':                  ['Q01', 'Q04', 'Q11', 'Q13', 'Q17'],
  'Comunicação e Mudanças': ['Q26', 'Q28', 'Q32'],
}

const WEIGHTS: Record<string, number> = {
  'Demandas':               0.20,
  'Controle':               0.15,
  'Apoio da Chefia':        0.15,
  'Apoio dos Colegas':      0.10,
  'Relacionamentos':        0.15,
  'Cargo':                  0.10,
  'Comunicação e Mudanças': 0.15,
}

// ─── Tipos de retorno ─────────────────────────────────────────────────────────
export type HseClassification = 'Baixo risco' | 'Risco moderado' | 'Alto risco'

export interface HseAnswerResult {
  questionCode: string
  rawValue: string | null
  numericValue: number | null
  riskValue: number | null
}

export interface HseDomainResult {
  domain: string
  weight: number
  score: number
  weightedScore: number
}

export interface HseResult {
  finalScore: number
  classification: HseClassification
  domains: HseDomainResult[]
  answers: HseAnswerResult[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseValue(raw: string | null): number | null {
  if (!raw) return null
  const key = raw.toLowerCase().trim()
  const v = HSE_SCALE[key]
  return v !== undefined ? v : null
}

function applyTransformation(code: string, value: number): number {
  return PROTECTIVE.has(code) ? 4 - value : value
}

// ─── Motor principal ──────────────────────────────────────────────────────────
export function calculateHSE(responses: Record<string, string | null>): HseResult {
  // 1. Processar cada resposta
  const answers: HseAnswerResult[] = Object.entries(responses).map(([code, raw]) => {
    const numericValue = parseValue(raw)
    const riskValue = numericValue !== null ? applyTransformation(code, numericValue) : null
    return { questionCode: code, rawValue: raw, numericValue, riskValue }
  })

  // 2. Calcular score por domínio
  const domains: HseDomainResult[] = []
  let totalWeightUsed = 0

  for (const [domain, items] of Object.entries(DOMAINS)) {
    const itemScores = items
      .map((code) => answers.find((a) => a.questionCode === code)?.riskValue)
      .filter((v): v is number => v !== null)

    if (itemScores.length === 0) continue // domínio sem respostas — ignora

    const score = itemScores.reduce((s, v) => s + v, 0) / itemScores.length
    const weight = WEIGHTS[domain]
    const weightedScore = score * weight
    totalWeightUsed += weight

    domains.push({ domain, weight, score, weightedScore })
  }

  // 3. Score final ponderado (normalizado pelo peso efetivamente usado)
  const rawTotal = domains.reduce((s, d) => s + d.weightedScore, 0)
  const finalScore = totalWeightUsed > 0 ? rawTotal / totalWeightUsed : 0

  // 4. Classificação
  const classification: HseClassification =
    finalScore < 1.5 ? 'Baixo risco' :
    finalScore < 2.5 ? 'Risco moderado' :
    'Alto risco'

  return { finalScore, classification, domains, answers }
}
