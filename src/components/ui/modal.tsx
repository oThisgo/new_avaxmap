'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useThemeTokens } from '@/lib/theme'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose?: () => void
  children: React.ReactNode
  className?: string
  /** Quando true, não fecha ao clicar no overlay nem no ESC (ex.: gate de TCLE obrigatório). */
  blocking?: boolean
}

/** Modal com entrada animada + scroll lock — substitui os overlays `fixed inset-0` que apareciam sem transição. */
export function Modal({ open, onClose, children, className, blocking }: Readonly<ModalProps>) {
  const T = useThemeTokens()

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open || blocking || !onClose) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, blocking, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
          onClick={blocking ? undefined : onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className={cn('w-full max-w-2xl rounded-2xl p-5 sm:p-6', className)}
            style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, color: T.text }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
