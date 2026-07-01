import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getMappingScopeContext } from '@/lib/auth/mapping-scope'
import { decryptFieldOrNull } from '@/lib/security/crypto'
import { getFilterLabel, normalizeMappingConfig } from '@/lib/mapping/config'

function getAgeRange(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (/^\d{1,3}$/.test(trimmed)) {
    const age = Number(trimmed)
    if (!Number.isFinite(age) || age < 0 || age > 120) return null
    if (age < 25) return 'Até 24'
    if (age < 35) return '25–34'
    if (age < 45) return '35–44'
    if (age < 55) return '45–54'
    return '55+'
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
  const md = today.getMonth() - birth.getMonth()
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age--
  if (age < 25) return 'Até 24'
  if (age < 35) return '25–34'
  if (age < 45) return '35–44'
  if (age < 55) return '45–54'
  return '55+'
}

export async function GET(request: NextRequest) {
  const session = request.cookies.get('manager_session')?.value
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mappingScope = await getMappingScopeContext(request, { requireMappingScope: true })
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  const supabase = createServerClient()

  const { data: mapping } = await supabase
    .from('mappings')
    .select('config')
    .eq('id', mappingScope.mappingId)
    .single()

  const mappingConfig = normalizeMappingConfig(mapping?.config)
  const availableFilters = mappingConfig.dashboard_filters

  const { data, error } = await supabase
    .from('collaborators')
    .select('area, role, gender, race_color, employment_type, birth_date')
    .eq('mapping_id', mappingScope.mappingId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  // Retorna apenas valores com >= 5 colaboradores para proteger o anonimato
  const MIN_GROUP_SIZE = 5
  const withMinSize = (key: keyof typeof rows[0]) => {
    const counts: Record<string, number> = {}
    for (const row of rows) {
      const val = row[key]
      if (val) counts[val as string] = (counts[val as string] ?? 0) + 1
    }
    return Object.entries(counts)
      .filter(([, count]) => count >= MIN_GROUP_SIZE)
      .map(([val]) => val)
      .sort((a, b) => a.localeCompare(b))
  }

  const optionsByKey: Record<string, string[]> = {
    area: withMinSize('area'),
    role: withMinSize('role'),
    gender: withMinSize('gender'),
    race_color: withMinSize('race_color'),
    employment_type: withMinSize('employment_type'),
    age_range: (() => {
      const counts: Record<string, number> = {}
      for (const row of rows) {
        const ageRange = getAgeRange(decryptFieldOrNull(row.birth_date))
        if (!ageRange) continue
        counts[ageRange] = (counts[ageRange] ?? 0) + 1
      }
      return Object.entries(counts)
        .filter(([, count]) => count >= MIN_GROUP_SIZE)
        .map(([value]) => value)
    })(),
  }

  return NextResponse.json({
    available_filters: availableFilters,
    options: Object.fromEntries(availableFilters.map((key) => [key, optionsByKey[key] ?? []])),
    labels: Object.fromEntries(availableFilters.map((key) => [key, getFilterLabel(key)])),
  })
}
