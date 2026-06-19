'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_ASSETS, BRAND_COLORS, BRAND_NAME } from '@/lib/brand'

interface SubmitLikeEvent {
  preventDefault: () => void
}

export default function ManagerLoginPage() {
  const router = useRouter()
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: SubmitLikeEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao autenticar')
        return
      }

      if (data.must_change_password) {
        router.push('/dashboard/reset-password?first_access=1')
        return
      }

      router.push('/dashboard')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: T.bg }}
    >
      <div className="w-full max-w-md -mt-16">
        {/* Toggle no canto superior direito */}
        <div className="flex justify-end mb-4">
          <ThemeToggle />
        </div>

        {/* Logo */}
        <div className="flex justify-center mb-10">
          <div
            className="w-26 h-26 rounded-full flex items-center justify-center overflow-hidden p-4"
            style={{ backgroundColor: BRAND_COLORS.primary }}
          >
            <Image
              src={BRAND_ASSETS.symbol}
              alt={BRAND_NAME}
              width={96}
              height={96}
              className="object-contain"
              style={{ height: 'auto' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: T.text }}>Acesso do Gestor</h1>
          <p className="text-sm mb-8" style={{ color: T.textMuted }}>
            Entre com suas credenciais para acessar o dashboard.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: T.textMuted }}>
                E-mail
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="gestor@beetouch.ai"
                className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                style={{ backgroundColor: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
                onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_COLORS.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = T.border)}
                disabled={loading}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: T.textMuted }}>
                Senha
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                style={{ backgroundColor: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
                onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_COLORS.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = T.border)}
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-sm rounded-lg px-4 py-2.5" style={{ backgroundColor: '#EF444422', border: '1px solid #EF444440', color: '#EF4444' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-3 text-sm font-semibold transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: BRAND_COLORS.primary, color: '#FFFFFF' }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = BRAND_COLORS.primaryHover }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = BRAND_COLORS.primary }}
            >
              {loading ? 'Entrando...' : 'Entrar →'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: isDark ? '#525252' : '#A3A3A3' }}>
          {BRAND_NAME} — Plataforma de Mapeamento de Riscos Psicossociais
        </p>
      </div>
    </div>
  )
}
