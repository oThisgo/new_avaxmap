import { NextRequest } from 'next/server'
import { db } from '@/lib/db/pool'
import { getManagerFromSession, type ManagerSession } from '@/lib/auth/manager'
import { isAdmin } from '@/lib/auth/roles'

export type MappingScopeContext = {
  scope: 'client' | 'mapping'
  mappingId: string | null
  mappingSlug: string | null
}

export type MappingScopeError = {
  error: string
  status: number
}

interface GetMappingScopeOptions {
  requireMappingScope?: boolean
}

export async function getMappingScopeContext(
  request: NextRequest,
  options?: GetMappingScopeOptions,
): Promise<MappingScopeContext | MappingScopeError> {
  const requireMappingScope = options?.requireMappingScope ?? false
  const scopeCookie = request.cookies.get('manager_scope')?.value
  const scope: 'client' | 'mapping' = scopeCookie === 'mapping' ? 'mapping' : 'client'
  const mappingSlug = request.cookies.get('active_mapping_slug')?.value ?? null

  if (requireMappingScope && scope !== 'mapping') {
    return {
      error: 'Este endpoint exige contexto de mapeamento ativo.',
      status: 403,
    }
  }

  if (scope !== 'mapping') {
    return {
      scope,
      mappingId: null,
      mappingSlug: null,
    }
  }

  if (!mappingSlug) {
    return {
      error: 'Mapeamento ativo não encontrado na sessão.',
      status: 401,
    }
  }

  const mapping = await db
    .selectFrom('mappings')
    .select(['id', 'status'])
    .where('slug', '=', mappingSlug)
    .executeTakeFirst()

  if (!mapping) {
    return {
      error: 'Mapeamento ativo não encontrado.',
      status: 404,
    }
  }

  if (mapping.status !== 'active') {
    return {
      error: 'O mapeamento ativo está inativo.',
      status: 403,
    }
  }

  return {
    scope,
    mappingId: mapping.id,
    mappingSlug,
  }
}

/**
 * Papel de um gestor em um mapeamento específico (mapping_managers.role), usado
 * junto com isMappingAdmin/isMappingSuperuser (src/lib/auth/manager.ts) para
 * conceder permissões restritas àquele mapeamento em vez de globalmente.
 */
export async function getMappingManagerRole(
  managerId: string,
  mappingId: string,
): Promise<string | null> {
  const data = await db
    .selectFrom('mapping_managers')
    .select('role')
    .where('mapping_id', '=', mappingId)
    .where('manager_id', '=', managerId)
    .executeTakeFirst()

  return data?.role ?? null
}

export type MappingAccessContext = {
  manager: ManagerSession
  mappingId: string
  mappingSlug: string
  mappingRole: string | null
}

/**
 * Porta de entrada única para rotas que devolvem dados de um mapeamento
 * (colaboradores, respostas, config, filtros, relatórios...).
 *
 * getMappingScopeContext, sozinho, só resolve QUAL mapeamento está ativo na
 * sessão (pelo cookie active_mapping_slug) e se ele existe/está ativo — ele NÃO
 * verifica se o gestor logado tem qualquer vínculo com esse mapeamento. Rotas
 * que chamavam getMappingScopeContext diretamente (sem também checar
 * getMappingManagerRole) e só validavam a PRESENÇA do cookie manager_session
 * (em vez de validar a sessão de fato via getManagerFromSession) permitiam que
 * qualquer requisição — mesmo com um manager_session forjado — lesse dados de
 * QUALQUER mapeamento ativo do sistema, bastando indicar outro slug no cookie
 * active_mapping_slug. Esta função corrige as duas falhas de uma vez: valida a
 * sessão de verdade e exige um vínculo real do gestor com o mapeamento
 * (mapping_managers), com bypass apenas para admin/superuser GLOBAL (equipe
 * AvaxMap, que já teria acesso via /admin).
 */
export async function requireMappingAccess(
  request: NextRequest,
): Promise<MappingAccessContext | MappingScopeError> {
  const sessionToken = request.cookies.get('manager_session')?.value
  const manager = await getManagerFromSession(sessionToken)
  if (!manager) {
    return { error: 'Não autenticado', status: 401 }
  }

  const scope = await getMappingScopeContext(request, { requireMappingScope: true })
  if ('error' in scope) {
    return scope
  }

  const mappingId = scope.mappingId as string
  const mappingRole = await getMappingManagerRole(manager.id, mappingId)

  if (mappingRole === null && !isAdmin(manager.role)) {
    return { error: 'Sem acesso a este mapeamento.', status: 403 }
  }

  return {
    manager,
    mappingId,
    mappingSlug: scope.mappingSlug as string,
    mappingRole,
  }
}
