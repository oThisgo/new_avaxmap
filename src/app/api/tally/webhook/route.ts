import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerClient } from '@/lib/supabase/server'
import { parseTallyPayload } from '@/lib/tally/parser'
import type { TallyWebhookPayload } from '@/lib/tally/types'
import { calculateHSE } from '@/lib/analytics/hse'
import { calculateRemote } from '@/lib/analytics/remote'

const SIGNING_SECRET = process.env.TALLY_SIGNING_SECRET

/**
 * Valida a assinatura HMAC-SHA256 enviada pelo Tally no header `tally-signature`.
 * Usa comparação de tempo constante para prevenir timing attacks.
 */
function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  // 1. Ler body bruto para validação de assinatura
  const rawBody = await request.text()

  // 2. Verificar assinatura (obrigatório se o secret estiver configurado)
  if (SIGNING_SECRET) {
    const signature = request.headers.get('tally-signature')
    if (!verifySignature(rawBody, signature, SIGNING_SECRET)) {
      return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 })
    }
  }

  // 3. Parsear payload
  let payload: TallyWebhookPayload
  try {
    payload = JSON.parse(rawBody) as TallyWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  // 4. Ignorar eventos que não são FORM_RESPONSE quando o campo estiver presente
  // (o botão Test do Tally não envia eventType — tratamos ausência como FORM_RESPONSE)
  if (payload.eventType && payload.eventType !== 'FORM_RESPONSE') {
    return NextResponse.json({ ok: true, message: 'Evento ignorado.' })
  }

  // 5. Extrair campos do formulário
  const parsed = parseTallyPayload(payload)

  if (!parsed.userId) {
    console.error('[webhook] user_id ausente no payload', { eventId: payload.eventId })
    return NextResponse.json({ error: 'user_id ausente.' }, { status: 400 })
  }

  const supabase = createServerClient()

  // 6. Buscar colaborador pelo UUID recebido no hidden field
  const collaboratorResult = await supabase
    .from('collaborators')
    .select('id, has_answered')
    .eq('id', parsed.userId)
    .single()

  const collaborator = collaboratorResult.data as { id: string; has_answered: boolean } | null

  if (!collaborator) {
    console.error('[webhook] colaborador não encontrado', { userId: parsed.userId })
    return NextResponse.json({ error: 'Colaborador não encontrado.' }, { status: 404 })
  }

  // 7. Idempotência: se já processado, confirma sem reprocessar
  if (collaborator.has_answered) {
    console.warn('[webhook] submissão duplicada ignorada', { userId: parsed.userId })
    return NextResponse.json({ ok: true, message: 'Já processado.' })
  }

  // 8. Calcular scores dos dois módulos
  const hseResult = calculateHSE(parsed.hse)
  const remoteResult = calculateRemote(parsed.remote)

  // 9. Montar arrays para JSONB
  const answersJson = [
    ...hseResult.answers.map((a) => ({
      questionCode: a.questionCode,
      rawValue: a.rawValue,
      numericValue: a.numericValue,
      riskValue: a.riskValue,
    })),
    ...remoteResult.answers.map((a) => ({
      questionCode: a.questionCode,
      rawValue: a.rawValue,
      numericValue: a.numericValue,
      riskValue: a.riskValue,
    })),
  ]

  const hseDomainsJson = hseResult.domains.map((d) => ({
    domain: d.domain,
    weight: d.weight,
    score: d.score,
    weightedScore: d.weightedScore,
  }))

  const remoteDomainsJson = remoteResult.domains.map((d) => ({
    domain: d.domain,
    weight: d.weight,
    score: d.score,
    weightedScore: d.weightedScore,
  }))

  // 10. Inserir tudo em uma única linha em responses
  const responseInsert = await supabase
    .from('responses')
    .insert({
      collaborator_id: parsed.userId,
      submitted_at: parsed.submittedAt,
      answers: answersJson,
      hse_domains: hseDomainsJson,
      remote_domains: remoteDomainsJson,
      hse_score: hseResult.finalScore,
      hse_class: hseResult.classification,
      remote_score: remoteResult.finalScore,
      remote_class: remoteResult.classification,
    })
    .select('id')
    .single()

  const responseRow = responseInsert.data as { id: string } | null

  if (!responseRow) {
    console.error('[webhook] erro ao inserir response', responseInsert.error)
    return NextResponse.json({ error: 'Erro interno ao salvar resposta.' }, { status: 500 })
  }

  // 11. Atualizar has_answered e dados sociodemográficos do colaborador
  const socio = parsed.socio
  const collaboratorUpdate = await supabase
    .from('collaborators')
    .update({
      has_answered: true,
      birth_date: socio.birth_date ?? null,
      gender: socio.gender ?? null,
      race_color: socio.race_color ?? null,
      marital_status: socio.marital_status ?? null,
      education_level: socio.education_level ?? null,
      disability: socio.disability ?? null,
    })
    .eq('id', parsed.userId)

  if (collaboratorUpdate.error) {
    console.error('[webhook] erro ao atualizar colaborador', collaboratorUpdate.error)
  }

  console.log('[webhook] processado com sucesso', {
    userId: parsed.userId,
    responseId: responseRow.id,
    hse: { score: hseResult.finalScore, class: hseResult.classification },
    remote: { score: remoteResult.finalScore, class: remoteResult.classification },
  })

  return NextResponse.json({ ok: true })
}
