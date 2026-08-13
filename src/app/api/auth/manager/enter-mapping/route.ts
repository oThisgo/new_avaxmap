import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { getManagerFromSession } from '@/lib/auth/manager'

// POST /api/auth/manager/enter-mapping
// Body: { mapping_slug: string }
//
// Promove a sessão já autenticada do gestor para o escopo de um mapeamento
// específico (manager_scope=mapping, active_mapping_slug, mapping_role em
// manager_display), sem exigir senha de novo.
//
// Necessário porque tanto o dashboard de analytics (DashboardShell, que decide
// mostrar relatório executivo/upload de colaboradores/insights via
// isMappingSuperuser(role, mapping_role)) quanto as rotas que ele chama
// (ex.: src/app/api/dashboard/insights/route.ts) dependem desse escopo — e ele
// só era estabelecido no login direto por /mapeamento/[slug]/manager/login
// (ver src/app/api/auth/manager/route.ts). O botão "Abrir mapeamento" em
// dashboard/client/[id]/page.tsx fazia um router.push puro no cliente,
// reaproveitando a sessão client-scoped sem nunca recalcular mapping_role —
// então um gestor recém-promovido a superuser num mapeamento específico não via
// as opções restritas até deslogar e logar de novo pela tela do mapeamento.
export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)

  if (!manager) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  let body: { mapping_slug?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const mappingSlug = (body.mapping_slug ?? '').trim().toLowerCase()
  if (!mappingSlug) {
    return NextResponse.json({ error: 'Slug do mapeamento é obrigatório.' }, { status: 400 })
  }

  const mapping = await db
    .selectFrom('mappings')
    .select(['id', 'slug', 'status'])
    .where('slug', '=', mappingSlug)
    .executeTakeFirst()

  if (!mapping || mapping.status !== 'active') {
    return NextResponse.json({ error: 'Mapeamento inválido ou inativo.' }, { status: 404 })
  }

  const access = await db
    .selectFrom('mapping_managers')
    .select('role')
    .where('mapping_id', '=', mapping.id)
    .where('manager_id', '=', manager.id)
    .executeTakeFirst()

  if (!access) {
    return NextResponse.json({ error: 'Sem acesso a este mapeamento.' }, { status: 403 })
  }

  const cookieOpts = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 8,
    path: '/',
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('manager_scope', 'mapping', { ...cookieOpts, httpOnly: true })
  response.cookies.set('active_mapping_slug', mappingSlug, { ...cookieOpts, httpOnly: true })
  // Cookie não-httpOnly apenas para exibição do nome/role no UI (sem dados sensíveis)
  response.cookies.set(
    'manager_display',
    JSON.stringify({
      name: manager.name,
      email: manager.email,
      role: manager.role,
      mapping_role: access.role ?? null,
      must_change_password: manager.mustChangePassword,
      mapping_slug: mappingSlug,
    }),
    { ...cookieOpts, httpOnly: false },
  )

  return response
}
