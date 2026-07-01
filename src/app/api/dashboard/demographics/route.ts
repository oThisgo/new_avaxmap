import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { decryptFieldOrNull } from '@/lib/security/crypto'
import { getMappingScopeContext } from '@/lib/auth/mapping-scope'

function buildFilters(params: URLSearchParams) {
  const filters: Record<string, string> = {}
  for (const key of ['area', 'role', 'gender', 'race_color', 'employment_type']) {
    const v = params.get(key)
    if (v) filters[key] = v
  }
  return filters
}

function getAgeRange(birthDate: string | null): string | null {
  if (!birthDate) return null
  const trimmed = birthDate.trim()
  if (/^\d{1,3}$/.test(trimmed)) {
    const age = Number(trimmed)
    if (!Number.isFinite(age) || age < 0 || age > 120) return null
    if (age < 25) return 'Até 24'
    if (age < 35) return '25–34'
    if (age < 45) return '35–44'
    if (age < 55) return '45–54'
    return '55+'
  }
  // Suporta DD/MM/YYYY (formato do CSV) e YYYY-MM-DD
  let normalized = trimmed
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(birthDate)) {
    const [day, month, year] = birthDate.split('/')
    normalized = `${year}-${month}-${day}`
  }
  const birth = new Date(normalized)
  if (isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--
  if (age < 25) return 'Até 24'
  if (age < 35) return '25–34'
  if (age < 45) return '35–44'
  if (age < 55) return '45–54'
  return '55+'
}

function countBy(arr: (string | null)[]): { name: string; value: number }[] {
  const map: Record<string, number> = {}
  for (const v of arr) {
    if (!v) continue
    map[v] = (map[v] ?? 0) + 1
  }
  return Object.entries(map).map(([name, value]) => ({ name, value }))
}

export async function GET(request: NextRequest) {
  const session = request.cookies.get('manager_session')?.value
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mappingScope = await getMappingScopeContext(request, { requireMappingScope: true })
  if ('error' in mappingScope) {
    return NextResponse.json({ error: mappingScope.error }, { status: mappingScope.status })
  }

  const supabase = createServerClient()
  const filters = buildFilters(request.nextUrl.searchParams)

  let query = supabase
    .from('collaborators')
    .select('birth_date, gender, race_color, education_level, marital_status, disability, which_disability')
    .eq('mapping_id', mappingScope.mappingId)
    .eq('has_answered', true)
  for (const [k, v] of Object.entries(filters)) {
    query = query.eq(k, v)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  return NextResponse.json({
    gender: countBy(rows.map((r) => r.gender ?? '')),
    age_range: countBy(rows.map((r) => getAgeRange(decryptFieldOrNull(r.birth_date)))),
    race_color: countBy(rows.map((r) => r.race_color ?? '')),
    education_level: countBy(rows.map((r) => decryptFieldOrNull(r.education_level) ?? '')),
    marital_status: countBy(rows.map((r) => decryptFieldOrNull(r.marital_status) ?? '')),
    disability: countBy(rows.map((r) => decryptFieldOrNull(r.disability) ?? '')),
    disability_types: countBy(
      rows
        .filter((r) => {
          const v = ((r as Record<string, unknown>).which_disability as string | null | undefined)
          return typeof v === 'string' && v.trim().length > 0
        })
        .map((r) => ((r as Record<string, unknown>).which_disability as string).trim())
    ),
  })
}
