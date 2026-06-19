"use client"

import { useTheme } from '@/components/ThemeProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_COLORS } from '@/lib/brand'

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
        <div className="text-center rounded-2xl px-8 py-10" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
          <p className="text-2xl font-semibold" style={{ color: T.text }}>
            Obrigado pela sua participação!
          </p>
          <p className="text-sm mt-2" style={{ color: T.textMuted }}>
            Sua resposta foi registrada com sucesso.
          </p>
        </div>
      </div>
    </div>
  )
}
