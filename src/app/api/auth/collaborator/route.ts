import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { hashCpf } from '@/lib/security/crypto'

const AUTH_WINDOW_MS = 60_000
const AUTH_LIMIT = 10

function normalizeCpf(raw: string): string {
  return raw.replace(/[.\-]/g, '').trim()
}

function normalizeGenericCredential(raw: string): string {
  return raw.trim().toLowerCase()
}

function isCpfLikeCredential(columnName: string | null | undefined): boolean {
  if (!columnName) return true
  const normalized = columnName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return /cpf|documento|tax id/.test(normalized)
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rateLimit = checkRateLimit(`auth:collaborator:${ip}`, AUTH_LIMIT, AUTH_WINDOW_MS)
  if (!rateLimit.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente em instantes.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    ((!('cpf' in body) || typeof (body as Record<string, unknown>).cpf !== 'string')
      && (!('credential' in body) || typeof (body as Record<string, unknown>).credential !== 'string'))
  ) {
    return NextResponse.json({ error: 'Credencial é obrigatória.' }, { status: 400 })
  }

  const payload = body as Record<string, unknown>
  const rawCredential =
    typeof payload.credential === 'string'
      ? payload.credential
      : typeof payload.cpf === 'string'
        ? payload.cpf
        : ''
  const mappingSlug =
    typeof payload.mapping_slug === 'string' && payload.mapping_slug.trim().length > 0
      ? payload.mapping_slug.trim().toLowerCase()
      : null

  const supabase = createServerClient()

  let mappingId: string | null = null
  let mappingCredentialColumn: string | null = null

  if (mappingSlug) {
    const { data: mapping, error: mappingError } = await supabase
      .from('mappings')
      .select('id, status, config')
      .eq('slug', mappingSlug)
      .single()

    if (mappingError || !mapping || mapping.status !== 'active') {
      return NextResponse.json({ error: 'Mapeamento inválido ou inativo.' }, { status: 404 })
    }

    mappingId = mapping.id
    const config = (mapping.config ?? {}) as { credential_column?: unknown }
    mappingCredentialColumn = typeof config.credential_column === 'string' ? config.credential_column : null
  }

  const expectsCpf = isCpfLikeCredential(mappingCredentialColumn)
  const normalizedCredential = expectsCpf
    ? normalizeCpf(rawCredential)
    : normalizeGenericCredential(rawCredential)

  if (!normalizedCredential) {
    return NextResponse.json({ error: 'Credencial inválida.' }, { status: 400 })
  }

  if (expectsCpf && (normalizedCredential.length !== 11 || !/^\d{11}$/.test(normalizedCredential))) {
    return NextResponse.json({ error: 'CPF inválido.' }, { status: 400 })
  }

  type CollaboratorRow = { id: string; has_answered: boolean }

  let collaboratorQuery = supabase
    .from('collaborators')
    .select('id, has_answered')
    .eq('cpf', hashCpf(normalizedCredential))

  if (mappingId) {
    collaboratorQuery = collaboratorQuery.eq('mapping_id', mappingId)
  }

  const result = await collaboratorQuery.single()

  const error = result.error
  const collaborator = result.data as CollaboratorRow | null

  if (error || !collaborator) {
    // Resposta genérica para não vazar informações sobre CPFs cadastrados
    return NextResponse.json({ error: 'Credencial não encontrada. Verifique se você está cadastrado na pesquisa.' }, { status: 401 })
  }

  if (collaborator.has_answered) {
    return NextResponse.json({ error: 'Você já respondeu esta pesquisa.' }, { status: 403 })
  }

  const cookieStore = await cookies()
  cookieStore.set('collaborator_id', collaborator.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 2, // 2 horas
  })

  cookieStore.set('collaborator_mapping_slug', mappingSlug ?? '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: mappingSlug ? 60 * 60 * 2 : 0,
  })

  return NextResponse.json({ ok: true })
}
