'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'motion/react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_ASSETS, BRAND_COLORS } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'
import { isRichTextEmpty, sanitizeRichTextHtml } from '@/lib/tcle/rich-text'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertPresence } from '@/components/ui/alert'
import { Modal } from '@/components/ui/modal'
import { SkeletonText } from '@/components/ui/skeleton'

interface SubmitLikeEvent {
  preventDefault: () => void
}

export default function MappingCollaboratorLoginPage() {
  const router = useRouter()
  const params = useParams<{ slug: string }>()
  const mappingSlug = params.slug

  const T = useThemeTokens()

  const [credential, setCredential] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tcleText, setTcleText] = useState<string | null>(null)
  const [tcleAccepted, setTcleAccepted] = useState(false)
  const [tcleGateOpen, setTcleGateOpen] = useState(true)
  const [tcleLoading, setTcleLoading] = useState(true)
  const [tcleLoadError, setTcleLoadError] = useState('')

  const tcleHtml = useMemo(() => sanitizeRichTextHtml(tcleText ?? ''), [tcleText])
  const tcleRequired = !isRichTextEmpty(tcleHtml)

  useEffect(() => {
    let active = true
    setTcleLoading(true)
    setTcleLoadError('')

    fetch(`/api/mapeamento/${mappingSlug}/config`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Não foi possível carregar o TCLE deste mapeamento.')
        return res.json()
      })
      .then((data) => {
        if (!active) return
        const text = typeof data?.mapping?.tcle_text === 'string' ? data.mapping.tcle_text : ''
        const sanitized = sanitizeRichTextHtml(text)
        setTcleText(sanitized)
        if (isRichTextEmpty(sanitized)) {
          setTcleAccepted(true)
          setTcleGateOpen(false)
        } else {
          setTcleAccepted(false)
          setTcleGateOpen(true)
        }
      })
      .catch((err) => {
        if (!active) return
        setTcleLoadError(err instanceof Error ? err.message : 'Não foi possível carregar o TCLE.')
      })
      .finally(() => {
        if (active) setTcleLoading(false)
      })

    return () => {
      active = false
    }
  }, [mappingSlug])

  async function handleSubmit(e: SubmitLikeEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/collaborator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential,
          mapping_slug: mappingSlug,
          tcle_accepted: !tcleRequired || tcleAccepted,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao validar credencial.')
        return
      }

      router.push(`/mapeamento/${mappingSlug}/consentimento`)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const isCredentialFilled = credential.trim().length > 0
  const canSubmit = isCredentialFilled && !loading && !tcleLoading && !!mappingSlug && (!tcleRequired || tcleAccepted)

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: T.bg }}>
      <div className="w-full max-w-md -mt-16">
        <div className="mb-4 flex justify-end">
          <ThemeToggle />
        </div>

        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="mb-10 flex justify-center"
        >
          <div className="w-26 h-26 flex items-center justify-center overflow-hidden rounded-full p-4 shadow-sm" style={{ backgroundColor: BRAND_COLORS.primary }}>
            <Image
              src={BRAND_ASSETS.symbol}
              alt="BeeTouch"
              width={96}
              height={96}
              className="object-contain"
              style={{ height: 'auto' }}
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3, ease: 'easeOut' }}
        >
          <Card className="p-8">
            <h1 className="mb-1 text-2xl font-semibold" style={{ color: T.text }}>
              Acesso do Colaborador
            </h1>
            <p className="mb-8 text-sm" style={{ color: T.textMuted }}>
              Insira a credencial definida para este mapeamento para acessar a pesquisa.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="credential" className="text-sm font-medium" style={{ color: T.textMuted }}>
                  Credencial
                </label>
                <Input
                  id="credential"
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  placeholder="CPF, matrícula, e-mail..."
                  disabled={loading}
                />
              </div>

              <AlertPresence show={!!error}>{error}</AlertPresence>

              <Button type="submit" size="lg" loading={loading} disabled={!canSubmit} className="mt-2 w-full">
                {loading ? 'Verificando...' : 'Acessar pesquisa'}
              </Button>

              {tcleLoadError && (
                <p className="text-xs" style={{ color: BRAND_COLORS.danger }}>
                  {tcleLoadError}
                </p>
              )}
            </form>
          </Card>
        </motion.div>
      </div>

      <Modal open={tcleGateOpen} blocking className="max-w-2xl">
        <h2 className="text-lg font-semibold sm:text-xl">Termo de Consentimento (TCLE)</h2>

        {tcleLoading ? (
          <div className="mt-4">
            <SkeletonText lines={4} />
          </div>
        ) : tcleLoadError ? (
          <p className="mt-4 text-sm" style={{ color: BRAND_COLORS.danger }}>
            {tcleLoadError}
          </p>
        ) : (
          <>
            <div
              className="relative mt-4 max-h-[45vh] overflow-y-auto rounded-lg p-3 text-sm"
              style={{ border: `1px solid ${T.border}`, backgroundColor: T.inputBg, color: T.textMuted }}
              dangerouslySetInnerHTML={{ __html: tcleHtml }}
            />

            <div className="mt-4">
              <Checkbox
                id="tcle-accept"
                checked={tcleAccepted}
                onChange={setTcleAccepted}
                label={<b>Li e concordo com o TCLE para acessar a pesquisa.</b>}
              />
            </div>

            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => setTcleGateOpen(false)} disabled={!tcleAccepted}>
                Continuar para login
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
