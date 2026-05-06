// ─── Escala IETR ─────────────────────────────────────────────────────────────
// 1 = Nunca | 2 = Raramente | 3 = Às vezes | 4 = Frequentemente | 5 = Sempre

const REMOTE_SCALE: Record<string, number> = {
  'nunca': 1,
  'raramente': 2,
  'às vezes': 3,
  'as vezes': 3,
  'frequentemente': 4,
  'sempre': 5,
}

// ─── Questões negativamente phrased: score = 6 - resposta ─────────────────
// TRN01: "Sinto sobrecarga..."  → mais frequência = pior
// TRN02: "Trabalho além do horário" → mais frequência = pior
const INVERTED = new Set(['TRN01', 'TRN02'])

// ─── Mapeamento de domínios ───────────────────────────────────────────────────
const DOMAINS: Record<string, string[]> = {
  'Demanda':  ['TRN01'],
  'Controle': ['TRN02', 'TRN03'],
}

// Pesos absolutos — IETR = Σ(media_dominio * peso) / Σ(pesos)
const WEIGHTS: Record<string, number> = {
  'Demanda':  2.0,
  'Controle': 1.5,
}

const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((s, v) => s + v, 0) // 3.5

// ─── Tipos de retorno ─────────────────────────────────────────────────────────
export type RemoteClassification = 'Condição adequada' | 'Zona de atenção' | 'Situação de risco'

export interface RemoteAnswerResult {
  questionCode: string
  rawValue: string | null
  numericValue: number | null
  riskValue: number | null
}

export interface RemoteDomainResult {
  domain: string
  weight: number
  score: number
  weightedScore: number
}

export interface RemoteResult {
  finalScore: number
  classification: RemoteClassification
  domains: RemoteDomainResult[]
  answers: RemoteAnswerResult[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseValue(raw: string | null): number | null {
  if (!raw) return null
  const key = raw.toLowerCase().trim()
  const v = REMOTE_SCALE[key]
  return v !== undefined ? v : null
}

function applyTransformation(code: string, value: number): number {
  return INVERTED.has(code) ? 6 - value : value
}

// ─── Motor principal ──────────────────────────────────────────────────────────
export function calculateRemote(responses: Record<string, string | null>): RemoteResult {
  // 1. Processar cada resposta
  const answers: RemoteAnswerResult[] = Object.entries(responses).map(([code, raw]) => {
    const numericValue = parseValue(raw)
    const riskValue = numericValue !== null ? applyTransformation(code, numericValue) : null
    return { questionCode: code, rawValue: raw, numericValue, riskValue }
  })

  // 2. Calcular score por domínio
  const domains: RemoteDomainResult[] = []
  let weightUsed = 0

  for (const [domain, items] of Object.entries(DOMAINS)) {
    const itemScores = items
      .map((code) => answers.find((a) => a.questionCode === code)?.riskValue)
      .filter((v): v is number => v !== null)

    if (itemScores.length === 0) continue

    const mediaDominio = itemScores.reduce((s, v) => s + v, 0) / itemScores.length
    const weight = WEIGHTS[domain]
    const weightedScore = mediaDominio * weight
    weightUsed += weight

    domains.push({ domain, weight, score: mediaDominio, weightedScore })
  }

  // 3. IETR = Σ(score_ponderado) / Σ(pesos usados)
  const rawTotal = domains.reduce((s, d) => s + d.weightedScore, 0)
  const denominator = weightUsed > 0 ? weightUsed : TOTAL_WEIGHT
  const finalScore = rawTotal / denominator

  // 4. Classificação
  const classification: RemoteClassification =
    finalScore >= 4.0 ? 'Condição adequada' :
    finalScore >= 3.0 ? 'Zona de atenção' :
    'Situação de risco'

  return { finalScore, classification, domains, answers }
}
