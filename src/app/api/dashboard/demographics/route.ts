import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

function buildFilters(params: URLSearchParams) {
  const filters: Record<string, string> = {}
  for (const key of ['area', 'role', 'gender', 'race_color']) {
    const v = params.get(key)
    if (v) filters[key] = v
  }
  return filters
}

function getAgeRange(birthDate: string | null): string {
  if (!birthDate) return 'Não informado'
  const birth = new Date(birthDate)
  const age = new Date().getFullYear() - birth.getFullYear()
  if (age < 25) return 'Até 24'
  if (age < 35) return '25–34'
  if (age < 45) return '35–44'
  if (age < 55) return '45–54'
  return '55+'
}

function countBy(arr: string[]): { name: string; value: number }[] {
  const map: Record<string, number> = {}
  for (const v of arr) {
    const key = v || 'Não informado'
    map[key] = (map[key] ?? 0) + 1
  }
  return Object.entries(map).map(([name, value]) => ({ name, value }))
}

export async function GET(request: NextRequest) {
  const session = request.cookies.get('manager_session')?.value
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const filters = buildFilters(request.nextUrl.searchParams)

  let query = supabase
    .from('collaborators')
    .select('birth_date, gender, race_color, education_level, marital_status, disability')
  for (const [k, v] of Object.entries(filters)) {
    query = query.eq(k, v)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  return NextResponse.json({
    gender: countBy(rows.map((r) => r.gender ?? '')),
    age_range: countBy(rows.map((r) => getAgeRange(r.birth_date))),
    race_color: countBy(rows.map((r) => r.race_color ?? '')),
    education_level: countBy(rows.map((r) => r.education_level ?? '')),
    marital_status: countBy(rows.map((r) => r.marital_status ?? '')),
    disability: countBy(rows.map((r) => r.disability ?? '')),
  })
}
