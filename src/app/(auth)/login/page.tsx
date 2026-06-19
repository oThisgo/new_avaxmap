'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_ASSETS, BRAND_COLORS } from '@/lib/brand'

interface SubmitLikeEvent {
  preventDefault: () => void
}

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export default function LoginPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const T = {
    bg: isDark ? BRAND_COLORS.darkBg : BRAND_COLORS.lightBg,
    surface: isDark ? BRAND_COLORS.darkSurface : BRAND_COLORS.lightSurface,
    border: isDark ? BRAND_COLORS.borderDark : BRAND_COLORS.borderLight,
    text: isDark ? BRAND_COLORS.textLight : BRAND_COLORS.textDark,
    textMuted: isDark ? BRAND_COLORS.textMutedDark : BRAND_COLORS.textMutedLight,
    textFaint: isDark ? BRAND_COLORS.textFaintDark : BRAND_COLORS.textFaintLight,
    inputBg: isDark ? BRAND_COLORS.darkSurface2 : BRAND_COLORS.lightSurface2,
  }
  const [cpf, setCpf] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: SubmitLikeEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/collaborator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: cpf.replace(/\D/g, '') }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao validar CPF.')
        return
      }

      router.push('/formulario')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const digits = cpf.replace(/\D/g, '')

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: T.bg }}>
      <div className="w-full max-w-md -mt-16">
        <div className="flex justify-end mb-4">
          <ThemeToggle />
        </div>

        {/* Logo */}
        <div className="flex justify-center mb-10">
          <div className="w-26 h-26 rounded-full flex items-center justify-center overflow-hidden p-4 shadow-sm" style={{ backgroundColor: BRAND_COLORS.primary }}>
            <Image
              src={BRAND_ASSETS.symbol}
              alt="BeeTouch"
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
          <h1 className="text-2xl font-semibold mb-1" style={{ color: T.text }}>
            Sua experiência no trabalho importa
          </h1>
          <p className="text-sm mb-8" style={{ color: T.textMuted }}>
            Insira o seu CPF para acessar a pesquisa.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cpf" className="text-sm font-medium" style={{ color: T.textMuted }}>
                CPF
              </label>
              <input
                id="cpf"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                placeholder="000.000.000-00"
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
              disabled={loading || digits.length !== 11}
              className="w-full rounded-lg py-3 text-sm font-semibold mt-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: BRAND_COLORS.primary, color: '#FFFFFF' }}
              onMouseEnter={(e) => { if (!loading && digits.length === 11) e.currentTarget.style.backgroundColor = BRAND_COLORS.primaryHover }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = BRAND_COLORS.primary }}
            >
              {loading ? 'Verificando...' : 'Acessar pesquisa →'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: T.textFaint }}>
          As respostas são anônimas e analisadas apenas de forma agregada.
        </p>
      </div>
    </div>
  )
}
