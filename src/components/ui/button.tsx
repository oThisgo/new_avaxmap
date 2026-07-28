'use client'

import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { useThemeTokens } from '@/lib/theme'
import { BRAND_COLORS } from '@/lib/brand'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0',
  {
    variants: {
      variant: {
        primary: 'hover:brightness-110 focus-visible:ring-[#1767F3]/40',
        outline: 'hover:bg-black/5 dark:hover:bg-white/5 focus-visible:ring-[#1767F3]/30',
        ghost: 'hover:bg-black/5 dark:hover:bg-white/5 focus-visible:ring-[#1767F3]/30',
        danger: 'hover:brightness-110 focus-visible:ring-red-500/40',
      },
      size: {
        md: 'px-4 py-2.5 text-sm',
        sm: 'px-3 py-2 text-xs',
        lg: 'px-5 py-3 text-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

function Spinner({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      className={cn('animate-spin', className)}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size, loading, disabled, children, style, ...props },
  ref,
) {
  const T = useThemeTokens()

  const variantStyle: React.CSSProperties = (() => {
    switch (variant) {
      case 'outline':
        return { border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.text }
      case 'ghost':
        return { backgroundColor: 'transparent', color: T.textMuted }
      case 'danger':
        return { backgroundColor: BRAND_COLORS.danger, color: '#FFFFFF' }
      default:
        return { backgroundColor: BRAND_COLORS.primary, color: '#FFFFFF' }
    }
  })()

  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      style={{ ...variantStyle, ...style }}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
})
