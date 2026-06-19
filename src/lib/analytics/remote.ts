import {
  IETR_CODES,
  IETR_DOMAIN_WEIGHTS,
  IETR_INVERTED_CODES,
  IETR_QUESTIONS,
  type IetrDomain,
} from './ietr-definition'

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

// ─── Mapeamento de domínios ─────────────────────────────────────────────────
const DOMAINS: Record<IetrDomain, string[]> = {
  Demandas: [],
  Controle: [],
  Suporte: [],
  Comunicação: [],
  Papel: [],
  Limites: [],
  Ambiente: [],
  Produtividade: [],
}

for (const question of IETR_QUESTIONS) {
  DOMAINS[question.domain].push(question.code)
}

const TOTAL_WEIGHT = Object.values(IETR_DOMAIN_WEIGHTS).reduce((s, v) => s + v, 0)

// ─── Tipos de retorno ─────────────────────────────────────────────────────────
export type RemoteClassification = 'Condição adequada' | 'Zona de atenção' | 'Situação de risco'

export interface RemoteAnswerResult {
  questionCode: string
  rawValue: string | null
  numericValue: number | null
  riskValue: number | null
}

export interface RemoteDomainResult {
  domain: IetrDomain
  weight: number
  score: number
  weightedScore: number
}

export interface RemoteResult {
  finalScore: number | null
  classification: RemoteClassification | null
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
  return IETR_INVERTED_CODES.has(code) ? 6 - value : value
}

// ─── Motor principal ──────────────────────────────────────────────────────────
export function calculateRemote(responses: Record<string, string | null>): RemoteResult {
  // 1. Processar apenas questões válidas do IETR canônico
  const answers: RemoteAnswerResult[] = IETR_CODES.map((code) => {
    const raw = responses[code] ?? null
    const numericValue = parseValue(raw)
    const riskValue = numericValue !== null ? applyTransformation(code, numericValue) : null
    return { questionCode: code, rawValue: raw, numericValue, riskValue }
  })

  // Se nenhuma resposta foi fornecida (usuário pulou o módulo IETR),
  // retorna sem score para não registrar score=0 incorretamente.
  const hasAnyAnswer = answers.some((a) => a.numericValue !== null)
  if (!hasAnyAnswer) {
    return { finalScore: null, classification: null, domains: [], answers }
  }

  // 2. Calcular score por domínio
  const domains: RemoteDomainResult[] = []
  let weightUsed = 0

  for (const [domain, items] of Object.entries(DOMAINS) as [IetrDomain, string[]][]) {
    const itemScores = items
      .map((code) => answers.find((a) => a.questionCode === code)?.riskValue)
      .filter((v): v is number => v !== null)

    if (itemScores.length === 0) continue

    const mediaDominio = itemScores.reduce((s, v) => s + v, 0) / itemScores.length
    const weight = IETR_DOMAIN_WEIGHTS[domain]
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
