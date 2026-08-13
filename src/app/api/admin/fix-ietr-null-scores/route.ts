import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/pool'
import { getManagerFromSession, isSuperuser } from '@/lib/auth/manager'

/**
 * POST /api/admin/fix-ietr-null-scores
 *
 * Corrige respostas onde remote_score foi gravado como 0 (e remote_class como
 * 'Situação de risco') por engano, quando o colaborador não respondeu nenhuma
 * questão do módulo IETR. Apenas superusers podem chamar este endpoint.
 *
 * Este endpoint é idempotente e pode ser chamado mais de uma vez sem danos.
 */
export async function POST(request: NextRequest) {
  const session = request.cookies.get('manager_session')?.value
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const manager = await getManagerFromSession(session)
  if (!manager || !isSuperuser(manager.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Identifica respostas com remote_score preenchido mas sem nenhuma resposta
  // numérica válida para TRN01/TRN02/TRN03 no array JSONB answers.
  let affected
  try {
    affected = await db
      .selectFrom('responses')
      .select(['id', 'collaborator_id', 'remote_score', 'remote_class'])
      .where('remote_score', 'is not', null)
      .execute()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao buscar respostas.' }, { status: 500 })
  }

  // Filtra no lado JS quais realmente não têm respostas IETR válidas
  const IETR_CODES = new Set(['TRN01', 'TRN02', 'TRN03'])

  interface AnswerEntry { questionCode?: string; numericValue?: number | null }

  // Busca os answers apenas para as linhas candidatas
  const candidateIds = affected.map((r) => r.id)
  if (candidateIds.length === 0) {
    return NextResponse.json({ fixed: 0, message: 'Nenhuma linha candidata encontrada.' })
  }

  let withAnswers
  try {
    withAnswers = await db
      .selectFrom('responses')
      .select(['id', 'collaborator_id', 'remote_score', 'remote_class', 'answers'])
      .where('id', 'in', candidateIds)
      .execute()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao buscar respostas.' }, { status: 500 })
  }

  const toFix = withAnswers.filter((r) => {
    const answers: AnswerEntry[] = Array.isArray(r.answers) ? (r.answers as unknown as AnswerEntry[]) : []
    const hasIetrAnswer = answers.some(
      (a) => a.questionCode !== undefined && IETR_CODES.has(a.questionCode) && a.numericValue != null,
    )
    return !hasIetrAnswer
  })

  if (toFix.length === 0) {
    return NextResponse.json({ fixed: 0, message: 'Nenhuma linha com erro encontrada. Dados já estão corretos.' })
  }

  const idsToFix = toFix.map((r) => r.id)

  try {
    await db
      .updateTable('responses')
      .set({ remote_score: null, remote_class: null, remote_domains: null })
      .where('id', 'in', idsToFix)
      .execute()
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro ao atualizar respostas.' }, { status: 500 })
  }

  return NextResponse.json({
    fixed: toFix.length,
    message: `${toFix.length} registro(s) corrigido(s): remote_score, remote_class e remote_domains definidos como NULL.`,
    ids: idsToFix,
  })
}
