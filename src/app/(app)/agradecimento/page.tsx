"use client"

import { motion } from 'motion/react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_ASSETS, BRAND_COLORS, BRAND_NAME } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'
import { Card } from '@/components/ui/card'
import Image from 'next/image'

export default function AgradecimentoPage() {
  const T = useThemeTokens()

  return (
    <div className="flex min-h-screen flex-col px-4" style={{ backgroundColor: T.bg }}>
      <div className="mx-auto flex w-full max-w-3xl justify-end pt-6">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center py-10">
        <Card className="w-full max-w-2xl px-8 py-10 text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="mx-auto mb-5 h-20 w-20 overflow-hidden rounded-full p-3 shadow-sm"
            style={{ backgroundColor: BRAND_COLORS.primary }}
          >
            <Image src={BRAND_ASSETS.symbol} alt={BRAND_NAME} width={80} height={80} className="h-full w-full object-contain" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4, ease: 'easeOut' }}
          >
            <p className="text-2xl font-semibold" style={{ color: T.text }}>
              Obrigado por participar da pesquisa
            </p>
            <p className="mt-3 text-sm" style={{ color: T.textMuted }}>
              Sua contribuição ajuda a construir um ambiente de trabalho mais seguro, saudável e humano para todas as pessoas.
            </p>

            <div
              className="mt-6 rounded-xl px-4 py-3 text-sm"
              style={{ border: `1px solid ${T.border}`, backgroundColor: T.surface2, color: T.textMuted }}
            >
              Suas respostas foram registradas com sucesso e serão analisadas apenas de forma agregada, preservando anonimato e confidencialidade.
            </div>
          </motion.div>
        </Card>
      </div>
    </div>
  )
}
