'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { BRAND_COLORS } from '@/lib/brand'

interface SubmitLikeEvent {
  preventDefault: () => void
}

export default function ResetManagerPasswordPage() {
  const router = useRouter()
  const [firstAccess, setFirstAccess] = useState(false)
  const [nextPath, setNextPath] = useState('/dashboard/client')

  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const T = {
    bg: isDark ? BRAND_COLORS.darkBg : BRAND_COLORS.lightBg,
    surface: isDark ? BRAND_COLORS.darkSurface : BRAND_COLORS.lightSurface,
    border: isDark ? BRAND_COLORS.borderDark : BRAND_COLORS.borderLight,
    text: isDark ? BRAND_COLORS.textLight : BRAND_COLORS.textDark,
    textMuted: isDark ? BRAND_COLORS.textMutedDark : BRAND_COLORS.textMutedLight,
    inputBg: isDark ? BRAND_COLORS.darkBg : BRAND_COLORS.lightSurface2,
  }

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const isFirstAccess = params.get('first_access') === '1'
    const next = params.get('next')
    setFirstAccess(isFirstAccess)
    if (next && next.startsWith('/')) {
      setNextPath(next)
    }

    fetch('/api/auth/manager/me')
      .then(async (res) => {
        if (!res.ok) throw new Error('unauthorized')
        return res.json()
      })
      .then((me) => {
        if (!isFirstAccess && me.must_change_password) {
          const scopedNext =
            me.scope === 'mapping' && me.mapping_slug
              ? `/mapeamento/${me.mapping_slug}/dashboard`
              : '/dashboard/client'
          router.replace(`/dashboard/reset-password?first_access=1&next=${encodeURIComponent(scopedNext)}`)
        }
      })
      .catch(() => {
        router.replace('/manager/login')
      })
  }, [router])

  async function handleSubmit(e: SubmitLikeEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('A confirmação da nova senha não confere.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/manager/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível alterar a senha.')
        return
      }

      setSuccess('Senha alterada com sucesso.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')

      setTimeout(() => {
        router.push(nextPath)
      }, 800)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ backgroundColor: T.bg, color: T.text }}>
      <div className="max-w-md mx-auto rounded-2xl p-6" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
        <h1 className="text-xl font-semibold mb-1">Redefinir senha</h1>
        <p className="text-sm mb-6" style={{ color: T.textMuted }}>
          {firstAccess
            ? 'Primeiro acesso detectado. Defina uma senha definitiva para continuar.'
            : 'Informe sua senha atual e escolha uma nova senha.'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm" style={{ color: T.textMuted }}>Senha atual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
              disabled={loading}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm" style={{ color: T.textMuted }}>Nova senha</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
              disabled={loading}
              minLength={8}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm" style={{ color: T.textMuted }}>Confirmar nova senha</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-sm outline-none"
              style={{ backgroundColor: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
              disabled={loading}
              minLength={8}
              required
            />
          </div>

          {error && (
            <p className="text-sm rounded-lg px-4 py-2.5" style={{ backgroundColor: '#EF444422', border: '1px solid #EF444440', color: '#EF4444' }}>
              {error}
            </p>
          )}

          {success && (
            <p className="text-sm rounded-lg px-4 py-2.5" style={{ backgroundColor: '#22C55E22', border: '1px solid #22C55E40', color: '#22C55E' }}>
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ backgroundColor: BRAND_COLORS.primary, color: '#FFFFFF' }}
          >
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
