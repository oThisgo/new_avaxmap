'use client'

import { cn } from '@/lib/utils'
import { useThemeTokens } from '@/lib/theme'
import { BRAND_COLORS } from '@/lib/brand'

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

const TONE_COLOR: Record<Exclude<BadgeTone, 'neutral'>, string> = {
  primary: BRAND_COLORS.primary,
  success: BRAND_COLORS.success,
  warning: BRAND_COLORS.warning,
  danger: BRAND_COLORS.danger,
}

export function Badge({
  tone = 'neutral',
  className,
  style,
  ...props
}: Readonly<React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }>) {
  const T = useThemeTokens()
  const color = tone === 'neutral' ? T.textMuted : TONE_COLOR[tone]
  const bg = tone === 'neutral' ? T.surface2 : `${color}20`

  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', className)}
      style={{ color, backgroundColor: bg, ...style }}
      {...props}
    />
  )
}
