import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { calculateHSE } from '@/lib/analytics/hse'
import { calculateRemote } from '@/lib/analytics/remote'
import { IETR_CODES } from '@/lib/analytics/ietr-definition'
import { HSE_CODES } from '@/lib/analytics/hse-definition'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { encryptFieldOrNull } from '@/lib/security/crypto'
import { normalizeMappingConfig } from '@/lib/mapping/config'

const SUBMIT_WINDOW_MS = 60_000
const SUBMIT_LIMIT = 6

type SupabaseClient = ReturnType<typeof createServerClient>

interface SubmitAnswerInput {
  questionCode: string
  rawValue: string
}

interface SubmitBody {
  socio: {
    birth_date: string
    gender: string
    race_color: string
    marital_status: string
    education_level: string
    disability: string
    which_disability?: string
    remote_status: string
  }
  hseAnswers: SubmitAnswerInput[]
  ietrAnswers: SubmitAnswerInput[]
  jobObservations?: string | null
}

function parseJsonBody(raw: unknown): SubmitBody | null {
  if (!raw || typeof raw !== 'object') return null

  const body = raw as Partial<SubmitBody>
  if (!body.socio || !Array.isArray(body.hseAnswers) || !Array.isArray(body.ietrAnswers)) {
    return null
  }

  return body as SubmitBody
}

function validateRequiredSocioFields(
  socio: SubmitBody['socio'],
  requiredKeys: Array<keyof SubmitBody['socio']>,
): string | null {
  if (requiredKeys.some((key) => typeof socio[key] !== 'string' || !(socio[key] as string).trim())) {
    return 'Campos sociodemográficos obrigatórios ausentes.'
  }

  if (requiredKeys.includes('disability') && /^sim/i.test(socio.disability.trim()) && !socio.which_disability?.trim()) {
    return 'Informe o tipo de deficiência.'
  }

  return null
}

function buildAnswerMap(codes: string[]): Record<string, string | null> {
  return Object.fromEntries(codes.map((code) => [code, null]))
}

function applyAnswers(
  targetMap: Record<string, string | null>,
  inputs: SubmitAnswerInput[],
  validCodes: string[],
  invalidCodeLabel: string,
): string | null {
  for (const answer of inputs) {
    if (!answer || typeof answer.questionCode !== 'string' || typeof answer.rawValue !== 'string') {
      return 'Formato de resposta inválido.'
    }

    if (!validCodes.includes(answer.questionCode)) {
      return `${invalidCodeLabel}${answer.questionCode}`
    }

    targetMap[answer.questionCode] = answer.rawValue
  }

  return null
}

function getMissingCodes(answerMap: Record<string, string | null>, codes: string[]): string[] {
  return codes.filter((code) => !answerMap[code])
}

function validateRequiredAnswers(
  requiresHse: boolean,
  requiresIetr: boolean,
  hseAnswerMap: Record<string, string | null>,
  ietrAnswerMap: Record<string, string | null>,
): string | null {
  if (requiresHse) {
    const missingHseCodes = getMissingCodes(hseAnswerMap, HSE_CODES)
    if (missingHseCodes.length > 0) {
      return `Questões obrigatórias HSE sem resposta: ${missingHseCodes.join(', ')}`
    }
  }

  if (!requiresIetr) return null

  const missingIetrCodes = getMissingCodes(ietrAnswerMap, IETR_CODES)
  if (missingIetrCodes.length > 0) {
    return `Questões obrigatórias IETR sem resposta: ${missingIetrCodes.join(', ')}`
  }

  return null
}

function validateRemoteResult(
  requiresIetr: boolean,
  remoteResult: { finalScore: number | null; classification: string | null },
): string | null {
  if (requiresIetr && (remoteResult.finalScore === null || remoteResult.classification === null)) {
    return 'Não foi possível calcular o resultado do IETR.'
  }

  return null
}

function clearCollaboratorCookie(response: NextResponse): NextResponse {
  response.cookies.set('collaborator_id', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })

  response.cookies.set('collaborator_mapping_slug', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })

  response.cookies.set('collaborator_lgpd_accepted', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })

  return response
}

async function saveOptionalFields(
  supabase: SupabaseClient,
  collaboratorId: string,
  remoteStatus: string,
): Promise<void> {
  const { error } = await supabase.rpc('save_optional_collaborator_fields', {
    p_id: collaboratorId,
    p_remote_status: remoteStatus,
  })

  if (error) {
    console.error('[responses] erro ao salvar remote_status via RPC', error.message)
  }
}

export async function POST(request: NextRequest) {
  const collaboratorId = request.cookies.get('collaborator_id')?.value
  const collaboratorMappingSlug = request.cookies.get('collaborator_mapping_slug')?.value
  const lgpdAccepted = request.cookies.get('collaborator_lgpd_accepted')?.value === '1'
  if (!collaboratorId) {
    return NextResponse.json({ error: 'Sessão expirada. Faça login novamente.' }, { status: 401 })
  }

  if (!lgpdAccepted) {
    return NextResponse.json({ error: 'Aceite LGPD obrigatório antes de responder a pesquisa.' }, { status: 403 })
  }

  const ip = getClientIp(request.headers)
  const limiter = checkRateLimit(`submit:collaborator:${collaboratorId}:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)
  if (!limiter.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000))
    return NextResponse.json(
      { error: 'Muitas tentativas em sequência. Aguarde alguns segundos.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const body = parseJsonBody(rawBody)
  if (!body) {
    return NextResponse.json({ error: 'Estrutura de submissão inválida.' }, { status: 400 })
  }

  let mappingConfig = normalizeMappingConfig(null)

  const hseAnswerMap = buildAnswerMap(HSE_CODES)
  const ietrAnswerMap = buildAnswerMap(IETR_CODES)

  const hseApplyError = applyAnswers(
    hseAnswerMap,
    body.hseAnswers,
    HSE_CODES,
    'Questão HSE inválida: ',
  )
  if (hseApplyError) {
    return NextResponse.json({ error: hseApplyError }, { status: 400 })
  }

  const ietrApplyError = applyAnswers(
    ietrAnswerMap,
    body.ietrAnswers,
    IETR_CODES,
    'Questão inválida: ',
  )
  if (ietrApplyError) {
    return NextResponse.json({ error: ietrApplyError }, { status: 400 })
  }

  const supabase = createServerClient()

  let mappingIdFromSlug: string | null = null
  if (collaboratorMappingSlug) {
    const { data: mapping } = await supabase
      .from('mappings')
      .select('id, status, config')
      .eq('slug', collaboratorMappingSlug)
      .single()

    if (!mapping || mapping.status !== 'active') {
      return NextResponse.json({ error: 'Mapeamento inválido ou inativo.' }, { status: 401 })
    }

    mappingIdFromSlug = mapping.id
    mappingConfig = normalizeMappingConfig(mapping.config)
  }

  const hasSocioModule = mappingConfig.modules.includes('sociodemografico')
  const hasHseModule = mappingConfig.modules.includes('hse')
  const hasIetrModule = mappingConfig.modules.includes('ietr')

  const requiredSocioKeys: Array<keyof SubmitBody['socio']> = []
  if (hasSocioModule) {
    const hasBirthDateFromCsv = !!mappingConfig.column_mapping.birth_date || !!mappingConfig.column_mapping.age_range
    const hasGenderFromCsv = !!mappingConfig.column_mapping.gender
    const hasRaceFromCsv = !!mappingConfig.column_mapping.race_color
    const hasMaritalFromCsv = !!mappingConfig.column_mapping.marital_status
    const hasEducationFromCsv = !!mappingConfig.column_mapping.education_level
    const hasDisabilityFromCsv = !!mappingConfig.column_mapping.disability

    if (mappingConfig.demographic_columns.includes('age_range') && !hasBirthDateFromCsv) requiredSocioKeys.push('birth_date')
    if (mappingConfig.demographic_columns.includes('gender') && !hasGenderFromCsv) requiredSocioKeys.push('gender')
    if (mappingConfig.demographic_columns.includes('race_color') && !hasRaceFromCsv) requiredSocioKeys.push('race_color')
    if (mappingConfig.demographic_columns.includes('marital_status') && !hasMaritalFromCsv) requiredSocioKeys.push('marital_status')
    if (mappingConfig.demographic_columns.includes('education_level') && !hasEducationFromCsv) requiredSocioKeys.push('education_level')
    if (mappingConfig.demographic_columns.includes('disability') && !hasDisabilityFromCsv) requiredSocioKeys.push('disability')
    if (hasIetrModule) requiredSocioKeys.push('remote_status')
  }

  const socioValidationError = validateRequiredSocioFields(body.socio, requiredSocioKeys)
  if (socioValidationError) {
    return NextResponse.json({ error: socioValidationError }, { status: 400 })
  }

  const requiresIetr = hasIetrModule && (!hasSocioModule || !/^n[aã]o/i.test(body.socio.remote_status.trim()))

  const requiredAnswersError = validateRequiredAnswers(hasHseModule, requiresIetr, hseAnswerMap, ietrAnswerMap)
  if (requiredAnswersError) {
    return NextResponse.json({ error: requiredAnswersError }, { status: 400 })
  }

  const collaboratorResult = await supabase
    .from('collaborators')
    .select('id, has_answered, mapping_id')
    .eq('id', collaboratorId)
    .single()

  const collaborator = collaboratorResult.data as {
    id: string
    has_answered: boolean
    mapping_id: string | null
  } | null
  if (!collaborator) {
    return NextResponse.json({ error: 'Colaborador não encontrado.' }, { status: 404 })
  }

  if (mappingIdFromSlug && collaborator.mapping_id !== mappingIdFromSlug) {
    return NextResponse.json({ error: 'Colaborador não pertence ao mapeamento ativo.' }, { status: 403 })
  }

  if (collaborator.has_answered) {
    return NextResponse.json({ error: 'Esta pesquisa já foi respondida.' }, { status: 409 })
  }

  const hseResult = calculateHSE(hseAnswerMap)
  const remoteResult = calculateRemote(ietrAnswerMap)
  const remoteResultError = validateRemoteResult(requiresIetr, remoteResult)
  if (remoteResultError) {
    return NextResponse.json({ error: remoteResultError }, { status: 400 })
  }

  const answersJson = [
    ...(hasHseModule ? hseResult.answers.map((a) => ({
      questionCode: a.questionCode,
      rawValue: a.rawValue,
      numericValue: a.numericValue,
      riskValue: a.riskValue,
    })) : []),
    ...(hasIetrModule ? remoteResult.answers.map((a) => ({
      questionCode: a.questionCode,
      rawValue: a.rawValue,
      numericValue: a.numericValue,
      riskValue: a.riskValue,
    })) : []),
  ]

  const hseDomainsJson = hasHseModule ? hseResult.domains.map((d) => ({
    domain: d.domain,
    weight: d.weight,
    score: d.score,
    weightedScore: d.weightedScore,
  })) : []

  const remoteDomainsJson = hasIetrModule ? remoteResult.domains.map((d) => ({
    domain: d.domain,
    weight: d.weight,
    score: d.score,
    weightedScore: d.weightedScore,
  })) : []

  const responseInsert = await supabase
    .from('responses')
    .insert({
      collaborator_id: collaborator.id,
      submitted_at: new Date().toISOString(),
      answers: answersJson,
      hse_domains: hseDomainsJson,
      remote_domains: remoteDomainsJson,
      hse_score: hasHseModule ? hseResult.finalScore : null,
      hse_class: hasHseModule ? hseResult.classification : null,
      remote_score: hasIetrModule ? remoteResult.finalScore : null,
      remote_class: hasIetrModule ? remoteResult.classification : null,
      job_observations: body.jobObservations?.trim() || null,
    })
    .select('id')
    .single()

  if (!responseInsert.data) {
    return NextResponse.json({ error: 'Falha ao salvar a resposta.' }, { status: 500 })
  }

  const collaboratorUpdate: Record<string, unknown> = {
    has_answered: true,
  }

  if (hasSocioModule) {
    if (body.socio.birth_date?.trim()) collaboratorUpdate.birth_date = encryptFieldOrNull(body.socio.birth_date)
    if (body.socio.gender?.trim()) collaboratorUpdate.gender = body.socio.gender
    if (body.socio.race_color?.trim()) collaboratorUpdate.race_color = body.socio.race_color
    if (body.socio.marital_status?.trim()) collaboratorUpdate.marital_status = encryptFieldOrNull(body.socio.marital_status)
    if (body.socio.education_level?.trim()) collaboratorUpdate.education_level = encryptFieldOrNull(body.socio.education_level)
    if (body.socio.disability?.trim()) collaboratorUpdate.disability = encryptFieldOrNull(body.socio.disability)
    collaboratorUpdate.which_disability = body.socio.which_disability?.trim() || null
  }

  const { error: coreUpdateError } = await supabase
    .from('collaborators')
    .update(collaboratorUpdate)
    .eq('id', collaborator.id)

  if (coreUpdateError) {
    console.error('[responses] erro ao atualizar has_answered', coreUpdateError.message)
  }

  if (hasSocioModule) {
    await saveOptionalFields(supabase, collaborator.id, body.socio.remote_status || (hasIetrModule ? 'Sim' : 'Não'))
  }

  return clearCollaboratorCookie(NextResponse.json({ ok: true }))
}
