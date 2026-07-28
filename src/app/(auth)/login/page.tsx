'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'motion/react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_ASSETS, BRAND_COLORS } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AlertPresence } from '@/components/ui/alert'

interface SubmitLikeEvent {
  preventDefault: () => void
}

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export default function LoginPage() {
  const router = useRouter()
  const T = useThemeTokens()
  const [cpf, setCpf] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: SubmitLikeEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/collaborator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: cpf.replace(/\D/g, '') }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao validar CPF.')
        return
      }

      router.push('/formulario')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const digits = cpf.replace(/\D/g, '')

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: T.bg }}>
      <div className="w-full max-w-md -mt-16">
        <div className="flex justify-end mb-4">
          <ThemeToggle />
        </div>

        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="mb-10 flex justify-center"
        >
          <div className="w-26 h-26 rounded-full flex items-center justify-center overflow-hidden p-4 shadow-sm" style={{ backgroundColor: BRAND_COLORS.primary }}>
            <Image
              src={BRAND_ASSETS.symbol}
              alt="BeeTouch"
              width={96}
              height={96}
              className="object-contain"
              style={{ height: 'auto' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
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
            <h1 className="text-2xl font-semibold mb-1" style={{ color: T.text }}>
              Sua experiência no trabalho importa
            </h1>
            <p className="text-sm mb-8" style={{ color: T.textMuted }}>
              Insira o seu CPF para acessar a pesquisa.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cpf" className="text-sm font-medium" style={{ color: T.textMuted }}>
                  CPF
                </label>
                <Input
                  id="cpf"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  disabled={loading}
                />
              </div>

              <AlertPresence show={!!error}>{error}</AlertPresence>

              <Button type="submit" size="lg" loading={loading} disabled={loading || digits.length !== 11} className="mt-2 w-full">
                {loading ? 'Verificando...' : 'Acessar pesquisa →'}
              </Button>
            </form>
          </Card>
        </motion.div>

        <p className="text-center text-xs mt-6" style={{ color: T.textFaint }}>
          As respostas são anônimas e analisadas apenas de forma agregada.
        </p>
      </div>
    </div>
  )
}
