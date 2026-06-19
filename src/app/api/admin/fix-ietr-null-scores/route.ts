import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
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

  const supabase = createServerClient()
  const manager = await getManagerFromSession(session)
  if (!manager || !isSuperuser(manager.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Identifica respostas com remote_score preenchido mas sem nenhuma resposta
  // numérica válida para TRN01/TRN02/TRN03 no array JSONB answers.
  const { data: affected, error: selectErr } = await supabase
    .from('responses')
    .select('id, collaborator_id, remote_score, remote_class')
    .not('remote_score', 'is', null)

  if (selectErr) return NextResponse.json({ error: selectErr.message }, { status: 500 })

  // Filtra no lado JS quais realmente não têm respostas IETR válidas
  const IETR_CODES = new Set(['TRN01', 'TRN02', 'TRN03'])

  interface AnswerEntry { questionCode?: string; numericValue?: number | null }
  interface ResponseRow {
    id: string
    collaborator_id: string
    remote_score: number | null
    remote_class: string | null
    answers?: AnswerEntry[]
  }

  // Busca os answers apenas para as linhas candidatas
  const candidateIds = (affected ?? []).map((r) => r.id)
  if (candidateIds.length === 0) {
    return NextResponse.json({ fixed: 0, message: 'Nenhuma linha candidata encontrada.' })
  }

  const { data: withAnswers, error: answersErr } = await supabase
    .from('responses')
    .select('id, collaborator_id, remote_score, remote_class, answers')
    .in('id', candidateIds)

  if (answersErr) return NextResponse.json({ error: answersErr.message }, { status: 500 })

  const toFix = (withAnswers as ResponseRow[] ?? []).filter((r) => {
    const answers: AnswerEntry[] = Array.isArray(r.answers) ? r.answers : []
    const hasIetrAnswer = answers.some(
      (a) => a.questionCode !== undefined && IETR_CODES.has(a.questionCode) && a.numericValue != null,
    )
    return !hasIetrAnswer
  })

  if (toFix.length === 0) {
    return NextResponse.json({ fixed: 0, message: 'Nenhuma linha com erro encontrada. Dados já estão corretos.' })
  }

  const idsToFix = toFix.map((r) => r.id)

  const { error: updateErr } = await supabase
    .from('responses')
    .update({ remote_score: null, remote_class: null, remote_domains: null })
    .in('id', idsToFix)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({
    fixed: toFix.length,
    message: `${toFix.length} registro(s) corrigido(s): remote_score, remote_class e remote_domains definidos como NULL.`,
    ids: idsToFix,
  })
}
