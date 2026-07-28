'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_COLORS } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { AlertPresence } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'

type MappingDetail = {
  id: string
  name: string
  slug: string
  description: string | null
  status: 'draft' | 'active' | 'archived'
  module_type: 'HSE' | 'REMOTE' | null
  is_demo: boolean
  created_at: string
  updated_at: string
}

type ManagerRow = {
  id: string
  name: string
  email: string
  mapping_role: string
  is_active: boolean
  temp_password_plain: string | null
  must_change_password: boolean
}

type ManagerRole = 'superuser' | 'admin' | 'manager' | 'analyst' | 'viewer'

const ROLE_OPTIONS: ReadonlyArray<{ value: ManagerRole; label: string }> = [
  { value: 'superuser', label: 'Superuser (base de trabalhadores, exportações, relatórios)' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Gestor' },
  { value: 'analyst', label: 'Analista' },
  { value: 'viewer', label: 'Visualizador' },
]

const STATUS_LABELS: Record<MappingDetail['status'], string> = {
  draft: 'Rascunho',
  active: 'Ativo',
  archived: 'Arquivado',
}

const STATUS_OPTIONS: ReadonlyArray<{ value: MappingDetail['status']; label: string }> = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'active', label: 'Ativo' },
  { value: 'archived', label: 'Arquivado' },
]

export default function MappingConfigPage() {
  const params = useParams<{ id: string }>()
  const mappingId = params.id
  const router = useRouter()
  const T = useThemeTokens()

  const [mapping, setMapping] = useState<MappingDetail | null>(null)
  const [managers, setManagers] = useState<ManagerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ManagerRole>('manager')
  const [submitting, setSubmitting] = useState(false)
  const [temporaryPassword, setTemporaryPassword] = useState('')

  const [statusDraft, setStatusDraft] = useState<MappingDetail['status']>('draft')
  const [statusSaving, setStatusSaving] = useState(false)

  async function loadMapping() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/client/mappings/${mappingId}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível carregar o mapeamento.')
        return
      }
      setMapping(data.mapping ?? null)
      setManagers(data.managers ?? [])
      if (data.mapping?.status) setStatusDraft(data.mapping.status)
    } catch {
      setError('Erro de conexão ao carregar o mapeamento.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (mappingId) loadMapping()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappingId])

  async function handleSaveStatus() {
    if (!mapping || statusDraft === mapping.status) return
    setError('')
    setStatusSaving(true)
    try {
      const res = await fetch(`/api/client/mappings/${mappingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusDraft }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível atualizar o status.')
        return
      }
      await loadMapping()
    } catch {
      setError('Erro de conexão ao atualizar o status.')
    } finally {
      setStatusSaving(false)
    }
  }

  async function handleAddManager(e: { preventDefault: () => void }) {
    e.preventDefault()
    setError('')
    setTemporaryPassword('')

    if (!name.trim() || !email.trim()) {
      setError('Nome e e-mail são obrigatórios.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/mappings/${mappingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível adicionar o gestor.')
        return
      }

      if (data.created_manager_credential?.temporary_password) {
        setTemporaryPassword(data.created_manager_credential.temporary_password)
      }
      setName('')
      setEmail('')
      setRole('manager')
      await loadMapping()
    } catch {
      setError('Erro de conexão ao adicionar gestor.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetCode(managerId: string) {
    setError('')
    setTemporaryPassword('')
    try {
      const res = await fetch(`/api/client/mappings/${mappingId}/managers/${managerId}/reset-code`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Falha ao redefinir código de acesso.')
        return
      }
      setTemporaryPassword(data.temporary_password ?? '')
      await loadMapping()
    } catch {
      setError('Erro de conexão ao redefinir código de acesso.')
    }
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: T.bg, color: T.text }}>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/dashboard/client')}
              className="flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: T.textMuted }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Meus mapeamentos
            </button>
            <span style={{ color: T.border }}>/</span>
            <span className="text-sm" style={{ color: T.text }}>Configuração do mapeamento</span>
          </div>
          <ThemeToggle />
        </div>

        {loading && (
          <div className="flex flex-col gap-6">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        )}

        {!loading && error && !mapping && <AlertPresence show>{error}</AlertPresence>}

        {!loading && mapping && (
          <>
            <Card className="mb-6 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold sm:text-2xl">{mapping.name}</h1>
                <Badge>{STATUS_LABELS[mapping.status]}</Badge>
                {mapping.is_demo && <Badge tone="primary">Demo</Badge>}
              </div>
              <p className="mt-2 text-sm" style={{ color: T.textMuted }}>
                {mapping.description ?? 'Sem descrição.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs" style={{ color: T.textFaint }}>
                <span>Slug: {mapping.slug}</span>
                <span>{mapping.module_type ?? 'Configuração customizada'}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <Button onClick={() => router.push(`/mapeamento/${mapping.slug}/dashboard`)}>
                  Abrir mapeamento
                </Button>

                <div className="flex items-end gap-2">
                  <label className="text-sm">
                    <span className="mb-1.5 block text-xs" style={{ color: T.textMuted }}>Status do mapeamento</span>
                    <Select
                      className="w-44"
                      value={statusDraft}
                      onChange={(v) => setStatusDraft(v as MappingDetail['status'])}
                      options={STATUS_OPTIONS}
                    />
                  </label>
                  <Button
                    variant="outline"
                    onClick={handleSaveStatus}
                    disabled={statusSaving || statusDraft === mapping.status}
                    loading={statusSaving}
                  >
                    {statusSaving ? 'Salvando...' : 'Salvar status'}
                  </Button>
                </div>
              </div>
            </Card>

            <AlertPresence show={!!error}>{error}</AlertPresence>

            {temporaryPassword && (
              <div className="rounded-lg px-4 py-3 mb-6 mt-4" style={{ backgroundColor: `${BRAND_COLORS.primary}22`, border: `1px solid ${BRAND_COLORS.primary}66` }}>
                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: T.textFaint }}>Código de acesso gerado</p>
                <p className="text-lg font-semibold" style={{ color: BRAND_COLORS.primary }}>{temporaryPassword}</p>
                <p className="text-xs mt-1" style={{ color: T.textMuted }}>
                  Entregue esse código ao gestor. No primeiro login ele será obrigado a definir a senha definitiva.
                </p>
              </div>
            )}

            <Card className="mb-6 p-5">
              <h2 className="text-lg font-semibold mb-1">Gestores cadastrados</h2>
              <p className="text-sm mb-4" style={{ color: T.textMuted }}>
                Emails e códigos de acesso dos gestores vinculados a este mapeamento.
              </p>

              {/* Tabela — telas médias/grandes */}
              <div className="hidden md:block overflow-x-auto rounded-lg" style={{ border: `1px solid ${T.border}` }}>
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: T.surface2 }}>
                    <tr>
                      <th className="text-left px-3 py-2">Nome</th>
                      <th className="text-left px-3 py-2">E-mail</th>
                      <th className="text-left px-3 py-2">Perfil</th>
                      <th className="text-left px-3 py-2">Código de acesso</th>
                      <th className="text-left px-3 py-2">Primeiro acesso</th>
                      <th className="text-left px-3 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managers.map((m) => (
                      <tr key={m.id} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td className="px-3 py-2">{m.name}</td>
                        <td className="px-3 py-2" style={{ color: T.textMuted }}>{m.email}</td>
                        <td className="px-3 py-2">{m.mapping_role}</td>
                        <td className="px-3 py-2">
                          {m.temp_password_plain ? (
                            <span className="font-mono text-xs px-2 py-1 rounded-md" style={{ backgroundColor: `${BRAND_COLORS.primary}15`, color: BRAND_COLORS.primary, border: `1px solid ${BRAND_COLORS.primary}40` }}>
                              {m.temp_password_plain}
                            </span>
                          ) : (
                            <span style={{ color: T.textFaint }}>—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={m.must_change_password ? 'primary' : 'success'}>
                            {m.must_change_password ? 'Pendente' : 'Concluído'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Button variant="outline" size="sm" onClick={() => handleResetCode(m.id)}>
                            Redefinir código
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {managers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center" style={{ color: T.textFaint }}>
                          Nenhum gestor vinculado a este mapeamento.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Cards — mobile */}
              <div className="md:hidden flex flex-col gap-3">
                {managers.map((m) => (
                  <div key={m.id} className="rounded-lg p-3" style={{ border: `1px solid ${T.border}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: T.text }}>{m.name}</p>
                        <p className="text-xs" style={{ color: T.textMuted }}>{m.email}</p>
                      </div>
                      <Badge tone={m.must_change_password ? 'primary' : 'success'}>
                        {m.must_change_password ? 'Pendente' : 'Concluído'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs" style={{ color: T.textFaint }}>Perfil: <span style={{ color: T.text }}>{m.mapping_role}</span></p>
                    {m.temp_password_plain && (
                      <span className="mt-2 inline-block font-mono text-xs px-2 py-1 rounded-md" style={{ backgroundColor: `${BRAND_COLORS.primary}15`, color: BRAND_COLORS.primary, border: `1px solid ${BRAND_COLORS.primary}40` }}>
                        {m.temp_password_plain}
                      </span>
                    )}
                    <div className="mt-3">
                      <Button variant="outline" size="sm" onClick={() => handleResetCode(m.id)}>
                        Redefinir código
                      </Button>
                    </div>
                  </div>
                ))}
                {managers.length === 0 && (
                  <p className="text-center text-sm py-6" style={{ color: T.textFaint }}>Nenhum gestor vinculado a este mapeamento.</p>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="text-lg font-semibold mb-1">Adicionar gestor</h2>
              <p className="text-sm mb-4" style={{ color: T.textMuted }}>
                O sistema vai gerar um código de acesso temporário para o primeiro login.
              </p>

              <form onSubmit={handleAddManager} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome"
                  required
                />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@empresa.com"
                  required
                />
                <Select value={role} onChange={(v) => setRole(v as ManagerRole)} options={ROLE_OPTIONS} />
                <Button type="submit" loading={submitting}>
                  {submitting ? 'Adicionando...' : 'Adicionar gestor'}
                </Button>
              </form>
            </Card>
          </>
        )}
      </div>
    </main>
  )
}
