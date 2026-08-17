/**
 * Perguntas do módulo sociodemográfico que o formulário pode fazer ao
 * colaborador. Fonte única de verdade — usada pelo editor de configuração
 * (criação e edição do mapeamento) e pelo formulário público
 * (src/components/forms/IetrForm.tsx) — para que os dois lados nunca
 * divirjam sobre quais perguntas existem e quando cada uma é bloqueada.
 */
export type SociodemographicQuestionKey =
  | 'age_range'
  | 'gender'
  | 'race_color'
  | 'marital_status'
  | 'education_level'
  | 'disability'

export const SOCIODEMOGRAPHIC_QUESTION_KEYS: readonly SociodemographicQuestionKey[] = [
  'age_range',
  'gender',
  'race_color',
  'marital_status',
  'education_level',
  'disability',
]

export const SOCIODEMOGRAPHIC_QUESTION_LABELS: Record<SociodemographicQuestionKey, string> = {
  age_range: 'Data de nascimento',
  gender: 'Gênero',
  race_color: 'Cor',
  marital_status: 'Estado civil',
  education_level: 'Escolaridade',
  disability: 'Possui deficiência?',
}

export function isSociodemographicQuestionKey(value: string): value is SociodemographicQuestionKey {
  return (SOCIODEMOGRAPHIC_QUESTION_KEYS as readonly string[]).includes(value)
}

/**
 * Chaves de `column_mapping` (header do CSV -> campo canônico, ver
 * CANONICAL_FIELD_BY_COLUMN_MAPPING_KEY em ./config.ts) que, se preenchidas,
 * já trazem esse dado pronto da base do cliente — perguntar de novo no
 * formulário seria redundante. 'age_range' aceita tanto `birth_date` quanto
 * `age_range` porque são o mesmo dado sob dois nomes possíveis no mapeamento
 * de colunas (data de nascimento crua ou faixa etária já calculada).
 */
const PREFILL_COLUMN_MAPPING_KEYS: Record<SociodemographicQuestionKey, readonly string[]> = {
  age_range: ['birth_date', 'age_range'],
  gender: ['gender'],
  race_color: ['race_color'],
  marital_status: ['marital_status'],
  education_level: ['education_level'],
  disability: ['disability'],
}

/** Header do CSV que já cobre esta pergunta, se houver — usado para explicar o bloqueio na UI. */
export function getSociodemographicPrefillColumn(
  key: SociodemographicQuestionKey,
  columnMapping: Record<string, string>,
): string | null {
  for (const mappingKey of PREFILL_COLUMN_MAPPING_KEYS[key]) {
    const column = columnMapping[mappingKey]
    if (column) return column
  }
  return null
}

export function isSociodemographicQuestionPrefilled(
  key: SociodemographicQuestionKey,
  columnMapping: Record<string, string>,
): boolean {
  return getSociodemographicPrefillColumn(key, columnMapping) !== null
}

/**
 * Lista efetivamente perguntada no formulário: a seleção do gestor menos o que
 * já vem pronto da base. Recalculada a cada leitura (nunca persistida já
 * filtrada) para que, se o cliente reenviar um CSV sem uma coluna que tinha
 * antes, a pergunta correspondente volte a ser feita automaticamente.
 */
export function getEffectiveSociodemographicQuestions(
  selected: readonly string[],
  columnMapping: Record<string, string>,
): SociodemographicQuestionKey[] {
  return SOCIODEMOGRAPHIC_QUESTION_KEYS.filter(
    (key) => selected.includes(key) && !isSociodemographicQuestionPrefilled(key, columnMapping),
  )
}
