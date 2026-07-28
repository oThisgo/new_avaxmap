'use client'

import { cn } from '@/lib/utils'
import { useThemeTokens } from '@/lib/theme'

export function Card({ className, style, ...props }: Readonly<React.HTMLAttributes<HTMLDivElement>>) {
  const T = useThemeTokens()
  return (
    <div
      className={cn('rounded-2xl', className)}
      style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, ...style }}
      {...props}
    />
  )
}
