'use client'

import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { BRAND_COLORS } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'

/**
 * Peças visuais dos painéis de destaque (Visão Geral do mapeamento e dashboard
 * do cliente). Cores de status (verde/amarelo/vermelho) ficam reservadas às
 * classificações de risco e sempre acompanham o rótulo textual.
 */

export const RISK_CLASS_COLORS: Record<string, string> = {
  'Baixo risco': BRAND_COLORS.success,
  'Risco moderado': BRAND_COLORS.warning,
  'Alto risco': BRAND_COLORS.danger,
  'Excelente': BRAND_COLORS.success,
  'Bom': '#9BCB8F',
  'Regular': BRAND_COLORS.warning,
  'Insatisfatório': BRAND_COLORS.danger,
  'Condição adequada': BRAND_COLORS.success,
  'Zona de atenção': BRAND_COLORS.warning,
  'Situação de risco': BRAND_COLORS.danger,
}

export function classColor(name: string | null | undefined): string {
  return (name && RISK_CLASS_COLORS[name]) || BRAND_COLORS.slate
}

export function fmtNumber(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function Panel({
  title, subtitle, icon: Icon, action, children, className = '', accent,
}: {
  title: string
  subtitle?: string
  icon?: LucideIcon
  action?: ReactNode
  children: ReactNode
  className?: string
  accent?: string
}) {
  const T = useThemeTokens()
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`rounded-2xl p-5 ${className}`}
      style={{ backgroundColor: T.surface, border: `1px solid ${accent ? `${accent}55` : T.border}` }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon && (
            <span
              className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${accent ?? BRAND_COLORS.primary}1A`, color: accent ?? BRAND_COLORS.primary }}
            >
              <Icon size={16} strokeWidth={2.2} />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold" style={{ color: T.text }}>{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs" style={{ color: T.textFaint }}>{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  )
}

/** Anel de progresso — leitura única de "quanto do todo" (adesão). */
export function ProgressRing({
  value, size = 168, stroke = 14, color = BRAND_COLORS.primary, label, sublabel,
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  label: string
  sublabel?: string
}) {
  const T = useThemeTokens()
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label} ${sublabel ?? ''}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={T.surface2} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-bold tabular-nums" style={{ color: T.text }}>{label}</span>
        {sublabel && <span className="mt-0.5 text-xs" style={{ color: T.textMuted }}>{sublabel}</span>}
      </div>
    </div>
  )
}

export function KpiTile({
  icon: Icon, label, value, unit, badge, badgeColor, foot, accent, emphasis = false, delay = 0,
}: {
  icon: LucideIcon
  label: string
  value: string
  unit?: string
  badge?: string | null
  badgeColor?: string
  foot?: ReactNode
  accent?: string
  emphasis?: boolean
  delay?: number
}) {
  const T = useThemeTokens()
  const color = accent ?? BRAND_COLORS.primary
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      className="relative flex flex-col gap-2 overflow-hidden rounded-2xl p-5"
      style={{
        backgroundColor: emphasis ? `${color}12` : T.surface,
        border: `1px solid ${emphasis ? `${color}66` : T.border}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: T.textMuted }}>{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1F`, color }}>
          <Icon size={17} strokeWidth={2.2} />
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums" style={{ color: emphasis ? color : T.text }}>{value}</span>
        {unit && <span className="text-sm" style={{ color: T.textFaint }}>{unit}</span>}
      </div>
      {badge && (
        <span
          className="w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: `${badgeColor ?? color}22`, color: badgeColor ?? color }}
        >
          {badge}
        </span>
      )}
      {foot && <div className="text-xs" style={{ color: T.textFaint }}>{foot}</div>}
    </motion.div>
  )
}

/**
 * Barra 100% empilhada para distribuição de classificações — com legenda
 * textual (nome, contagem e %) para nunca depender só da cor.
 */
export function StackedClassBar({ title, items }: { title: string; items: Array<{ name: string; value: number }> }) {
  const T = useThemeTokens()
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold" style={{ color: T.textMuted }}>{title}</span>
        <span className="text-xs tabular-nums" style={{ color: T.textFaint }}>{total} respostas</span>
      </div>
      <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-full">
        {items.map((item) => (
          <motion.div
            key={item.name}
            title={`${item.name}: ${item.value} (${fmtNumber((item.value / total) * 100)}%)`}
            initial={{ width: 0 }}
            animate={{ width: `${(item.value / total) * 100}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ backgroundColor: classColor(item.name) }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((item) => (
          <span key={item.name} className="flex items-center gap-1.5 text-xs" style={{ color: T.textMuted }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: classColor(item.name) }} />
            {item.name}
            <span className="font-semibold tabular-nums" style={{ color: T.text }}>{item.value}</span>
            <span className="tabular-nums" style={{ color: T.textFaint }}>({fmtNumber((item.value / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Barra horizontal simples com rótulo e valor — para listas ranqueadas. */
export function RankBar({
  label, value, max, display, color, hint, tag, tagColor,
}: {
  label: string
  value: number
  max: number
  display: string
  color: string
  hint?: string
  tag?: string | null
  tagColor?: string
}) {
  const T = useThemeTokens()
  const width = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="flex flex-col gap-1.5" title={hint}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm" style={{ color: T.text }}>{label}</span>
        <div className="flex flex-shrink-0 items-center gap-2">
          {tag && (
            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${tagColor ?? color}22`, color: tagColor ?? color }}>
              {tag}
            </span>
          )}
          <span className="text-sm font-semibold tabular-nums" style={{ color: T.text }}>{display}</span>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: T.surface2 }}>
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export function SegmentPills({
  options, value, onChange,
}: {
  options: Array<{ key: string; label: string }>
  value: string
  onChange: (key: string) => void
}) {
  const T = useThemeTokens()
  if (options.length <= 1) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = opt.key === value
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: active ? BRAND_COLORS.primary : T.surface2,
              color: active ? '#FFFFFF' : T.textMuted,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function chartTooltipStyle(T: ReturnType<typeof useThemeTokens>) {
  return {
    contentStyle: { backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: '10px', color: T.text },
    itemStyle: { color: T.text },
    labelStyle: { color: T.textMuted },
  }
}
