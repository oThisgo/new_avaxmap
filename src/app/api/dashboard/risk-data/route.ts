import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { listSuicideRiskCases } from '@/lib/analytics/suicide-risk'
import { getLastSeenAt, requireRiskDataGrant } from './guard'

/**
 * GET /api/dashboard/risk-data
 *
 * Lista nominal dos colaboradores com indicador de risco de suicídio no
 * mapeamento ativo. Exige admin/superuser **e** a concessão emitida na
 * reconfirmação de senha.
 *
 * POST /api/dashboard/risk-data
 *
 * Marca os casos como vistos por este gestor (zera o indicador da aba).
 */

export async function GET(request: NextRequest) {
  const context = await requireRiskDataGrant(request)
  if (context instanceof NextResponse) return context

  try {
    const [cases, lastSeenAt] = await Promise.all([
      listSuicideRiskCases(context.mappingId),
      getLastSeenAt(context.managerId, context.mappingId),
    ])

    // O cliente destaca o que chegou depois da última visita, sem depender de
    // ter marcado como visto antes de renderizar.
    return NextResponse.json({
      cases,
      last_seen_at: lastSeenAt ? lastSeenAt.toISOString() : null,
    })
  } catch (err) {
    console.error('[risk-data] falha ao listar casos', err)
    return NextResponse.json({ error: 'Não foi possível carregar os dados de risco.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const context = await requireRiskDataGrant(request)
  if (context instanceof NextResponse) return context

  const seenAt = new Date().toISOString()

  try {
    await db
      .insertInto('risk_data_views')
      .values({
        manager_id: context.managerId,
        mapping_id: context.mappingId,
        last_seen_at: seenAt,
      })
      .onConflict((oc) =>
        oc.columns(['manager_id', 'mapping_id']).doUpdateSet({ last_seen_at: seenAt }),
      )
      .execute()
  } catch (err) {
    console.error('[risk-data] falha ao marcar como visto', err)
    return NextResponse.json({ error: 'Não foi possível registrar a visualização.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
