import { NextRequest, NextResponse } from 'next/server'

const COLLABORATOR_PROTECTED = ['/formulario', '/agradecimento']
const MANAGER_PROTECTED = ['/dashboard', '/admin']

function extractMappingSlug(pathname: string): string | null {
  const match = pathname.match(/^\/mapeamento\/([^/]+)(?:\/|$)/)
  return match?.[1] ?? null
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const mappingSlug = extractMappingSlug(pathname)
  const isMappingCollaboratorPath =
    /^\/mapeamento\/[^/]+\/(formulario|agradecimento)(?:\/|$)/.test(pathname)
  const isMappingManagerPath = /^\/mapeamento\/[^/]+\/dashboard(?:\/|$)/.test(pathname)

  if (mappingSlug && isMappingCollaboratorPath) {
    const collaboratorId = request.cookies.get('collaborator_id')?.value
    const collaboratorMappingSlug = request.cookies.get('collaborator_mapping_slug')?.value
    if (!collaboratorId || collaboratorMappingSlug !== mappingSlug) {
      const loginUrl = new URL(`/mapeamento/${mappingSlug}/login`, request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

  if (mappingSlug && isMappingManagerPath) {
    const managerSession = request.cookies.get('manager_session')?.value
    const activeMappingSlug = request.cookies.get('active_mapping_slug')?.value
    if (!managerSession || activeMappingSlug !== mappingSlug) {
      const loginUrl = new URL(`/mapeamento/${mappingSlug}/manager/login`, request.url)
      return NextResponse.redirect(loginUrl)
    }
  }

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
  matcher: [
    '/formulario/:path*',
    '/agradecimento/:path*',
    '/dashboard/:path*',
    '/admin/:path*',
    '/mapeamento/:path*',
  ],
}
