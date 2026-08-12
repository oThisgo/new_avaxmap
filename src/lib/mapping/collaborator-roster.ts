import { decryptFieldOrNull } from '@/lib/security/crypto'
import { customFieldSlug, isCustomFieldKey, slugifyColumnKey } from './column-key'
import { getAgeRangeFromBirthDate } from './collaborator-fields'
import type { NormalizedMappingConfig } from './config'

/**
 * Monta a listagem nominal de colaboradores de um mapeamento (tela
 * /admin/collaborators) a partir das COLUNAS DA BASE que o cliente enviou.
 *
 * Recorte de privacidade (deliberado): as colunas exibidas saem de
 * `mappings.csv_columns` / `column_mapping`, ou seja, apenas dados que o
 * próprio cliente já possuía e subiu no CSV. Campos sensíveis que o
 * colaborador respondeu no questionário anônimo (gênero, raça/cor, deficiência,
 * estado civil, escolaridade) e que NÃO vinham da base ficam de fora — eles
 * foram coletados sob a promessa de anonimato do TCLE e o restante do sistema
 * trata esse dado apenas de forma agregada (ver MIN_GROUP_SIZE em
 * src/app/api/dashboard/filters/route.ts e o `id_anonimo` em
 * src/app/api/dashboard/export-risk/route.ts). Como a lista é construída
 * iterando as colunas da base, esse recorte é automático: um campo que não
 * existe no CSV não tem coluna para aparecer.
 *
 * Pelo mesmo motivo esta listagem nunca inclui respostas, notas ou
 * classificações de risco — só se a pessoa respondeu e quando.
 */

export interface RosterCollaboratorSource {
  name?: string | null
  email?: string | null
  birth_date?: string | null
  area?: string | null
  role?: string | null
  gender?: string | null
  race_color?: string | null
  employment_type?: string | null
  education_level?: string | null
  marital_status?: string | null
  disability?: string | null
  which_disability?: string | null
  extra_fields?: Record<string, string | null> | null
}

export type RosterColumn = {
  /** Chave estável usada como id da coluna e chave do objeto de valores da linha. */
  key: string
  label: string
}

/** Coluna da base que existe no CSV mas não pode ser exibida, com o motivo. */
export type RosterOmittedColumn = {
  label: string
  reason: string
}

type CanonicalResolver = (row: RosterCollaboratorSource) => string | null

/**
 * Como ler cada campo canônico do registro do colaborador. Os campos
 * criptografados (AES-256-GCM, ver src/lib/security/crypto.ts) são
 * descriptografados aqui; os organizacionais ficam em texto claro no banco.
 */
const CANONICAL_RESOLVERS = new Map<string, CanonicalResolver>([
  ['full_name', (row) => decryptFieldOrNull(row.name)],
  ['email', (row) => decryptFieldOrNull(row.email)],
  ['birth_date', (row) => decryptFieldOrNull(row.birth_date)],
  ['age_range', (row) => getAgeRangeFromBirthDate(decryptFieldOrNull(row.birth_date))],
  ['area', (row) => row.area ?? null],
  ['role', (row) => row.role ?? null],
  ['employment_type', (row) => row.employment_type ?? null],
  ['gender', (row) => row.gender ?? null],
  ['race_color', (row) => row.race_color ?? null],
  ['education_level', (row) => decryptFieldOrNull(row.education_level)],
  ['marital_status', (row) => decryptFieldOrNull(row.marital_status)],
  ['disability', (row) => decryptFieldOrNull(row.disability)],
  ['disability_type', (row) => row.which_disability ?? null],
])

/**
 * Campos canônicos que a importação transforma em hash HMAC irreversível
 * (a credencial de acesso, ver hashCpf em src/lib/security/crypto.ts e o
 * `cpf: hashCpf(...)` em src/app/api/admin/upload-collaborators/route.ts).
 * Não existe valor em claro para exibir.
 */
const HASHED_CANONICAL_FIELDS = new Set(['cpf', 'employee_code'])

const OMITTED_REASON_HASHED = 'credencial de acesso — armazenada como hash irreversível'
const OMITTED_REASON_NOT_STORED =
  'não é persistida: marque a coluna como filtro ou gráfico na configuração do mapeamento para que ela passe a ser importada'

function buildResolverForColumn(
  header: string,
  canonicalField: string | undefined,
  persistedCustomSlugs: ReadonlySet<string>,
): { resolver: CanonicalResolver } | { omittedReason: string } {
  if (canonicalField) {
    const resolver = CANONICAL_RESOLVERS.get(canonicalField)
    if (resolver) return { resolver }
    if (HASHED_CANONICAL_FIELDS.has(canonicalField)) return { omittedReason: OMITTED_REASON_HASHED }
    return { omittedReason: OMITTED_REASON_NOT_STORED }
  }

  // Coluna customizada: só chega no banco (collaborators.extra_fields) quando foi
  // escolhida como filtro ou gráfico — mesma regra do customFieldSlugsToImport
  // em src/app/api/admin/upload-collaborators/route.ts.
  const slug = slugifyColumnKey(header)
  if (!persistedCustomSlugs.has(slug)) return { omittedReason: OMITTED_REASON_NOT_STORED }

  return {
    resolver: (row) => {
      const value = row.extra_fields ? row.extra_fields[slug] : null
      return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
    },
  }
}

export type RosterSchema = {
  columns: RosterColumn[]
  omitted: RosterOmittedColumn[]
  resolvers: Map<string, CanonicalResolver>
}

/**
 * Resolve quais colunas da base podem ser exibidas e como ler o valor de cada
 * uma. `csvColumns` é `mappings.csv_columns`; quando vazio (mapeamentos
 * semeados direto no banco, sem CSV) cai para os cabeçalhos declarados em
 * `column_mapping`.
 */
export function buildRosterSchema(
  csvColumns: readonly string[],
  config: NormalizedMappingConfig,
): RosterSchema {
  const canonicalByHeader = new Map<string, string>()
  for (const [field, header] of Object.entries(config.column_mapping)) {
    if (header) canonicalByHeader.set(header, field)
  }

  const persistedCustomSlugs = new Set(
    [...config.dashboard_filters, ...config.demographic_columns]
      .filter(isCustomFieldKey)
      .map(customFieldSlug),
  )

  const headers = csvColumns.length > 0
    ? csvColumns
    : Object.values(config.column_mapping).filter((header): header is string => !!header)

  const columns: RosterColumn[] = []
  const omitted: RosterOmittedColumn[] = []
  const resolvers = new Map<string, CanonicalResolver>()
  const seenKeys = new Set<string>()

  for (const header of headers) {
    const canonicalField = canonicalByHeader.get(header)
    const label = config.column_display_names[header] || header
    const built = buildResolverForColumn(header, canonicalField, persistedCustomSlugs)

    if ('omittedReason' in built) {
      omitted.push({ label, reason: built.omittedReason })
      continue
    }

    // Cabeçalhos distintos podem apontar para o mesmo campo (ex.: "Idade" e
    // "Nascimento" -> birth_date). Mantém a primeira ocorrência para não
    // duplicar coluna na tabela.
    const key = canonicalField ? `canonical:${canonicalField}` : `custom:${slugifyColumnKey(header)}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    columns.push({ key, label })
    resolvers.set(key, built.resolver)
  }

  return { columns, omitted, resolvers }
}

/**
 * Fallback para mapeamentos sem `csv_columns` nem `column_mapping`: usa os
 * campos canônicos que de fato têm algum valor gravado, para a tabela não
 * ficar vazia nem cheia de colunas sempre em branco.
 */
export function buildFallbackSchema(rows: readonly RosterCollaboratorSource[]): RosterSchema {
  const FALLBACK_LABELS: Record<string, string> = {
    full_name: 'Nome',
    email: 'E-mail',
    area: 'Área',
    role: 'Cargo',
    employment_type: 'Vínculo',
  }

  const columns: RosterColumn[] = []
  const resolvers = new Map<string, CanonicalResolver>()

  for (const [field, label] of Object.entries(FALLBACK_LABELS)) {
    const resolver = CANONICAL_RESOLVERS.get(field)
    if (!resolver) continue
    if (!rows.some((row) => resolver(row) !== null)) continue

    const key = `canonical:${field}`
    columns.push({ key, label })
    resolvers.set(key, resolver)
  }

  return { columns, omitted: [], resolvers }
}

export function resolveRosterValues(
  schema: RosterSchema,
  row: RosterCollaboratorSource,
): Record<string, string | null> {
  const values: Record<string, string | null> = {}
  for (const column of schema.columns) {
    values[column.key] = schema.resolvers.get(column.key)?.(row) ?? null
  }
  return values
}
