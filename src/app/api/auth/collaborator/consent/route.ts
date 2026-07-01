import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const collaboratorId = request.cookies.get('collaborator_id')?.value
  const collaboratorMappingSlug = request.cookies.get('collaborator_mapping_slug')?.value

  if (!collaboratorId || !collaboratorMappingSlug) {
    return NextResponse.json({ error: 'Sessão expirada. Faça login novamente.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    (body as Record<string, unknown>).accepted !== true ||
    typeof (body as Record<string, unknown>).mapping_slug !== 'string'
  ) {
    return NextResponse.json({ error: 'Confirmação de consentimento inválida.' }, { status: 400 })
  }

  const mappingSlug = String((body as Record<string, unknown>).mapping_slug).trim().toLowerCase()
  if (!mappingSlug || mappingSlug !== collaboratorMappingSlug) {
    return NextResponse.json({ error: 'Mapeamento inválido para esta sessão.' }, { status: 403 })
  }

  const supabase = createServerClient()

  const { data: mapping } = await supabase
    .from('mappings')
    .select('id, status')
    .eq('slug', mappingSlug)
    .single()

  if (!mapping || mapping.status !== 'active') {
    return NextResponse.json({ error: 'Mapeamento inválido ou inativo.' }, { status: 404 })
  }

  const { data: collaborator } = await supabase
    .from('collaborators')
    .select('id, mapping_id, has_answered')
    .eq('id', collaboratorId)
    .single()

  if (!collaborator || collaborator.mapping_id !== mapping.id) {
    return NextResponse.json({ error: 'Colaborador não pertence ao mapeamento ativo.' }, { status: 403 })
  }

  if (collaborator.has_answered) {
    return NextResponse.json({ error: 'Esta pesquisa já foi respondida.' }, { status: 409 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('collaborator_lgpd_accepted', '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 2,
  })

  return response
}
