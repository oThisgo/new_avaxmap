import { decryptFieldOrNull } from '@/lib/security/crypto'
import { isCustomFieldKey, customFieldSlug } from './column-key'

export interface CollaboratorFieldSource {
  area?: string | null
  role?: string | null
  employment_type?: string | null
  gender?: string | null
  race_color?: string | null
  birth_date?: string | null
  education_level?: string | null
  marital_status?: string | null
  disability?: string | null
  which_disability?: string | null
  extra_fields?: Record<string, string | null> | null
}

function classifyAge(age: number): string {
  if (age < 25) return 'Até 24'
  if (age < 35) return '25–34'
  if (age < 45) return '35–44'
  if (age < 55) return '45–54'
  return '55+'
}

export function getAgeRangeFromBirthDate(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (/^\d{1,3}$/.test(trimmed)) {
    const age = Number(trimmed)
    if (!Number.isFinite(age) || age < 0 || age > 120) return null
    return classifyAge(age)
  }
  let normalized = trimmed
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/')
    normalized = `${y}-${m}-${d}`
  }
  const birth = new Date(normalized)
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--
  return classifyAge(age)
}

/**
 * Extrai o valor de um colaborador para uma chave de campo (canônica, ex.
 * 'gender', 'area', ou customizada, 'custom:<slug>'). Centraliza a leitura
 * (e descriptografia, quando aplicável) usada tanto pelos gráficos da aba
 * demográfica quanto pelas opções/valores de filtro do dashboard.
 */
export function getCollaboratorFieldValue(row: CollaboratorFieldSource, key: string): string | null {
  if (isCustomFieldKey(key)) {
    const slug = customFieldSlug(key)
    const value = row.extra_fields ? row.extra_fields[slug] : null
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
  }

  switch (key) {
    case 'area': return row.area ?? null
    case 'role': return row.role ?? null
    case 'employment_type': return row.employment_type ?? null
    case 'gender': return row.gender ?? null
    case 'race_color': return row.race_color ?? null
    case 'age_range': return getAgeRangeFromBirthDate(decryptFieldOrNull(row.birth_date))
    case 'education_level': return decryptFieldOrNull(row.education_level)
    case 'marital_status': return decryptFieldOrNull(row.marital_status)
    case 'disability': return decryptFieldOrNull(row.disability)
    case 'disability_types': {
      const v = row.which_disability
      return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
    }
    default: return null
  }
}

/**
 * Chaves cujo valor não corresponde a uma coluna literal filtrável via SQL
 * (age_range é derivado de birth_date, que é criptografado por linha — só dá
 * pra calcular após buscar e descriptografar em memória). Essas chaves ainda
 * aparecem como filtro disponível no dashboard (com opções calculadas), só
 * não são empurradas para a query do Supabase.
 */
const NON_PUSHABLE_FILTER_KEYS = new Set(['age_range', 'disability_types'])

export function isPushableFilterKey(key: string): boolean {
  return !NON_PUSHABLE_FILTER_KEYS.has(key)
}

export function collaboratorFieldColumnExpr(key: string): string {
  if (isCustomFieldKey(key)) {
    return `extra_fields->>${customFieldSlug(key)}`
  }
  return key
}

export function parseCollaboratorFilters(
  searchParams: URLSearchParams,
  allowedKeys: readonly string[],
): Record<string, string> {
  const filters: Record<string, string> = {}
  for (const key of allowedKeys) {
    const value = searchParams.get(key)
    if (value) filters[key] = value
  }
  return filters
}

interface FilterableQuery {
  eq: (column: string, value: string) => unknown
}

/**
 * Aplica apenas as chaves filtráveis via SQL (ver isPushableFilterKey) a uma query
 * do Supabase. Tipado estruturalmente (não genérico sobre o tipo real do query
 * builder) para evitar que o TS tente unificar o tipo profundamente aninhado do
 * PostgrestFilterBuilder, o que estoura o limite de instanciação de tipos.
 */
export function applyCollaboratorFilters<Q extends FilterableQuery>(query: Q, filters: Record<string, string>): Q {
  let result: unknown = query
  for (const [key, value] of Object.entries(filters)) {
    if (!isPushableFilterKey(key)) continue
    result = (result as FilterableQuery).eq(collaboratorFieldColumnExpr(key), value)
  }
  return result as Q
}
