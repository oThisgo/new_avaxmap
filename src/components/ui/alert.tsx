'use client'

import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import { BRAND_COLORS } from '@/lib/brand'

type AlertTone = 'danger' | 'success' | 'info'

const TONE_COLOR: Record<AlertTone, string> = {
  danger: BRAND_COLORS.danger,
  success: BRAND_COLORS.success,
  info: BRAND_COLORS.primary,
}

interface AlertProps {
  tone?: AlertTone
  children: React.ReactNode
  className?: string
}

/** Bloco de erro/sucesso com entrada animada — substitui os `<p style={{...}}>` duplicados por arquivo. */
export function Alert({ tone = 'danger', children, className }: Readonly<AlertProps>) {
  const color = TONE_COLOR[tone]
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -6, height: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn('overflow-hidden rounded-lg text-sm', className)}
    >
      <div className="px-4 py-2.5" style={{ backgroundColor: `${color}1a`, border: `1px solid ${color}40`, color }}>
        {children}
      </div>
    </motion.div>
  )
}

export function AlertPresence({ show, ...props }: Readonly<AlertProps & { show: boolean }>) {
  return <AnimatePresence>{show && <Alert {...props} />}</AnimatePresence>
}
