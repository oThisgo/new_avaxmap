import { NextRequest, NextResponse } from 'next/server'
import { getManagerFromSession } from '@/lib/auth/manager'

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024

type CanonicalField =
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

const FIELD_PATTERNS: Array<{ field: CanonicalField; patterns: RegExp[] }> = [
  { field: 'full_name', patterns: [/^nome$/, /nome.*completo/, /colaborador/, /funcionario/, /employee.*name/] },
  { field: 'cpf', patterns: [/^cpf$/, /cpf.*colaborador/, /documento/, /tax.?id/] },
  { field: 'employee_code', patterns: [/matricula/, /codigo/, /id.*colaborador/, /employee.*id/, /registro/] },
  { field: 'email', patterns: [/^e-?mail$/, /email/, /mail/] },
  { field: 'age_range', patterns: [/^idade$/, /faixa.*etaria/, /age/] },
  { field: 'birth_date', patterns: [/nascimento/, /data.*nasc/, /birth/, /dob/] },
  { field: 'gender', patterns: [/genero/, /sexo/, /gender/] },
  { field: 'race_color', patterns: [/raca/, /raça/, /cor/, /etnia/, /ethnic/] },
  { field: 'education_level', patterns: [/escolaridade/, /formacao/, /formação/, /education/] },
  { field: 'marital_status', patterns: [/estado.*civil/, /marital/] },
  { field: 'disability', patterns: [/deficiencia$/, /deficiência$/, /pcd/, /disability$/] },
  { field: 'disability_type', patterns: [/qual.*deficiencia/, /tipo.*deficiencia/, /deficiencia.*qual/, /disability.*type/] },
]

const STRATIFICATION_HINTS = [
  /diretoria/,
  /gerencia/,
  /gerência/,
  /coordena/,
  /area/,
  /área/,
  /setor/,
  /departamento/,
  /equipe/,
  /time/,
  /cargo/,
  /funcao/,
  /função/,
  /nivel/,
  /nível/,
  /unidade/,
  /filial/,
  /regional/,
  /site/,
  /planta/,
  /operacao/,
  /operação/,
]

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectDelimiter(headerLine: string): string {
  const delimiters = [';', ',', '\t', '|']
  let best = ';'
  let bestCount = -1

  for (const delimiter of delimiters) {
    const count = headerLine.split(delimiter).length
    if (count > bestCount) {
      bestCount = count
      best = delimiter
    }
  }

  return best
}

function parseHeaderLine(headerLine: string, delimiter: string): string[] {
  if (delimiter !== ';') {
    return headerLine
      .split(delimiter)
      .map((h) => h.replace(/^\uFEFF/, '').trim())
      .filter(Boolean)
  }

  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < headerLine.length; i++) {
    const ch = headerLine[i]
    if (ch === '"') {
      if (inQuotes && headerLine[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ';' && !inQuotes) {
      result.push(current.replace(/^\uFEFF/, '').trim())
      current = ''
    } else {
      current += ch
    }
  }

  result.push(current.replace(/^\uFEFF/, '').trim())

  return result.filter(Boolean)
}

function inferFieldMap(headers: string[]): Partial<Record<CanonicalField, string>> {
  const fieldMap: Partial<Record<CanonicalField, string>> = {}
  const used = new Set<string>()

  for (const { field, patterns } of FIELD_PATTERNS) {
    for (const header of headers) {
      if (used.has(header)) continue
      const normalized = normalizeLabel(header)
      if (patterns.some((pattern) => pattern.test(normalized))) {
        fieldMap[field] = header
        used.add(header)
        break
      }
    }
  }

  return fieldMap
}

function inferCredentialCandidates(
  headers: string[],
  fieldMap: Partial<Record<CanonicalField, string>>,
): string[] {
  const preferred = [fieldMap.cpf, fieldMap.employee_code, fieldMap.email].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  )

  const patternCandidates = headers.filter((h) => {
    const n = normalizeLabel(h)
    return /cpf|matricula|matricula|codigo|codigo interno|employee id|registro|email|mail/.test(n)
  })

  return Array.from(new Set([...preferred, ...patternCandidates]))
}

function inferStratificationColumns(
  headers: string[],
  fieldMap: Partial<Record<CanonicalField, string>>,
): string[] {
  const mapped = new Set(Object.values(fieldMap).filter((v): v is string => typeof v === 'string'))

  return headers.filter((header) => {
    if (mapped.has(header)) return false
    const n = normalizeLabel(header)
    return STRATIFICATION_HINTS.some((rx) => rx.test(n))
  })
}

function inferDashboardFilters(stratificationColumns: string[]): string[] {
  return stratificationColumns.slice(0, 6)
}

function toEscapedDelimiter(delimiter: string): string {
  if (delimiter === '\t') return '\\t'
  return delimiter
}

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Payload inválido para análise de CSV.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Arquivo CSV não informado.' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'Arquivo muito grande para análise rápida.' }, { status: 413 })
  }

  const text = await file.text()
  const firstNonEmptyLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstNonEmptyLine) {
    return NextResponse.json({ error: 'CSV vazio.' }, { status: 400 })
  }

  const delimiter = detectDelimiter(firstNonEmptyLine)
  const headers = parseHeaderLine(firstNonEmptyLine, delimiter)

  if (headers.length === 0) {
    return NextResponse.json({ error: 'Não foi possível identificar colunas do CSV.' }, { status: 400 })
  }

  const fieldMap = inferFieldMap(headers)
  const credentialCandidates = inferCredentialCandidates(headers, fieldMap)
  const stratificationColumns = inferStratificationColumns(headers, fieldMap)
  const dashboardFilters = inferDashboardFilters(stratificationColumns)

  return NextResponse.json({
    ok: true,
    headers,
    delimiter: toEscapedDelimiter(delimiter),
    suggestions: {
      field_map: fieldMap,
      credential_candidates: credentialCandidates,
      credential_column: credentialCandidates[0] ?? null,
      stratification_columns: stratificationColumns,
      dashboard_filters: dashboardFilters,
    },
  })
}
