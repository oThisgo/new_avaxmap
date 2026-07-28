'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import { useThemeTokens } from '@/lib/theme'
import { BRAND_COLORS } from '@/lib/brand'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  options: readonly SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
}

/**
 * Dropdown único — consolida as reimplementações duplicadas (CustomDropdown em
 * IetrForm.tsx, FilterDropdown em DashboardShell.tsx, StyledDropdown em
 * create/page.tsx): fecha ao clicar fora, chevron animado, item ativo marcado.
 */
export function Select({ value, options, onChange, placeholder = 'Selecione', disabled, className, id }: Readonly<SelectProps>) {
  const T = useThemeTokens()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((opt) => opt.value === value)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          backgroundColor: T.inputBg,
          border: `1px solid ${open ? BRAND_COLORS.primary : T.border}`,
          color: selected ? T.text : T.textMuted,
        }}
      >
        <span className="truncate text-left">{selected?.label ?? placeholder}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="currentColor"
          style={{ opacity: 0.5, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
        >
          <path d="M6 8L1 3h10z" />
        </svg>
      </button>

      <AnimatePresence>
        {open && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="absolute z-40 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl py-1 shadow-xl"
            style={{ backgroundColor: T.surface, border: `1px solid ${T.border}` }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: opt.value === value ? BRAND_COLORS.primary : T.text, fontWeight: opt.value === value ? 600 : 400 }}
              >
                <span className="truncate">{opt.label}</span>
                {opt.value === value && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={BRAND_COLORS.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
