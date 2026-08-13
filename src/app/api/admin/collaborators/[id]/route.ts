import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
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

  const guard = await requireCollaboratorDeletion(request, id)
  if ('error' in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status })
  }

  // Respostas primeiro: `responses.collaborator_id` referencia o colaborador,
  // então apagar na ordem inversa esbarraria na FK.
  try {
    await db.deleteFrom('responses').where('collaborator_id', '=', id).execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao excluir as respostas do colaborador.' }, { status: 500 })
  }

  try {
    await db
      .deleteFrom('collaborators')
      .where('id', '=', id)
      .where('mapping_id', '=', guard.mappingId)
      .execute()
  } catch {
    return NextResponse.json({ error: 'Falha ao excluir o colaborador.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
