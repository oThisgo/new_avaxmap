import { normalizeQuestionOverrides } from './question-overrides'
import { MAPPING_MODULE_KEYS } from './config'
import { HSE_CODES } from '@/lib/analytics/hse-definition'
import { IETR_CODES } from '@/lib/analytics/ietr-definition'
import { MENTAL_HEALTH_CODES } from '@/lib/analytics/mental-health-definition'
import { SOCIODEMOGRAPHIC_QUESTION_KEYS, isSociodemographicQuestionKey } from './sociodemographic-questions'

/**
 * Payload de configuração aceito tanto na criação (POST /api/client/mappings)
 * quanto na edição (PATCH /api/client/mappings/[id]). Manter uma única fonte de
 * verdade evita que as duas rotas divirjam nas regras de validação — em especial
 * na proteção de colunas sensíveis, que é defesa em profundidade contra payloads
 * que tentem contornar a UI.
 */
export type MappingConfigPayload = {
  modules?: string[]
  csv_columns?: string[]
  credential_column?: string
  stratification_columns?: string[]
  demographic_columns?: string[]
  column_display_names?: Record<string, string>
  column_profiles?: Array<{
    source_name?: string
    display_name?: string
    is_dashboard_filter?: boolean
    is_demographic?: boolean
    locked?: boolean
    locked_reason?: string | null
  }>
  column_mapping?: Record<string, string>
  dashboard_filters?: string[]
  sociodemographic_questions?: string[]
  hse_question_order?: string[]
  hse_question_text_overrides?: Record<string, string>
  ietr_question_order?: string[]
  ietr_question_text_overrides?: Record<string, string>
  mental_health_question_order?: string[]
  mental_health_question_text_overrides?: Record<string, string>
}

export type NormalizedColumnProfile = {
  source_name: string
  display_name: string
  is_dashboard_filter: boolean
  is_demographic: boolean
  locked: boolean
  locked_reason: string | null
}

export type BuiltMappingConfig = {
  config: Record<string, unknown>
  csvColumns: string[]
  moduleType: 'HSE' | 'REMOTE' | null
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function normalizeModules(modules: unknown): string[] {
  const allowed = new Set<string>(MAPPING_MODULE_KEYS)
  return normalizeStringList(modules)
    .map((m) => m.toLowerCase())
    .filter((m) => allowed.has(m))
}

function normalizeColumnMapping(value: unknown, csvColumns: string[]): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const allowedColumns = new Set(csvColumns)
  const output: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v !== 'string') continue
    const key = k.trim()
    const column = v.trim()
    if (!key || !column) continue
    if (!allowedColumns.has(column)) continue
    output[key] = column
  }
  return output
}

function normalizeColumnProfiles(value: unknown, csvColumns: string[]): NormalizedColumnProfile[] {
  if (!Array.isArray(value)) return []
  const allowedColumns = new Set(csvColumns)
  const profiles: NormalizedColumnProfile[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const sourceName = typeof row.source_name === 'string' ? row.source_name.trim() : ''
    if (!sourceName || !allowedColumns.has(sourceName)) continue

    const displayName = typeof row.display_name === 'string' && row.display_name.trim().length > 0
      ? row.display_name.trim()
      : sourceName

    profiles.push({
      source_name: sourceName,
      display_name: displayName,
      is_dashboard_filter: row.is_dashboard_filter === true,
      is_demographic: row.is_demographic === true,
      locked: row.locked === true,
      locked_reason: typeof row.locked_reason === 'string' ? row.locked_reason : null,
    })
  }

  return profiles
}

function normalizeColumnDisplayNames(value: unknown, csvColumns: string[]): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const allowedColumns = new Set(csvColumns)
  const output: Record<string, string> = {}

  for (const [key, rawLabel] of Object.entries(value as Record<string, unknown>)) {
    const column = key.trim()
    if (!column || !allowedColumns.has(column)) continue
    if (typeof rawLabel !== 'string') continue
    const label = rawLabel.trim()
    output[column] = label || column
  }

  return output
}

export function inferModuleType(modules: string[]): 'HSE' | 'REMOTE' | null {
  const hasHse = modules.includes('hse')
  const hasIetr = modules.includes('ietr')
  if (hasHse && !hasIetr) return 'HSE'
  if (!hasHse && hasIetr) return 'REMOTE'
  return null
}

/**
 * Constrói o objeto `config` persistido em `mappings.config` a partir do payload.
 *
 * `fallbackCsvColumns` é usado na edição: quando o gestor altera a configuração
 * sem reenviar o CSV, as colunas conhecidas do mapeamento continuam valendo como
 * lista permitida — sem isso, `column_mapping`, `column_profiles` e
 * `column_display_names` seriam silenciosamente descartados por não constarem em
 * uma lista vazia.
 */
export function buildMappingConfig(
  payload: MappingConfigPayload,
  options: { fallbackCsvColumns?: string[] } = {},
): BuiltMappingConfig {
  const modules = normalizeModules(payload.modules)

  const payloadCsvColumns = normalizeStringList(payload.csv_columns)
  const csvColumns = payloadCsvColumns.length > 0
    ? payloadCsvColumns
    : normalizeStringList(options.fallbackCsvColumns)

  const credentialColumn = typeof payload.credential_column === 'string'
    ? payload.credential_column.trim()
    : ''

  const columnMapping = normalizeColumnMapping(payload.column_mapping, csvColumns)

  // Colunas já reservadas para campos sensíveis (nome, CPF/matrícula, e-mail,
  // credencial) nunca podem virar filtro/dado demográfico — a UI já bloqueia isso
  // (colunas "locked"), isto é defesa em profundidade contra um payload que tente
  // contornar a UI.
  const sensitiveColumns = new Set(
    [columnMapping.full_name, columnMapping.cpf, columnMapping.employee_code, columnMapping.email, credentialColumn]
      .filter((c): c is string => !!c),
  )

  const rawColumnProfiles = normalizeColumnProfiles(payload.column_profiles, csvColumns)
  const columnProfiles = rawColumnProfiles.map((profile) => (
    sensitiveColumns.has(profile.source_name)
      ? { ...profile, is_dashboard_filter: false, is_demographic: false }
      : profile
  ))

  const dashboardFiltersFromProfiles = columnProfiles
    .filter((profile) => profile.is_dashboard_filter)
    .map((profile) => profile.source_name)
  const demographicColumnsFromProfiles = columnProfiles
    .filter((profile) => profile.is_demographic)
    .map((profile) => profile.source_name)

  const dashboardFilters = (dashboardFiltersFromProfiles.length > 0
    ? dashboardFiltersFromProfiles
    : normalizeStringList(payload.dashboard_filters)
  ).filter((column) => !sensitiveColumns.has(column))

  const stratificationColumns = normalizeStringList(payload.stratification_columns)
  const effectiveStratificationColumns = (stratificationColumns.length > 0
    ? stratificationColumns
    : dashboardFilters
  ).filter((column) => !sensitiveColumns.has(column))

  const demographicColumns = (demographicColumnsFromProfiles.length > 0
    ? demographicColumnsFromProfiles
    : normalizeStringList(payload.demographic_columns)
  ).filter((column) => !sensitiveColumns.has(column))

  // O nome de exibição digitado no card da coluna é a fonte de verdade do rótulo.
  // Sem esta derivação ele só valeria quando o cliente também enviasse
  // `column_display_names`, e renomear uma coluna não teria efeito nenhum no
  // dashboard nem nos relatórios.
  const displayNamesFromProfiles: Record<string, string> = {}
  for (const profile of columnProfiles) {
    if (profile.display_name && profile.display_name !== profile.source_name) {
      displayNamesFromProfiles[profile.source_name] = profile.display_name
    }
  }
  const columnDisplayNames = {
    ...normalizeColumnDisplayNames(payload.column_display_names, csvColumns),
    ...displayNamesFromProfiles,
  }

  // Mesma regra de fallback do normalizeMappingConfig (src/lib/mapping/config.ts):
  // sem seleção explícita, o padrão é perguntar tudo. O bloqueio por coluna já
  // presente na base não é resolvido aqui — fica para a leitura, via
  // getEffectiveSociodemographicQuestions.
  const rawSociodemographicQuestions = normalizeStringList(payload.sociodemographic_questions)
    .filter(isSociodemographicQuestionKey)
  const sociodemographicQuestions = rawSociodemographicQuestions.length > 0
    ? rawSociodemographicQuestions
    : [...SOCIODEMOGRAPHIC_QUESTION_KEYS]

  const hseOverrides = normalizeQuestionOverrides(
    payload.hse_question_order,
    payload.hse_question_text_overrides,
    HSE_CODES,
  )
  const ietrOverrides = normalizeQuestionOverrides(
    payload.ietr_question_order,
    payload.ietr_question_text_overrides,
    IETR_CODES,
  )
  const mentalHealthOverrides = normalizeQuestionOverrides(
    payload.mental_health_question_order,
    payload.mental_health_question_text_overrides,
    MENTAL_HEALTH_CODES,
  )

  return {
    csvColumns,
    moduleType: inferModuleType(modules),
    config: {
      modules,
      dashboard_filters: dashboardFilters,
      stratification_columns: effectiveStratificationColumns,
      demographic_columns: demographicColumns,
      column_display_names: columnDisplayNames,
      column_profiles: columnProfiles,
      credential_column: credentialColumn || null,
      column_mapping: columnMapping,
      sociodemographic_questions: sociodemographicQuestions,
      hse_question_order: hseOverrides.order,
      hse_question_text_overrides: hseOverrides.text,
      ietr_question_order: ietrOverrides.order,
      ietr_question_text_overrides: ietrOverrides.text,
      mental_health_question_order: mentalHealthOverrides.order,
      mental_health_question_text_overrides: mentalHealthOverrides.text,
      report: 'dynamic',
    },
  }
}
