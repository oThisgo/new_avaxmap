import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireCollaboratorDeletion } from '@/lib/auth/collaborator-deletion'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * DELETE /api/admin/collaborators/[id]/response
 *
 * Apaga a resposta do colaborador e reabre o questionário para ele (zera
 * `has_answered`, que é a trava usada em src/app/api/responses/route.ts para
 * recusar uma segunda submissão). Serve para o caso de alguém ter respondido
 * errado e precisar responder de novo. O cadastro do colaborador é preservado.
 *
 * Irreversível — restrito a superuser do mapeamento.
 */
export async function DELETE(request: NextRequest, { params }: Readonly<RouteParams>) {
  const { id } = await params
  const supabase = createServerClient()

  const guard = await requireCollaboratorDeletion(request, supabase, id)
  if ('error' in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }

  const { error: responsesError } = await supabase
    .from('responses')
    .delete()
    .eq('collaborator_id', id)

  if (responsesError) {
    return NextResponse.json({ error: 'Falha ao excluir a resposta.' }, { status: 500 })
  }

  // Os campos sociodemográficos que a submissão gravou no colaborador
  // (gênero, raça/cor, escolaridade...) são mantidos: eles serão sobrescritos
  // na nova submissão e apagá-los aqui destruiria dado que também pode ter
  // vindo da base importada.
  const { error: collaboratorError } = await supabase
    .from('collaborators')
    .update({ has_answered: false })
    .eq('id', id)
    .eq('mapping_id', guard.mappingId)

  if (collaboratorError) {
    return NextResponse.json({ error: 'Falha ao reabrir o questionário do colaborador.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
