import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const session = request.cookies.get('manager_session')?.value
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('collaborators')
    .select('area, role, gender, race_color')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const unique = (key: keyof typeof rows[0]) =>
    [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort()

  return NextResponse.json({
    area: unique('area'),
    role: unique('role'),
    gender: unique('gender'),
    race_color: unique('race_color'),
  })
}
