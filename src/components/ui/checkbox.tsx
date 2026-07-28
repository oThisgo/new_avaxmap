'use client'

import { useThemeTokens } from '@/lib/theme'
import { BRAND_COLORS } from '@/lib/brand'
import { cn } from '@/lib/utils'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  label?: React.ReactNode
  className?: string
}

/** Checkbox maior/customizado — o nativo (~14px) é pequeno demais em telas de consentimento/TCLE. */
export function Checkbox({ checked, onChange, disabled, id, label, className }: Readonly<CheckboxProps>) {
  const T = useThemeTokens()
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start gap-3 text-sm select-none',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className,
      )}
      style={{ color: T.text }}
    >
      <span className="relative mt-0.5 h-6 w-6 flex-shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 h-6 w-6 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-0"
          style={{
            borderColor: checked ? BRAND_COLORS.primary : T.border,
            backgroundColor: checked ? BRAND_COLORS.primary : T.inputBg,
            ['--tw-ring-color' as string]: `${BRAND_COLORS.primary}66`,
          }}
        >
          {checked && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ strokeDasharray: 24, animation: 'checkDraw 220ms ease forwards' }}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>
      </span>
      {label && <span className="leading-snug">{label}</span>}
    </label>
  )
}
