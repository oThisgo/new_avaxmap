import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
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
  supabase: ReturnType<typeof createServerClient>,
  collaboratorId: string,
): Promise<DeletionGuardOk | DeletionGuardError> {
  const access = await requireMappingAccess(request, supabase)
  if ('error' in access) return access

  if (!isMappingSuperuser(access.manager.role, access.mappingRole)) {
    return { error: 'Apenas superuser pode excluir dados da base de colaboradores.', status: 403 }
  }

  if (!collaboratorId) {
    return { error: 'Colaborador não informado.', status: 400 }
  }

  const { data: collaborator, error } = await supabase
    .from('collaborators')
    .select('id')
    .eq('id', collaboratorId)
    .eq('mapping_id', access.mappingId)
    .maybeSingle()

  if (error) {
    return { error: 'Falha ao validar o colaborador.', status: 500 }
  }

  if (!collaborator) {
    return { error: 'Colaborador não encontrado neste mapeamento.', status: 404 }
  }

  return { mappingId: access.mappingId }
}
