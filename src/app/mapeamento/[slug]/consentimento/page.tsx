'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion } from 'motion/react'
import Image from 'next/image'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_ASSETS, BRAND_COLORS } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { AlertPresence } from '@/components/ui/alert'

interface SubmitLikeEvent {
  preventDefault: () => void
}

export default function MappingConsentimentoPage() {
  const router = useRouter()
  const params = useParams<{ slug: string }>()
  const mappingSlug = params.slug

  const T = useThemeTokens()

  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleContinue(e: SubmitLikeEvent) {
    e.preventDefault()
    setError('')

    if (!accepted) {
      setError('Você precisa declarar que leu e concorda para continuar.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/collaborator/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true, mapping_slug: mappingSlug }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível registrar seu consentimento.')
        return
      }

      router.push(`/mapeamento/${mappingSlug}/formulario`)
    } catch {
      setError('Erro de conexão. Tente novamente em instantes.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: T.bg }}>
      <div className="w-full max-w-2xl py-6">
        <div className="mb-4 flex justify-end">
          <ThemeToggle />
        </div>

        <div className="mb-6 flex justify-center">
          <div className="h-20 w-20 overflow-hidden rounded-full p-3 shadow-sm" style={{ backgroundColor: BRAND_COLORS.primary }}>
            <Image src={BRAND_ASSETS.symbol} alt="BeeTouch" width={80} height={80} className="h-full w-full object-contain" />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <Card className="p-6 sm:p-8">
            <h1 className="text-2xl font-semibold" style={{ color: T.text }}>
              Privacidade e Segurança das Informações
            </h1>

            <div className="mt-4 space-y-3 text-sm leading-relaxed" style={{ color: T.textMuted }}>
              <p>
                Esta pesquisa segue os princípios da LGPD e existe para apoiar melhorias no ambiente de trabalho.
              </p>
              <p>
                Suas respostas são tratadas com confidencialidade e utilizadas apenas em análises consolidadas e agregadas,
                sem exposição individual.
              </p>
              <p>
                O objetivo é preservar seu anonimato e garantir segurança no tratamento dos dados durante todo o processo.
              </p>
            </div>

            <form onSubmit={handleContinue} className="mt-6 space-y-4">
              <Checkbox
                id="consent-accept"
                checked={accepted}
                onChange={setAccepted}
                disabled={loading}
                label={<b>Declaro que li e concordo com os termos de privacidade e uso agregado das informações.</b>}
              />

              <AlertPresence show={!!error}>{error}</AlertPresence>

              <Button type="submit" size="lg" loading={loading} disabled={!accepted} className="w-full">
                {loading ? 'Confirmando...' : 'Continuar para o formulário'}
              </Button>
            </form>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
