"use client"

import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_ASSETS, BRAND_COLORS, BRAND_NAME } from '@/lib/brand'
import Image from 'next/image'

export default function AgradecimentoPage() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const T = {
    bg: isDark ? BRAND_COLORS.darkBg : BRAND_COLORS.lightBg,
    surface: isDark ? BRAND_COLORS.darkSurface : BRAND_COLORS.lightSurface,
    border: isDark ? BRAND_COLORS.borderDark : BRAND_COLORS.borderLight,
    text: isDark ? BRAND_COLORS.textLight : BRAND_COLORS.textDark,
    textMuted: isDark ? BRAND_COLORS.textMutedDark : BRAND_COLORS.textMutedLight,
  }

  return (
    <div className="min-h-screen px-4" style={{ backgroundColor: T.bg }}>
      <div className="mx-auto max-w-3xl pt-6 flex justify-end">
        <ThemeToggle />
      </div>
      <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 56px)' }}>
        <div className="w-full max-w-2xl text-center rounded-2xl px-8 py-10" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
          <div className="mx-auto mb-5 h-20 w-20 overflow-hidden rounded-full p-3 shadow-sm" style={{ backgroundColor: BRAND_COLORS.primary }}>
            <Image src={BRAND_ASSETS.symbol} alt={BRAND_NAME} width={80} height={80} className="h-full w-full object-contain" />
          </div>

          <p className="text-2xl font-semibold" style={{ color: T.text }}>
            Obrigado por participar da pesquisa
          </p>
          <p className="text-sm mt-3" style={{ color: T.textMuted }}>
            Sua contribuição ajuda a construir um ambiente de trabalho mais seguro, saudável e humano para todas as pessoas.
          </p>

          <div className="mt-6 rounded-xl px-4 py-3 text-sm" style={{ border: `1px solid ${T.border}`, backgroundColor: isDark ? BRAND_COLORS.darkSurface2 : BRAND_COLORS.lightSurface2, color: T.textMuted }}>
            Suas respostas foram registradas com sucesso e serão analisadas apenas de forma agregada, preservando anonimato e confidencialidade.
          </div>
        </div>
      </div>
    </div>
  )
}
