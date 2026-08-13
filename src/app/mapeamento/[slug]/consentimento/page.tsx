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
              Privacidade e Proteção das Informações
            </h1>

            <div className="mt-4 space-y-3 text-sm leading-relaxed" style={{ color: T.textMuted }}>
              <p>
                Esta iniciativa é conduzida em conformidade com a LGPD e tem como objetivo apoiar melhorias no ambiente de trabalho.
              </p>
              <p>
                As informações fornecidas são tratadas de forma confidencial e utilizadas exclusivamente em análises consolidadas. Nenhuma resposta individual será disponibilizada à organização.
              </p>
              <p>
                Medidas de proteção são adotadas durante todo o processo para preservar a privacidade e garantir a segurança dos dados.
              </p>
            </div>

            <form onSubmit={handleContinue} className="mt-6 space-y-4">
              <Checkbox
                id="consent-accept"
                checked={accepted}
                onChange={setAccepted}
                disabled={loading}
                label={<b>Confirmo que li as informações sobre privacidade e tratamento de dados.</b>}
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
