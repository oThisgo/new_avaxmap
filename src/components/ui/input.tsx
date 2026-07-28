'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { useThemeTokens } from '@/lib/theme'

const fieldClassName =
  'w-full rounded-lg px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:border-[#1767F3]'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, style, ...props }, ref) {
    const T = useThemeTokens()
    return (
      <input
        ref={ref}
        className={cn(fieldClassName, className)}
        style={{ backgroundColor: T.inputBg, border: `1px solid ${T.border}`, color: T.text, ...style }}
        {...props}
      />
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, style, ...props }, ref) {
    const T = useThemeTokens()
    return (
      <textarea
        ref={ref}
        className={cn(fieldClassName, 'resize-y', className)}
        style={{ backgroundColor: T.inputBg, border: `1px solid ${T.border}`, color: T.text, ...style }}
        {...props}
      />
    )
  },
)
