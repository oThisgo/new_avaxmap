import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getManagerFromSession, isAdmin } from '@/lib/auth/manager'
import { hashCpf, encryptFieldOrNull } from '@/lib/security/crypto'

// ─── CSV parser mínimo com suporte a campos com ponto-e-vírgula entre aspas ─
function parseCsvRow(row: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ';' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function normalizeCpf(raw: string): string {
  return raw.replace(/[.\-\s]/g, '').trim()
}

// Colunas do CSV (0-indexed, separador: ponto-e-vírgula):
// 0: Nome completo → name
// 1: CPF → cpf
// 2: Data de nascimento → birth_date
// 3: E-mail → email
// 4: Variável de estratificação 1 (área) → area
// 5: Variável de estratificação 2 (cargo) → role
// 6: Variável de estratificação 3 (gênero) → gender
// 7: Variável de estratificação 4 (raça) → race_color
// 8: Variável de estratificação 5 (idade) → IGNORADO
// 9: Vínculo → employment_type
// 10: Escolaridade → education_level (criptografado)
// 11: Estado Civil → marital_status (criptografado)
// 12: Deficiência → disability + which_disability (lógica abaixo)

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  if (!isAdmin(manager.role)) {
    return NextResponse.json({ error: 'Acesso negado. Apenas administradores podem importar colaboradores.' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Falha ao ler o arquivo enviado.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 })
  }

  const text = await file.text()
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    return NextResponse.json({ error: 'CSV vazio ou sem linhas de dados.' }, { status: 400 })
  }

  // Pula o header
  const dataLines = lines.slice(1)

  type CollaboratorRow = {
    cpf: string
    name: string
    email: string | null
    birth_date: string | null
    area: string | null
    role: string | null
    gender: string | null
    race_color: string | null
    employment_type: string | null
    education_level: string | null
    marital_status: string | null
    disability: string | null
    which_disability: string | null
  }

  const rows: CollaboratorRow[] = []
  const parseErrors: string[] = []

  for (let i = 0; i < dataLines.length; i++) {
    const cols = parseCsvRow(dataLines[i])
    const rawCpf = cols[1] ?? ''
    const cpf = normalizeCpf(rawCpf)

    if (!cpf || !/^\d{11}$/.test(cpf)) {
      parseErrors.push(`Linha ${i + 2}: CPF inválido ("${rawCpf}")`)
      continue
    }

    const disabilityCol = (cols[12] ?? '').trim()
    const hasDisability = disabilityCol.toLowerCase() !== 'sem deficiência' && disabilityCol !== ''

    rows.push({
      cpf: hashCpf(cpf),
      name: encryptFieldOrNull(cols[0]) ?? '',
      email: encryptFieldOrNull(cols[3] ?? null),
      birth_date: encryptFieldOrNull(cols[2] ?? null),
      area: cols[4] || null,
      role: cols[5] || null,
      gender: cols[6] || null,
      race_color: cols[7] || null,
      employment_type: cols[9] || null,
      education_level: encryptFieldOrNull(cols[10] ?? null),
      marital_status: encryptFieldOrNull(cols[11] ?? null),
      disability: encryptFieldOrNull(hasDisability ? 'sim' : 'não'),
      which_disability: hasDisability ? disabilityCol : null,
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Nenhuma linha válida encontrada.', parse_errors: parseErrors }, { status: 400 })
  }

  const supabase = createServerClient()

  // CPFs já estão hasheados em rows; busca para diferenciar insert de update
  const incomingHashedCpfs = rows.map((r) => r.cpf)
  const { data: existing } = await supabase
    .from('collaborators')
    .select('cpf')
    .in('cpf', incomingHashedCpfs)

  const existingCpfSet = new Set((existing ?? []).map((e) => e.cpf))

  // Upsert: atualiza name, email, birth_date, area, role, gender, race_color, employment_type, organization
  // NÃO toca em: has_answered
  const { error: upsertError } = await supabase
    .from('collaborators')
    .upsert(rows, { onConflict: 'cpf', ignoreDuplicates: false })

  if (upsertError) {
    return NextResponse.json({ error: `Erro no banco: ${upsertError.message}` }, { status: 500 })
  }

  const inserted = rows.filter((r) => !existingCpfSet.has(r.cpf as string)).length
  const updated = rows.filter((r) => existingCpfSet.has(r.cpf as string)).length

  return NextResponse.json({
    ok: true,
    total: rows.length,
    inserted,
    updated,
    parse_errors: parseErrors,
  })
}
