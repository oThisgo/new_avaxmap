'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'motion/react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BRAND_ASSETS, BRAND_COLORS, BRAND_NAME } from '@/lib/brand'
import { useThemeTokens } from '@/lib/theme'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AlertPresence } from '@/components/ui/alert'

interface SubmitLikeEvent {
  preventDefault: () => void
}

export default function ManagerLoginPage() {
  const router = useRouter()
  const T = useThemeTokens()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: SubmitLikeEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao autenticar')
        return
      }

      if (data.must_change_password) {
        router.push('/dashboard/reset-password?first_access=1')
        return
      }

      router.push('/dashboard/client')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

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
          <div className="w-26 h-26 flex items-center justify-center overflow-hidden rounded-full p-4" style={{ backgroundColor: BRAND_COLORS.primary }}>
            <Image
              src={BRAND_ASSETS.symbol}
              alt={BRAND_NAME}
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
            <h1 className="text-2xl font-semibold mb-1" style={{ color: T.text }}>AvaxMap</h1>
            <p className="text-sm mb-8" style={{ color: T.textMuted }}>
              Entre com suas credenciais para acessar o dashboard.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" style={{ color: T.textMuted }}>
                  E-mail
                </label>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="gestor@beetouch.ai"
                  disabled={loading}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" style={{ color: T.textMuted }}>
                  Senha
                </label>
                <Input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                />
              </div>

              <AlertPresence show={!!error}>{error}</AlertPresence>

              <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
                {loading ? 'Entrando...' : 'Entrar →'}
              </Button>
            </form>
          </Card>
        </motion.div>

        <p className="text-center text-xs mt-6" style={{ color: T.textFaint }}>
          {BRAND_NAME} — Plataforma de Mapeamento de Riscos Psicossociais
        </p>
      </div>
    </div>
  )
}
