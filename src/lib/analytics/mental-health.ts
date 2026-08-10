/**
 * Motor analítico do módulo SAÚDE MENTAL.
 *
 * Função pura: respostas brutas (+ gênero do colaborador) → flags descritivas,
 * níveis, notas por componente, média ponderada, índice e classificação.
 *
 * Não existe tabela de fórmulas nem passo de recálculo em SQL: o resultado é
 * derivado das respostas cruas sempre que necessário. O que é gravado junto da
 * resposta é apenas um cache desta função, recalculável a qualquer momento com
 * `calculateMentalHealth(answers, { gender })`.
 *
 * Regra transversal (§6.0.1 da especificação): componente **sem resposta** tem
 * nota `null` e seu peso **sai do denominador**. Nota 0 é reservada para a pior
 * situação efetivamente declarada. Ausência de dado nunca é penalidade.
 */

import {
  DEPRESSION_SYMPTOM_OPTIONS,
  INTERNET_FIELDS,
  LIFE_EVENT_OPTIONS,
  LIFE_EVENT_OTHER_FIELD,
  MENTAL_HEALTH_CONDITIONAL_FIELDS,
  MENTAL_HEALTH_FIELDS,
  MENTAL_HEALTH_QUESTIONS,
  SMOKING_ACTIVE_VALUE,
  STRESS_SOURCE_OPTIONS,
  STRESS_SYMPTOM_OPTIONS,
  SUBSTANCE_USED_OPTIONS,
  SUICIDE_SYMPTOM_OPTIONS,
  SUPPORT_NOBODY_FIELD,
  SUPPORT_OTHER_FIELD,
  SUPPORT_SOURCE_OPTIONS,
  type CheckboxOption,
  type MentalHealthFieldMeta,
} from './mental-health-definition'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type MentalHealthAnswerValue = boolean | number | string | null
export type MentalHealthAnswers = Record<string, MentalHealthAnswerValue>

export type SymptomLevel =
  | 'Ausência de Sintomas'
  | 'Sintomas Leves'
  | 'Sintomas Moderados'
  | 'Sintomas Graves'

export type TobaccoCategory =
  | 'Não fumante'
  | 'Ex-fumante'
  | 'Fumante passivo'
  | 'Fumante'
  | 'Não Informado'

export type AlcoholCategory =
  | 'Não Bebe'
  | 'Consumo Moderado'
  | 'Padrão Binge'
  | 'Não Informado'

export type InternetLevel = 'Ausente' | 'Leve' | 'Moderada' | 'Alta' | 'Não Informado'

export type SupportPresence = 'Sim' | 'Não' | 'Não Informado'

export type MentalHealthClassification =
  | 'Insatisfatório'
  | 'Regular'
  | 'Bom'
  | 'Excelente'
  | 'Sem dados'

export type MentalHealthComponentKey =
  | 'estresse'
  | 'sintomas_depressivos'
  | 'tabaco'
  | 'alcool'
  | 'internet'
  | 'rede_de_apoio'
  | 'percepcao_saude'
  | 'qualidade_de_vida'

export interface MentalHealthComponent {
  key: MentalHealthComponentKey
  label: string
  weight: number
  /** Nota 0–10, ou `null` quando o componente não foi respondido. */
  score: number | null
  /** Nível/categoria textual correspondente à nota. */
  detail: string | null
}

export interface MentalHealthResult {
  stress: { symptomCount: number; level: SymptomLevel; score: number }
  depression: { symptomCount: number; level: SymptomLevel; score: number }
  suicide: { indicatorCount: number; atRisk: boolean; divisor: 1 | 2 }
  tobacco: { category: TobaccoCategory; score: number | null; cigarettesPerDay: number | null }
  alcohol: {
    category: AlcoholCategory
    score: number | null
    doses: number | null
    bingeThreshold: number
    genderKnown: boolean
  }
  internet: { affirmativeCount: number; level: InternetLevel; score: number | null }
  support: { sourceCount: number; presence: SupportPresence; score: number | null }
  perception: { healthScore: number | null; lifeQualityScore: number | null }
  disaster: { exposed: boolean | null; type: number | null; contact: number | null }
  components: MentalHealthComponent[]
  /** Soma dos pesos dos componentes efetivamente respondidos (máx. 17). */
  weightPresent: number
  /** Média ponderada dos componentes respondidos (escala 0–10). */
  componentsMean: number | null
  /** Índice de Saúde Mental = média ponderada ÷ divisor de suicídio. */
  index: number | null
  classification: MentalHealthClassification
  /** Contagens descritivas 0/1 de cada campo booleano, chaveadas pelo campo. */
  flags: Record<string, number>
}

// ─── Pesos e limiares ────────────────────────────────────────────────────────

export const MENTAL_HEALTH_COMPONENT_WEIGHTS: Record<MentalHealthComponentKey, number> = {
  estresse: 3,
  sintomas_depressivos: 3,
  tabaco: 1,
  alcool: 2,
  internet: 2,
  rede_de_apoio: 2,
  percepcao_saude: 2,
  qualidade_de_vida: 2,
}

export const MENTAL_HEALTH_TOTAL_WEIGHT = Object.values(MENTAL_HEALTH_COMPONENT_WEIGHTS)
  .reduce((sum, weight) => sum + weight, 0)

/**
 * Piso de confiabilidade: abaixo desta soma de pesos presentes (~60% de 17) o
 * índice não é comparável com um índice completo e sai como `Sem dados` em vez
 * de publicar um número frágil.
 */
export const MENTAL_HEALTH_MIN_WEIGHT = 10

const COMPONENT_LABELS: Record<MentalHealthComponentKey, string> = {
  estresse: 'Estresse',
  sintomas_depressivos: 'Sintomas Depressivos',
  tabaco: 'Tabaco',
  alcool: 'Álcool',
  internet: 'Dependência de Internet',
  rede_de_apoio: 'Rede de Apoio',
  percepcao_saude: 'Percepção de Saúde',
  qualidade_de_vida: 'Qualidade de Vida',
}

/** Limiar de consumo binge por gênero: 5 doses para homens, 4 para os demais. */
const BINGE_THRESHOLD_MALE = 5
const BINGE_THRESHOLD_DEFAULT = 4

const MALE_GENDER_TOKENS = new Set(['1', 'm', 'h', 'homem', 'masculino', 'male', 'man'])

const COMBINING_MARKS = /[̀-ͯ]/g

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '')
}

/**
 * Resolve o limiar de binge a partir do gênero do colaborador. Gênero
 * desconhecido cai no limiar conservador (4) — a linha nunca é descartada por
 * falta de gênero.
 */
export function resolveBingeThreshold(gender: string | null | undefined): {
  threshold: number
  genderKnown: boolean
} {
  const normalized = stripDiacritics(gender ?? '').trim().toLowerCase()

  if (!normalized) return { threshold: BINGE_THRESHOLD_DEFAULT, genderKnown: false }
  if (MALE_GENDER_TOKENS.has(normalized)) return { threshold: BINGE_THRESHOLD_MALE, genderKnown: true }
  return { threshold: BINGE_THRESHOLD_DEFAULT, genderKnown: true }
}

// ─── Normalização ────────────────────────────────────────────────────────────

const CHECKBOX_GROUP_CODES = new Set(
  MENTAL_HEALTH_QUESTIONS.filter((q) => q.kind === 'checkbox_group').map((q) => q.code),
)

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return null
}

function coerceInteger(value: unknown, meta: MentalHealthFieldMeta): number | null {
  let parsed: number | null = null
  if (typeof value === 'number' && Number.isFinite(value)) parsed = Math.trunc(value)
  else if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim())
    if (Number.isFinite(n)) parsed = Math.trunc(n)
  }
  if (parsed === null) return null

  if (meta.allowedValues && !meta.allowedValues.includes(parsed)) return null
  if (meta.min !== undefined && parsed < meta.min) return null
  if (meta.max !== undefined && parsed > meta.max) return null
  return parsed
}

function coerceText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Zera para `null` cada campo cujo bloco condicional está oculto (§2.4). É a
 * regra que impede resíduos como "cigarros por dia" preenchido para quem
 * declarou não ser fumante. Aplicada tanto na digitação (formulário) quanto na
 * entrada do backend.
 */
export function clearHiddenConditionalFields(answers: MentalHealthAnswers): MentalHealthAnswers {
  const next = { ...answers }
  for (const { field, rule } of MENTAL_HEALTH_CONDITIONAL_FIELDS) {
    if (next[rule.field] !== rule.equals) next[field] = null
  }
  return next
}

/** Estado inicial do formulário: checkboxes em `false`, demais campos em `null`. */
export function createEmptyMentalHealthAnswers(): MentalHealthAnswers {
  return normalizeMentalHealthAnswers({})
}

/**
 * Coage o payload cru ao contrato de dados e aplica a limpeza dos campos
 * condicionais: quando o gatilho não é satisfeito, o dependente vai a `null`
 * (§2.4) — em vez de guardar o resíduo do último valor digitado.
 *
 * Checkbox de grupo desmarcado vira `false` explícito, nunca `null`, para
 * separar "não marcou" de "não respondeu".
 */
export function normalizeMentalHealthAnswers(raw: unknown): MentalHealthAnswers {
  const input = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? raw as Record<string, unknown>
    : {}

  const answers: MentalHealthAnswers = {}

  for (const meta of MENTAL_HEALTH_FIELDS) {
    const value = input[meta.field]

    if (meta.type === 'boolean') {
      const coerced = coerceBoolean(value)
      answers[meta.field] = coerced ?? (CHECKBOX_GROUP_CODES.has(meta.code) ? false : null)
      continue
    }

    if (meta.type === 'integer') {
      answers[meta.field] = coerceInteger(value, meta)
      continue
    }

    answers[meta.field] = coerceText(value)
  }

  return clearHiddenConditionalFields(answers)
}

// ─── Validação ───────────────────────────────────────────────────────────────

/**
 * Invariantes do contrato de dados (§8.0), verificadas sobre as respostas já
 * normalizadas. As invariantes de "campo condicional oculto deve ser null" são
 * garantidas por construção em `normalizeMentalHealthAnswers`.
 */
export function validateMentalHealthAnswers(answers: MentalHealthAnswers): string[] {
  const errors: string[] = []

  for (const question of MENTAL_HEALTH_QUESTIONS) {
    if (question.kind === 'checkbox_group' || !question.required) continue

    // Campo condicional só é obrigatório enquanto seu gatilho está satisfeito.
    if (question.visibleWhen && answers[question.visibleWhen.field] !== question.visibleWhen.equals) continue

    if (answers[question.field] === null || answers[question.field] === undefined) {
      errors.push(`Responda: ${question.text}`)
    }
  }

  const nobody = answers[SUPPORT_NOBODY_FIELD] === true
  const supportCount = countSupportSources(answers)

  if (nobody && supportCount > 0) {
    errors.push('Rede de apoio: "Ninguém" não pode ser marcado junto com outras fontes de apoio.')
  }
  if (!nobody && supportCount === 0) {
    errors.push('Rede de apoio: indique ao menos uma fonte de apoio ou marque "Ninguém".')
  }

  return errors
}

// ─── Helpers de contagem ─────────────────────────────────────────────────────

function countTrue(answers: MentalHealthAnswers, options: readonly CheckboxOption[]): number {
  return options.reduce((total, option) => total + (answers[option.field] === true ? 1 : 0), 0)
}

function hasText(value: MentalHealthAnswerValue): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function countSupportSources(answers: MentalHealthAnswers): number {
  return countTrue(answers, SUPPORT_SOURCE_OPTIONS) + (hasText(answers[SUPPORT_OTHER_FIELD]) ? 1 : 0)
}

function symptomLevel(count: number): SymptomLevel {
  if (count < 1) return 'Ausência de Sintomas'
  if (count < 2) return 'Sintomas Leves'
  // Corte < 5: alinha "Sintomas Graves" ao limiar do DSM-5 (≥5 sintomas em duas
  // semanas) e mantém a mesma régua nos blocos de estresse e depressão.
  if (count < 5) return 'Sintomas Moderados'
  return 'Sintomas Graves'
}

function symptomScore(level: SymptomLevel): number {
  if (level === 'Ausência de Sintomas') return 10
  if (level === 'Sintomas Leves') return 7
  if (level === 'Sintomas Moderados') return 3
  return 0
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// ─── Blocos derivados ────────────────────────────────────────────────────────

function deriveTobacco(answers: MentalHealthAnswers): {
  category: TobaccoCategory
  score: number | null
} {
  switch (answers.substance_smoking) {
    case 1: return { category: 'Não fumante', score: 10 }
    case 2: return { category: 'Ex-fumante', score: 5 }
    case 3: return { category: 'Fumante passivo', score: 5 }
    case 4: return { category: 'Fumante', score: 0 }
    default: return { category: 'Não Informado', score: null }
  }
}

function deriveAlcohol(
  answers: MentalHealthAnswers,
  threshold: number,
): { category: AlcoholCategory; score: number | null } {
  const use = answers.substance_alcohol_use
  const doses = answers.substance_drinking_doses

  if (use === false) return { category: 'Não Bebe', score: 10 }
  if (use === true && typeof doses === 'number') {
    return doses >= threshold
      ? { category: 'Padrão Binge', score: 0 }
      : { category: 'Consumo Moderado', score: 5 }
  }
  return { category: 'Não Informado', score: null }
}

function deriveInternet(answers: MentalHealthAnswers): {
  affirmativeCount: number
  level: InternetLevel
  score: number | null
} {
  const values = INTERNET_FIELDS.map((field) => answers[field])
  // Só é "sem resposta" quando as três perguntas estão nulas. Com ao menos uma
  // respondida, `null` nas outras é lido como "Não".
  if (values.every((value) => value === null || value === undefined)) {
    return { affirmativeCount: 0, level: 'Não Informado', score: null }
  }

  const affirmativeCount = values.filter((value) => value === true).length
  const LEVELS: InternetLevel[] = ['Ausente', 'Leve', 'Moderada', 'Alta']
  const SCORES = [10, 7, 3, 0]

  return { affirmativeCount, level: LEVELS[affirmativeCount], score: SCORES[affirmativeCount] }
}

function deriveSupport(answers: MentalHealthAnswers): {
  sourceCount: number
  presence: SupportPresence
  score: number | null
} {
  const sourceCount = countSupportSources(answers)
  if (sourceCount > 0) return { sourceCount, presence: 'Sim', score: 10 }
  // "Ninguém" declarado é risco real (nota 0); grupo em branco é ausência de
  // dado (nota null, peso fora do denominador).
  if (answers[SUPPORT_NOBODY_FIELD] === true) return { sourceCount, presence: 'Não', score: 0 }
  return { sourceCount, presence: 'Não Informado', score: null }
}

function buildFlags(answers: MentalHealthAnswers): Record<string, number> {
  const flags: Record<string, number> = {}

  const booleanGroups: ReadonlyArray<readonly CheckboxOption[]> = [
    STRESS_SYMPTOM_OPTIONS,
    STRESS_SOURCE_OPTIONS,
    DEPRESSION_SYMPTOM_OPTIONS,
    SUICIDE_SYMPTOM_OPTIONS,
    SUBSTANCE_USED_OPTIONS,
    SUPPORT_SOURCE_OPTIONS,
    LIFE_EVENT_OPTIONS,
  ]

  for (const group of booleanGroups) {
    for (const option of group) flags[option.field] = answers[option.field] === true ? 1 : 0
  }

  for (const field of INTERNET_FIELDS) flags[field] = answers[field] === true ? 1 : 0

  flags[SUPPORT_NOBODY_FIELD] = answers[SUPPORT_NOBODY_FIELD] === true ? 1 : 0
  // "Outro" com texto preenchido conta como item marcado, dos dois lados.
  flags[SUPPORT_OTHER_FIELD] = hasText(answers[SUPPORT_OTHER_FIELD]) ? 1 : 0
  flags[LIFE_EVENT_OTHER_FIELD] = hasText(answers[LIFE_EVENT_OTHER_FIELD]) ? 1 : 0

  return flags
}

// ─── Motor principal ─────────────────────────────────────────────────────────

export interface MentalHealthContext {
  /** Gênero do colaborador — define o limiar de binge alcoólico. */
  gender?: string | null
}

export function calculateMentalHealth(
  rawAnswers: MentalHealthAnswers,
  context: MentalHealthContext = {},
): MentalHealthResult {
  const answers = rawAnswers

  const stressCount = countTrue(answers, STRESS_SYMPTOM_OPTIONS)
  const stressLevel = symptomLevel(stressCount)
  const depressionCount = countTrue(answers, DEPRESSION_SYMPTOM_OPTIONS)
  const depressionLevel = symptomLevel(depressionCount)

  const suicideCount = countTrue(answers, SUICIDE_SYMPTOM_OPTIONS)
  const atRisk = suicideCount >= 1
  // O bloco de suicídio não é uma parcela ponderada: é o divisor do índice.
  // Qualquer indicador marcado corta o Índice de Saúde Mental pela metade.
  const divisor: 1 | 2 = atRisk ? 2 : 1

  const tobacco = deriveTobacco(answers)
  const { threshold, genderKnown } = resolveBingeThreshold(context.gender)
  const alcohol = deriveAlcohol(answers, threshold)
  const internet = deriveInternet(answers)
  const support = deriveSupport(answers)

  const healthScore = typeof answers.health_score === 'number' ? answers.health_score : null
  const lifeQualityScore = typeof answers.life_quality_score === 'number' ? answers.life_quality_score : null

  const rawComponents: Array<Pick<MentalHealthComponent, 'key' | 'score' | 'detail'>> = [
    { key: 'estresse', score: symptomScore(stressLevel), detail: stressLevel },
    { key: 'sintomas_depressivos', score: symptomScore(depressionLevel), detail: depressionLevel },
    { key: 'tabaco', score: tobacco.score, detail: tobacco.category },
    { key: 'alcool', score: alcohol.score, detail: alcohol.category },
    { key: 'internet', score: internet.score, detail: internet.level },
    { key: 'rede_de_apoio', score: support.score, detail: support.presence },
    { key: 'percepcao_saude', score: healthScore, detail: null },
    { key: 'qualidade_de_vida', score: lifeQualityScore, detail: null },
  ]

  const components: MentalHealthComponent[] = rawComponents.map((component) => ({
    ...component,
    label: COMPONENT_LABELS[component.key],
    weight: MENTAL_HEALTH_COMPONENT_WEIGHTS[component.key],
  }))

  let weightedSum = 0
  let weightPresent = 0
  for (const component of components) {
    if (component.score === null) continue
    weightedSum += component.score * component.weight
    weightPresent += component.weight
  }

  const componentsMean = weightPresent > 0 ? round(weightedSum / weightPresent, 4) : null

  const index = componentsMean !== null && weightPresent >= MENTAL_HEALTH_MIN_WEIGHT
    ? round(componentsMean / divisor, 4)
    : null

  return {
    stress: { symptomCount: stressCount, level: stressLevel, score: symptomScore(stressLevel) },
    depression: { symptomCount: depressionCount, level: depressionLevel, score: symptomScore(depressionLevel) },
    suicide: { indicatorCount: suicideCount, atRisk, divisor },
    tobacco: {
      category: tobacco.category,
      score: tobacco.score,
      cigarettesPerDay: typeof answers.substance_cigarettes_per_day === 'number'
        ? answers.substance_cigarettes_per_day
        : null,
    },
    alcohol: {
      category: alcohol.category,
      score: alcohol.score,
      doses: typeof answers.substance_drinking_doses === 'number' ? answers.substance_drinking_doses : null,
      bingeThreshold: threshold,
      genderKnown,
    },
    internet,
    support,
    perception: { healthScore, lifeQualityScore },
    disaster: {
      exposed: typeof answers.exposed_natural_disaster === 'boolean' ? answers.exposed_natural_disaster : null,
      type: typeof answers.disaster_type === 'number' ? answers.disaster_type : null,
      contact: typeof answers.disaster_contact === 'number' ? answers.disaster_contact : null,
    },
    components,
    weightPresent,
    componentsMean,
    index,
    classification: classifyMentalHealth(index),
    flags: buildFlags(answers),
  }
}

/**
 * Índice maior = melhor. Ao contrário dos domínios psicossociais, não há
 * inversão de leitura entre índice e classificação.
 */
export function classifyMentalHealth(index: number | null): MentalHealthClassification {
  if (index === null) return 'Sem dados'
  if (index < 5) return 'Insatisfatório'
  if (index < 7) return 'Regular'
  if (index < 9) return 'Bom'
  return 'Excelente'
}

export const MENTAL_HEALTH_CLASSIFICATIONS: readonly MentalHealthClassification[] = [
  'Insatisfatório',
  'Regular',
  'Bom',
  'Excelente',
  'Sem dados',
] as const

/** Verdadeiro quando o colaborador declarou ser fumante ativo (§3.6). */
export function isActiveSmoker(answers: MentalHealthAnswers): boolean {
  return answers.substance_smoking === SMOKING_ACTIVE_VALUE
}
