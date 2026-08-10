import { toCustomFieldKey } from './column-key'
import { normalizeQuestionOverrides } from './question-overrides'
import { HSE_CODES } from '@/lib/analytics/hse-definition'
import { IETR_CODES } from '@/lib/analytics/ietr-definition'
import { MENTAL_HEALTH_CODES } from '@/lib/analytics/mental-health-definition'

export type MappingModuleKey = 'sociodemografico' | 'hse' | 'ietr' | 'saude_mental'

export const MAPPING_MODULE_KEYS: readonly MappingModuleKey[] = [
  'sociodemografico',
  'hse',
  'ietr',
  'saude_mental',
] as const

export const DEFAULT_MODULES: MappingModuleKey[] = ['sociodemografico', 'hse', 'ietr']
export const DEFAULT_FILTERS: string[] = ['area', 'role', 'employment_type', 'gender', 'race_color']
export const DEFAULT_DEMOGRAPHIC_CHARTS: string[] = [
  'gender',
  'age_range',
  'race_color',
  'education_level',
  'marital_status',
  'disability',
  'disability_types',
]

const CANONICAL_LABELS: Record<string, string> = {
  area: 'Área',
  role: 'Cargo',
  gender: 'Gênero',
  race_color: 'Raça/Cor',
  employment_type: 'Vínculo',
  age_range: 'Faixa etária',
  education_level: 'Escolaridade',
  marital_status: 'Estado Civil',
  disability: 'Deficiência (PcD)',
  disability_types: 'Tipos de Deficiência',
}

/**
 * Campos de `column_mapping` (header reconhecido pela inferência de CSV) que
 * podem virar filtro/gráfico demográfico, e a chave canônica correspondente.
 * `birth_date`/`age_range` colapsam na mesma chave porque o dashboard só
 * exibe faixa etária derivada, nunca a data de nascimento crua.
 */
const CANONICAL_FIELD_BY_COLUMN_MAPPING_KEY: Record<string, string> = {
  area: 'area',
  role: 'role',
  employment_type: 'employment_type',
  gender: 'gender',
  race_color: 'race_color',
  birth_date: 'age_range',
  age_range: 'age_range',
  education_level: 'education_level',
  marital_status: 'marital_status',
  disability: 'disability',
  disability_type: 'disability_types',
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

function toModuleKey(value: string): MappingModuleKey | null {
  return (MAPPING_MODULE_KEYS as readonly string[]).includes(value)
    ? value as MappingModuleKey
    : null
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

/** header do CSV -> chave canônica (ex.: "Gênero" -> "gender"), a partir de column_mapping. */
function buildHeaderFieldMap(columnMapping: Record<string, string>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [field, header] of Object.entries(columnMapping)) {
    const canonical = CANONICAL_FIELD_BY_COLUMN_MAPPING_KEY[field]
    if (!canonical || !header) continue
    map[header] = canonical
  }
  return map
}

/**
 * Resolve um cabeçalho bruto de CSV (como salvo em dashboard_filters/demographic_columns)
 * para uma chave estável: a chave canônica quando o cabeçalho corresponde a um campo
 * padrão reconhecido (via column_mapping), ou `custom:<slug>` caso contrário. Também
 * acumula o rótulo de exibição correspondente em `labels`.
 */
function resolveFieldKey(
  header: string,
  headerFieldMap: Record<string, string>,
  columnDisplayNames: Record<string, string>,
  labels: Record<string, string>,
): string {
  const canonical = headerFieldMap[header]
  if (canonical) {
    labels[canonical] = labels[canonical] ?? CANONICAL_LABELS[canonical] ?? canonical
    return canonical
  }

  const key = toCustomFieldKey(header)
  labels[key] = columnDisplayNames[header] || header
  return key
}

export type NormalizedMappingConfig = {
  modules: MappingModuleKey[]
  dashboard_filters: string[]
  /** Dimensões usadas para estratificar o relatório de risco. */
  stratification_columns: string[]
  demographic_columns: string[]
  credential_column: string | null
  column_mapping: Record<string, string>
  column_display_names: Record<string, string>
  column_profiles: Array<Record<string, unknown>>
  /** Rótulo de exibição para qualquer chave presente em dashboard_filters/demographic_columns. */
  field_labels: Record<string, string>
  hse_question_order: string[]
  hse_question_text_overrides: Record<string, string>
  ietr_question_order: string[]
  ietr_question_text_overrides: Record<string, string>
  mental_health_question_order: string[]
  mental_health_question_text_overrides: Record<string, string>
}

export function normalizeMappingConfig(raw: unknown): NormalizedMappingConfig {
  const config = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? raw as Record<string, unknown>
    : {}

  const modules = unique(
    normalizeStringArray(config.modules)
      .map((v) => toModuleKey(v))
      .filter((v): v is MappingModuleKey => v !== null),
  )

  const credentialColumn = typeof config.credential_column === 'string' && config.credential_column.trim().length > 0
    ? config.credential_column.trim()
    : null

  const columnMapping =
    config.column_mapping && typeof config.column_mapping === 'object' && !Array.isArray(config.column_mapping)
      ? Object.fromEntries(
          Object.entries(config.column_mapping as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
            .map(([k, v]) => [k, (v as string).trim()]),
        )
      : {}

  const columnDisplayNames =
    config.column_display_names && typeof config.column_display_names === 'object' && !Array.isArray(config.column_display_names)
      ? Object.fromEntries(
          Object.entries(config.column_display_names as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
            .map(([k, v]) => [k, (v as string).trim()]),
        )
      : {}

  const columnProfiles = Array.isArray(config.column_profiles)
    ? config.column_profiles.filter((row) => row && typeof row === 'object') as Array<Record<string, unknown>>
    : []

  const hseOverrides = normalizeQuestionOverrides(config.hse_question_order, config.hse_question_text_overrides, HSE_CODES)
  const ietrOverrides = normalizeQuestionOverrides(config.ietr_question_order, config.ietr_question_text_overrides, IETR_CODES)
  const mentalHealthOverrides = normalizeQuestionOverrides(
    config.mental_health_question_order,
    config.mental_health_question_text_overrides,
    MENTAL_HEALTH_CODES,
  )

  const headerFieldMap = buildHeaderFieldMap(columnMapping)
  const fieldLabels: Record<string, string> = {}

  const dashboardFilters = unique(
    normalizeStringArray(config.dashboard_filters)
      .map((header) => resolveFieldKey(header, headerFieldMap, columnDisplayNames, fieldLabels)),
  )

  const demographicColumns = unique(
    normalizeStringArray(config.demographic_columns)
      .map((header) => resolveFieldKey(header, headerFieldMap, columnDisplayNames, fieldLabels)),
  )

  const stratificationColumns = unique(
    normalizeStringArray(config.stratification_columns)
      .map((header) => resolveFieldKey(header, headerFieldMap, columnDisplayNames, fieldLabels)),
  )

  const effectiveFilters = dashboardFilters.length > 0 ? dashboardFilters : DEFAULT_FILTERS
  const effectiveCharts = demographicColumns.length > 0 ? demographicColumns : DEFAULT_DEMOGRAPHIC_CHARTS
  // A estratificação do relatório cai para os filtros do dashboard quando não foi
  // configurada explicitamente — são as mesmas dimensões que fazem sentido cruzar.
  const effectiveStrata = stratificationColumns.length > 0 ? stratificationColumns : effectiveFilters
  for (const key of [...effectiveFilters, ...effectiveCharts, ...effectiveStrata]) {
    fieldLabels[key] = fieldLabels[key] ?? CANONICAL_LABELS[key] ?? key
  }

  return {
    modules: modules.length > 0 ? modules : DEFAULT_MODULES,
    dashboard_filters: effectiveFilters,
    stratification_columns: effectiveStrata,
    demographic_columns: effectiveCharts,
    credential_column: credentialColumn,
    column_mapping: columnMapping,
    column_display_names: columnDisplayNames,
    column_profiles: columnProfiles,
    field_labels: fieldLabels,
    hse_question_order: hseOverrides.order,
    hse_question_text_overrides: hseOverrides.text,
    ietr_question_order: ietrOverrides.order,
    ietr_question_text_overrides: ietrOverrides.text,
    mental_health_question_order: mentalHealthOverrides.order,
    mental_health_question_text_overrides: mentalHealthOverrides.text,
  }
}
