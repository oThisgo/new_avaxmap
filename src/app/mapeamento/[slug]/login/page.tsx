'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_ASSETS, BRAND_COLORS } from '@/lib/brand'

interface SubmitLikeEvent {
  preventDefault: () => void
}

export default function MappingCollaboratorLoginPage() {
  const router = useRouter()
  const params = useParams<{ slug: string }>()
  const mappingSlug = params.slug

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

  const [credential, setCredential] = useState('')
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
        body: JSON.stringify({
          credential,
          mapping_slug: mappingSlug,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao validar credencial.')
        return
      }

      router.push(`/mapeamento/${mappingSlug}/formulario`)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const isCredentialFilled = credential.trim().length > 0

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: T.bg }}>
      <div className="w-full max-w-md -mt-16">
        <div className="flex justify-end mb-4">
          <ThemeToggle />
        </div>

        <div className="mb-3 text-center text-xs uppercase tracking-wide" style={{ color: T.textFaint }}>
          Mapeamento: {mappingSlug}
        </div>

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
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        </div>

        <div className="rounded-2xl p-8" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: T.text }}>
            Acesso do Colaborador
          </h1>
          <p className="text-sm mb-8" style={{ color: T.textMuted }}>
            Insira a credencial definida para este mapeamento para acessar a pesquisa.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="credential" className="text-sm font-medium" style={{ color: T.textMuted }}>
                Credencial
              </label>
              <input
                id="credential"
                type="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder="CPF, matrícula, e-mail..."
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
              disabled={loading || !isCredentialFilled}
              className="w-full rounded-lg py-3 text-sm font-semibold mt-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: BRAND_COLORS.primary, color: '#FFFFFF' }}
              onMouseEnter={(e) => {
                if (!loading && isCredentialFilled) e.currentTarget.style.backgroundColor = BRAND_COLORS.primaryHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = BRAND_COLORS.primary
              }}
            >
              {loading ? 'Verificando...' : 'Acessar pesquisa ->'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
