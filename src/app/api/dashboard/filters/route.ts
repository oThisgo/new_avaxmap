import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const session = request.cookies.get('manager_session')?.value
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('collaborators')
    .select('area, role, gender, race_color, employment_type')

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

  return NextResponse.json({
    area: withMinSize('area'),
    role: withMinSize('role'),
    gender: withMinSize('gender'),
    race_color: withMinSize('race_color'),
    employment_type: withMinSize('employment_type'),
  })
}
