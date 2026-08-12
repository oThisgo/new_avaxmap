'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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

type ManagerRow = {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
  created_at: string
  must_change_password: boolean
  temp_password_plain: string | null
}

const ROLE_OPTIONS = [
  { value: 'manager', label: 'manager' },
  { value: 'admin', label: 'admin' },
  { value: 'superuser', label: 'superuser' },
]

export default function ManagersAdminPage() {
  const router = useRouter()
  const T = useThemeTokens()

  const [managers, setManagers] = useState<ManagerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('manager')
  const [submitting, setSubmitting] = useState(false)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function loadManagers() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/managers')
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Falha ao listar gestores.')
        return
      }
      setManagers(data.managers ?? [])
    } catch {
      setError('Erro de conexão ao carregar gestores.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadManagers()
  }, [])

  async function handleCreateManager(e: { preventDefault: () => void }) {
    e.preventDefault()
    setError('')
    setTemporaryPassword('')

    if (!name.trim() || !email.trim()) {
      setError('Nome e e-mail são obrigatórios.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          role,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível criar o gestor.')
        return
      }

      setTemporaryPassword(data.temporary_password ?? '')
      setName('')
      setEmail('')
      setRole('manager')
      await loadManagers()
    } catch {
      setError('Erro de conexão ao criar gestor.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetPassword(managerId: string) {
    setError('')
    setTemporaryPassword('')

    try {
      const res = await fetch('/api/admin/managers/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager_id: managerId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Falha ao redefinir senha.')
        return
      }

      setTemporaryPassword(data.temporary_password ?? '')
      await loadManagers()
    } catch {
      setError('Erro de conexão ao redefinir senha.')
    }
  }

  async function handleDeleteManager(managerId: string) {
    setError('')
    try {
      const res = await fetch('/api/admin/managers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager_id: managerId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Falha ao excluir gestor.')
        return
      }
      setConfirmDeleteId(null)
      await loadManagers()
    } catch {
      setError('Erro de conexão ao excluir gestor.')
    }
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8" style={{ backgroundColor: T.bg, color: T.text }}>
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: T.textMuted }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Dashboard
            </button>
            <span style={{ color: T.border }}>/</span>
            <span className="text-sm" style={{ color: T.text }}>Gestores</span>
          </div>
          <ThemeToggle />
        </div>

        <Card className="p-5">
          <h1 className="text-xl font-semibold mb-1">Contas internas AvaxMap</h1>
          <p className="text-sm mb-4" style={{ color: T.textMuted }}>
            Área exclusiva da equipe AvaxMap (superuser global) para criar contas internas e redefinir senhas
            temporárias. Não tem relação com os gestores de um mapeamento de cliente — esses são cadastrados na
            tela de edição de cada mapeamento (Dashboard do cliente → mapeamento → Gestores).
          </p>

          <AlertPresence show={!!error}>{error}</AlertPresence>

          {temporaryPassword && (
            <div className="rounded-lg px-4 py-3 mb-4 mt-4" style={{ backgroundColor: `${BRAND_COLORS.primary}22`, border: `1px solid ${BRAND_COLORS.primary}66` }}>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: T.textFaint }}>Senha temporária gerada</p>
              <p className="text-lg font-semibold" style={{ color: BRAND_COLORS.primary }}>{temporaryPassword}</p>
              <p className="text-xs mt-1" style={{ color: T.textMuted }}>
                Entregue essa senha ao gestor. No primeiro login ele será obrigado a definir a senha definitiva.
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : (
            <>
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
                        <td className="px-3 py-2">{m.role}</td>
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
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleResetPassword(m.id)}>
                              Redefinir senha
                            </Button>
                            {confirmDeleteId === m.id ? (
                              <>
                                <Button variant="danger" size="sm" onClick={() => handleDeleteManager(m.id)}>
                                  Confirmar
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
                                  Cancelar
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setConfirmDeleteId(m.id)}
                                style={{ color: BRAND_COLORS.danger, borderColor: `${BRAND_COLORS.danger}66` }}
                              >
                                Excluir
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {managers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center" style={{ color: T.textFaint }}>
                          Nenhum gestor encontrado.
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
                    <p className="mt-2 text-xs" style={{ color: T.textFaint }}>Perfil: <span style={{ color: T.text }}>{m.role}</span></p>
                    {m.temp_password_plain && (
                      <span className="mt-2 inline-block font-mono text-xs px-2 py-1 rounded-md" style={{ backgroundColor: `${BRAND_COLORS.primary}15`, color: BRAND_COLORS.primary, border: `1px solid ${BRAND_COLORS.primary}40` }}>
                        {m.temp_password_plain}
                      </span>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleResetPassword(m.id)}>
                        Redefinir senha
                      </Button>
                      {confirmDeleteId === m.id ? (
                        <>
                          <Button variant="danger" size="sm" onClick={() => handleDeleteManager(m.id)}>
                            Confirmar
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmDeleteId(m.id)}
                          style={{ color: BRAND_COLORS.danger, borderColor: `${BRAND_COLORS.danger}66` }}
                        >
                          Excluir
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {managers.length === 0 && (
                  <p className="text-center text-sm py-6" style={{ color: T.textFaint }}>Nenhum gestor encontrado.</p>
                )}
              </div>
            </>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold mb-1">Adicionar novo gestor</h2>
          <p className="text-sm mb-4" style={{ color: T.textMuted }}>
            O sistema vai gerar uma senha temporária aleatória para o primeiro acesso.
          </p>

          <form onSubmit={handleCreateManager} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" required />
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" required />
            <Select value={role} onChange={setRole} options={ROLE_OPTIONS} />
            <Button type="submit" loading={submitting}>
              {submitting ? 'Criando...' : 'Criar gestor'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
