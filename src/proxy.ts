import { NextRequest, NextResponse } from 'next/server'

const COLLABORATOR_PROTECTED = ['/formulario', '/agradecimento']
const MANAGER_PROTECTED = ['/dashboard', '/admin']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rotas protegidas do colaborador
  if (COLLABORATOR_PROTECTED.some((p) => pathname.startsWith(p))) {
    const collaboratorId = request.cookies.get('collaborator_id')?.value
    if (!collaboratorId) {
      const loginUrl = new URL('/login', request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Rotas protegidas do gestor (inclui /admin)
  if (MANAGER_PROTECTED.some((p) => pathname.startsWith(p))) {
    const managerSession = request.cookies.get('manager_session')?.value
    if (!managerSession) {
      const loginUrl = new URL('/manager/login', request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/formulario/:path*', '/agradecimento/:path*', '/dashboard/:path*', '/admin/:path*'],
}
