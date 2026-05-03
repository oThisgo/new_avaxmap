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
    !('cpf' in body) ||
    typeof (body as Record<string, unknown>).cpf !== 'string'
  ) {
    return NextResponse.json({ error: 'CPF é obrigatório.' }, { status: 400 })
  }

  const cpf = normalizeCpf((body as Record<string, unknown>).cpf as string)

  if (cpf.length !== 11 || !/^\d{11}$/.test(cpf)) {
    return NextResponse.json({ error: 'CPF inválido.' }, { status: 400 })
  }

  const supabase = createServerClient()

  type CollaboratorRow = { id: string; has_answered: boolean }

  const result = await supabase
    .from('collaborators')
    .select('id, has_answered')
    .eq('cpf', hashCpf(cpf))
    .single()

  const error = result.error
  const collaborator = result.data as CollaboratorRow | null

  if (error || !collaborator) {
    // Resposta genérica para não vazar informações sobre CPFs cadastrados
    return NextResponse.json({ error: 'CPF não encontrado. Verifique se você está cadastrado na pesquisa.' }, { status: 401 })
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

  return NextResponse.json({ ok: true })
}
