import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

interface CollabRow {
  id: string
  area: string | null
  role: string | null
  employment_type: string | null
  gender: string | null
  race_color: string | null
  has_answered: boolean
}

interface AdhesionEntry {
  name: string
  total: number
  answered: number
  pct: number
}

function buildAdhesionTable(
  collabs: CollabRow[],
  field: keyof Pick<CollabRow, 'area' | 'role' | 'employment_type' | 'gender' | 'race_color'>,
): AdhesionEntry[] {
  const map: Record<string, { total: number; answered: number }> = {}
  for (const c of collabs) {
    const key = (c[field] as string | null) ?? 'Não informado'
    if (!map[key]) map[key] = { total: 0, answered: 0 }
    map[key].total++
    if (c.has_answered) map[key].answered++
  }
  return Object.entries(map)
    .map(([name, { total, answered }]) => ({
      name,
      total,
      answered,
      pct: total > 0 ? Math.round((answered / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

export async function GET(request: NextRequest) {
  const session = request.cookies.get('manager_session')?.value
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const format = request.nextUrl.searchParams.get('format') ?? 'json'

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('collaborators')
    .select('id, area, role, employment_type, gender, race_color, has_answered')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const collabs: CollabRow[] = data ?? []
  const total = collabs.length
  const answered = collabs.filter((c) => c.has_answered).length
  const pct = total > 0 ? Math.round((answered / total) * 10000) / 100 : 0

  const { data: responses } = await supabase
    .from('responses')
    .select('submitted_at')
    .order('submitted_at', { ascending: true })

  const byDayMap: Record<string, number> = {}
  for (const r of responses ?? []) {
    if (r.submitted_at) {
      const day = (r.submitted_at as string).slice(0, 10)
      byDayMap[day] = (byDayMap[day] ?? 0) + 1
    }
  }
  const responses_by_day = Object.entries(byDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  const reportData = {
    generated_at: new Date().toISOString(),
    summary: { total, answered, pct },
    by_area: buildAdhesionTable(collabs, 'area'),
    by_role: buildAdhesionTable(collabs, 'role'),
    by_employment_type: buildAdhesionTable(collabs, 'employment_type'),
    by_gender: buildAdhesionTable(collabs, 'gender'),
    by_race_color: buildAdhesionTable(collabs, 'race_color'),
    responses_by_day,
  }

  if (format === 'json') {
    return NextResponse.json(reportData)
  }

  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new()

    const dateStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

    // Aba Resumo
    const wsSummary = XLSX.utils.aoa_to_sheet([
      ['Relatório de Adesão — Instituto Alana'],
      ['Gerado em:', dateStr],
      [],
      ['RESUMO GERAL'],
      ['Total de Colaboradores', 'Responderam', 'Taxa de Adesão (%)'],
      [total, answered, pct],
    ])
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo')

    const addSheet = (sheetName: string, rows: AdhesionEntry[]) => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['Categoria', 'Total Colaboradores', 'Responderam', 'Taxa de Adesão (%)'],
        ...rows.map((r) => [r.name, r.total, r.answered, r.pct]),
      ])
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    }

    addSheet('Por Área', reportData.by_area)
    addSheet('Por Cargo', reportData.by_role)
    addSheet('Por Vínculo', reportData.by_employment_type)
    addSheet('Por Gênero', reportData.by_gender)
    addSheet('Por Raça-Cor', reportData.by_race_color)

    const wsDay = XLSX.utils.aoa_to_sheet([
      ['Data', 'Respostas no Dia'],
      ...responses_by_day.map((r) => [r.date, r.count]),
    ])
    XLSX.utils.book_append_sheet(wb, wsDay, 'Linha do Tempo')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const fileName = `relatorio-adesao-${new Date().toISOString().slice(0, 10)}.xlsx`

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  }

  return NextResponse.json({ error: 'Formato inválido. Use ?format=xlsx ou ?format=json' }, { status: 400 })
}
