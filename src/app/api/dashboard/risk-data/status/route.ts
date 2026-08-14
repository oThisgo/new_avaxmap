import { NextRequest, NextResponse } from 'next/server'
import { countSuicideRiskCases } from '@/lib/analytics/suicide-risk'
import { getLastSeenAt, requireRiskDataAdmin } from '../guard'

/**
 * GET /api/dashboard/risk-data/status
 *
 * Contadores para o indicador da aba (total e quantos são novos para este
 * gestor). Exige admin/superuser, mas **não** a confirmação de senha: só
 * devolve números, nenhum dado pessoal. Exigir a senha aqui inviabilizaria a
 * própria notificação, que precisa aparecer antes de o gestor abrir a aba.
 */
export async function GET(request: NextRequest) {
  const context = await requireRiskDataAdmin(request)
  if (context instanceof NextResponse) return context

  try {
    const lastSeenAt = await getLastSeenAt(context.managerId, context.mappingId)
    const counts = await countSuicideRiskCases(context.mappingId, lastSeenAt)
    return NextResponse.json(counts)
  } catch (err) {
    console.error('[risk-data] falha ao contar casos', err)
    return NextResponse.json({ error: 'Não foi possível verificar os dados de risco.' }, { status: 500 })
  }
}
