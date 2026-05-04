import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createServerClient } from '@/lib/supabase/server'
import { parseTallyPayload } from '@/lib/tally/parser'
import type { TallyWebhookPayload } from '@/lib/tally/types'
import { calculateHSE } from '@/lib/analytics/hse'
import { calculateRemote } from '@/lib/analytics/remote'
import { encryptFieldOrNull } from '@/lib/security/crypto'

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

type SupabaseClient = ReturnType<typeof createServerClient>

// Salva os campos opcionais (which_disability, remote_status) via RPC para contornar
// o schema cache do PostgREST no Supabase Cloud, que não reconhece colunas adicionadas
// depois que o servidor subiu, mesmo após NOTIFY pgrst 'reload schema'.
// A função SQL `save_optional_collaborator_fields` executa UPDATE direto no Postgres.
async function saveOptionalFields(
  supabase: SupabaseClient,
  collaboratorId: string,
  whichDisability: string | null,
  remoteStatus: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('save_optional_collaborator_fields', {
    p_id: collaboratorId,
    p_which_disability: whichDisability,
    p_remote_status: remoteStatus,
  })
  if (error) {
    console.error('[webhook] erro ao salvar campos opcionais via RPC', error.message)
  } else {
    console.log('[webhook] campos opcionais salvos OK', { which_disability: whichDisability, remote_status: remoteStatus })
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
      job_observations: parsed.jobObservations ?? null,
    })
    .select('id')
    .single()

  const responseRow = responseInsert.data as { id: string } | null

  if (!responseRow) {
    console.error('[webhook] erro ao inserir response', responseInsert.error)
    return NextResponse.json({ error: 'Erro interno ao salvar resposta.' }, { status: 500 })
  }

  // 11. Atualizar has_answered e dados sociodemográficos do colaborador.
  // birth_date, gender e race_color vêm do CSV e NÃO são lidos do formulário.
  // which_disability e remote_status são salvos via RPC (bypassa o schema cache do PostgREST).
  const socio = parsed.socio
  const disabilityRaw = (socio.disability ?? '').toLowerCase().trim()
  const hasDisability = disabilityRaw.startsWith('sim') || ['yes', 'true', '1'].includes(disabilityRaw)
  const whichDisability = hasDisability ? (socio.which_disability ?? null) : null
  const remoteStatusRaw = socio.remote_status ?? null

  console.log('[webhook] socio parsed', {
    disability: socio.disability, hasDisability,
    which_disability: socio.which_disability, whichDisability,
    remote_status: socio.remote_status,
  })

  const { error: coreUpdateError } = await supabase
    .from('collaborators')
    .update({
      has_answered: true,
      marital_status: encryptFieldOrNull(socio.marital_status),
      education_level: encryptFieldOrNull(socio.education_level),
      disability: encryptFieldOrNull(socio.disability),
    })
    .eq('id', parsed.userId)

  if (coreUpdateError) {
    console.error('[webhook] erro ao atualizar campos base', coreUpdateError.message)
  }

  await saveOptionalFields(supabase, parsed.userId, whichDisability, remoteStatusRaw)

  console.log('[webhook] processado com sucesso', {
    userId: parsed.userId,
    responseId: responseRow.id,
    hse: { score: hseResult.finalScore, class: hseResult.classification },
    remote: { score: remoteResult.finalScore, class: remoteResult.classification },
  })

  return NextResponse.json({ ok: true })
}
