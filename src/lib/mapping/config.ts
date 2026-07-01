export type MappingModuleKey = 'sociodemografico' | 'hse' | 'ietr'

export type DashboardFilterKey =
  | 'area'
  | 'role'
  | 'gender'
  | 'race_color'
  | 'employment_type'
  | 'age_range'

export type DemographicChartKey =
  | 'gender'
  | 'age_range'
  | 'race_color'
  | 'education_level'
  | 'marital_status'
  | 'disability'
  | 'disability_types'

export const DEFAULT_MODULES: MappingModuleKey[] = ['sociodemografico', 'hse', 'ietr']
export const DEFAULT_FILTERS: DashboardFilterKey[] = ['area', 'role', 'employment_type', 'gender', 'race_color']
export const DEFAULT_DEMOGRAPHIC_CHARTS: DemographicChartKey[] = [
  'gender',
  'age_range',
  'race_color',
  'education_level',
  'marital_status',
  'disability',
  'disability_types',
]

const FILTER_LABELS: Record<DashboardFilterKey, string> = {
  area: 'Área',
  role: 'Cargo',
  gender: 'Gênero',
  race_color: 'Raça/Cor',
  employment_type: 'Vínculo',
  age_range: 'Faixa etária',
}

const CHART_LABELS: Record<DemographicChartKey, string> = {
  gender: 'Gênero',
  age_range: 'Faixa Etária',
  race_color: 'Raça / Cor',
  education_level: 'Escolaridade',
  marital_status: 'Estado Civil',
  disability: 'Deficiência (PcD)',
  disability_types: 'Tipos de Deficiência',
}

export function getFilterLabel(key: DashboardFilterKey): string {
  return FILTER_LABELS[key]
}

export function getChartLabel(key: DemographicChartKey): string {
  return CHART_LABELS[key]
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

function toFilterKey(value: string): DashboardFilterKey | null {
  if (value === 'area') return 'area'
  if (value === 'role') return 'role'
  if (value === 'gender') return 'gender'
  if (value === 'race_color') return 'race_color'
  if (value === 'employment_type') return 'employment_type'
  if (value === 'age_range') return 'age_range'
  return null
}

function toChartKey(value: string): DemographicChartKey | null {
  if (value === 'gender') return 'gender'
  if (value === 'age_range') return 'age_range'
  if (value === 'race_color') return 'race_color'
  if (value === 'education_level') return 'education_level'
  if (value === 'marital_status') return 'marital_status'
  if (value === 'disability') return 'disability'
  if (value === 'disability_type' || value === 'disability_types') return 'disability_types'
  return null
}

function toModuleKey(value: string): MappingModuleKey | null {
  if (value === 'sociodemografico') return 'sociodemografico'
  if (value === 'hse') return 'hse'
  if (value === 'ietr') return 'ietr'
  return null
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

export type NormalizedMappingConfig = {
  modules: MappingModuleKey[]
  dashboard_filters: DashboardFilterKey[]
  demographic_columns: DemographicChartKey[]
  credential_column: string | null
  column_mapping: Record<string, string>
  column_display_names: Record<string, string>
  column_profiles: Array<Record<string, unknown>>
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

  const dashboardFilters = unique(
    normalizeStringArray(config.dashboard_filters)
      .map((v) => toFilterKey(v))
      .filter((v): v is DashboardFilterKey => v !== null),
  )

  const demographicColumns = unique(
    normalizeStringArray(config.demographic_columns)
      .map((v) => toChartKey(v))
      .filter((v): v is DemographicChartKey => v !== null),
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

  return {
    modules: modules.length > 0 ? modules : DEFAULT_MODULES,
    dashboard_filters: dashboardFilters.length > 0 ? dashboardFilters : DEFAULT_FILTERS,
    demographic_columns: demographicColumns.length > 0 ? demographicColumns : DEFAULT_DEMOGRAPHIC_CHARTS,
    credential_column: credentialColumn,
    column_mapping: columnMapping,
    column_display_names: columnDisplayNames,
    column_profiles: columnProfiles,
  }
}
