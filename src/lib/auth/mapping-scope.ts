import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

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

  const supabase = createServerClient()
  const { data: mapping, error } = await supabase
    .from('mappings')
    .select('id, status')
    .eq('slug', mappingSlug)
    .single()

  if (error || !mapping) {
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
