'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function ManagerLoginPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const T = {
    bg: isDark ? '#111111' : '#F8F8F8',
    surface: isDark ? '#1A1A1A' : '#FFFFFF',
    border: isDark ? '#2A2A2A' : '#E5E5E5',
    text: isDark ? '#FFFFFF' : '#111111',
    textMuted: isDark ? '#A3A3A3' : '#737373',
    inputBg: isDark ? '#111111' : '#F5F5F5',
  }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
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
            className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: '#F5C200' }}
          >
            <Image
              src="/logo-alana.png"
              alt="Instituto Alana"
              width={56}
              height={56}
              className="object-contain"
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
                placeholder="gestor@institutoalana.org.br"
                className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                style={{ backgroundColor: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#F5C200')}
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
                onFocus={(e) => (e.currentTarget.style.borderColor = '#F5C200')}
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
              style={{ backgroundColor: '#F5C200', color: '#111111' }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#D4A800' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#F5C200' }}
            >
              {loading ? 'Entrando...' : 'Entrar →'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: isDark ? '#525252' : '#A3A3A3' }}>
          Instituto Alana — Plataforma de Mapeamento de Riscos Psicossociais
        </p>
      </div>
    </div>
  )
}
