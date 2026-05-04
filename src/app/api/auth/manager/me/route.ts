import { NextRequest, NextResponse } from 'next/server'
import { getManagerFromSession } from '@/lib/auth/manager'

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  return NextResponse.json({
    id: manager.id,
    name: manager.name,
    email: manager.email,
    role: manager.role,
    must_change_password: manager.mustChangePassword,
  })
}
