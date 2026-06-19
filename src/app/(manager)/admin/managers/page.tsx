'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_COLORS } from '@/lib/brand'

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

const ROLE_OPTIONS = ['manager', 'admin', 'superuser']

export default function ManagersAdminPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const T = {
    bg: isDark ? BRAND_COLORS.darkBg : BRAND_COLORS.lightBg,
    surface: isDark ? BRAND_COLORS.darkSurface : BRAND_COLORS.lightSurface,
    surface2: isDark ? BRAND_COLORS.darkSurface2 : BRAND_COLORS.lightSurface2,
    border: isDark ? BRAND_COLORS.borderDark : BRAND_COLORS.borderLight,
    text: isDark ? BRAND_COLORS.textLight : BRAND_COLORS.textDark,
    textMuted: isDark ? BRAND_COLORS.textMutedDark : BRAND_COLORS.textMutedLight,
    textFaint: isDark ? BRAND_COLORS.textFaintDark : BRAND_COLORS.textFaintLight,
  }

  const [managers, setManagers] = useState<ManagerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('manager')
  const [roleMenuOpen, setRoleMenuOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const roleMenuRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (roleMenuRef.current && !roleMenuRef.current.contains(event.target as Node)) {
        setRoleMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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
    <div className="min-h-screen p-6" style={{ backgroundColor: T.bg, color: T.text }}>
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: T.textMuted }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.textMuted)}
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

        <div className="rounded-xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
          <h1 className="text-xl font-semibold mb-1">Gestores cadastrados</h1>
          <p className="text-sm mb-4" style={{ color: T.textMuted }}>
            Área exclusiva do superuser para criar gestores e redefinir senhas temporárias.
          </p>

          {error && (
            <p className="text-sm rounded-lg px-4 py-2.5 mb-4" style={{ backgroundColor: '#EF444422', border: '1px solid #EF444440', color: '#EF4444' }}>
              {error}
            </p>
          )}

          {temporaryPassword && (
            <div className="rounded-lg px-4 py-3 mb-4" style={{ backgroundColor: `${BRAND_COLORS.primary}22`, border: `1px solid ${BRAND_COLORS.primary}66` }}>
              <p className="text-xs uppercase tracking-wide mb-1" style={{ color: T.textFaint }}>Senha temporária gerada</p>
              <p className="text-lg font-semibold" style={{ color: BRAND_COLORS.primary }}>{temporaryPassword}</p>
              <p className="text-xs mt-1" style={{ color: T.textMuted }}>
                Entregue essa senha ao gestor. No primeiro login ele será obrigado a definir a senha definitiva.
              </p>
            </div>
          )}

          {loading ? (
            <p className="text-sm" style={{ color: T.textMuted }}>Carregando gestores...</p>
          ) : (
            <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${T.border}` }}>
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
                        <span
                          className="text-xs px-2 py-1 rounded-full"
                          style={{
                            backgroundColor: m.must_change_password ? `${BRAND_COLORS.primary}22` : '#22C55E22',
                            color: m.must_change_password ? BRAND_COLORS.primary : '#22C55E',
                          }}
                        >
                          {m.must_change_password ? 'Pendente' : 'Concluído'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleResetPassword(m.id)}
                            className="text-xs px-2 py-1 rounded-md"
                            style={{ backgroundColor: T.surface2, border: `1px solid ${T.border}`, color: T.textMuted }}
                          >
                            Redefinir senha
                          </button>
                          {confirmDeleteId === m.id ? (
                            <>
                              <button
                                onClick={() => handleDeleteManager(m.id)}
                                className="text-xs px-2 py-1 rounded-md"
                                style={{ backgroundColor: '#EF444420', border: '1px solid #EF444440', color: '#EF4444' }}
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-xs px-2 py-1 rounded-md"
                                style={{ backgroundColor: T.surface2, border: `1px solid ${T.border}`, color: T.textMuted }}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(m.id)}
                              className="text-xs px-2 py-1 rounded-md"
                              style={{ backgroundColor: T.surface2, border: `1px solid #EF444440`, color: '#EF4444' }}
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {managers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center" style={{ color: T.textFaint }}>
                        Nenhum gestor encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl p-5" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
          <h2 className="text-lg font-semibold mb-1">Adicionar novo gestor</h2>
          <p className="text-sm mb-4" style={{ color: T.textMuted }}>
            O sistema vai gerar uma senha temporária aleatória para o primeiro acesso.
          </p>

          <form onSubmit={handleCreateManager} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome"
              className="rounded-lg px-3 py-2 text-sm"
              style={{ backgroundColor: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
              required
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              className="rounded-lg px-3 py-2 text-sm"
              style={{ backgroundColor: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
              required
            />
            <div className="relative" ref={roleMenuRef}>
              <button
                type="button"
                onClick={() => setRoleMenuOpen((v) => !v)}
                className="w-full rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors"
                style={{
                  backgroundColor: T.surface2,
                  border: `1px solid ${roleMenuOpen ? BRAND_COLORS.primary : T.border}`,
                  color: T.text,
                }}
                onMouseEnter={(e) => {
                  if (!roleMenuOpen) e.currentTarget.style.borderColor = T.textMuted
                }}
                onMouseLeave={(e) => {
                  if (!roleMenuOpen) e.currentTarget.style.borderColor = T.border
                }}
              >
                <span>{role}</span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                  style={{ opacity: 0.45, transform: roleMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
                >
                  <path d="M6 8L1 3h10z" />
                </svg>
              </button>
              {roleMenuOpen && (
                <div
                  className="absolute top-full left-0 mt-1 w-full rounded-xl shadow-xl py-1 z-20"
                  style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setRole(option)
                        setRoleMenuOpen(false)
                      }}
                      className="w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 transition-colors"
                      style={{ color: option === role ? BRAND_COLORS.primary : T.text, fontWeight: option === role ? 600 : 400 }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = T.surface2 }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <span>{option}</span>
                      {option === role && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={BRAND_COLORS.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ backgroundColor: BRAND_COLORS.primary, color: '#FFFFFF' }}
              onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.backgroundColor = BRAND_COLORS.primaryHover }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = BRAND_COLORS.primary }}
            >
              {submitting ? 'Criando...' : 'Criar gestor'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
