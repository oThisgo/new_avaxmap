/**
 * Bloqueio de colunas da base, usado tanto na criação quanto na edição de um
 * mapeamento (ver src/app/(manager)/dashboard/client/create/page.tsx e
 * .../client/[id]/page.tsx). Duas categorias, com efeitos diferentes na UI:
 *
 * - Identidade (nome, CPF/matrícula, e-mail, credencial de acesso): a coluna
 *   guarda dado identificável e nunca pode virar filtro nem gráfico
 *   demográfico do dashboard — trava as duas opções.
 * - Sociodemográfico reconhecido (gênero, data de nascimento, raça/cor,
 *   escolaridade, estado civil, deficiência): a coluna já responde a uma
 *   pergunta do módulo sociodemográfico, então sempre vira gráfico — mas,
 *   diferente da identidade, pode livremente virar filtro do dashboard também
 *   (ex.: gênero como filtro, data de nascimento vira o filtro de faixa etária).
 */

export type CanonicalColumnField =
  | 'full_name'
  | 'cpf'
  | 'employee_code'
  | 'email'
  | 'age_range'
  | 'birth_date'
  | 'gender'
  | 'race_color'
  | 'education_level'
  | 'marital_status'
  | 'disability'
  | 'disability_type'

const FIELD_LABELS: Record<string, string> = {
  full_name: 'Nome completo',
  cpf: 'CPF',
  employee_code: 'Código/Matrícula',
  email: 'E-mail',
  birth_date: 'Data de nascimento',
  gender: 'Gênero',
  race_color: 'Raça/Cor',
  education_level: 'Escolaridade',
  marital_status: 'Estado civil',
  disability: 'Deficiência',
  disability_type: 'Tipo de deficiência',
  age_range: 'Faixa etária',
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field
}

const IDENTITY_FIELDS = new Set<string>(['full_name', 'cpf', 'employee_code', 'email'])

const DEMOGRAPHIC_FIELDS = new Set<string>([
  'age_range',
  'birth_date',
  'gender',
  'race_color',
  'education_level',
  'marital_status',
  'disability',
  'disability_type',
])

export type ColumnLockMaps = {
  /** coluna -> motivo, para colunas com dado identificável (trava filtro + demográfico). */
  identityLockByColumn: Map<string, string>
  /** coluna -> motivo, para colunas sociodemográficas reconhecidas (trava só demográfico). */
  demographicLockByColumn: Map<string, string>
}

/**
 * @param fieldMap campo canônico (ex. "gender") -> header da coluna no CSV, como salvo em `column_mapping`.
 * @param credentialColumn header da coluna usada como credencial de acesso, se houver.
 */
export function computeColumnLockMaps(
  fieldMap: Record<string, string>,
  credentialColumn: string,
): ColumnLockMaps {
  const identityLockByColumn = new Map<string, string>()
  const demographicLockByColumn = new Map<string, string>()

  for (const [field, column] of Object.entries(fieldMap)) {
    if (!column) continue
    if (IDENTITY_FIELDS.has(field)) {
      identityLockByColumn.set(column, `Campo padrão: ${fieldLabel(field)}`)
    } else if (DEMOGRAPHIC_FIELDS.has(field)) {
      demographicLockByColumn.set(column, `Campo padrão: ${fieldLabel(field)}`)
    }
  }

  if (credentialColumn) {
    identityLockByColumn.set(credentialColumn, 'Credencial de acesso')
  }

  return { identityLockByColumn, demographicLockByColumn }
}
