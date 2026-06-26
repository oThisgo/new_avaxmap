import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { getMappingScopeContext } from '@/lib/auth/mapping-scope'

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

  const mappingScope = await getMappingScopeContext(request, { requireMappingScope: true })
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  const format = request.nextUrl.searchParams.get('format') ?? 'json'
  const area = request.nextUrl.searchParams.get('area') ?? ''
  const role = request.nextUrl.searchParams.get('role') ?? ''
  const gender = request.nextUrl.searchParams.get('gender') ?? ''
  const raceColor = request.nextUrl.searchParams.get('race_color') ?? ''
  const employmentType = request.nextUrl.searchParams.get('employment_type') ?? ''
  const hasFilters = !!(area || role || gender || raceColor || employmentType)

  const supabase = createServerClient()
  let query = supabase
    .from('collaborators')
    .select('id, area, role, employment_type, gender, race_color, has_answered')
    .eq('mapping_id', mappingScope.mappingId)

  if (area) query = query.eq('area', area)
  if (role) query = query.eq('role', role)
  if (gender) query = query.eq('gender', gender)
  if (raceColor) query = query.eq('race_color', raceColor)
  if (employmentType) query = query.eq('employment_type', employmentType)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const collabs: CollabRow[] = data ?? []
  const total = collabs.length
  const answered = collabs.filter((c) => c.has_answered).length
  const pct = total > 0 ? Math.round((answered / total) * 10000) / 100 : 0

  const collaboratorIds = collabs.map((c) => c.id)

  const { data: responses } = collaboratorIds.length > 0
    ? await supabase
        .from('responses')
        .select('submitted_at')
        .in('collaborator_id', collaboratorIds)
        .order('submitted_at', { ascending: true })
    : { data: [] }

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
    filters: hasFilters ? { area: area || null, role: role || null, gender: gender || null, race_color: raceColor || null, employment_type: employmentType || null } : null,
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
    const filterRows = hasFilters
      ? [
          ['Filtros ativos:'],
          ...(area ? [['Área:', area]] : []),
          ...(role ? [['Cargo:', role]] : []),
          ...(gender ? [['Gênero:', gender]] : []),
          ...(raceColor ? [['Raça/Cor:', raceColor]] : []),
          ...(employmentType ? [['Vínculo:', employmentType]] : []),
          [],
        ]
      : []

    const wsSummary = XLSX.utils.aoa_to_sheet([
      ['Relatório de Adesão — BeeTouch'],
      ['Gerado em:', dateStr],
      ...filterRows,
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

    const raw = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
    // Cria um ArrayBuffer puro (não SharedArrayBuffer) compatível com BodyInit
    const ab = new ArrayBuffer(raw.byteLength)
    new Uint8Array(ab).set(raw)
    const blob = new Blob([ab], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const fileName = `relatorio-adesao-${new Date().toISOString().slice(0, 10)}.xlsx`

    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  }

  return NextResponse.json({ error: 'Formato inválido. Use ?format=xlsx ou ?format=json' }, { status: 400 })
}
