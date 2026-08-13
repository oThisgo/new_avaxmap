import { NextRequest } from 'next/server'
import { db } from '@/lib/db/pool'
import { isMappingSuperuser } from '@/lib/auth/manager'
import { requireMappingAccess } from '@/lib/auth/mapping-scope'

type DeletionGuardError = { error: string; status: number }
type DeletionGuardOk = { mappingId: string }

/**
 * Guarda comum das exclusões da base de colaboradores (excluir o colaborador ou
 * apenas a resposta dele).
 *
 * Além de exigir superuser DO MAPEAMENTO ativo, confere que o colaborador alvo
 * realmente pertence a esse mapeamento: sem essa checagem, um superuser de um
 * mapeamento poderia apagar o colaborador de outro cliente só passando um id
 * arbitrário na URL.
 */
export async function requireCollaboratorDeletion(
  request: NextRequest,
  collaboratorId: string,
): Promise<DeletionGuardOk | DeletionGuardError> {
  const access = await requireMappingAccess(request)
  if ('error' in access) return access

  if (!isMappingSuperuser(access.manager.role, access.mappingRole)) {
    return { error: 'Apenas superuser pode excluir dados da base de colaboradores.', status: 403 }
  }

  if (!collaboratorId) {
    return { error: 'Colaborador não informado.', status: 400 }
  }

  let collaborator
  try {
    collaborator = await db
      .selectFrom('collaborators')
      .select('id')
      .where('id', '=', collaboratorId)
      .where('mapping_id', '=', access.mappingId)
      .executeTakeFirst()
  } catch {
    return { error: 'Falha ao validar o colaborador.', status: 500 }
  }

  if (!collaborator) {
    return { error: 'Colaborador não encontrado neste mapeamento.', status: 404 }
  }

  return { mappingId: access.mappingId }
}
