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

export default function MappingConsentimentoPage() {
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
  }

  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleContinue(e: SubmitLikeEvent) {
    e.preventDefault()
    setError('')

    if (!accepted) {
      setError('Você precisa declarar que leu e concorda para continuar.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/collaborator/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true, mapping_slug: mappingSlug }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível registrar seu consentimento.')
        return
      }

      router.push(`/mapeamento/${mappingSlug}/formulario`)
    } catch {
      setError('Erro de conexão. Tente novamente em instantes.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: T.bg }}>
      <div className="w-full max-w-2xl py-6">
        <div className="mb-4 flex justify-end">
          <ThemeToggle />
        </div>

        <div className="mb-6 flex justify-center">
          <div className="h-20 w-20 overflow-hidden rounded-full p-3 shadow-sm" style={{ backgroundColor: BRAND_COLORS.primary }}>
            <Image src={BRAND_ASSETS.symbol} alt="BeeTouch" width={80} height={80} className="h-full w-full object-contain" />
          </div>
        </div>

        <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
          <h1 className="text-2xl font-semibold" style={{ color: T.text }}>
            Privacidade e Segurança das Informações
          </h1>

          <div className="mt-4 space-y-3 text-sm leading-relaxed" style={{ color: T.textMuted }}>
            <p>
              Esta pesquisa segue os princípios da LGPD e existe para apoiar melhorias no ambiente de trabalho.
            </p>
            <p>
              Suas respostas são tratadas com confidencialidade e utilizadas apenas em análises consolidadas e agregadas,
              sem exposição individual.
            </p>
            <p>
              O objetivo é preservar seu anonimato e garantir segurança no tratamento dos dados durante todo o processo.
            </p>
          </div>

          <form onSubmit={handleContinue} className="mt-6 space-y-4">
            <label className="flex items-center gap-2 text-sm" style={{ color: T.text }}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                disabled={loading}
                className="h-4 w-4 shrink-0 rounded"
                style={{
                  accentColor: BRAND_COLORS.primary,
                  colorScheme: isDark ? 'dark' : 'light',
                  backgroundColor: isDark ? T.surface : '#FFFFFF',
                  border: `1px solid ${T.border}`,
                }}
              />
              <span><b>Declaro que li e concordo com os termos de privacidade e uso agregado das informações.</b></span>
            </label>

            {error && (
              <p className="rounded-lg px-4 py-2.5 text-sm" style={{ backgroundColor: '#EF444422', border: '1px solid #EF444440', color: '#EF4444' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !accepted}
              className="w-full rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: BRAND_COLORS.primary, color: '#FFFFFF' }}
            >
              {loading ? 'Confirmando...' : 'Continuar para o formulário'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
