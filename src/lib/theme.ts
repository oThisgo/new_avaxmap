import { useMemo } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import { BRAND_COLORS } from '@/lib/brand'

export interface ThemeTokens {
  bg: string
  surface: string
  surface2: string
  border: string
  text: string
  textMuted: string
  textFaint: string
  inputBg: string
  skeleton: string
  skeletonShine: string
}

export function getThemeTokens(isDark: boolean): ThemeTokens {
  return {
    bg: isDark ? BRAND_COLORS.darkBg : BRAND_COLORS.lightBg,
    surface: isDark ? BRAND_COLORS.darkSurface : BRAND_COLORS.lightSurface,
    surface2: isDark ? BRAND_COLORS.darkSurface2 : BRAND_COLORS.lightSurface2,
    border: isDark ? BRAND_COLORS.borderDark : BRAND_COLORS.borderLight,
    text: isDark ? BRAND_COLORS.textLight : BRAND_COLORS.textDark,
    textMuted: isDark ? BRAND_COLORS.textMutedDark : BRAND_COLORS.textMutedLight,
    textFaint: isDark ? BRAND_COLORS.textFaintDark : BRAND_COLORS.textFaintLight,
    inputBg: isDark ? BRAND_COLORS.darkSurface2 : BRAND_COLORS.lightSurface2,
    skeleton: isDark ? '#222222' : '#EBEBEB',
    skeletonShine: isDark ? '#2C2C2C' : '#F5F5F5',
  }
}

/**
 * Substitui as ~16 cópias locais de `const T = { bg: isDark ? ... : ... }`
 * espalhadas pelas páginas por uma única fonte, mantendo a mesma forma de
 * retorno usada hoje (bg/surface/surface2/border/text/textMuted/textFaint)
 * para permitir migração mecânica.
 */
export function useThemeTokens(): ThemeTokens & { isDark: boolean } {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const tokens = useMemo(() => getThemeTokens(isDark), [isDark])
  return { ...tokens, isDark }
}
