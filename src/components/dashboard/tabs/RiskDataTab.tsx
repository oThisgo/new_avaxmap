'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useThemeTokens } from '@/lib/theme'
import { BRAND_COLORS } from '@/lib/brand'
import { Alert, AlertPresence } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { readJsonResponse } from '@/lib/http/read-json-response'

/**
 * Aba Dados de Risco: lista nominal dos colaboradores com indicador de risco de
 * suicídio.
 *
 * É a única tela da plataforma que quebra o anonimato das respostas, e existe
 * por dever de cuidado — identificar quem precisa de encaminhamento. Por isso o
 * acesso é sempre precedido de reconfirmação de senha, mesmo com a sessão já
 * aberta: garante que quem está diante da tela é de fato a pessoa autorizada, e
 * torna o acesso um ato deliberado em vez de um clique de navegação.
 */

interface RiskCase {
  collaborator_id: string
  name: string | null
  email: string | null
  birth_date: string | null
  gender: string | null
  area: string | null
  role: string | null
  exposures: string[]
  submitted_at: string
}

/** Recarga periódica enquanto a aba está aberta — "tempo real" na prática. */
const REFRESH_INTERVAL_MS = 60_000

function formatDate(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

function formatDateTime(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('pt-BR')
}

/** Idade só é derivada quando a data de nascimento é uma data completa válida. */
function ageFrom(birthDate: string | null): string {
  if (!birthDate) return ''
  const parsed = new Date(birthDate)
  if (Number.isNaN(parsed.getTime())) return ''
  const now = new Date()
  let age = now.getUTCFullYear() - parsed.getUTCFullYear()
  const monthDelta = now.getUTCMonth() - parsed.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < parsed.getUTCDate())) age--
  if (age < 0 || age > 120) return ''
  return ` (${age} anos)`
}

interface RiskDataTabProps {
  onSeen?: () => void
}

export default function RiskDataTab({ onSeen }: Readonly<RiskDataTabProps>) {
  const T = useThemeTokens()

  const [unlocked, setUnlocked] = useState(false)
  const [password, setPassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [error, setError] = useState('')

  const [cases, setCases] = useState<RiskCase[]>([])
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Guardado em ref para o efeito de recarga não reiniciar a cada render do pai.
  const onSeenRef = useRef(onSeen)
  useEffect(() => { onSeenRef.current = onSeen }, [onSeen])

  const loadCases = useCallback(async (markAsSeen: boolean) => {
    const res = await fetch('/api/dashboard/risk-data')
    const result = await readJsonResponse<{ cases: RiskCase[]; last_seen_at: string | null }>(
      res,
      'Não foi possível carregar os dados de risco.',
    )

    if (!result.ok) {
      // 401 aqui significa concessão expirada: volta para a porta de entrada.
      if (res.status === 401) {
        setUnlocked(false)
        setError('Sua confirmação expirou. Informe a senha novamente para continuar.')
        return
      }
      setError(result.error)
      return
    }

    setError('')
    setCases(result.data.cases)
    setLastSeenAt(result.data.last_seen_at)

    if (markAsSeen) {
      await fetch('/api/dashboard/risk-data', { method: 'POST' }).catch(() => {})
      onSeenRef.current?.()
    }
  }, [])

  useEffect(() => {
    if (!unlocked) return

    let active = true
    const timer = setInterval(() => {
      if (active) loadCases(false).catch(() => {})
    }, REFRESH_INTERVAL_MS)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [unlocked, loadCases])

  async function handleUnlock(e: { preventDefault: () => void }) {
    e.preventDefault()
    setError('')
    setUnlocking(true)

    try {
      const res = await fetch('/api/dashboard/risk-data/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const result = await readJsonResponse(res, 'Não foi possível validar sua senha.')
      if (!result.ok) {
        setError(result.error)
        return
      }

      setPassword('')
      setUnlocked(true)
      setLoading(true)
      await loadCases(true)
    } catch {
      setError('Erro de conexão. Tente novamente em instantes.')
    } finally {
      setUnlocking(false)
      setLoading(false)
    }
  }

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-2xl">
        <div
          className="rounded-xl p-5 sm:p-6"
          style={{ border: `1px solid ${BRAND_COLORS.danger}55`, backgroundColor: `${BRAND_COLORS.danger}0f` }}
        >
          <h2 className="text-lg font-semibold" style={{ color: T.text }}>
            Dados sensíveis — acesso restrito
          </h2>

          <div className="mt-3 space-y-3 text-sm leading-relaxed" style={{ color: T.textMuted }}>
            <p>
              Esta área identifica <strong style={{ color: T.text }}>nominalmente</strong> os colaboradores
              que sinalizaram indicadores de risco de suicídio no questionário. É a única tela da
              plataforma em que as respostas deixam de ser anônimas, e existe para viabilizar
              acolhimento e encaminhamento profissional.
            </p>
            <p>
              O uso destes dados é restrito a essa finalidade. Compartilhar, exportar ou utilizar as
              informações para qualquer outro fim, inclusive decisões administrativas sobre a pessoa, viola a LGPD e o dever de sigilo em saúde.
            </p>
            <p>
              Confirme sua senha para prosseguir. O acesso vale por 15 minutos e o registro é
              vinculado ao seu usuário.
            </p>
          </div>

          <form onSubmit={handleUnlock} className="mt-5 flex flex-col gap-3">
            <label htmlFor="risk-password" className="text-sm font-medium" style={{ color: T.text }}>
              Sua senha
            </label>
            <Input
              id="risk-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={unlocking}
            />

            <AlertPresence show={!!error}>{error}</AlertPresence>

            <Button type="submit" loading={unlocking} disabled={unlocking || !password.trim()}>
              {unlocking ? 'Verificando...' : 'Confirmar e acessar'}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  const seenThreshold = lastSeenAt ? new Date(lastSeenAt).getTime() : null

  return (
    <div className="flex flex-col gap-5">
      <div
        className="rounded-xl p-5"
        style={{ border: `1px solid ${BRAND_COLORS.danger}55`, backgroundColor: `${BRAND_COLORS.danger}0f` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs uppercase tracking-wide" style={{ color: T.textMuted }}>
              Colaboradores com indicador de risco
            </span>
            <p className="text-3xl font-bold" style={{ color: BRAND_COLORS.danger }}>{cases.length}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadCases(true)}>
            Atualizar agora
          </Button>
        </div>
        <p className="mt-3 text-xs leading-relaxed" style={{ color: T.textMuted }}>
          Lista atualizada automaticamente a cada minuto. Dados de identificação pessoal, não
          exporte nem compartilhe fora do fluxo de acolhimento.
        </p>
      </div>

      <AlertPresence show={!!error}>{error}</AlertPresence>

      {cases.length === 0 ? (
        <Alert tone="success">
          Nenhum colaborador sinalizou indicadores de risco de suicídio neste mapeamento.
        </Alert>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface }}>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: T.surface2 }}>
                <tr>
                  <th className="px-3 py-2 text-left" style={{ color: T.textMuted }}>Nome</th>
                  <th className="px-3 py-2 text-left" style={{ color: T.textMuted }}>E-mail</th>
                  <th className="px-3 py-2 text-left" style={{ color: T.textMuted }}>Nascimento</th>
                  <th className="px-3 py-2 text-left" style={{ color: T.textMuted }}>Gênero</th>
                  <th className="px-3 py-2 text-left" style={{ color: T.textMuted }}>Indicadores</th>
                  <th className="px-3 py-2 text-left" style={{ color: T.textMuted }}>Respondido em</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((row) => {
                  const isNew = seenThreshold !== null && new Date(row.submitted_at).getTime() > seenThreshold
                  return (
                    <tr key={row.collaborator_id} style={{ borderTop: `1px solid ${T.border}` }}>
                      <td className="px-3 py-2" style={{ color: T.text }}>
                        <span className="flex items-center gap-2">
                          {isNew && (
                            <span
                              title="Novo desde seu último acesso"
                              style={{
                                width: 8, height: 8, borderRadius: '50%',
                                backgroundColor: BRAND_COLORS.danger, flexShrink: 0,
                              }}
                            />
                          )}
                          {row.name || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: T.textMuted }}>{row.email || '—'}</td>
                      <td className="px-3 py-2" style={{ color: T.textMuted }}>
                        {formatDate(row.birth_date)}{ageFrom(row.birth_date)}
                      </td>
                      <td className="px-3 py-2" style={{ color: T.textMuted }}>{row.gender || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {row.exposures.map((exposure) => (
                            <span
                              key={exposure}
                              className="rounded-full px-2 py-0.5 text-xs"
                              style={{ backgroundColor: `${BRAND_COLORS.danger}22`, color: BRAND_COLORS.danger }}
                            >
                              {exposure}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs" style={{ color: T.textMuted }}>
                        {formatDateTime(row.submitted_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y lg:hidden" style={{ borderColor: T.border }}>
            {cases.map((row) => {
              const isNew = seenThreshold !== null && new Date(row.submitted_at).getTime() > seenThreshold
              return (
                <div key={row.collaborator_id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {isNew && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: BRAND_COLORS.danger }} />
                    )}
                    <p className="font-semibold" style={{ color: T.text }}>{row.name || '—'}</p>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: T.textMuted }}>{row.email || '—'}</p>
                  <p className="mt-1 text-xs" style={{ color: T.textMuted }}>
                    {formatDate(row.birth_date)}{ageFrom(row.birth_date)} · {row.gender || '—'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {row.exposures.map((exposure) => (
                      <span
                        key={exposure}
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ backgroundColor: `${BRAND_COLORS.danger}22`, color: BRAND_COLORS.danger }}
                      >
                        {exposure}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs" style={{ color: T.textFaint }}>
                    {formatDateTime(row.submitted_at)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
