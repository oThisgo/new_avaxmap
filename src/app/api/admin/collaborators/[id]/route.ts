import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireCollaboratorDeletion } from '@/lib/auth/collaborator-deletion'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * DELETE /api/admin/collaborators/[id]
 *
 * Remove o colaborador do mapeamento ativo e, junto, qualquer resposta dele.
 * Irreversível — restrito a superuser do mapeamento (ver ../guard.ts).
 */
export async function DELETE(request: NextRequest, { params }: Readonly<RouteParams>) {
  const { id } = await params
  const supabase = createServerClient()

  const guard = await requireCollaboratorDeletion(request, supabase, id)
  if ('error' in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }

  // Respostas primeiro: `responses.collaborator_id` referencia o colaborador,
  // então apagar na ordem inversa esbarraria na FK.
  const { error: responsesError } = await supabase
    .from('responses')
    .delete()
    .eq('collaborator_id', id)

  if (responsesError) {
    return NextResponse.json({ error: 'Falha ao excluir as respostas do colaborador.' }, { status: 500 })
  }

  const { error: collaboratorError } = await supabase
    .from('collaborators')
    .delete()
    .eq('id', id)
    .eq('mapping_id', guard.mappingId)

  if (collaboratorError) {
    return NextResponse.json({ error: 'Falha ao excluir o colaborador.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
