'use client'

import { cn } from '@/lib/utils'
import { useThemeTokens } from '@/lib/theme'

/** Barra shimmer única — extraído do padrão que já existia só em InsightsTab.tsx. */
export function Skeleton({ className, style }: Readonly<{ className?: string; style?: React.CSSProperties }>) {
  const T = useThemeTokens()
  return (
    <div
      className={cn('rounded-full', className)}
      style={{
        background: `linear-gradient(90deg, ${T.skeleton} 25%, ${T.skeletonShine} 50%, ${T.skeleton} 75%)`,
        backgroundSize: '600px 100%',
        animation: 'shimmer 1.6s infinite linear',
        ...style,
      }}
    />
  )
}

/** Bloco de texto: algumas linhas shimmer de largura decrescente, para telas de "carregando conteúdo". */
export function SkeletonText({ lines = 3, className }: Readonly<{ lines?: number; className?: string }>) {
  const widths = [92, 78, 55, 88, 64]
  return (
    <div className={cn('space-y-2.5', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={`sk-line-${i}`} className="h-3" style={{ width: `${widths[i % widths.length]}%` }} />
      ))}
    </div>
  )
}
