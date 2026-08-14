import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { requireMappingAccess } from '@/lib/auth/mapping-scope'
import { isMappingAdmin } from '@/lib/auth/roles'
import { RISK_DATA_GRANT_COOKIE, verifyGrantToken } from '@/lib/security/grant-token'

/**
 * Autorização das rotas de Dados de Risco. Duas camadas, deliberadamente
 * separadas:
 *
 * 1. `requireRiskDataAdmin` — sessão válida, vínculo com o mapeamento e papel
 *    de admin/superuser. Basta para as **contagens** do indicador da aba, que
 *    não expõem nenhum dado pessoal.
 * 2. `requireRiskDataGrant` — tudo acima **mais** a concessão assinada emitida
 *    na reconfirmação de senha. Exigida para ler a lista nominal.
 */

export interface RiskDataContext {
  managerId: string
  mappingId: string
}

export async function requireRiskDataAdmin(
  request: NextRequest,
): Promise<RiskDataContext | NextResponse> {
  const access = await requireMappingAccess(request)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  if (!isMappingAdmin(access.manager.role, access.mappingRole)) {
    return NextResponse.json(
      { error: 'Apenas admin ou superuser podem acessar dados de risco.' },
      { status: 403 },
    )
  }

  return { managerId: access.manager.id, mappingId: access.mappingId }
}

export async function requireRiskDataGrant(
  request: NextRequest,
): Promise<RiskDataContext | NextResponse> {
  const context = await requireRiskDataAdmin(request)
  if (context instanceof NextResponse) return context

  const token = request.cookies.get(RISK_DATA_GRANT_COOKIE)?.value
  if (!verifyGrantToken(token, context.managerId, context.mappingId)) {
    return NextResponse.json(
      { error: 'Confirme sua senha para acessar os dados de risco.' },
      { status: 401 },
    )
  }

  return context
}

/** Momento em que este gestor abriu os dados de risco deste mapeamento. */
export async function getLastSeenAt(managerId: string, mappingId: string): Promise<Date | null> {
  const row = await db
    .selectFrom('risk_data_views')
    .select('last_seen_at')
    .where('manager_id', '=', managerId)
    .where('mapping_id', '=', mappingId)
    .executeTakeFirst()

  // O driver devolve timestamptz já como string ISO (ver src/lib/db/pool.ts).
  if (!row?.last_seen_at) return null
  return new Date(row.last_seen_at)
}
